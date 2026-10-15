import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { fileVisibilityPredicate } from "../../../../../lib/file-access";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ containerId: string }> }) {
  try {
    const { containerId } = await context.params;
    const revisionId = new URL(request.url).searchParams.get("revisionId");
    if (revisionId && !/^[0-9a-f-]{36}$/i.test(revisionId)) return NextResponse.json({ error: { code: "INVALID_REVISION", message: "revisionId must be a UUID" } }, { status: 400 });
    if (!/^[0-9a-f-]{36}$/i.test(containerId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
    const container = await db.query<{ projectCode: string; projectId: string }>(
      `SELECT p.code AS "projectCode", c.project_id AS "projectId" FROM containers c JOIN projects p ON p.id = c.project_id WHERE c.id = $1`, [containerId],
    );
    if (!container.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
    const { membership, user } = await requireProjectMembership(request, container.rows[0].projectCode, undefined, "documents.read");
    const result = await db.query(
      `SELECT fa.id, fa.original_filename AS "filename", fa.mime_type AS "mimeType", fa.byte_size AS "byteSize",
              fa.virus_scan_status AS "virusScanStatus", fa.text_index_status AS "textIndexStatus",
              fa.extracted_text IS NOT NULL AS "hasExtractedText", r.revision_code AS "revisionCode",
              rf.is_primary AS "isPrimary", rf.sort_order AS "sortOrder"
       FROM revision_files rf
       JOIN document_revisions r ON r.id = rf.revision_id AND r.container_id = $1
       JOIN file_assets fa ON fa.id = rf.file_id AND fa.project_id = $2
       WHERE ($6::uuid IS NULL OR r.id = $6::uuid) ${fileVisibilityPredicate}
       ORDER BY r.revision_sequence DESC, rf.sort_order, fa.original_filename`,
      [containerId, membership.projectId, membership.partyId, user.id, membership.roleSlug, revisionId],
    );
    return NextResponse.json({ data: result.rows, containerId });
  } catch (error) { return authErrorResponse(error); }
}
