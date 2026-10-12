import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { buildStorageKey, createUploadUrl, isFilesystemStorage, sanitizeFilename } from "../../../../../../lib/storage";

export const runtime = "nodejs";

const uploadRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, uploadRoles, "documents.create");
    const body = (await request.json()) as Record<string, unknown>;
    const filename = typeof body.filename === "string" ? sanitizeFilename(body.filename) : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().slice(0, 255) : "";
    const byteSize = typeof body.byteSize === "number" ? body.byteSize : Number(body.byteSize);
    if (!filename || !mimeType || !Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > 5368709120) {
      return NextResponse.json({ error: { code: "INVALID_FILE", message: "filename, mimeType and byteSize are required; files are limited to 5 GB" } }, { status: 400 });
    }

    const fileId = randomUUID();
    const storageKey = buildStorageKey(membership.projectId, fileId, filename);
    await db.query(
      `INSERT INTO file_assets (id, project_id, storage_key, original_filename, mime_type, byte_size, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fileId, membership.projectId, storageKey, filename, mimeType, byteSize, user.id],
    );

    if (isFilesystemStorage()) {
      // Relative URLs stay valid behind a reverse proxy and avoid exposing the
      // container's internal 0.0.0.0:3000 listener to browser clients.
      const uploadUrl = `/api/projects/${encodeURIComponent(projectCode)}/files/${fileId}/upload`;
      return NextResponse.json({ data: { fileId, storageKey, uploadUrl, headers: { "content-type": mimeType }, expiresIn: 900, storageMode: "filesystem" } }, { status: 201 });
    }
    const signed = await createUploadUrl(storageKey, mimeType);
    return NextResponse.json({ data: { fileId, storageKey, uploadUrl: signed.url, headers: signed.headers, expiresIn: signed.expiresIn, storageMode: "s3" } }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

