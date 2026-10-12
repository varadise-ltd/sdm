import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";
import { fileVisibilityPredicate } from "../../../../../../../lib/file-access";
import { createDownloadUrl, isFilesystemStorage } from "../../../../../../../lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string; fileId: string }> }) {
  try {
    const { projectCode, fileId } = await context.params;
    const { membership, user } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
    const result = await db.query<{ storageKey: string; originalFilename: string; mimeType: string; virusScanStatus: string }>(
      `SELECT storage_key AS "storageKey", original_filename AS "originalFilename", mime_type AS "mimeType", virus_scan_status AS "virusScanStatus"
       FROM file_assets fa
       WHERE fa.id = $1 AND fa.project_id = $2
       ${fileVisibilityPredicate}`,
      [fileId, membership.projectId, membership.partyId, user.id, membership.roleSlug],
    );
    const file = result.rows[0];
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
    if (file.virusScanStatus !== "clean") return NextResponse.json({ error: { code: "FILE_BLOCKED", message: "This file is not available until malware scanning completes successfully" } }, { status: 423 });
    const inline = new URL(request.url).searchParams.get("disposition") === "inline";
    if (isFilesystemStorage()) {
      const downloadUrl = `/api/projects/${encodeURIComponent(projectCode)}/files/${fileId}/download/content`;
      return NextResponse.json({ data: { downloadUrl, expiresIn: 900, mimeType: file.mimeType, storageMode: "filesystem" } });
    }
    const signed = await createDownloadUrl(file.storageKey, file.originalFilename, inline);
    return NextResponse.json({ data: { downloadUrl: signed.url, expiresIn: signed.expiresIn, mimeType: file.mimeType } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

