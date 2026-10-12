import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { isUuid } from "../../../../../lib/http";

export const runtime = "nodejs";

type RecordKind = "form" | "photo" | "document";
type LinkedRecord = {
  id: string;
  kind: RecordKind;
  source: "external" | "document";
  title: string;
  reference: string | null;
  revisionCode: string | null;
  sourceName: string;
  url: string | null;
  targetDocumentId: string | null;
};

function safeLinkUrl(value: string | null): string | null {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function notFound(message: string) {
  return NextResponse.json({ error: { code: "NOT_FOUND", message } }, { status: 404 });
}

export async function GET(request: Request, context: { params: Promise<{ containerId: string }> }) {
  try {
    const { containerId } = await context.params;
    if (!isUuid(containerId)) return notFound("Document not found");
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") ?? "all";
    if (!["all", "form", "photo"].includes(kind)) {
      return NextResponse.json({ error: { code: "INVALID_KIND", message: "Choose all, form, or photo records" } }, { status: 400 });
    }
    const requestedRevision = searchParams.get("revisionId");
    if (requestedRevision !== null && !isUuid(requestedRevision)) return notFound("Revision not found");

    const sourceResult = await db.query<{
      projectCode: string;
      isInternal: boolean;
      originatorPartyId: string;
      latestRevisionId: string | null;
    }>(
      `SELECT p.code AS "projectCode", c.is_internal AS "isInternal",
              c.originator_party_id AS "originatorPartyId", c.latest_revision_id AS "latestRevisionId"
       FROM containers c JOIN projects p ON p.id = c.project_id WHERE c.id = $1`,
      [containerId],
    );
    const source = sourceResult.rows[0];
    if (!source) return notFound("Document not found");
    const { membership } = await requireProjectMembership(request, source.projectCode, undefined, "documents.read");
    if (source.isInternal && membership.roleSlug !== "document_controller" && source.originatorPartyId !== membership.partyId) {
      throw new AuthError(403, "This internal document is outside your party scope");
    }

    const revisionId = requestedRevision ?? source.latestRevisionId;
    if (revisionId) {
      const revision = await db.query(
        "SELECT id FROM document_revisions WHERE id = $1 AND container_id = $2",
        [revisionId, containerId],
      );
      if (!revision.rows.length) return notFound("Revision not found for this document");
    }

    const [externalResult, documentResult] = await Promise.all([
      db.query<{
        id: string;
        sourceHub: string;
        objectType: string;
        objectId: string;
        sourceRevision: string | null;
        linkUrl: string | null;
      }>(
        `SELECT h.id, h.source_hub AS "sourceHub", h.source_object_type AS "objectType",
                h.source_object_id AS "objectId", h.source_revision AS "sourceRevision", h.link_url AS "linkUrl"
         FROM hub_links h
         WHERE h.project_id = $1
           AND (h.container_id = $2 OR h.revision_id = $3::uuid)
           AND (h.container_id IS NULL OR h.container_id = $2)
           AND (h.revision_id IS NULL OR h.revision_id = $3::uuid)
           AND ($4 = 'all' OR ($4 = 'form' AND h.source_hub = 'Form Flow')
                          OR ($4 = 'photo' AND h.source_hub = 'Photo Hub'))
         ORDER BY h.created_at DESC, h.id`,
        [membership.projectId, containerId, revisionId, kind],
      ),
      db.query<{
        id: string;
        title: string;
        reference: string | null;
        revisionCode: string | null;
        kind: RecordKind;
      }>(
        `SELECT linked.* FROM (
           SELECT target.id, target.title,
                  COALESCE(target.document_number, target.container_number, target.internal_number) AS reference,
                  r.revision_code AS "revisionCode",
                  CASE WHEN upper(target.document_type_code) IN ('FM', 'FORM')
                              OR lower(cl.link_type) IN ('form', 'form_record', 'form_reference') THEN 'form'
                       WHEN lower(cl.link_type) IN ('photo', 'photo_record', 'photo_reference', 'image') THEN 'photo'
                       ELSE 'document' END AS kind,
                  cl.created_at AS "linkedAt"
           FROM container_links cl
           JOIN containers target ON target.id = cl.target_container_id AND target.project_id = $1
           LEFT JOIN document_revisions r ON r.id = target.latest_revision_id AND r.container_id = target.id
           WHERE cl.source_container_id = $2
             AND ($3::text = 'document_controller' OR target.is_internal = false OR target.originator_party_id = $4::uuid)
         ) linked WHERE $5 = 'all' OR linked.kind = $5
         ORDER BY linked."linkedAt" DESC, linked.id`,
        [membership.projectId, containerId, membership.roleSlug, membership.partyId, kind],
      ),
    ]);

    const data: LinkedRecord[] = [
      ...externalResult.rows.map((row): LinkedRecord => ({
        id: `external:${row.id}`,
        kind: row.sourceHub === "Form Flow" ? "form" : row.sourceHub === "Photo Hub" ? "photo" : "document",
        source: "external",
        title: `${row.objectType.replace(/[_-]+/g, " ")} · ${row.objectId}`,
        reference: row.objectId,
        revisionCode: row.sourceRevision,
        sourceName: row.sourceHub,
        url: safeLinkUrl(row.linkUrl),
        targetDocumentId: null,
      })),
      ...documentResult.rows.map((row): LinkedRecord => ({
        id: `document:${row.id}`,
        kind: row.kind,
        source: "document",
        title: row.title,
        reference: row.reference,
        revisionCode: row.revisionCode,
        sourceName: "SDM repository",
        url: null,
        targetDocumentId: row.id,
      })),
    ];
    return NextResponse.json({ data, revisionId, projectCode: membership.projectCode });
  } catch (error) {
    return authErrorResponse(error);
  }
}
