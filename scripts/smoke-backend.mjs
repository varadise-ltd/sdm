#!/usr/bin/env node
/*
 * Runnable local acceptance smoke test for the SDM API.
 *
 * It intentionally creates uniquely named local records so the workflow,
 * storage, transmittal, and resubmission state machine are exercised from the
 * public API. Set SDM_BASE_URL/SDM_USER_EMAIL to run against another local
 * instance. The script requires local auth/development mode and the seeded
 * P001 project.
 */
import crypto from "node:crypto";

const base = process.env.SDM_BASE_URL ?? "http://localhost:3001";
const users = {
  pm: process.env.SDM_PM_EMAIL ?? "pm.project001@sdm.local",
  dc: process.env.SDM_DC_EMAIL ?? "dc.project001@sdm.local",
  design: process.env.SDM_DESIGN_EMAIL ?? "design.project001@sdm.local",
  supplier: process.env.SDM_SUPPLIER_EMAIL ?? "supplier.project001@sdm.local",
  client: process.env.SDM_CLIENT_EMAIL ?? "client.project001@sdm.local",
};
const project = process.env.SDM_PROJECT ?? "P001";
const password = process.env.SDM_SMOKE_PASSWORD ?? "SdmLocal!1";
const failures = [];
const now = Date.now();
const sessions = new Map();

async function loginAs(user) {
  const email = users[user] ?? user;
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    failures.push(`POST /api/auth/login (${user}) expected 200, got ${response.status}`);
    return undefined;
  }
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  const sessionCookie = setCookies.map((value) => value.match(/sdm_session=[^;]+/)?.[0]).find(Boolean);
  if (!sessionCookie) {
    failures.push(`POST /api/auth/login (${user}) did not return an SDM session cookie`);
    return undefined;
  }
  sessions.set(user, sessionCookie);
  return sessionCookie;
}

async function request(method, path, user = "pm", body, expected = undefined, raw = false) {
  const cookie = sessions.get(user) ?? await loginAs(user);
  const headers = { accept: "application/json", "x-sdm-user-email": users[user] ?? user };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined && !raw) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* binary or plain text */ }
  const allowed = expected ?? (response.status >= 200 && response.status < 300 ? [response.status] : []);
  const ok = Array.isArray(allowed) ? allowed.includes(response.status) : response.status === allowed;
  if (!ok) failures.push(`${method} ${path} expected ${allowed.join?.("/") ?? allowed}, got ${response.status}: ${String(text).slice(0, 240)}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${method} ${path} -> ${response.status}`);
  return { response, status: response.status, data };
}

function expect(condition, message) {
  if (!condition) failures.push(message);
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
}

const health = await request("GET", "/api/health");
expect(health.data?.status === "ok" && health.data?.database === "ok", "health and database are available");
await request("GET", `/api/containers?project=${project}`);
await request("GET", `/api/search?project=${project}&q=site`);
await request("GET", `/api/projects/${project}/settings`);
await request("GET", `/api/projects/${project}/members`);
await request("GET", `/api/projects/${project}/workflows`);
await request("GET", `/api/projects/${project}/forms`);
await request("GET", `/api/projects/${project}/tasks`);
await request("GET", `/api/projects/${project}/alerts`);
await request("GET", `/api/projects/${project}/settings`, "client", undefined, [403]);
await request("GET", `/api/projects/${project}/workflows`, "client", undefined, [403]);

const title = `API smoke ${now}`;
const draft = await request("POST", `/api/projects/${project}/drafts`, "pm", {
  title, documentTypeCode: "DC", isDrawing: false, isInternal: false,
  metadata: { originatorCode: "CON", volumeCode: "ZZ", levelCode: "01", typeCode: "DC", roleCode: "C" },
});
const draftId = draft.data?.data?.id;
expect(Boolean(draftId), "draft is created");

const file = await request("POST", `/api/projects/${project}/files/presign`, "pm", {
  filename: `smoke-${now}.txt`, mimeType: "text/plain", byteSize: 11,
});
const fileId = file.data?.data?.fileId;
expect(Boolean(fileId), "file upload is presigned");
if (fileId) {
  await request("PUT", `/api/projects/${project}/files/${fileId}/upload`, "pm", undefined, [400, 409], false);
  await request("PUT", `/api/projects/${project}/files/${fileId}/upload`, "pm", Buffer.from("hello world"), [204], true);
  const hash = crypto.createHash("sha256").update("hello world").digest("hex");
  await request("POST", `/api/projects/${project}/files/complete`, "pm", { fileId, sha256Hex: hash });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  await request("POST", `/api/projects/${project}/drafts/${draftId}/files`, "pm", { fileId });
}

const submitted = await request("POST", `/api/projects/${project}/drafts/${draftId}/submit`, "pm");
const containerId = submitted.data?.data?.containerId;
const revisionId = submitted.data?.data?.revisionId;
expect(Boolean(containerId && revisionId), "draft is promoted to an ISO revision");
if (containerId && revisionId) {
  await request("GET", `/api/containers/${containerId}/files`);
  await request("GET", `/api/containers/${containerId}/tags`);
  await request("GET", `/api/projects/${project}/revisions/${revisionId}/workflow`);
  let signed = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const workflow = await request("GET", `/api/projects/${project}/revisions/${revisionId}/workflow`);
    const active = workflow.data?.data?.steps?.find((step) => step.stepStatus === "in_progress");
    if (!active) break;
    const signer = active.assigneeName?.includes("Design") ? "design"
      : active.assigneeName?.includes("Document") ? "dc"
      : active.assigneeName?.includes("Supplier") ? "supplier"
      : active.assigneeName?.includes("Subcontractor") ? "pm"
      : active.assigneeName?.includes("Client") ? "client"
      : "pm";
    const result = await request("POST", `/api/projects/${project}/revisions/${revisionId}/workflow`, signer, { stepId: active.stepId });
    if (result.status !== 200) break;
    signed += 1;
  }
  expect(signed >= 1, "workflow signatures can advance");
  const transmittal = await request("POST", `/api/projects/${project}/transmittals`, "pm", { subject: `${title} transmittal`, recipientPartyCode: "CLI", revisionIds: [revisionId] });
  if (transmittal.data?.data?.id) {
    await request("POST", `/api/projects/${project}/transmittals/${transmittal.data.data.id}/send`, "pm");
    const asClient = await request("GET", `/api/containers?project=${project}`, "client");
    const item = asClient.data?.data?.find((row) => row.revisionId === revisionId);
    if (item?.transmittalItemId) {
      const decision = await request("POST", `/api/projects/${project}/client-decisions`, "client", { transmittalItemId: item.transmittalItemId, responseCode: "C", comments: "smoke resubmit" });
      if (decision.status === 200) {
        const resubmission = await request("POST", `/api/projects/${project}/revisions/${revisionId}/resubmit`, "pm");
        expect(resubmission.data?.data?.revisionCode === "P02", "returned C revision creates P02 resubmission");
      }
    }
  }
}

// A workflow template cannot be activated without steps; this protects the
// setup UI from creating a template that would silently skip all workflow work.
const empty = await request("POST", `/api/projects/${project}/workflows`, "pm", { slug: `smoke-empty-${now}`, name: "Smoke empty" });
if (empty.data?.data?.id) {
  await request("PATCH", `/api/projects/${project}/workflows/${empty.data.data.id}`, "pm", { active: true }, [409]);
  await request("DELETE", `/api/projects/${project}/workflows/${empty.data.data.id}`, "pm");
}

if (failures.length) {
  console.error(`\nSMOKE FAILURES (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nSMOKE PASS: SDM API acceptance flow completed");
}
