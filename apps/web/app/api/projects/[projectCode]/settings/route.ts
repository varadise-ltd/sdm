import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../lib/auth";
import { defaultDocumentNumbering, parseDocumentNumbering, publicDocumentNumbering } from "../../../../../lib/document-numbering";
import { db } from "../../../../../lib/db";
import { jsonError, parseObjectBody } from "../../../../../lib/http";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ projectCode: string }> };
const adminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];

function validTimezone(value: string): boolean {
  if (value.length < 2 || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

export async function GET(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  try {
    const { membership } = await requireProjectMembership(request, projectCode, adminRoles, "project.settings");
    const result = await db.query(
      `SELECT p.id, p.code, p.name, p.timezone, p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
              n.enabled AS "numberingEnabled", n.prefix AS "numberingPrefix", n.suffix AS "numberingSuffix",
              n.separator AS "numberingSeparator", n.sequence_width AS "numberingSequenceWidth",
              n.sequence_start AS "numberingSequenceStart", n.sequence_next AS "numberingSequenceNext",
              n.sequence_scope AS "numberingSequenceScope",
              n.sequence_levels AS "numberingSequenceLevels", n.custom_fields AS "numberingCustomFields",
              n.document_type_overrides AS "numberingDocumentTypeOverrides"
       FROM projects p LEFT JOIN project_document_numbering n ON n.project_id = p.id WHERE p.id = $1`,
      [membership.projectId],
    );
    if (!result.rows[0]) return jsonError("Project not found", 404);
    const row = result.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      data: {
        id: row.id, code: row.code, name: row.name, timezone: row.timezone, status: row.status,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
        numbering: publicDocumentNumbering(row.numberingEnabled === null ? null : {
          enabled: row.numberingEnabled, prefix: row.numberingPrefix, suffix: row.numberingSuffix,
          separator: row.numberingSeparator, sequenceWidth: row.numberingSequenceWidth,
          sequenceStart: row.numberingSequenceStart, sequenceNext: row.numberingSequenceNext,
          sequenceScope: row.numberingSequenceScope,
          sequenceLevels: row.numberingSequenceLevels, customFields: row.numberingCustomFields,
          documentTypeOverrides: row.numberingDocumentTypeOverrides,
        }),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectCode } = await context.params;
  let body: Record<string, unknown> | null;
  try { body = parseObjectBody(await request.json()); } catch { return jsonError("Request body must be valid JSON"); }
  if (!body) return jsonError("Request body must be a JSON object");
  const name = body.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim() : "";
  const timezone = body.timezone === undefined ? undefined : typeof body.timezone === "string" ? body.timezone.trim() : "";
  const status = body.status === undefined ? undefined : body.status;
  const hasNumbering = body.numbering !== undefined;
  const numbering = hasNumbering ? parseDocumentNumbering(body.numbering) : undefined;
  if (name !== undefined && (name.length < 2 || name.length > 160)) return jsonError("name must be 2-160 characters");
  if (timezone !== undefined && !validTimezone(timezone)) return jsonError("timezone must be a valid IANA timezone");
  if (status !== undefined && !["active", "paused", "closed"].includes(String(status))) return jsonError("status must be active, paused, or closed");
  if (name === undefined && timezone === undefined && status === undefined && !hasNumbering) return jsonError("At least one project field is required");
  try {
    const { user, membership } = await requireProjectMembership(request, projectCode, adminRoles, "project.settings");
    const result = await db.query(
      `UPDATE projects SET name = COALESCE($2, name), timezone = COALESCE($3, timezone), status = COALESCE($4, status)
       WHERE id = $1
       RETURNING id, code, name, timezone, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [membership.projectId, name ?? null, timezone ?? null, status ?? null],
    );
    if (!result.rows[0]) return jsonError("Project not found", 404);
    if (numbering) {
      await db.query(
        `INSERT INTO project_document_numbering
          (project_id, enabled, prefix, suffix, separator, sequence_width, sequence_start, sequence_next, sequence_scope, sequence_levels, custom_fields, document_type_overrides, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13)
         ON CONFLICT (project_id) DO UPDATE SET enabled = EXCLUDED.enabled, prefix = EXCLUDED.prefix,
           suffix = EXCLUDED.suffix, separator = EXCLUDED.separator, sequence_width = EXCLUDED.sequence_width,
           sequence_start = EXCLUDED.sequence_start, sequence_next = EXCLUDED.sequence_next,
           sequence_scope = EXCLUDED.sequence_scope,
           sequence_levels = EXCLUDED.sequence_levels, custom_fields = EXCLUDED.custom_fields,
           document_type_overrides = EXCLUDED.document_type_overrides, updated_by_user_id = EXCLUDED.updated_by_user_id`,
        [membership.projectId, numbering.enabled, numbering.prefix, numbering.suffix, numbering.separator,
          numbering.sequenceWidth, numbering.sequenceStart, numbering.sequenceNext, numbering.sequenceScope, JSON.stringify(numbering.sequenceLevels),
          JSON.stringify(numbering.customFields), JSON.stringify(numbering.documentTypeOverrides), user.id],
      );
    }
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'project.settings.updated', 'project', $1, $3::jsonb, $4)`,
      [membership.projectId, user.id, JSON.stringify({ name, timezone, status, numbering: numbering ?? null }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: { ...result.rows[0], ...(numbering ? { numbering } : {}) } });
  } catch (error) { return authErrorResponse(error); }
}
