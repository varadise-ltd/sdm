import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import {
  numberingLevels,
  parseDocumentNumbering,
  publicDocumentNumbering,
  type DocumentNumberingBase,
  type DocumentNumberingConfig,
  type NumberingLevel,
} from "../../../../../../../lib/document-numbering";
import { db } from "../../../../../../../lib/db";
import { jsonError, parseObjectBody } from "../../../../../../../lib/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectCode: string }> };
const adminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

const documentTypePattern = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const customLevelPattern = /^custom:[a-z][a-z0-9_]{1,31}$/i;

function parseLevels(value: unknown): NumberingLevel[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return null;
  const levels: NumberingLevel[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    const level = customLevelPattern.test(trimmed) ? `custom:${trimmed.slice(7).toLowerCase()}` : trimmed;
    const valid = numberingLevels.includes(level as (typeof numberingLevels)[number]) || customLevelPattern.test(level);
    if (!valid || seen.has(level.toLowerCase())) return null;
    seen.add(level.toLowerCase());
    levels.push(level as NumberingLevel);
  }
  return levels;
}

function parseLevel(value: unknown): NumberingLevel | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const level = customLevelPattern.test(trimmed) ? `custom:${trimmed.slice(7).toLowerCase()}` : trimmed;
  if (numberingLevels.includes(level as (typeof numberingLevels)[number]) || customLevelPattern.test(level)) {
    return level as NumberingLevel;
  }
  return null;
}

function parsePositiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < 1 || number > 2_000_000_000) return null;
  return number;
}

function namespacePrefix(documentType: string | null): string {
  return documentType ? `type:${documentType}:` : "document:";
}

function baseFromConfig(config: DocumentNumberingConfig, documentType: string | null): DocumentNumberingBase | null {
  if (!documentType) return config;
  return config.documentTypeOverrides?.[documentType] ?? null;
}

/**
 * Recount/reset a numbering namespace explicitly. Existing document numbers
 * are immutable; this only removes the allocator cursors so the next number
 * starts at the requested value. The operation is intentionally separate from
 * PATCH so saving unrelated settings cannot silently reset numbering.
 */
export async function POST(request: Request, context: RouteContext) {
  let body: Record<string, unknown> | null;
  try {
    body = parseObjectBody(await request.json());
  } catch {
    return jsonError("Request body must be valid JSON");
  }
  if (!body) return jsonError("Request body must be a JSON object");

  // sequenceLevels remains the rendered fields for backward compatibility.
  // The counter now has one explicit scope level. Older callers can still
  // send sequenceLevels and the first level is used as that scope.
  const requestedLevels = body.sequenceLevels === undefined ? null : parseLevels(body.sequenceLevels);
  const sequenceScope = parseLevel(body.sequenceScope ?? (requestedLevels?.[0] ?? null));
  const sequenceNext = parsePositiveInteger(body.sequenceNext);
  if (body.sequenceLevels !== undefined && !requestedLevels) return jsonError("sequenceLevels must contain one or more unique numbering attributes");
  if (!sequenceScope) return jsonError("sequenceScope must be one valid numbering attribute");
  if (sequenceNext === null) return jsonError("sequenceNext must be a positive integer up to 2000000000");

  let documentType: string | null = null;
  if (body.documentType !== undefined && body.documentType !== null && body.documentType !== "") {
    if (typeof body.documentType !== "string") return jsonError("documentType must be a string or null");
    documentType = body.documentType.trim().toUpperCase();
    if (!documentTypePattern.test(documentType)) return jsonError("documentType has an invalid format");
  }

  // Validate the shape through the same normalizer used by settings PATCH.
  // The strict checks above prevent the normalizer from silently falling back
  // to defaults when a recount request is malformed.
  const normalized = parseDocumentNumbering({ sequenceScope, sequenceLevels: requestedLevels ?? [sequenceScope], sequenceNext });
  if (normalized.sequenceScope !== sequenceScope || normalized.sequenceNext !== sequenceNext || (requestedLevels && normalized.sequenceLevels.join("|") !== requestedLevels.join("|"))) {
    return jsonError("Invalid numbering configuration");
  }

  const client = await db.connect();
  try {
    const { user, membership } = await requireProjectMembership(request, (await context.params).projectCode, adminRoles, "project.settings");
    await client.query("BEGIN");

    const existing = await client.query<Record<string, unknown>>(
      `SELECT enabled, prefix, suffix, separator, sequence_width AS "sequenceWidth",
              sequence_start AS "sequenceStart", sequence_next AS "sequenceNext",
              sequence_scope AS "sequenceScope",
              sequence_levels AS "sequenceLevels", custom_fields AS "customFields",
              document_type_overrides AS "documentTypeOverrides"
         FROM project_document_numbering
        WHERE project_id = $1
        FOR UPDATE`,
      [membership.projectId],
    );
    const current = publicDocumentNumbering(existing.rows[0] ?? null);
    const currentBase = baseFromConfig(current, documentType);
    if (documentType && !currentBase) {
      await client.query("ROLLBACK");
      return jsonError(`No numbering override exists for document type ${documentType}; create the override before recounting it`, 409);
    }

    const prefix = namespacePrefix(documentType);
    const sequenceNamespace = documentType ? `type:${documentType}` : "document";
    // Match the lock used by allocateDocumentNumber. This keeps a submission
    // from recreating a cursor between the namespace reset and its commit.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${membership.projectId}:${sequenceNamespace}`],
    );
    const highest = await client.query<{ maxNext: string | null }>(
      `SELECT max(next_value)::text AS "maxNext"
         FROM project_document_number_sequences
        WHERE project_id = $1 AND left(sequence_key, length($2)) = $2`,
      [membership.projectId, prefix],
    );
    const currentMaxNext = highest.rows[0]?.maxNext ? Number(highest.rows[0].maxNext) : null;
    // next_value is the next unallocated value. Never move it backwards: doing
    // so would make a later allocation collide with an existing document
    // number. Operators can still move it forward to intentionally skip IDs.
    if (currentMaxNext !== null && sequenceNext < currentMaxNext) {
      await client.query("ROLLBACK");
      return jsonError(
        `sequenceNext cannot be lower than the current next sequence value (${currentMaxNext})`,
        409,
      );
    }
    // left(...)=... avoids LIKE wildcard semantics because valid document type
    // codes may contain an underscore.
    const deleted = await client.query<{ count: string }>(
      `WITH removed AS (
         DELETE FROM project_document_number_sequences
          WHERE project_id = $1 AND left(sequence_key, length($2)) = $2
          RETURNING 1
       ) SELECT count(*)::text AS count FROM removed`,
      [membership.projectId, prefix],
    );

    const updatedBase = {
      ...(currentBase ?? current),
      sequenceScope,
      ...(requestedLevels ? { sequenceLevels: requestedLevels } : {}),
      sequenceNext,
    };
    const nextConfig: DocumentNumberingConfig = documentType
      ? {
          ...current,
          documentTypeOverrides: {
            ...current.documentTypeOverrides,
            [documentType]: updatedBase,
          },
        }
      : { ...current, sequenceScope, ...(requestedLevels ? { sequenceLevels: requestedLevels } : {}), sequenceNext };

    // A project can have no numbering row yet. Recounting the shared default
    // creates a complete disabled configuration that can be enabled later.
    await client.query(
      `INSERT INTO project_document_numbering
        (project_id, enabled, prefix, suffix, separator, sequence_width, sequence_start,
        sequence_next, sequence_scope, sequence_levels, custom_fields, document_type_overrides, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13)
       ON CONFLICT (project_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, prefix = EXCLUDED.prefix, suffix = EXCLUDED.suffix,
         separator = EXCLUDED.separator, sequence_width = EXCLUDED.sequence_width,
         sequence_start = EXCLUDED.sequence_start, sequence_next = EXCLUDED.sequence_next,
         sequence_scope = EXCLUDED.sequence_scope,
         sequence_levels = EXCLUDED.sequence_levels, custom_fields = EXCLUDED.custom_fields,
         document_type_overrides = EXCLUDED.document_type_overrides,
         updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [
        membership.projectId,
        nextConfig.enabled,
        nextConfig.prefix,
        nextConfig.suffix,
        nextConfig.separator,
        nextConfig.sequenceWidth,
        nextConfig.sequenceStart,
        nextConfig.sequenceNext,
        nextConfig.sequenceScope,
        JSON.stringify(nextConfig.sequenceLevels),
        JSON.stringify(nextConfig.customFields),
        JSON.stringify(nextConfig.documentTypeOverrides),
        user.id,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'project.numbering.recounted', 'project', $1, $3::jsonb, $4)`,
      [
        membership.projectId,
        user.id,
        JSON.stringify({
          documentType,
          sequenceScope,
          sequenceLevels: requestedLevels ?? null,
          sequenceNext,
          namespace: prefix,
          resetSequenceRows: Number(deleted.rows[0]?.count ?? 0),
        }),
        request.headers.get("x-request-id"),
      ],
    );
    await client.query("COMMIT");

    return NextResponse.json({
      data: {
        documentType,
        sequenceScope,
        sequenceLevels: nextConfig.sequenceLevels,
        sequenceNext,
        namespace: prefix,
        resetSequenceRows: Number(deleted.rows[0]?.count ?? 0),
        numbering: nextConfig,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error);
  } finally {
    client.release();
  }
}
