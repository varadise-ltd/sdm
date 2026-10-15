import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import ObsClient from "esdk-obs-nodejs";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";

export class StorageError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}
export function storageErrorResponse(error: unknown): Response | undefined {
  if (error instanceof StorageError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
}

export function storageMode(): "filesystem" | "s3" | "obs" {
  const mode = process.env.S3_STORAGE_MODE;
  if (mode === "filesystem") return "filesystem";
  // Existing deployments can keep S3_* environment names for Huawei OBS.
  if (mode === "obs" || process.env.OBS_ENDPOINT || /\.myhuaweicloud\.(com|cn)(?::\d+)?\/?$/i.test(process.env.S3_ENDPOINT ?? "")) return "obs";
  if (mode && mode !== "s3") throw new StorageError("STORAGE_CONFIGURATION", "The server storage mode is invalid", 503);
  return mode === "s3" || process.env.NODE_ENV !== "development" ? "s3" : "filesystem";
}
export function isFilesystemStorage(): boolean { return storageMode() === "filesystem"; }
function localObjectPath(key: string): string {
  const root = resolve(process.env.S3_LOCAL_DIR ?? resolve(process.cwd(), ".local-storage"));
  const destination = resolve(root, key);
  if (!destination.startsWith(`${root}/`) && !destination.startsWith(`${root}\\`)) throw new StorageError("INVALID_STORAGE_KEY", "Invalid storage key", 400);
  return destination;
}
function cloudConfig() {
  const obs = storageMode() === "obs";
  const bucket = (obs ? process.env.OBS_BUCKET : undefined) || process.env.S3_BUCKET;
  const endpoint = (obs ? process.env.OBS_ENDPOINT : undefined) || process.env.S3_ENDPOINT;
  const accessKeyId = (obs ? process.env.OBS_ACCESS_KEY_ID : undefined) || process.env.S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY;
  const secretAccessKey = (obs ? process.env.OBS_SECRET_ACCESS_KEY : undefined) || process.env.S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY;
  const sessionToken = (obs ? process.env.OBS_SECURITY_TOKEN : undefined) || process.env.S3_SESSION_TOKEN;
  if (!bucket || !accessKeyId || !secretAccessKey || (obs && !endpoint)) throw new StorageError("STORAGE_CONFIGURATION", "Object storage is not configured on the server. Ask the administrator to check the endpoint, bucket and credentials.", 503);
  if (endpoint) {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new StorageError("STORAGE_CONFIGURATION", "The server storage endpoint must be a valid HTTP or HTTPS URL", 503); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new StorageError("STORAGE_CONFIGURATION", "Use the regional storage endpoint without a bucket path or query string", 503);
  }
  return { bucket, endpoint, accessKeyId, secretAccessKey, sessionToken };
}
export function assertStorageConfigured() { if (!isFilesystemStorage()) cloudConfig(); }
let s3: S3Client | undefined;
let obs: ObsClient | undefined;
function s3Client() {
  if (s3) return s3;
  const config = cloudConfig();
  s3 = new S3Client({
    region: process.env.S3_REGION || "auto", endpoint: config.endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === undefined ? Boolean(config.endpoint) : process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return s3;
}
function obsClient() {
  if (obs) return obs;
  const config = cloudConfig();
  const configuredTimeout = Number(process.env.OBS_TIMEOUT_SECONDS || 900);
  obs = new ObsClient({
    access_key_id: config.accessKeyId, secret_access_key: config.secretAccessKey, security_token: config.sessionToken,
    server: config.endpoint!, ssl_verify: true, max_retry_count: 2,
    timeout: Number.isFinite(configuredTimeout) ? Math.min(Math.max(configuredTimeout, 30), 3600) : 900,
    is_signature_negotiation: false,
  });
  return obs;
}
function checkObs(result: Awaited<ReturnType<ObsClient["getObjectMetadata"]>>) {
  if (result.CommonMsg.Status >= 200 && result.CommonMsg.Status < 300 && result.InterfaceResult) return result.InterfaceResult;
  if (result.CommonMsg.Status === 404) throw new StorageError("OBJECT_NOT_FOUND", "The uploaded object was not found in storage", 404);
  throw new StorageError("STORAGE_UNAVAILABLE", "Object storage rejected the request. Ask the administrator to check bucket permissions and server credentials, then retry.");
}
function cloudError(error: unknown): never {
  if (error instanceof StorageError) throw error;
  if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) throw new StorageError("OBJECT_NOT_FOUND", "The uploaded object was not found in storage", 404);
  throw new StorageError("STORAGE_UNAVAILABLE", "The server could not reach object storage. Retry to continue; your draft is saved.");
}
export function sanitizeFilename(filename: string): string {
  const cleaned = filename.normalize("NFKC").replace(/[\\/\u0000-\u001f]/g, "_").replace(/[^\p{L}\p{N}._ ()-]/gu, "_").trim();
  return (cleaned || "upload.bin").slice(0, 180);
}
export function buildStorageKey(projectId: string, fileId: string, filename: string): string {
  return `projects/${projectId}/files/${fileId}/${sanitizeFilename(filename)}`;
}

/** Stage to bounded disk, verify the exact size, then upload with server credentials.
 * A replayable file lets the cloud SDK retry without retaining an IFC in memory. */
export async function writeStoredObject(key: string, body: ReadableStream<Uint8Array>, expectedSize: number, contentType: string): Promise<string> {
  assertStorageConfigured();
  const root = resolve(process.env.SDM_UPLOAD_TEMP_DIR || tmpdir());
  await mkdir(root, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(root, "sdm-upload-"));
  const temporaryFile = join(temporaryDirectory, "body");
  let bytes = 0;
  const hash = createHash("sha256");
  const measure = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > expectedSize) return callback(new StorageError("SIZE_MISMATCH", "Uploaded object size does not match the declared size", 409));
    hash.update(chunk);
    callback(null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), measure, createWriteStream(temporaryFile, { mode: 0o600 }));
    if (bytes !== expectedSize) throw new StorageError("SIZE_MISMATCH", "Uploaded object size does not match the declared size", 409);
    const sha256Hex = hash.digest("hex");
    if (isFilesystemStorage()) {
      const destination = localObjectPath(key);
      await mkdir(dirname(destination), { recursive: true });
      // Temporary storage may be on a different filesystem from the repository.
      try {
        await pipeline(createReadStream(temporaryFile), createWriteStream(`${destination}.uploading`, { mode: 0o600 }));
        await rename(`${destination}.uploading`, destination);
      } finally { await rm(`${destination}.uploading`, { force: true }); }
    } else {
      try {
        const config = cloudConfig();
        if (storageMode() === "obs") checkObs(await obsClient().putObject({ Bucket: config.bucket, Key: key, SourceFile: temporaryFile, ContentType: contentType, ContentLength: bytes, Metadata: { sha256: sha256Hex } }));
        else await s3Client().send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: createReadStream(temporaryFile), ContentType: contentType, ContentLength: bytes, Metadata: { sha256: sha256Hex } }));
        const stored = await headStoredObject(key);
        if (Number(stored.ContentLength) !== expectedSize) throw new StorageError("SIZE_MISMATCH", "Object storage did not retain the complete file. Retry the upload.", 409);
      } catch (error) { cloudError(error); }
    }
    return sha256Hex;
  } finally {
    await rm(temporaryFile, { force: true });
    await rmdir(temporaryDirectory);
  }
}
export async function headStoredObject(key: string): Promise<{ ContentLength?: number | string }> {
  if (isFilesystemStorage()) {
    try { return { ContentLength: (await stat(localObjectPath(key))).size }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageError("OBJECT_NOT_FOUND", "The uploaded object was not found in storage", 404); throw error; }
  }
  try {
    const config = cloudConfig();
    if (storageMode() === "obs") return checkObs(await obsClient().getObjectMetadata({ Bucket: config.bucket, Key: key }));
    return await s3Client().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) { cloudError(error); }
}
export async function storedObjectReadStream(key: string): Promise<Readable> {
  if (isFilesystemStorage()) { await headStoredObject(key); return createReadStream(localObjectPath(key)); }
  try {
    const config = cloudConfig();
    if (storageMode() === "obs") {
      const result = checkObs(await obsClient().getObject({ Bucket: config.bucket, Key: key, SaveAsStream: true }));
      if (result.Content instanceof Readable) return result.Content;
    } else {
      const result = await s3Client().send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (result.Body instanceof Readable) return result.Body;
    }
    throw new StorageError("STORAGE_UNAVAILABLE", "Object storage did not return a readable file");
  } catch (error) { cloudError(error); }
}
export async function deleteStoredObject(key: string): Promise<void> {
  if (isFilesystemStorage()) { await rm(localObjectPath(key), { force: true }); return; }
  try {
    const config = cloudConfig();
    if (storageMode() === "obs") checkObs(await obsClient().deleteObject({ Bucket: config.bucket, Key: key }));
    else await s3Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) { cloudError(error); }
}
