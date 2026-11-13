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
  // Verify the material example, real background worker, saved comparisons and CSV.
  await page.selectOption("#scenarioPreset", "production");
  await page.click("#loadPresetBtn");
  await page.click("#stepBtn");
  await page.waitForFunction(() => window.state.totals.produced === 10);
  await page.waitForTimeout(300);
  await page.click("#resetBtn");
  await page.locator('[data-id="factory"] .node-type-chip').click();
  await page.getByText("Production recipe", { exact: true }).click();
  assert.ok(
    await page
      .getByRole("button", { name: "Apply recipe", exact: true })
      .isVisible(),
  );
  await page.getByText("Saved experiments", { exact: true }).click();
  await page.fill("#variantName", "Baseline");
  await page.click("#captureVariant");
  await page.getByText("Disruptions", { exact: true }).click();
  await page.selectOption("#disruptionTarget", "source");
  await page.fill("#disruptionStart", "1");
  await page.fill("#disruptionEnd", "30");
  await page
    .getByRole("button", { name: "Add disruption", exact: true })
    .click();
  await page.fill("#variantName", "Supplier outage");
  await page.click("#captureVariant");
  await page.fill("#experimentDays", "30");
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.workerCompleted = false;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (event) => {
          if (event.data.results) window.workerCompleted = true;
        });
      }
    };
  });
  await page.click("#runExperiments");
  await page.waitForFunction(
    () => window.SCFL_Experiments.read().results.length === 2,
  );
  assert.equal(await page.evaluate(() => window.workerCompleted), true);
  const results = await page.evaluate(
    () => window.SCFL_Experiments.read().results,
  );
  assert.ok(results[0].kpis.serviceLevel > results[1].kpis.serviceLevel);
  await page.reload();
  await page.waitForSelector(".node-card");
  assert.equal(
    await page.evaluate(() => window.SCFL_Experiments.read().results.length),
    2,
  );
  assert.equal(await page.evaluate(() => window.state.disruptions.length), 1);
  await page.getByText("CSV data", { exact: true }).click();
  await page.selectOption("#csvKind", "demand");
  await page.setInputFiles("#csvInput", {
    name: "demand.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nodeId,day,quantity\nfactory,2,25"),
  });
  await page.waitForFunction(
    () =>
      window.state.nodes.find((n) => n.id === "factory").demandSchedule[0]
        ?.quantity === 25,
  );
  await page.setInputFiles("#csvInput", {
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nodeId,day,quantity\nfactory,0,-1"),
  });
  await page.waitForFunction(() =>
    document.getElementById("labStatus").textContent.includes("invalid"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.state.nodes.find((n) => n.id === "factory").demandSchedule[0]
          .quantity,
    ),
    25,
  );
  await page.screenshot({ path: "browser-check.png", fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("Browser smoke passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
