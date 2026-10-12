import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export type StorageConfig = {
  bucket: string;
  region: string;
  expiresIn: number;
};

let client: S3Client | undefined;

export function isFilesystemStorage(): boolean {
  return (process.env.S3_STORAGE_MODE ?? (process.env.NODE_ENV === "development" ? "filesystem" : "s3")) === "filesystem";
}

function localObjectPath(key: string): string {
  const root = resolve(process.env.S3_LOCAL_DIR ?? resolve(process.cwd(), ".local-storage"));
  const destination = resolve(root, key);
  if (destination !== root && !destination.startsWith(`${root}/`) && !destination.startsWith(`${root}\\`)) {
    throw new Error("Invalid storage key");
  }
  return destination;
}

function storageConfig(): StorageConfig {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION ?? "auto";
  if (!bucket) throw new Error("S3_BUCKET is required");
  const expiresIn = Math.min(Math.max(Number(process.env.S3_SIGNED_URL_TTL_SECONDS ?? 900), 60), 3600);
  return { bucket, region, expiresIn };
}

function s3Client(): S3Client {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT;
  // S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are the canonical names. The short
  // aliases keep the local MinIO compose profile compatible with existing
  // deployments and are intentionally read only on the server.
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required");
  client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename.normalize("NFKC").replace(/[\\/\u0000-\u001f]/g, "_").replace(/[^\p{L}\p{N}._ ()-]/gu, "_").trim();
  return (cleaned || "upload.bin").slice(0, 180);
}

export function buildStorageKey(projectId: string, fileId: string, filename: string): string {
  return `projects/${projectId}/files/${fileId}/${sanitizeFilename(filename)}`;
}

export async function createUploadUrl(key: string, contentType: string) {
  const config = storageConfig();
  const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType });
  return {
    url: await getSignedUrl(s3Client(), command, { expiresIn: config.expiresIn }),
    expiresIn: config.expiresIn,
    headers: { "content-type": contentType },
  };
}

export async function writeLocalObject(key: string, body: ReadableStream<Uint8Array>, expectedSize: number): Promise<void> {
  const destination = localObjectPath(key);
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), createWriteStream(destination, { mode: 0o600 }));
  const actual = (await stat(destination)).size;
  if (actual !== expectedSize) throw new Error("Uploaded object size does not match the declared size");
}

export async function localObjectStats(key: string) {
  return stat(localObjectPath(key));
}

export function localObjectReadStream(key: string) {
  return createReadStream(localObjectPath(key));
}

export async function createDownloadUrl(key: string, filename: string, inline = false) {
  const config = storageConfig();
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(sanitizeFilename(filename))}`;
  const command = new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseContentDisposition: disposition });
  return {
    url: await getSignedUrl(s3Client(), command, { expiresIn: config.expiresIn }),
    expiresIn: config.expiresIn,
  };
}

export async function headStoredObject(key: string) {
  if (isFilesystemStorage()) return { ContentLength: (await localObjectStats(key)).size };
  const config = storageConfig();
  return s3Client().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function deleteStoredObject(key: string): Promise<void> {
  if (isFilesystemStorage()) {
    const { rm } = await import("node:fs/promises");
    await rm(localObjectPath(key), { force: true });
    return;
  }
  const config = storageConfig();
  await s3Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

