import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { buildStorageKey, createUploadUrl, isFilesystemStorage, sanitizeFilename } from "../../../../../../lib/storage";

export const runtime = "nodejs";

const uploadRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

/**
 * Batch upload is deliberately a presign operation. The browser uploads each
 * object directly to local storage/S3 and then completes it through the
 * existing complete endpoint. This keeps large IFC/DWG files out of the API
 * process memory while still giving callers one request and a result per file.
 */
const MAX_FILES = 100;
const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_BATCH_BYTES = 50 * 1024 * 1024 * 1024;

type BatchFile = {
  filename: string;
  mimeType: string;
  byteSize: number;
  documentTypeCode?: string;
  title?: string;
  isDrawing?: boolean;
};

type AssetKind = "drawing" | "bim";

const drawingExtensions = new Set(["dwg", "dxf", "dgn", "plt", "svg", "pdf", "png", "jpg", "jpeg", "tif", "tiff"]);
const bimExtensions = new Set(["ifc", "ifczip", "ifcxml", "xkt", "rvt", "rfa", "nwd", "nwc", "nwf", "skp", "glb", "gltf", "obj", "fbx", "3dm", "step", "stp", "iges", "igs"]);

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? "";
}

function assetKind(filename: string): AssetKind | null {
  const extension = extensionOf(filename);
  if (drawingExtensions.has(extension)) return "drawing";
  if (bimExtensions.has(extension)) return "bim";
  return null;
}

function validDocumentType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(normalized) ? normalized : undefined;
}

function parseFile(value: unknown): BatchFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const filename = typeof record.filename === "string" ? sanitizeFilename(record.filename) : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim().slice(0, 255) : "application/octet-stream";
  const byteSize = typeof record.byteSize === "number" ? record.byteSize : Number(record.byteSize);
  if (!filename || !mimeType || !Number.isSafeInteger(byteSize) || byteSize < 0) return null;
  return {
    filename,
    mimeType,
    byteSize,
    documentTypeCode: validDocumentType(record.documentTypeCode),
    title: typeof record.title === "string" ? record.title.trim().slice(0, 500) : undefined,
    isDrawing: record.isDrawing === true,
  };
}

function requestError(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string }> }) {
  try {
    const { projectCode } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, uploadRoles, "documents.create");
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return requestError("INVALID_BATCH", "Batch upload expects a JSON body with a files array");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return requestError("INVALID_BATCH", "Batch upload expects a JSON body with a files array");
    }
    const rawFiles = Array.isArray(body.files) ? body.files : [];
    if (rawFiles.length === 0) return requestError("INVALID_BATCH", "At least one drawing or BIM model is required");
    if (rawFiles.length > MAX_FILES) return requestError("BATCH_LIMIT", `A batch can contain at most ${MAX_FILES} files`, 413);

    const parsed = rawFiles.map(parseFile);
    const results: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    let totalBytes = 0;
    for (let index = 0; index < parsed.length; index += 1) {
      const file = parsed[index];
      const source = rawFiles[index] as Record<string, unknown>;
      const filename = file?.filename ?? (typeof source?.filename === "string" ? sanitizeFilename(source.filename) : `file-${index + 1}`);
      if (!file) {
        results.push({ index, filename, status: "rejected", error: { code: "INVALID_FILE", message: "filename, mimeType and a safe integer byteSize are required" } });
        continue;
      }
      if (file.byteSize === 0) {
        results.push({ index, filename: file.filename, status: "rejected", error: { code: "EMPTY_FILE", message: "Empty files cannot be uploaded" } });
        continue;
      }
      const duplicateKey = file.filename.toLocaleLowerCase("en-US");
      if (seen.has(duplicateKey)) {
        results.push({ index, filename: file.filename, status: "rejected", error: { code: "DUPLICATE_FILENAME", message: "The same filename appears more than once in this batch" } });
        continue;
      }
      seen.add(duplicateKey);
      const kind = assetKind(file.filename);
      if (!kind) {
        results.push({ index, filename: file.filename, status: "rejected", error: { code: "UNSUPPORTED_FILE_TYPE", message: "Only supported drawing (DWG/DXF/DGN/PLT/SVG/PDF) and BIM/model files (IFC/IFCZIP/XKT/RVT/GLB/GLTF and related formats) can be batched" } });
        continue;
      }
      if (file.byteSize > MAX_FILE_BYTES) {
        results.push({ index, filename: file.filename, status: "rejected", assetKind: kind, error: { code: "FILE_LIMIT", message: "Each file is limited to 5 GB" } });
        continue;
      }
      if (totalBytes + file.byteSize > MAX_BATCH_BYTES) {
        results.push({ index, filename: file.filename, status: "rejected", assetKind: kind, error: { code: "BATCH_SIZE_LIMIT", message: "The combined batch size is limited to 50 GB" } });
        continue;
      }
      totalBytes += file.byteSize;

      const fileId = randomUUID();
      const storageKey = buildStorageKey(membership.projectId, fileId, file.filename);
      try {
        await db.query(
          `INSERT INTO file_assets (id, project_id, storage_key, original_filename, mime_type, byte_size, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [fileId, membership.projectId, storageKey, file.filename, file.mimeType, file.byteSize, user.id],
        );

        let uploadUrl: string;
        let headers: Record<string, string>;
        let expiresIn = 900;
        let storageMode: "filesystem" | "s3";
        if (isFilesystemStorage()) {
          uploadUrl = `/api/projects/${encodeURIComponent(projectCode)}/files/${fileId}/upload`;
          headers = { "content-type": file.mimeType };
          storageMode = "filesystem";
        } else {
          const signed = await createUploadUrl(storageKey, file.mimeType);
          uploadUrl = signed.url;
          headers = signed.headers;
          expiresIn = signed.expiresIn;
          storageMode = "s3";
        }
        results.push({
          index,
          filename: file.filename,
          status: "accepted",
          assetKind: kind,
          fileId,
          storageKey,
          byteSize: file.byteSize,
          mimeType: file.mimeType,
          documentTypeCode: file.documentTypeCode ?? (kind === "bim" ? "BIM" : "DRW"),
          title: file.title ?? file.filename.replace(/\.[^.]+$/, ""),
          isDrawing: file.isDrawing || kind === "drawing",
          uploadUrl,
          headers,
          expiresIn,
          storageMode,
          completeUrl: `/api/projects/${encodeURIComponent(projectCode)}/files/complete`,
          attachUrlHint: "After completion, attach fileId to a draft with POST /api/projects/{projectCode}/drafts/{draftId}/files",
        });
      } catch (error) {
        // The asset is only a reservation until a signed upload is returned.
        // Remove an unservable reservation so retries do not leave orphaned
        // file rows behind.
        await db.query("DELETE FROM file_assets WHERE id = $1 AND project_id = $2", [fileId, membership.projectId]).catch(() => undefined);
        results.push({ index, filename: file.filename, status: "rejected", assetKind: kind, error: { code: "PRESIGN_FAILED", message: error instanceof Error ? error.message : "The upload could not be prepared" } });
      }
    }

    const accepted = results.filter((result) => result.status === "accepted");
    const rejected = results.filter((result) => result.status === "rejected");
    if (accepted.length > 0) {
      await db.query(
        `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, payload, request_id)
         VALUES ($1, $2, 'file.batch.prepared', 'file_batch', $3::jsonb, $4)`,
        [membership.projectId, user.id, JSON.stringify({ count: accepted.length, rejected: rejected.length, files: accepted.map((file) => ({ fileId: file.fileId, filename: file.filename, assetKind: file.assetKind })) }), request.headers.get("x-request-id")],
      );
    }
    const status = accepted.length === 0 ? 400 : rejected.length > 0 ? 207 : 201;
    return NextResponse.json({ data: { total: results.length, accepted: accepted.length, rejected: rejected.length, totalBytes, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES, maxBatchBytes: MAX_BATCH_BYTES, results } }, { status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
