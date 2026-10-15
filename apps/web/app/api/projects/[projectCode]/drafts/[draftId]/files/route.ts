import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";

export const runtime = "nodejs";

const attachRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function GET(request: Request, context: { params: Promise<{ projectCode: string; draftId: string }> }) {
  try {
    const { projectCode, draftId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, attachRoles, "documents.read");
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    }

    const draft = await db.query<{ id: string }>(
      `SELECT id FROM drafts
       WHERE id = $1 AND project_id = $2
         AND (creator_user_id = $3 OR $4::text = 'document_controller')`,
      [draftId, membership.projectId, user.id, membership.roleSlug],
    );
    if (!draft.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });

    const files = await db.query(
      `SELECT fa.id, fa.original_filename AS "filename", fa.mime_type AS "mimeType", fa.byte_size AS "byteSize",
              fa.virus_scan_status AS "virusScanStatus", fa.text_index_status AS "textIndexStatus",
              'Draft' AS "revisionCode", df.sort_order AS "sortOrder", df.sort_order = 0 AS "isPrimary"
       FROM draft_files df
       JOIN file_assets fa ON fa.id = df.file_id AND fa.project_id = $2
       WHERE df.draft_id = $1
       ORDER BY df.sort_order, fa.original_filename`,
      [draftId, membership.projectId],
    );
    return NextResponse.json({ data: files.rows, draftId });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Attach a completed upload to an open draft. Infected/failed files are
 * rejected immediately; pending files remain quarantined until the worker
 * releases them. The database keeps the
 * draft/file relationship separate from the blob so a draft can be edited
 * before ISO numbering and promotion. */
export async function POST(request: Request, context: { params: Promise<{ projectCode: string; draftId: string }> }) {
  try {
    const { projectCode, draftId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, attachRoles, "documents.create");
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const fileId = typeof body.fileId === "string" ? body.fileId : "";
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
      return NextResponse.json({ error: { code: "INVALID_FILE", message: "fileId must be a UUID" } }, { status: 400 });
    }

    const draft = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM drafts
       WHERE id = $1 AND project_id = $2
         AND (creator_user_id = $3 OR $4::text = 'document_controller')`,
      [draftId, membership.projectId, user.id, membership.roleSlug],
    );
    if (!draft.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    if (draft.rows[0].status !== "open") return NextResponse.json({ error: { code: "DRAFT_CLOSED", message: "Only open drafts can receive files" } }, { status: 409 });

    const file = await db.query<{ id: string; filename: string; scan: string; uploadedAt: string | null }>(
      `SELECT id, original_filename AS filename, virus_scan_status AS scan, uploaded_at AS "uploadedAt"
       FROM file_assets WHERE id = $1 AND project_id = $2
         AND (created_by_user_id = $3 OR $4::text = 'document_controller')`,
      [fileId, membership.projectId, user.id, membership.roleSlug],
    );
    if (!file.rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File upload not found" } }, { status: 404 });
    if (!file.rows[0].uploadedAt) return NextResponse.json({ error: { code: "UPLOAD_INCOMPLETE", message: "The file must finish uploading before it can be attached" } }, { status: 409 });
    if (["infected", "failed"].includes(file.rows[0].scan)) {
      return NextResponse.json({ error: { code: "FILE_BLOCKED", message: "This file failed the malware scan and cannot be attached" } }, { status: 423 });
    }

    await db.query(
      `INSERT INTO draft_files (draft_id, file_id, sort_order)
       VALUES ($1, $2, COALESCE((SELECT max(sort_order) + 1 FROM draft_files WHERE draft_id = $1), 0))
       ON CONFLICT (draft_id, file_id) DO NOTHING`,
      [draftId, fileId],
    );
    await db.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload)
       VALUES ($1, $2, 'draft.file.attached', 'draft', $3, $4::jsonb)`,
      [membership.projectId, user.id, draftId, JSON.stringify({ fileId, filename: file.rows[0].filename })],
    );
    return NextResponse.json({ data: { draftId, fileId, filename: file.rows[0].filename, scanStatus: file.rows[0].scan } }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
