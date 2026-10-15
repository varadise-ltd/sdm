import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { authErrorResponse, requireProjectMembership } from "../../../../../../../../lib/auth";
import { db } from "../../../../../../../../lib/db";
import { fileVisibilityPredicate } from "../../../../../../../../lib/file-access";
import { fileDisposition } from "../../../../../../../../lib/file-disposition";
import { isFilesystemStorage, localObjectReadStream } from "../../../../../../../../lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ projectCode: string; fileId: string }> }) {
  try {
    if (!isFilesystemStorage()) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Local download endpoint is disabled" } }, { status: 404 });
    const { projectCode, fileId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
    const { membership, user } = await requireProjectMembership(request, projectCode, undefined, "documents.read");
    const result = await db.query<{ storageKey: string; originalFilename: string; mimeType: string; virusScanStatus: string }>(
      `SELECT fa.storage_key AS "storageKey", fa.original_filename AS "originalFilename", fa.mime_type AS "mimeType", fa.virus_scan_status AS "virusScanStatus"
       FROM file_assets fa
       WHERE fa.id = $1 AND fa.project_id = $2
       ${fileVisibilityPredicate}`,
      [fileId, membership.projectId, membership.partyId, user.id, membership.roleSlug],
    );
    const file = result.rows[0];
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
    if (file.virusScanStatus !== "clean") return NextResponse.json({ error: { code: "FILE_BLOCKED", message: "This file is not available until malware scanning completes successfully" } }, { status: 423 });
    const stream = Readable.toWeb(localObjectReadStream(file.storageKey)) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(stream, { headers: { "Content-Type": file.mimeType, "Content-Disposition": fileDisposition(file.originalFilename) } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

