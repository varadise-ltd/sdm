/* Local regression coverage for draft attachments, IFC bytes and revision isolation. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

const base = process.env.SDM_BASE_URL || "http://localhost:3001";
const project = process.env.SDM_PROJECT || "P001";
const prefix = `/api/projects/${project}`;
const cookies = {};
async function request(path, { method = "GET", body, user = "pm", expected = 200, binary = false, redirect } = {}) {
  const response = await fetch(new URL(path, base), {
    method, redirect, signal: AbortSignal.timeout(120000),
    headers: { cookie: cookies[user] || "", ...(body && !binary ? { "content-type": "application/json" } : {}) },
    body: body ? binary ? body : JSON.stringify(body) : undefined,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, expected, `${method} ${path}: ${bytes.toString().slice(0, 180)}`);
  console.log(`PASS ${method} ${path} -> ${expected}`);
  let payload;
  try { payload = JSON.parse(bytes.toString()); } catch { /* Binary response. */ }
  return { response, payload, bytes };
}
for (const user of ["pm", "design"]) {
  const { response } = await request("/api/auth/login", { method: "POST", body: { email: `${user}.project001@sdm.local`, password: process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1" } });
  cookies[user] = response.headers.getSetCookie().map((cookie) => cookie.match(/sdm_session=[^;]+/)?.[0]).find(Boolean);
  assert(cookies[user]);
}
const fixture = await readFile(new URL("./fixtures/simple-wall.ifc", import.meta.url));
const title = `File regression ${Date.now()}`;
const { payload: draft } = await request(`${prefix}/drafts`, { method: "POST", expected: 201, body: { title, documentTypeCode: "BIM", isDrawing: true, libraryFolder: "Drawings/Structural", metadata: { typeCode: "DR", roleCode: "C" } } });
const draftId = draft.data.id;
await request(`${prefix}/drafts/${draftId}`, { method: "PATCH", body: { title: `${title} edited` } });
await request(`${prefix}/drafts/${draftId}/files`, { user: "design", expected: 404 });
await request(`${prefix}/files/presign`, { method: "POST", body: { filename: "empty.ifc", mimeType: "application/octet-stream", byteSize: 0 }, expected: 400 });
const { payload: reservation } = await request(`${prefix}/files/presign`, { method: "POST", expected: 201, body: { filename: "simple-wall.ifc", mimeType: "application/octet-stream", byteSize: fixture.length } });
const fileId = reservation.data.fileId;
await request(reservation.data.uploadUrl, { method: "PUT", binary: true, body: fixture, expected: 204 });
await request(`${prefix}/files/complete`, { method: "POST", body: { fileId, sha256Hex: createHash("sha256").update(fixture).digest("hex") } });
await request(`${prefix}/drafts/${draftId}/files`, { method: "POST", body: { fileId }, expected: 201 });
await request(`${prefix}/drafts/${draftId}/files`, { method: "POST", body: { fileId }, expected: 201 });
let attached;
for (let attempt = 0; attempt < 30; attempt++) {
  const { payload } = await request(`${prefix}/drafts/${draftId}/files`);
  assert.equal(payload.data.length, 1, "Retry must not duplicate attachments");
  attached = payload.data[0];
  assert.equal(attached.id, fileId);
  if (attached.virusScanStatus !== "pending") break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
assert.equal(attached.virusScanStatus, "clean", "Worker must release a clean IFC file");
await request(`${prefix}/files/${fileId}/download`, { user: "design", expected: 404 });
const { payload: download } = await request(`${prefix}/files/${fileId}/download`);
const { bytes } = await request(download.data.downloadUrl);
assert.deepEqual(bytes, fixture, "Downloaded IFC must match uploaded bytes");
const { response: direct } = await request(`${prefix}/files/${fileId}/download?redirect=1`, { expected: 307, redirect: "manual" });
assert(direct.headers.get("location").includes("/download/content"));
const { payload: submit } = await request(`${prefix}/drafts/${draftId}/submit`, { method: "POST", expected: 201 });
const { containerId, revisionId } = submit.data;
const { payload: revisionFiles } = await request(`/api/containers/${containerId}/files?revisionId=${revisionId}`);
assert.equal(revisionFiles.data[0].id, fileId);
const { payload: otherRevision } = await request(`/api/containers/${containerId}/files?revisionId=${randomUUID()}`);
assert.equal(otherRevision.data.length, 0, "Other revision must not return this model");
await request(`/api/containers/${containerId}/files?revisionId=invalid`, { expected: 400 });
for (const format of ["xlsx", "pdf"]) {
  const { bytes: exported } = await request(`${prefix}/exports/${format}`);
  assert(exported.length > 100);
  assert.equal(exported.subarray(0, format === "pdf" ? 4 : 2).toString(), format === "pdf" ? "%PDF" : "PK");
}
const { bytes: page } = await request("/");
const stylesheets = [...page.toString().matchAll(/href="([^"]+\.css[^\"]*)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
assert(stylesheets.length, "The workspace page must link its stylesheet");
for (const href of new Set(stylesheets)) {
  const { bytes: css } = await request(href);
  assert(css.length > 100, "CSS must load successfully rather than returning an empty/error page");
}
const { response: logout } = await request("/api/auth/oidc/logout", { expected: 307, redirect: "manual" });
assert.equal(logout.headers.get("location"), "/login", "Logout must retain the public browser host and port");
assert(logout.headers.getSetCookie().some((cookie) => cookie.includes("Max-Age=0")));
await request("/api/me", { expected: 401 });
console.log(`FILES PASS: IFC upload/download, private drafts, draft edit, idempotent attachment, selected revision, XLSX/PDF exports, logout. Test container: ${containerId}`);
