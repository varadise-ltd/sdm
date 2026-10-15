import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";
import { StorageError, storageErrorResponse, writeStoredObject } from "../../../../../../../lib/storage";

export const runtime = "nodejs";
const uploadRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function PUT(request: Request, context: { params: Promise<{ projectCode: string; fileId: string }> }) {
  let client: import("pg").PoolClient | undefined;
  try {
    const { projectCode, fileId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, uploadRoles, "documents.create");
    if (!/^[0-9a-f-]{36}$/i.test(fileId) || !request.body) return NextResponse.json({ error: { code: "INVALID_FILE", message: "A file body is required" } }, { status: 400 });
    client = await db.connect();
    await client.query("BEGIN");
    // Serialize retries so an asset cannot be changed once stored or attached.
    const result = await client.query<{ storageKey: string; byteSize: number; mimeType: string; uploadedAt: string | null }>(
      `SELECT storage_key AS "storageKey", byte_size AS "byteSize", mime_type AS "mimeType", uploaded_at AS "uploadedAt"
       FROM file_assets WHERE id = $1 AND project_id = $2 AND created_by_user_id = $3 FOR UPDATE`,
      [fileId, membership.projectId, user.id],
    );
    const file = result.rows[0];
    if (!file) throw new StorageError("NOT_FOUND", "File upload was not found", 404);
    if (file.uploadedAt) {
      await client.query("ROLLBACK");
      return new NextResponse(null, { status: 204 });
    }
    const expectedSize = Number(file.byteSize);
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) !== expectedSize) throw new StorageError("SIZE_MISMATCH", "Uploaded object size does not match the declared size", 409);
    if (expectedSize <= 0 || expectedSize > 5368709120) throw new StorageError("INVALID_FILE", "Files must be between 1 byte and 5 GB", 400);
    const sha256Hex = await writeStoredObject(file.storageKey, request.body, expectedSize, file.mimeType);
    await client.query("UPDATE file_assets SET uploaded_at = now(), sha256_hex = $2, virus_scan_status = 'pending', text_index_status = 'pending' WHERE id = $1", [fileId, sha256Hex]);
    await client.query("COMMIT");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    return storageErrorResponse(error) ?? authErrorResponse(error);
  } finally {
    client?.release();
  }
}

