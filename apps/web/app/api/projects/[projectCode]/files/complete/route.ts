import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { headStoredObject } from "../../../../../../lib/storage";

export const runtime = "nodejs";

const completeRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, completeRoles, "documents.create");
    const body = (await request.json()) as Record<string, unknown>;
    const fileId = typeof body.fileId === "string" ? body.fileId : "";
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: { code: "INVALID_FILE", message: "fileId must be a UUID" } }, { status: 400 });

    const existing = await db.query<{ storageKey: string; expectedSize: number; originalFilename: string }>(
      `SELECT storage_key AS "storageKey", byte_size AS "expectedSize", original_filename AS "originalFilename"
       FROM file_assets WHERE id = $1 AND project_id = $2 AND created_by_user_id = $3`,
      [fileId, membership.projectId, user.id],
    );
    const file = existing.rows[0];
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File upload was not found" } }, { status: 404 });

    const head = await headStoredObject(file.storageKey);
    const actualSize = Number(head.ContentLength ?? -1);
    if (actualSize !== Number(file.expectedSize)) {
      return NextResponse.json({ error: { code: "SIZE_MISMATCH", message: "Uploaded object size does not match the declared size" } }, { status: 409 });
    }
    const sha256Hex = typeof body.sha256Hex === "string" && /^[a-f0-9]{64}$/i.test(body.sha256Hex) ? body.sha256Hex.toLowerCase() : null;
    const updated = await db.query(
      `UPDATE file_assets SET sha256_hex = $1, virus_scan_status = 'pending', text_index_status = 'pending'
       WHERE id = $2 RETURNING id, original_filename AS "originalFilename", byte_size AS "byteSize", virus_scan_status AS "virusScanStatus"`,
      [sha256Hex, fileId],
    );
    return NextResponse.json({ data: updated.rows[0] });
  } catch (error) {
    return authErrorResponse(error);
  }
}

