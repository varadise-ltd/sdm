import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { waitForApp } from "./test-readiness.mjs";

const baseURL = process.env.SDM_BASE_URL || "http://localhost:3001";
const output = resolve("artifacts/functional-checks");
const expect = baseExpect.configure({ timeout: 45000 });
await mkdir(output, { recursive: true });
await waitForApp(baseURL);
const browser = await chromium.launch({ channel: process.env.SDM_BROWSER || "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120000);
const errors = [], checks = [];
page.on("pageerror", (error) => errors.push(error.message));
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
async function screenshot(name) { await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true }); }
const fixture = resolve("scripts/fixtures/simple-wall.ifc");
const title = `Browser check ${Date.now()}`;
try {
  await check("Login through the sign-in form", async () => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("pm.project001@sdm.local");
    await page.getByLabel("Password", { exact: true }).fill(process.env.SDM_SMOKE_PASSWORD || "SdmLocal!1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "New submission" })).toBeVisible({ timeout: 120000 });
    await expect(page.getByText("Checking your SDM session…")).toBeHidden({ timeout: 120000 });
    await expect(page.getByText("Loading the live document register…")).toBeHidden({ timeout: 120000 });
    await screenshot("01-workspace");
  });
  await check("File chooser, draft upload, attachment and automatic scan refresh", async () => {
    await page.getByRole("button", { name: "New submission" }).click();
    const dialog = page.getByRole("dialog", { name: "New SDM submission" });
    await dialog.getByLabel("Document title").fill(title);
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Drop a file or choose from your computer" }).click();
    await (await chooser).setFiles(fixture);
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 120000 });
    await expect(page.locator(".detail-head")).toContainText(title);
    await expect(page.locator(".file-list button").filter({ hasText: "simple-wall.ifc" })).toBeEnabled({ timeout: 120000 });
    await screenshot("02-draft-attachment");
  });
  await check("Draft Edit saves metadata", async () => {
    await page.locator(".detail-drawer").getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit document details" });
    await dialog.getByLabel("Title", { exact: true }).fill(`${title} edited`);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".detail-head")).toContainText(`${title} edited`);
  });
  await check("Move preserves the selected draft", async () => {
    await page.locator(".detail-drawer").getByRole("button", { name: "Move", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination folder").selectOption("Documents/Design");
    await dialog.getByRole("button", { name: "Move document" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".detail-head")).toContainText(`${title} edited`);
    await expect(page.locator(".meta-grid")).toContainText("Design");
  });
  await check("IFC renders visible geometry and viewer controls work", async () => {
    await page.getByRole("button", { name: "Open BIM viewer", exact: true }).click();
    await expect(page.locator(".bim-runtime-status")).toContainText("Model loaded", { timeout: 120000 });
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    await screenshot("03-ifc-rendered");
    await page.getByRole("button", { name: "Viewer settings", exact: true }).click();
    await page.getByLabel("Camera mode").selectOption("firstPerson");
    await page.getByLabel("Show model edges").uncheck();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".bim-runtime-status")).toContainText("First person · edges off", { timeout: 120000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
  await check("Drawer close, reopen, enlarge, restore and tabs respond", async () => {
    await page.getByRole("button", { name: "Close details", exact: true }).click();
    await page.getByRole("button", { name: "Open details", exact: true }).click();
    await page.getByRole("button", { name: "Enlarge details panel" }).click();
    await expect(page.getByRole("button", { name: "Restore details panel" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Restore details panel" }).click();
    for (const name of ["Workflow", "Revisions", "Links", "Activity", "Overview"]) await page.locator(".detail-tabs").getByRole("button", { name, exact: true }).click();
  });
  await check("Navigation opens and dismisses working panels", async () => {
    for (const name of ["Workflows", "People", "Connections", "Settings", "Help"]) {
      await page.locator(".rail").getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
    await page.locator(".rail").getByRole("button", { name: "Repository", exact: true }).click();
    await expect(page.locator(".board-area")).toBeVisible();
  });
  await check("Batch file upload attaches every queued file", async () => {
    await page.getByRole("button", { name: "Batch upload", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles([fixture, resolve("scripts/fixtures/simple-drawing.svg")]);
    await dialog.getByRole("button", { name: "Upload 2", exact: true }).click();
    await expect(dialog.locator(".batch-complete")).toHaveCount(2, { timeout: 120000 });
    await screenshot("04-batch-upload");
    await page.keyboard.press("Escape");
  });
  await check("Search retains drafts and accepts filename matches", async () => {
    const search = page.getByRole("textbox", { name: "Search SDM" });
    await search.fill(title);
    await expect(page.locator(".container-row").filter({ hasText: title })).toBeVisible();
    await page.getByRole("button", { name: "Submit draft", exact: true }).click();
    await expect(page.locator(".detail-head")).not.toContainText("DRAFT-");
    await search.fill("simple-wall");
    await expect(page.locator(".container-row").filter({ hasText: title })).toBeVisible({ timeout: 45000 });
    await search.fill("");
  });
  await check("Register Excel and PDF buttons download usable files", async () => {
    await page.locator(".rail").getByRole("button", { name: "Register", exact: true }).click();
    for (const [name, extension] of [["Export Excel", "xlsx"], ["Download PDF", "pdf"]]) {
      const downloaded = page.waitForEvent("download", { timeout: 120000 });
      await page.getByRole("button", { name, exact: true }).click();
      const download = await downloaded;
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toContain(extension);
    }
  });
  await check("Profile menu Sign out returns to login", async () => {
    await page.getByRole("button", { name: "Open user menu", exact: true }).first().click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: 45000 });
    await screenshot("05-logout");
  });
  expect(errors).toEqual([]);
  console.log(`BROWSER PASS: ${checks.length} end-to-end checks`);
} catch (error) {
  await screenshot("failure");
  await writeFile(resolve(output, "failure.txt"), `${error.stack}\nBrowser errors:\n${errors.join("\n")}\n${await page.locator("body").innerText()}`);
  console.error(error); process.exitCode = 1;
} finally {
  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks, errors, passed: !process.exitCode }, null, 2));
  await browser.close();
}
