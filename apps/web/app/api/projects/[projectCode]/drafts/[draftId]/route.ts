import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { libraryFolderCompatibilityError } from "../../../../../../lib/library-folders";

export const runtime = "nodejs";
const draftRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function PATCH(request: Request, context: { params: Promise<{ projectCode: string; draftId: string }> }) {
  try {
    const { projectCode, draftId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, draftRoles, "documents.edit");
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = body.title === undefined ? null : (typeof body.title === "string" ? body.title.trim().slice(0, 500) : "");
    const folder = body.libraryFolder === undefined ? null : (typeof body.libraryFolder === "string" ? body.libraryFolder.trim() : "");
    if (title === null && folder === null) return NextResponse.json({ error: { code: "INVALID_UPDATE", message: "title or libraryFolder is required" } }, { status: 400 });
    if (title === "") return NextResponse.json({ error: { code: "INVALID_UPDATE", message: "title cannot be empty" } }, { status: 400 });

    const existing = await db.query<{ id: string; title: string; documentTypeCode: string; isDrawing: boolean; libraryFolder: string; creatorUserId: string; status: string }>(
      `SELECT id, title, document_type_code AS "documentTypeCode", is_drawing AS "isDrawing", library_folder AS "libraryFolder", creator_user_id AS "creatorUserId", status
       FROM drafts WHERE id = $1 AND project_id = $2`, [draftId, membership.projectId],
    );
    const draft = existing.rows[0];
    if (!draft) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    if (draft.creatorUserId !== user.id && membership.roleSlug !== "document_controller") throw new AuthError(403, "Only the draft creator or document controller can edit this draft");
    if (draft.status !== "open") return NextResponse.json({ error: { code: "DRAFT_CLOSED", message: "Only open drafts can be edited" } }, { status: 409 });
    if (folder !== null) {
      const error = libraryFolderCompatibilityError(folder, draft.documentTypeCode, draft.isDrawing);
      if (error) return NextResponse.json({ error: { code: "INVALID_LIBRARY_FOLDER", message: error } }, { status: 400 });
    }
    const result = await db.query(
      `UPDATE drafts SET title = COALESCE($1, title), library_folder = COALESCE($2, library_folder)
       WHERE id = $3
       RETURNING id, title, document_type_code AS "documentTypeCode", is_drawing AS "isDrawing", library_folder AS "libraryFolder", status, updated_at AS "updatedAt"`,
      [title, folder, draftId],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'draft.updated', 'draft', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, draftId, JSON.stringify({ titleChanged: title !== null, libraryFolderChanged: folder !== null, from: folder !== null ? draft.libraryFolder : undefined, to: folder ?? undefined }), request.headers.get("x-request-id")],
    );
    return NextResponse.json({ data: result.rows[0] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
