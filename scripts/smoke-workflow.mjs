import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { waitForApp } from "./test-readiness.mjs";

const expect = baseExpect.configure({ timeout: 60000 });
const baseURL = process.env.SDM_BASE_URL || "http://localhost:3001";
const project = process.env.SDM_PROJECT || "P001";
const output = resolve("artifacts/functional-checks");
await mkdir(output, { recursive: true });
await waitForApp(baseURL);
const browser = await chromium.launch({ channel: process.env.SDM_BROWSER || "msedge", headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
context.setDefaultTimeout(60000);
const checks = [], errors = [];
let page, workflowPath;
async function check(name, run) {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function api(method, path, data, status) {
  const response = await context.request.fetch(path, { method, data, timeout: 120000 });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(status);
  return response.json();
}
try {
  await api("POST", "/api/auth/login", {
    email: process.env.SDM_PM_EMAIL || "pm.project001@sdm.local",
    password: process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1",
  }, 200);
  const name = `Workflow validation ${Date.now()}`;
  const workflow = await api("POST", `/api/projects/${project}/workflows`, {
    name, slug: `validation_${Date.now()}`,
  }, 201);
  // Keep this disposable template inactive so existing submissions are unaffected.
  workflowPath = `/api/projects/${project}/workflows/${workflow.data.id}`;
  page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  const panel = page.getByRole("region", { name: "Workflow setup", exact: true });
  await panel.getByRole("button", { name, exact: false }).click();
  await check("The Add step button accepts a single-letter key and persists the step", async () => {
    await panel.getByLabel("New step key", { exact: true }).fill("a");
    await panel.getByLabel("New step display name").fill("Endorse");
    const response = page.waitForResponse((response) => response.url().endsWith(`${workflowPath}/steps`) && response.request().method() === "POST");
    await panel.getByRole("button", { name: "Add step", exact: true }).click();
    expect((await response).status()).toBe(201);
    await expect(panel.getByLabel("Step 1 key", { exact: true })).toHaveValue("a");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    const persisted = await api("GET", workflowPath, undefined, 200);
    expect(persisted.data.steps[0]).toMatchObject({ stepKey: "a", displayName: "Endorse", required: true, requiredRoleSlug: "contractor_pm" });
  });
  const initial = await api("GET", workflowPath, undefined, 200);
  const stepPath = `${workflowPath}/steps/${initial.data.steps[0].id}`;
  await check("Editing a step to another single letter succeeds and survives reload", async () => {
    const response = page.waitForResponse((response) => response.url().endsWith(stepPath) && response.request().method() === "PATCH");
    await panel.getByLabel("Step 1 key", { exact: true }).fill("b");
    await panel.getByLabel("Step 1 key", { exact: true }).press("Tab");
    expect((await response).status()).toBe(200);
    await expect(panel.getByLabel("Step 1 key", { exact: true })).toHaveValue("b");
    await page.reload();
    await page.getByRole("button", { name: "Workflows", exact: true }).click();
    await panel.getByRole("button", { name, exact: false }).click();
    await expect(panel.getByLabel("Step 1 key", { exact: true })).toHaveValue("b");
    await page.screenshot({ path: resolve(output, "07-workflow-single-letter.png"), fullPage: true });
  });
  const stepData = { displayName: "Review", required: true, requiredRoleSlug: "contractor_pm" };
  await check("Both endpoints accept normalization, permitted punctuation and 64-character keys", async () => {
    for (const [input, normalized] of [[" C ", "c"], ["Review_1.2-final", "review_1.2-final"], ["z".repeat(64), "z".repeat(64)]]) {
      expect((await api("POST", `${workflowPath}/steps`, { ...stepData, stepKey: input }, 201)).data.stepKey).toBe(normalized);
      expect((await api("PATCH", stepPath, { stepKey: ` ${normalized.toUpperCase()} ` }, 409)).error.code).toBe("CONFLICT");
    }
    expect((await api("PATCH", stepPath, { stepKey: " D " }, 200)).data.stepKey).toBe("d");
    expect((await api("PATCH", stepPath, { stepKey: "approve_1.2-final" }, 200)).data.stepKey).toBe("approve_1.2-final");
    expect((await api("PATCH", stepPath, { stepKey: "x".repeat(64) }, 200)).data.stepKey).toHaveLength(64);
  });
  await check("Invalid creates and edits return 400 without changing saved steps", async () => {
    const before = (await api("GET", workflowPath, undefined, 200)).data.steps;
    for (const stepKey of ["", " ", "1", "1review", "_review", "review step", "review/step", "a".repeat(65)]) {
      expect((await api("POST", `${workflowPath}/steps`, { ...stepData, stepKey }, 400)).error.code).toBe("INVALID_REQUEST");
      expect((await api("PATCH", stepPath, { stepKey }, 400)).error.code).toBe("INVALID_REQUEST");
    }
    expect((await api("GET", workflowPath, undefined, 200)).data.steps).toEqual(before);
  });
  await check("Duplicate keys remain blocked and ordered steps remain consecutive", async () => {
    expect((await api("POST", `${workflowPath}/steps`, { ...stepData, stepKey: "c" }, 409)).error.code).toBe("CONFLICT");
    const steps = (await api("GET", workflowPath, undefined, 200)).data.steps;
    expect(steps.map((step) => step.sequenceNo)).toEqual(steps.map((_, index) => index + 1));
    expect(errors).toEqual([]);
  });
} catch (error) {
  process.exitCode = 1;
  console.error(error.message);
  await page?.screenshot({ path: resolve(output, "workflow-failure.png"), fullPage: true }).catch(() => undefined);
} finally {
  if (workflowPath) {
    try { await api("DELETE", workflowPath, undefined, 200); }
    catch (error) { console.error(`Test template cleanup failed: ${error.message}`); process.exitCode = 1; }
  }
  await writeFile(resolve(output, "workflow-results.json"), JSON.stringify({ checks, errors, passed: !process.exitCode }, null, 2));
  await browser.close();
}
