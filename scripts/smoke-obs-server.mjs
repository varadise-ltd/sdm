// Runs the production app against a local OBS protocol fixture with no CORS.
// Requires an isolated production build and the seeded local database/worker.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { once } from "node:events";
import { chromium, expect as baseExpect } from "@playwright/test";
import { waitForApp } from "./test-readiness.mjs";
import pg from "pg";

const expect = baseExpect.configure({ timeout: 60000 });
const buildDir = process.env.SDM_OBS_TEST_BUILD_DIR || ".next-verify";
await access(resolve("apps/web", buildDir, "BUILD_ID"));
const output = resolve("artifacts/functional-checks");
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(tmpdir(), "sdm-obs-test-"));
const objects = new Map(), requests = [], checks = [], errors = [];
const reservedIds = new Set();
const databaseUrl = process.env.DATABASE_URL || "postgresql://sdm:sdm_dev_password@127.0.0.1:5433/sdm";
const title = `OBS server upload ${Date.now()}`;
let rejectUploads = true, app, browser, page, draftId, fileId;
let serverLog = "";
async function listen(server) { server.listen(0, "127.0.0.1"); await once(server, "listening"); return server.address().port; }
const fixture = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const canonicalHeaders = Object.entries(request.headers).filter(([name]) => name.startsWith("x-amz-")).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}:${String(value).trim()}\n`).join("");
    const toSign = `${request.method}\n${request.headers["content-md5"] || ""}\n${request.headers["content-type"] || ""}\n${request.headers.date || ""}\n${canonicalHeaders}${url.pathname}`;
    const signature = createHmac("sha1", "fixture-secret").update(toSign).digest("base64");
    assert.equal(request.headers.authorization, `AWS fixture-ak:${signature}`, "The SDK must authenticate each server request");
    assert.equal(request.headers["x-amz-security-token"], "fixture-session-token");
    const parts = [];
    for await (const part of request) parts.push(part);
    requests.push({ method: request.method, path: decodeURIComponent(url.pathname) });
    response.setHeader("x-obs-request-id", "local-fixture");
    if (request.method === "PUT") {
      if (rejectUploads) { response.writeHead(403, { "content-type": "application/xml" }); response.end("<Error><Code>AccessDenied</Code><Message>Fixture denial</Message></Error>"); return; }
      const bytes = Buffer.concat(parts);
      assert.equal(Number(request.headers["content-length"]), bytes.length);
      assert.equal(request.headers["x-amz-meta-sha256"], createHash("sha256").update(bytes).digest("hex"));
      objects.set(decodeURIComponent(url.pathname), { bytes, mimeType: request.headers["content-type"] });
      response.writeHead(200, { etag: '"fixture-etag"' }); response.end(); return;
    }
    const object = objects.get(decodeURIComponent(url.pathname));
    if (!object) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-length": object.bytes.length, "content-type": object.mimeType });
    response.end(request.method === "HEAD" ? undefined : object.bytes);
  } catch (error) {
    errors.push(error.message);
    response.writeHead(500); response.end("Fixture validation failed");
  }
});
try {
  const fixturePort = await listen(fixture);
  const portProbe = createServer();
  const appPort = await listen(portProbe);
  await new Promise((done) => portProbe.close(done));
  const baseURL = `http://127.0.0.1:${appPort}`;
  app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
    cwd: resolve("apps/web"), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", SDM_BUILD_DIR: buildDir,
      DATABASE_URL: databaseUrl,
      SDM_AUTH_MODE: "local", S3_STORAGE_MODE: "obs", OBS_ENDPOINT: `http://127.0.0.1:${fixturePort}`,
      OBS_BUCKET: "sdm-obs-test", OBS_ACCESS_KEY_ID: "fixture-ak", OBS_SECRET_ACCESS_KEY: "fixture-secret",
      OBS_SECURITY_TOKEN: "fixture-session-token", SDM_UPLOAD_TEMP_DIR: staging },
  });
  app.stdout.on("data", (data) => { serverLog += data; });
  app.stderr.on("data", (data) => { serverLog += data; });
  await waitForApp(baseURL);
  browser = await chromium.launch({ channel: process.env.SDM_BROWSER || "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
  const login = await context.request.post("/api/auth/login", { data: { email: "pm.project001@sdm.local", password: process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1" } });
  expect(login.status()).toBe(200);
  page = await context.newPage();
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  const browserOrigins = new Set();
  page.on("request", (request) => browserOrigins.add(new URL(request.url()).origin));
  page.on("response", async (response) => {
    try {
    if (response.url().endsWith("/files/presign") && response.status() === 201) {
      const { data } = await response.json(); fileId = data.fileId;
      reservedIds.add(fileId);
      expect(data.uploadMode).toBe("server"); expect(data.storageMode).toBe("obs");
      expect(data.uploadUrl).toMatch(/^\/api\/projects\/P001\/files\/[a-f0-9-]+\/upload$/);
      expect(JSON.stringify(data)).not.toMatch(/fixture-ak|fixture-secret|Signature|AccessKeyId/);
    }
    if (response.url().endsWith("/drafts") && response.request().method() === "POST" && response.status() === 201) draftId = (await response.json()).data.id;
    } catch (error) { errors.push(error.message); }
  });
  async function api(path, options = {}, status = 200) {
    const response = await context.request.fetch(path, { ...options, timeout: 120000 });
    expect(response.status(), await response.text()).toBe(status);
    return response;
  }
  function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
  await page.goto("/");
  await page.getByRole("button", { name: "New submission", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New SDM submission" });
  await dialog.getByLabel("Document title").fill(title);
  await dialog.getByLabel("Submission file").setInputFiles(resolve("scripts/fixtures/simple-wall.ifc"));
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your draft is saved", { timeout: 120000 });
  expect(draftId).toBeTruthy(); expect(fileId).toBeTruthy();
  const prefix = "/api/projects/P001";
  await api(`${prefix}/files/complete`, { method: "POST", data: { fileId } }, 409);
  await api(`${prefix}/drafts/${draftId}/files`, { method: "POST", data: { fileId } }, 409);
  expect((await (await api(`${prefix}/drafts/${draftId}/files`)).json()).data).toHaveLength(0);
  expect(await readdir(staging)).toEqual([]);
  pass("OBS errors preserve the draft, clean staging files and block incomplete attachments");
  rejectUploads = false;
  await dialog.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 120000 });
  await expect(page.locator(".detail-head")).toContainText(title);
  await expect(page.locator(".file-list button")).toHaveCount(1);
  const filePath = `${prefix}/files/${fileId}`;
  await api(`${filePath}/upload`, { method: "PUT", data: Buffer.from("must not overwrite") }, 204);
  await api(`${prefix}/files/complete`, { method: "POST", data: { fileId, sha256Hex: "0".repeat(64) } }, 409);
  expect(objects.size).toBe(1);
  expect(await readdir(staging)).toEqual([]);
  pass("Retry stores one complete object with a server checksum and prevents later replacement");
  await page.getByRole("button", { name: "Open BIM viewer", exact: true }).click();
  await expect(page.locator(".bim-runtime-status")).toContainText("Model loaded", { timeout: 120000 });
  await page.screenshot({ path: resolve(output, "08-obs-server-ifc.png"), fullPage: true });
  await page.keyboard.press("Escape");
  const { data: download } = await (await api(`${filePath}/download?disposition=inline`)).json();
  expect(download.downloadUrl).toMatch(/^\/api\/.*\/download\/content\?disposition=inline$/);
  const content = await api(download.downloadUrl);
  expect(await content.body()).toEqual(await readFile(resolve("scripts/fixtures/simple-wall.ifc")));
  expect(content.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(content.headers()["cache-control"]).toBe("private, no-store");
  expect(content.headers()["content-security-policy"]).toBe("sandbox");
  expect([...browserOrigins]).toEqual([new URL(baseURL).origin]);
  pass("The browser uploads and renders an IFC through SDM without accessing OBS or requiring CORS");
  const design = await browser.newContext({ baseURL });
  expect((await design.request.post("/api/auth/login", { data: { email: "design.project001@sdm.local", password: process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1" } })).status()).toBe(200);
  expect((await design.request.put(`${filePath}/upload`, { data: Buffer.from("x") })).status()).toBe(404);
  expect((await design.request.get(download.downloadUrl)).status()).toBe(404);
  const pending = (await (await api(`${prefix}/files/presign`, { method: "POST", data: { filename: "truncated.ifc", mimeType: "application/octet-stream", byteSize: 100 } }, 201)).json()).data;
  reservedIds.add(pending.fileId);
  await api(pending.uploadUrl, { method: "PUT", data: Buffer.from("short") }, 409);
  await api(`${prefix}/files/complete`, { method: "POST", data: { fileId: pending.fileId } }, 409);
  expect(objects.size).toBe(1);
  const batch = (await (await api(`${prefix}/files/batch`, { method: "POST", data: { files: [{ filename: "batch.ifc", mimeType: "application/octet-stream", byteSize: 10 }] } }, 201)).json()).data;
  batch.results.forEach((entry) => { if (entry.fileId) reservedIds.add(entry.fileId); });
  expect(batch.results[0]).toMatchObject({ uploadMode: "server", storageMode: "obs" });
  expect(batch.results[0].uploadUrl).toMatch(/^\/api\//);
  expect(errors).toEqual([]);
  pass("Ownership, private downloads, truncated files and batch server reservations are enforced");
  const unicodeBytes = await readFile(resolve("scripts/fixtures/simple-wall.ifc"));
  const unicode = (await (await api(`${prefix}/files/presign`, { method: "POST", data: { filename: "建築模型.ifc", mimeType: "application/octet-stream", byteSize: unicodeBytes.length } }, 201)).json()).data;
  reservedIds.add(unicode.fileId);
  await api(unicode.uploadUrl, { method: "PUT", data: unicodeBytes }, 204);
  await api(`${prefix}/files/complete`, { method: "POST", data: { fileId: unicode.fileId } });
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    // Wait for the local development worker, including an unuploaded reservation.
    await expect.poll(async () => (await pool.query("SELECT virus_scan_status FROM file_assets WHERE id = $1", [unicode.fileId])).rows[0].virus_scan_status).toBe("clean");
    const unuploaded = (await pool.query("SELECT uploaded_at, virus_scan_status FROM file_assets WHERE id = $1", [pending.fileId])).rows[0];
    expect(unuploaded).toEqual({ uploaded_at: null, virus_scan_status: "pending" });
  } finally { await pool.end(); }
  const unicodeDownload = await api(`${prefix}/files/${unicode.fileId}/download/content`);
  expect(await unicodeDownload.body()).toEqual(unicodeBytes);
  expect(unicodeDownload.headers()["content-disposition"]).toContain(encodeURIComponent("建築模型.ifc"));
  pass("Unicode OBS keys round-trip correctly and the worker leaves unuploaded reservations quarantined");
} catch (error) {
  process.exitCode = 1; console.error(error.stack);
  await page?.screenshot({ path: resolve(output, "obs-failure.png"), fullPage: true }).catch(() => undefined);
} finally {
  await browser?.close();
  if (app && app.exitCode === null) { app.kill(); await once(app, "exit"); }
  fixture.closeAllConnections(); await new Promise((done) => fixture.close(done));
  const cleanup = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    if (draftId) await cleanup.query("DELETE FROM drafts WHERE id = $1 AND title = $2 AND status = 'open'", [draftId, title]);
    await cleanup.query("DELETE FROM file_assets fa WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM draft_files df WHERE df.file_id = fa.id) AND NOT EXISTS (SELECT 1 FROM revision_files rf WHERE rf.file_id = fa.id)", [[...reservedIds]]);
  } catch (error) { errors.push(`Fixture cleanup failed: ${error.message}`); process.exitCode = 1; }
  finally { await cleanup.end(); }
  await writeFile(resolve(output, "obs-server.log"), serverLog);
  await writeFile(resolve(output, "obs-results.json"), JSON.stringify({ checks, errors, requests, passed: !process.exitCode }, null, 2));
  if (!staging.startsWith(`${resolve(tmpdir())}${sep}sdm-obs-test-`)) throw new Error("Unexpected test staging path");
  await rm(staging, { recursive: true, force: true });
}
