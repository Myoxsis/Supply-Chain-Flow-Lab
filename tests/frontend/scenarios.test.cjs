const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
function environment() {
  const memory = new Map(),
    c = {
      window: {},
      structuredClone,
      console,
      localStorage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => memory.set(k, v),
      },
      setTimeout,
    };
  vm.createContext(c);
  for (const f of [
    "materials",
    "modelValidation",
    "examples",
    "coreNodes",
    "nodeRegistry",
    "scenarioStorage",
    "validation",
    "pluginRuntime",
    "simulationEngine",
    "experiments",
    "csv",
  ])
    vm.runInContext(fs.readFileSync(`frontend/${f}.js`, "utf8"), c);
  return c.window;
}
const warehouse = (id, inventory, extras = {}) => ({
  id,
  type: "warehouse",
  initialInventory: 0,
  initialInventoryByMaterial: { steel: inventory },
  storageCapacity: 1000,
  preparationTimeDays: 0,
  preparationCapacityPerDay: 100,
  deliveryToPlantDays: 0,
  ...extras,
});
const plant = (id, extras = {}) => ({
  id,
  type: "plant",
  initialInventory: 0,
  materialId: "steel",
  consumptionRatePerDay: 0,
  safetyStock: 20,
  ...extras,
});
const link = (id, from, to, extras = {}) => ({
  id,
  from,
  to,
  materialId: "steel",
  linkType: "material",
  maxDailyCapacity: 100,
  transportDelayDays: 0,
  priority: 1,
  ...extras,
});
const graph = (nodes, links = []) => ({
  version: 9,
  day: 0,
  nodes: [
    { id: "steel", type: "material" },
    { id: "widget", type: "material" },
    ...nodes,
  ],
  links,
});
function physical(state, material) {
  return (
    state.nodes.reduce(
      (a, n) =>
        a +
        (n.inventoryByMaterial?.[material] ?? 0) +
        (n.preparingShipments ?? [])
          .filter((q) => q.materialId === material)
          .reduce((a, q) => a + q.qty, 0),
      0,
    ) +
    state.shipments
      .filter((s) => s.materialId === material)
      .reduce((a, s) => a + s.qty, 0)
  );
}
test("materials remain separate and recipes conserve input equivalents", () => {
  const w = environment(),
    s = graph([
      plant("p", {
        materialId: "widget",
        initialInventoryByMaterial: { steel: 10, widget: 0 },
        recipe: {
          inputs: { steel: 2 },
          outputMaterialId: "widget",
          outputQuantity: 1,
        },
        consumptionRatePerDay: 4,
        productionCapacityPerDay: 3,
      }),
    ]);
  w.SCFL_SimulationEngine.step(s);
  const p = s.nodes[2];
  assert.equal(p.inventoryByMaterial.steel, 4);
  assert.equal(p.inventoryByMaterial.widget, 0);
  assert.equal(p.produced, 3);
  assert.equal(s.kpis.unmetDemand, 1);
  assert.equal(physical(s, "steel") + s.totals.produced * 2, 10);
  assert.ok(
    s.trace.some((t) => t.type === "production" && t.inputs.steel === 6),
  );
});
test("stock cannot substitute across material IDs", () => {
  const w = environment(),
    s = graph([
      plant("p", {
        initialInventoryByMaterial: { widget: 100 },
        consumptionRatePerDay: 5,
      }),
    ]);
  w.SCFL_SimulationEngine.step(s);
  assert.equal(s.kpis.unmetDemand, 5);
  assert.equal(s.nodes[2].inventoryByMaterial.widget, 100);
});
test("waiting, preparation and transit conserve material over partial dispatches", () => {
  const w = environment(),
    s = graph(
      [
        warehouse("w", 30, {
          preparationTimeDays: 2,
          preparationCapacityPerDay: 5,
        }),
        plant("p"),
      ],
      [link("l", "w", "p", { maxDailyCapacity: 3, transportDelayDays: 2 })],
    );
  for (let i = 0; i < 15; i++) {
    w.SCFL_SimulationEngine.step(s);
    assert.equal(physical(s, "steel"), 30);
    assert.ok((s.linkUsage.l ?? 0) <= 3);
  }
  assert.equal(s.nodes[3].inventoryByMaterial.steel, 20);
  assert.equal(s.nodes[2].preparationQueue.length, 0);
});
test("competing routes allocate by priority then stable ID, independent of input order", () => {
  const w = environment();
  for (const reverse of [false, true]) {
    const links = [link("b", "w", "p2"), link("a", "w", "p1")];
    if (reverse) links.reverse();
    const s = graph([warehouse("w", 10), plant("p1"), plant("p2")], links);
    w.SCFL_SimulationEngine.step(s);
    assert.equal(
      s.nodes.find((n) => n.id === "p1").inventoryByMaterial.steel,
      10,
    );
    assert.equal(
      s.nodes.find((n) => n.id === "p2").inventoryByMaterial.steel ?? 0,
      0,
    );
    assert.equal(physical(s, "steel"), 10);
  }
});
test("outage, capacity reduction, added delay and demand profile apply only within their ranges", () => {
  const w = environment(),
    s = graph(
      [
        {
          id: "s",
          type: "supplier",
          materialId: "steel",
          initialInventory: 100,
          deliveryQuantity: 10,
          deliveryFrequencyDays: 1,
          leadTimeDays: 0,
        },
        plant("p", {
          consumptionRatePerDay: 2,
          demandProfile: [{ startDay: 2, endDay: 2, multiplier: 2 }],
        }),
      ],
      [link("l", "s", "p")],
    );
  s.disruptions = [
    { kind: "outage", targetId: "s", startDay: 1, endDay: 1 },
    { kind: "capacity", targetId: "l", startDay: 2, endDay: 2, value: 0.05 },
    { kind: "delay", targetId: "l", startDay: 2, endDay: 2, value: 3 },
  ];
  w.SCFL_SimulationEngine.step(s);
  assert.equal(s.shipments.length, 0);
  w.SCFL_SimulationEngine.step(s);
  assert.equal(s.shipments[0].qty, 5);
  assert.equal(s.shipments[0].arrivalDay, 5);
  assert.equal(s.totals.demand, 6);
  w.SCFL_SimulationEngine.step(s);
  assert.equal(s.totals.shipped, 15);
});
test("explicit link cannot dispatch from another source", () => {
  const w = environment(),
    s = graph(
      [warehouse("w", 10), plant("p"), plant("other")],
      [link("l", "w", "p")],
    );
  assert.equal(
    w.SCFL_SimulationEngine.pushShipment(s, {
      from: "other",
      to: "p",
      linkId: "l",
      qty: 10,
    }),
    null,
  );
});
test("removed route restores reserved material without creating stock", () => {
  const w = environment(),
    s = graph(
      [warehouse("w", 30, { preparationTimeDays: 5 }), plant("p")],
      [link("l", "w", "p")],
    );
  w.SCFL_SimulationEngine.step(s);
  s.links = [];
  w.SCFL_SimulationEngine.step(s);
  assert.equal(physical(s, "steel"), 30);
  assert.equal(s.nodes[2].inventoryByMaterial.steel, 30);
});
test("arrival overflow records discarded units explicitly", () => {
  const w = environment(),
    s = graph([warehouse("w", 0, { storageCapacity: 5 }), plant("p")]);
  s.shipments = [
    {
      id: "s",
      from: "p",
      to: "w",
      materialId: "steel",
      qty: 10,
      arrivalDay: 1,
    },
  ];
  w.SCFL_SimulationEngine.step(s);
  assert.equal(s.nodes[2].inventoryByMaterial.steel, 5);
  assert.equal(s.kpis.discarded, 5);
});
test("legacy v8 in-flight arrivals keep their original due day and use default material", () => {
  const w = environment(),
    s = {
      version: 8,
      day: 3,
      nodes: [
        { id: "s", type: "supplier", initialInventory: 10 },
        { id: "p", type: "plant", inventory: 0, consumptionRatePerDay: 0 },
      ],
      links: [],
      shipments: [{ id: "old", from: "s", to: "p", qty: 7, arrivalDay: 4 }],
    };
  const imported = w.SCFL_ScenarioStorage.importScenario(s);
  assert.equal(imported.ok, true);
  w.SCFL_SimulationEngine.step(imported.scenario);
  assert.equal(imported.scenario.nodes[1].inventoryByMaterial.default, 7);
});
test("model rejects malformed recipes, unknown materials, negative stock and invalid disruptions", () => {
  const w = environment();
  for (const patch of [
    {
      recipe: {
        inputs: { steel: -2 },
        outputMaterialId: "widget",
        outputQuantity: 1,
      },
    },
    { initialInventoryByMaterial: { steel: -1 } },
    { materialId: "missing" },
    { demandProfile: [{ startDay: 0, endDay: 2, multiplier: 1 }] },
  ]) {
    const s = graph([plant("p", patch)]);
    assert.equal(w.SCFL_ScenarioStorage.importScenario(s).ok, false);
  }
  const s = graph([plant("p")]);
  s.disruptions = [
    { kind: "outage", targetId: "missing", startDay: 1, endDay: 2 },
  ];
  assert.equal(w.SCFL_ScenarioStorage.importScenario(s).ok, false);
});
test("batch runs reset initial state, are repeatable and leave captured scenarios unchanged", async () => {
  const w = environment(),
    s = w.SCFL_Examples.production();
  const before = JSON.stringify(s);
  const variants = [{ id: "a", name: "Base", scenario: s }];
  const one = await w.SCFL_Experiments.calculate(variants, 30),
    two = await w.SCFL_Experiments.calculate(variants, 30);
  assert.deepEqual({ ...one[0].kpis }, { ...two[0].kpis });
  assert.equal(JSON.stringify(s), before);
  assert.equal(one[0].days, 30);
  assert.ok(one[0].totals.produced > 0);
});
test("experiments reject invalid horizons and honor cancellation", async () => {
  const w = environment(),
    variants = [
      { id: "a", name: "Base", scenario: w.SCFL_Examples.production() },
    ];
  await assert.rejects(w.SCFL_Experiments.calculate(variants, 366));
  await assert.rejects(
    w.SCFL_Experiments.calculate(variants, 30, { cancelled: () => true }),
    /cancelled/,
  );
});
test("comparison persistence keeps Infinity inside captured scenarios", () => {
  const w = environment();
  assert.equal(
    w.SCFL_Experiments.capture("base", w.SCFL_Examples.production()).ok,
    true,
  );
  const snapshot = w.SCFL_Experiments.read().variants[0].scenario;
  assert.ok(snapshot.includes("source"));
  assert.equal(
    w.SCFL_ScenarioStorage.parse(snapshot).nodes.find((n) => n.id === "source")
      .initialInventory,
    null,
  );
});
test("CSV supports quoted commas/newlines, rejects broken input and protects formula cells", () => {
  const w = environment();
  const text = w.SCFL_CSV.encode([{ name: 'two, "parts"\nplant' }], ["name"]);
  assert.equal(w.SCFL_CSV.parse(text)[0].name, 'two, "parts"\nplant');
  assert.throws(() => w.SCFL_CSV.parse('a,b\n"bad'));
  assert.ok(w.SCFL_CSV.encode([{ name: "=1+1" }], ["name"]).includes("'=1+1"));
});
test("node CSV and daily demand import validate atomically and round trip typed configuration", () => {
  const w = environment(),
    s = w.SCFL_Examples.production();
  const csv = w.SCFL_CSV.nodes(s);
  const next = w.SCFL_CSV.importNodes(csv, s);
  assert.equal(
    next.nodes.find((n) => n.id === "factory").recipe.inputs.steel,
    2,
  );
  const daily = w.SCFL_CSV.importDemand("nodeId,day,quantity\nfactory,3,40", s);
  assert.equal(
    daily.nodes.find((n) => n.id === "factory").demandSchedule[0].quantity,
    40,
  );
  assert.equal(
    s.nodes.find((n) => n.id === "factory").demandSchedule.length,
    0,
  );
  assert.throws(() =>
    w.SCFL_CSV.importDemand("nodeId,day,quantity\nfactory,0,-2", s),
  );
});
