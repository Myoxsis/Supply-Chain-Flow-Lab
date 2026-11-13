const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
function env() {
  const c = {
    window: {},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    console,
  };
  vm.createContext(c);
  for (const f of [
    "coreNodes",
    "nodeRegistry",
    "validation",
    "scenarioStorage",
    "pluginRuntime",
    "nodePackages",
    "simulationEngine",
  ])
    vm.runInContext(fs.readFileSync(`frontend/${f}.js`, "utf8"), c);
  return c;
}
function state(delay = 0) {
  return {
    day: 0,
    nodes: [
      {
        id: "a",
        type: "supplier",
        inventory: 100,
        deliveryQuantity: 80,
        deliveryFrequencyDays: 1,
        leadTimeDays: 0,
      },
      { id: "b", type: "plant", inventory: 0, consumptionRatePerDay: 10 },
    ],
    links: [
      {
        id: "l",
        from: "a",
        to: "b",
        transportDelayDays: delay,
        maxDailyCapacity: 20,
      },
    ],
    shipments: [],
  };
}
test("zero-day arrival precedes demand and inventory is conserved", () => {
  const c = env(),
    s = state();
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(s.nodes[0].inventory, 80);
  assert.equal(s.nodes[1].inventory, 10);
  assert.equal(s.kpis.serviceLevel, 100);
});
test("plugin shipments cannot bypass stock or shared capacity", () => {
  const c = env(),
    s = state(2);
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(
    c.window.SCFL_SimulationEngine.pushShipment(
      s,
      { from: "a", to: "b", quantity: 50 },
      [],
    ),
    null,
  );
  assert.equal(s.nodes[0].inventory, 80);
});
test("preparation capacity is shared across outbound links and timing is additive", () => {
  const c = env(),
    s = state();
  s.nodes[0] = {
    id: "a",
    type: "warehouse",
    inventory: 100,
    preparationCapacityPerDay: 5,
    preparationTimeDays: 2,
    deliveryToPlantDays: 1,
  };
  s.nodes[1].safetyStock = 50;
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(s.shipments[0].qty, 5);
  assert.equal(s.shipments[0].arrivalDay, 4);
});
test("incoming stock prevents duplicate plant replenishment", () => {
  const c = env(),
    s = state(3);
  s.nodes[0] = {
    id: "a",
    type: "warehouse",
    inventory: 100,
    preparationTimeDays: 0,
    deliveryToPlantDays: 0,
  };
  s.nodes[1].safetyStock = 20;
  s.nodes[1].consumptionRatePerDay = 0;
  c.window.SCFL_SimulationEngine.step(s);
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(s.shipments.length, 1);
});
test("supplier lead time and warehouse reorder point are honored", () => {
  const c = env(),
    s = state();
  s.nodes[0].leadTimeDays = 2;
  s.nodes[1] = {
    id: "b",
    type: "warehouse",
    inventory: 30,
    storageCapacity: 100,
    reorderPoint: 20,
  };
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(s.shipments.length, 0);
  s.nodes[1].inventory = 0;
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(s.shipments[0].arrivalDay, 4);
});
test("scenario validates IDs, versions and endpoints; Infinity round trips", () => {
  const c = env(),
    storage = c.window.SCFL_ScenarioStorage,
    s = state();
  s.nodes[0].inventory = Infinity;
  assert.equal(
    storage.importScenario(storage.serialize(s)).scenario.nodes[0].inventory,
    Infinity,
  );
  s.nodes.push(s.nodes[0]);
  assert.equal(storage.importScenario(s).ok, false);
  assert.equal(storage.importScenario({ ...state(), version: 999 }).ok, false);
});
test("storage exceptions are recoverable", () => {
  const c = env();
  c.localStorage.setItem = () => {
    throw Error("quota");
  };
  assert.equal(c.window.SCFL_ScenarioStorage.save(state()).ok, false);
});
test("custom connections use registry ports", () => {
  const c = env();
  c.window.SCFL_NodeRegistry.register({
    type: "custom",
    source: "package",
    inputs: ["material"],
    outputs: [],
  });
  assert.equal(
    c.window.SCFL_Validation.isValidConnection(
      { id: "a", type: "supplier" },
      { id: "b", type: "custom" },
      "material",
    ),
    true,
  );
  assert.equal(
    c.window.SCFL_Validation.isValidConnection(
      { id: "a", type: "supplier" },
      { id: "b", type: "custom" },
      "information",
    ),
    false,
  );
});
test("code-based plugins are rejected; declarative plugins emit validated shipments", () => {
  const c = env();
  const pkg = {
    name: "test",
    nodes: [
      {
        type: "custom",
        label: "Custom",
        fields: [],
        runtime: { onTick: "function(){while(true){}}" },
      },
    ],
  };
  assert.equal(c.window.SCFL_NodePackages.installPackage(pkg).ok, false);
  pkg.nodes[0].runtime.onTick = [{ action: "shipment", to: "b", value: 100 }];
  assert.equal(c.window.SCFL_NodePackages.installPackage(pkg).ok, true);
  const s = state();
  s.nodes[0].type = "custom";
  s.nodes[0].inventory = 5;
  c.window.SCFL_SimulationEngine.step(s);
  assert.equal(s.nodes[0].inventory, 0);
  assert.equal(s.nodes[1].received, 5);
});
