const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8000");
  await page.waitForSelector(".node-card");
  assert.equal(await page.locator(".node-card").count(), 3);
  await page.click("#addSupplier");
  assert.equal(await page.locator(".node-card").count(), 4);
  await page.click("#duplicateBtn");
  assert.equal(await page.locator(".node-card").count(), 5);
  await page.click("#undoBtn");
  assert.equal(await page.locator(".node-card").count(), 4);
  await page.click("#redoBtn");
  assert.equal(await page.locator(".node-card").count(), 5);
  await page.click("#stepBtn");
  await page.waitForFunction(() => window.state.day === 1);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector(".node-card");
  assert.equal(await page.locator(".node-card").count(), 5);
  await page.setInputFiles("#importScenarioInput", {
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '{"nodes":[],"links":[{"id":"bad","from":"missing","to":"missing"}]}',
    ),
  });
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".node-card").count(), 5);
  await page.screenshot({ path: "browser-check.png", fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("Browser smoke passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
