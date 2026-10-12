import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireProjectMembership } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { libraryFolderCompatibilityError } from "../../../../lib/library-folders";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ containerId: string }> }) {
  try {
    const { containerId } = await context.params;
    const result = await db.query(
      `SELECT c.id, p.code AS "projectCode", COALESCE(c.document_number, c.container_number) AS "containerNumber", c.document_number AS "documentNumber", c.internal_number AS "internalNumber",
              c.title, c.document_type_code AS "documentType", c.is_drawing AS "isDrawing", c.is_internal AS "isInternal",
              c.library_folder AS "libraryFolder",
              c.originator_party_id AS "originatorPartyId",
              c.lifecycle_status AS "lifecycleStatus", c.updated_at AS "updatedAt", r.id AS "revisionId",
              r.revision_code AS "revisionCode", r.suitability_code AS "suitabilityCode", r.client_response_code AS "clientResponseCode",
              r.cde_state AS "cdeState", r.workflow_status AS "workflowStatus", r.metadata
       FROM containers c JOIN projects p ON p.id = c.project_id LEFT JOIN document_revisions r ON r.id = c.latest_revision_id
       WHERE c.id = $1`,
      [containerId],
    );
    const container = result.rows[0];
    if (!container) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
    const { membership } = await requireProjectMembership(request, container.projectCode, undefined, "documents.read");
    if (container.isInternal && membership.roleSlug !== "document_controller" && container.originatorPartyId !== membership.partyId) throw new AuthError(403, "This internal document is outside your party scope");
    return NextResponse.json({ data: container });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ containerId: string }> }) {
  try {
    const { containerId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : null;
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : null;
    const libraryFolder = body.libraryFolder === undefined ? null : (typeof body.libraryFolder === "string" ? body.libraryFolder.trim() : "");
    if (!title && !metadata && libraryFolder === null) return NextResponse.json({ error: { code: "INVALID_UPDATE", message: "title, metadata, or libraryFolder is required" } }, { status: 400 });
    const lookup = await db.query<{ projectCode: string; projectId: string; isInternal: boolean; originatorPartyId: string; documentType: string; isDrawing: boolean; currentFolder: string }>(
      `SELECT p.code AS "projectCode", c.project_id AS "projectId", c.is_internal AS "isInternal", c.originator_party_id AS "originatorPartyId",
              c.document_type_code AS "documentType", c.is_drawing AS "isDrawing", c.library_folder AS "currentFolder"
       FROM containers c JOIN projects p ON p.id = c.project_id WHERE c.id = $1`, [containerId],
    );
    const container = lookup.rows[0];
    if (!container) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Document not found" } }, { status: 404 });
    const { user, membership } = await requireProjectMembership(request, container.projectCode, undefined, "documents.edit");
    if (container.isInternal && membership.roleSlug !== "document_controller" && container.originatorPartyId !== membership.partyId) throw new AuthError(403, "This internal document is outside your party scope");
    if (libraryFolder !== null) {
      const folderError = libraryFolderCompatibilityError(libraryFolder, container.documentType, container.isDrawing);
      if (folderError) return NextResponse.json({ error: { code: "INVALID_LIBRARY_FOLDER", message: folderError } }, { status: 400 });
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      if (title) await client.query("UPDATE containers SET title = $1 WHERE id = $2", [title, containerId]);
      if (metadata) await client.query("UPDATE document_revisions SET metadata = metadata || $1::jsonb WHERE id = (SELECT latest_revision_id FROM containers WHERE id = $2)", [JSON.stringify(metadata), containerId]);
      if (libraryFolder !== null) await client.query("UPDATE containers SET library_folder = $1 WHERE id = $2", [libraryFolder, containerId]);
      await client.query("INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload) VALUES ($1, $2, $3, 'container', $4, $5::jsonb)", [membership.projectId, user.id, libraryFolder !== null && !title && !metadata ? "container.library-folder.updated" : "container.metadata.updated", containerId, JSON.stringify({ titleChanged: Boolean(title), metadataChanged: Boolean(metadata), libraryFolderChanged: libraryFolder !== null, from: libraryFolder !== null ? container.currentFolder : undefined, to: libraryFolder ?? undefined })]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
    return NextResponse.json({ data: { id: containerId, updated: true, libraryFolder: libraryFolder ?? container.currentFolder } });
  } catch (error) { return authErrorResponse(error); }
}
