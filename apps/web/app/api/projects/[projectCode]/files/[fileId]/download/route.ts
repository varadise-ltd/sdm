import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";
import { fileVisibilityPredicate } from "../../../../../../../lib/file-access";
import { storageMode, storageErrorResponse } from "../../../../../../../lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string; fileId: string }> }) {
  try {
    const { projectCode, fileId } = await context.params;
    const { membership, user } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
    const result = await db.query<{ storageKey: string; originalFilename: string; mimeType: string; virusScanStatus: string }>(
      `SELECT storage_key AS "storageKey", original_filename AS "originalFilename", mime_type AS "mimeType", virus_scan_status AS "virusScanStatus"
       FROM file_assets fa
       WHERE fa.id = $1 AND fa.project_id = $2 AND fa.uploaded_at IS NOT NULL
       ${fileVisibilityPredicate}`,
      [fileId, membership.projectId, membership.partyId, user.id, membership.roleSlug],
    );
    const file = result.rows[0];
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
    if (file.virusScanStatus !== "clean") return NextResponse.json({ error: { code: "FILE_BLOCKED", message: "This file is not available until malware scanning completes successfully" } }, { status: 423 });
    const inline = new URL(request.url).searchParams.get("disposition") === "inline";
    const downloadUrl = `/api/projects/${encodeURIComponent(projectCode)}/files/${fileId}/download/content${inline ? "?disposition=inline" : ""}`;
    if (new URL(request.url).searchParams.get("redirect") === "1") return new NextResponse(null, { status: 307, headers: { Location: downloadUrl, "Cache-Control": "private, no-store" } });
    return NextResponse.json({ data: { downloadUrl, mimeType: file.mimeType, storageMode: storageMode() } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return storageErrorResponse(error) ?? authErrorResponse(error);
  }
}

