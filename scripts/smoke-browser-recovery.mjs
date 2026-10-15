import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { waitForApp } from "./test-readiness.mjs";

const expect = baseExpect.configure({ timeout: 60000 });
const baseURL = process.env.SDM_BASE_URL || "http://localhost:3001";
const output = resolve("artifacts/functional-checks");
await mkdir(output, { recursive: true });
await waitForApp(baseURL);
const browser = await chromium.launch({ channel: process.env.SDM_BROWSER || "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const checks = [];
let mainPage;
try {
  const context = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
  const login = await context.request.post("/api/auth/login", { data: { email: "pm.project001@sdm.local", password: process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1" } });
  expect(login.status()).toBe(200);
  const page = await context.newPage();
  mainPage = page;
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);
  const counts = { drafts: 0, presigns: 0, uploads: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/projects/P001/drafts") counts.drafts++;
    if (request.method() === "POST" && path.endsWith("/files/presign")) counts.presigns++;
    if (request.method() === "PUT" && path.endsWith("/upload")) counts.uploads++;
  });
  let attachments = 0;
  let deferIfcScan = true;
  await page.route("**/api/projects/P001/drafts/*/files", async (route) => {
    if (route.request().method() === "POST" && attachments++ === 0) return route.fulfill({ status: 503, json: { error: { message: "Simulated attachment interruption" } } });
    if (route.request().method() === "GET") {
      const response = await route.fetch({ timeout: 120000 });
      const payload = await response.json();
      if (deferIfcScan) payload.data?.forEach((file) => { if (file.filename.endsWith(".ifc")) file.virusScanStatus = "pending"; });
      return route.fulfill({ response, json: payload });
    }
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "New submission" }).click();
  const dialog = page.getByRole("dialog", { name: "New SDM submission" });
  await dialog.getByLabel("Document title").fill(`Upload recovery ${Date.now()}`);
  await dialog.getByLabel("Submission file").setInputFiles(resolve("scripts/fixtures/simple-drawing.svg"));
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your draft is saved", { timeout: 120000 });
  await dialog.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 120000 });
  expect(counts).toEqual({ drafts: 1, presigns: 1, uploads: 1 });
  await expect(page.locator(".file-list button")).toHaveCount(1);
  checks.push("Interrupted attachment retry creates one draft and uploads the file once");
  console.log(`PASS ${checks.at(-1)}`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file", exact: true }).click();
  const ifcName = "測試模型.ifc";
  await (await chooser).setFiles({ name: ifcName, mimeType: "application/octet-stream", buffer: await readFile(resolve("scripts/fixtures/simple-wall.ifc")) });
  await expect(page.locator(".file-list button")).toHaveCount(2, { timeout: 120000 });
  await page.getByRole("button", { name: "Open BIM viewer", exact: true }).click();
  await expect(page.getByText("File scan is in progress; the model will open when it completes.")).toBeVisible();
  deferIfcScan = false;
  await expect(page.locator(".bim-runtime-status")).toContainText("Model loaded", { timeout: 120000 });
  await page.keyboard.press("Escape");
  const ifcDownload = page.locator(".file-list button").filter({ hasText: ifcName });
  await expect(ifcDownload).toBeEnabled({ timeout: 120000 });
  const downloaded = page.waitForEvent("download", { timeout: 120000 });
  await ifcDownload.click();
  expect((await downloaded).suggestedFilename()).toBe(ifcName);
  await page.screenshot({ path: resolve(output, "06-upload-recovery.png"), fullPage: true });
  checks.push("Existing drafts support scan-to-view loading and downloads of Unicode IFC filenames");
  console.log(`PASS ${checks.at(-1)}`);
  const client = await browser.newContext({ baseURL });
  expect((await client.request.post("/api/auth/login", { data: { email: "client.project001@sdm.local", password: process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1" } })).status()).toBe(200);
  const me = await (await client.request.get("/api/me")).json();
  expect(me.data.memberships.find((membership) => membership.projectCode === "P001").permissions["documents.create"]).toBe(false);
  const clientPage = await client.newPage();
  await clientPage.goto("/", { timeout: 120000 });
  await expect(clientPage.getByText("Checking your SDM session…")).toBeHidden();
  await expect(clientPage.getByRole("button", { name: "New submission" })).toBeDisabled();
  await expect(clientPage.getByRole("button", { name: "Batch upload", exact: true })).toBeDisabled();
  await expect(clientPage.locator(".detail-drawer").getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  checks.push("Client account shows its server-enforced creation and editing restrictions");
  console.log(`PASS ${checks.at(-1)}`);
} catch (error) {
  if (mainPage) {
    await mainPage.screenshot({ path: resolve(output, "recovery-failure.png"), fullPage: true }).catch(() => undefined);
    await writeFile(resolve(output, "recovery-failure.txt"), `${error.message}\n${await mainPage.locator("body").innerText().catch(() => "")}`);
  }
  console.error(error.message); process.exitCode = 1;
}
finally {
  await mainPage?.unrouteAll({ behavior: "ignoreErrors" });
  await writeFile(resolve(output, "recovery-results.json"), JSON.stringify({ checks, passed: !process.exitCode }, null, 2));
  await browser.close();
}
