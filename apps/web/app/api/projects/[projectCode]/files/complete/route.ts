import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { headStoredObject, StorageError, storageErrorResponse } from "../../../../../../lib/storage";

export const runtime = "nodejs";

const completeRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, completeRoles, "documents.create");
    const body = (await request.json()) as Record<string, unknown>;
    const fileId = typeof body.fileId === "string" ? body.fileId : "";
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: { code: "INVALID_FILE", message: "fileId must be a UUID" } }, { status: 400 });

    const existing = await db.query<{ id: string; storageKey: string; expectedSize: number; originalFilename: string; uploadedAt: string | null; sha256Hex: string | null; virusScanStatus: string }>(
      `SELECT id, storage_key AS "storageKey", byte_size AS "expectedSize", original_filename AS "originalFilename",
              uploaded_at AS "uploadedAt", sha256_hex AS "sha256Hex", virus_scan_status AS "virusScanStatus"
       FROM file_assets WHERE id = $1 AND project_id = $2 AND created_by_user_id = $3`,
      [fileId, membership.projectId, user.id],
    );
    const file = existing.rows[0];
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File upload was not found" } }, { status: 404 });
    if (!file.uploadedAt) throw new StorageError("UPLOAD_INCOMPLETE", "Upload the file through SDM before completing or attaching it", 409);

    const head = await headStoredObject(file.storageKey);
    const actualSize = Number(head.ContentLength ?? -1);
    if (actualSize !== Number(file.expectedSize)) {
      return NextResponse.json({ error: { code: "SIZE_MISMATCH", message: "Uploaded object size does not match the declared size" } }, { status: 409 });
    }
    if (body.sha256Hex !== undefined && (typeof body.sha256Hex !== "string" || !/^[a-f0-9]{64}$/i.test(body.sha256Hex))) throw new StorageError("INVALID_CHECKSUM", "sha256Hex must be a SHA-256 hex digest", 400);
    if (body.sha256Hex && file.sha256Hex && String(body.sha256Hex).toLowerCase() !== file.sha256Hex) throw new StorageError("CHECKSUM_MISMATCH", "The uploaded file does not match its checksum", 409);
    return NextResponse.json({ data: { id: file.id, originalFilename: file.originalFilename, byteSize: Number(file.expectedSize), virusScanStatus: file.virusScanStatus } });
  } catch (error) {
    return storageErrorResponse(error) ?? authErrorResponse(error);
  }
}

