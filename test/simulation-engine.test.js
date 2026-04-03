import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/app-state.js';
import { createSimulationEngine } from '../src/simulation-engine.js';

function buildHarness({ nodes, links }) {
  const state = createInitialState();
  state.nodes = nodes.map((node) => ({ shipped: 0, received: 0, stockouts: 0, ...node }));
  state.links = links;

  const getNode = (nodeId) => state.nodes.find((node) => node.id === nodeId);
  const log = () => {};
  const getRemainingLinkCapacity = (link, day) => {
    const shippedToday = state.shipments
      .filter((shipment) => shipment.linkId === link.id && shipment.departureDay === day)
      .reduce((sum, shipment) => sum + shipment.qty, 0);
    return Math.max(0, link.maxDailyCapacity - shippedToday);
  };
  const initializeNodeRuntime = (node) => {
    if (node.type !== 'warehouse') return;
    node.preparationQueue = [];
    node.preparingShipments = [];
    node.nextQueueRequestId = 1;
  };

  state.nodes.forEach(initializeNodeRuntime);
  const engine = createSimulationEngine({ state, getNode, log, getRemainingLinkCapacity, initializeNodeRuntime });

  return {
    state,
    simulateDays(days) {
      for (let i = 0; i < days; i += 1) engine.simulateDay();
    },
  };
}

test('supplier recurring delivery schedule honors deliveryFrequencyDays', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [
      { id: 'supplier-1', type: 'supplier', name: 'Supplier', inventory: Infinity, deliveryFrequencyDays: 2, deliveryQuantity: 10, leadTimeDays: 0 },
      { id: 'plant-1', type: 'plant', name: 'Plant', inventory: 0, consumptionRatePerDay: 0, safetyStock: 0, stockoutPenaltyPerUnit: 0 },
    ],
    links: [{ id: 'l1', from: 'supplier-1', to: 'plant-1', materialName: 'Ore', priority: 1, maxDailyCapacity: 100, transportDelayDays: 0, costPerShipment: 0 }],
  });

  simulateDays(4);

  const dispatchedDays = state.shipmentsByDay.filter((day) => day.count > 0).map((day) => day.day);
  assert.deepEqual(dispatchedDays, [2, 4]);
  assert.equal(state.deliveryStats.dispatched, 2);
});

test('shipment lead times include supplier lead time + link transport delay', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [
      { id: 'supplier-1', type: 'supplier', name: 'Supplier', inventory: Infinity, deliveryFrequencyDays: 1, deliveryQuantity: 5, leadTimeDays: 2 },
      { id: 'plant-1', type: 'plant', name: 'Plant', inventory: 0, consumptionRatePerDay: 0, safetyStock: 0, stockoutPenaltyPerUnit: 0 },
    ],
    links: [{ id: 'l1', from: 'supplier-1', to: 'plant-1', materialName: 'Resin', priority: 1, maxDailyCapacity: 100, transportDelayDays: 1, costPerShipment: 0 }],
  });

  simulateDays(3);
  assert.equal(state.nodes.find((n) => n.id === 'plant-1').received, 0);

  simulateDays(1);
  assert.equal(state.nodes.find((n) => n.id === 'plant-1').received, 5);
  assert.equal(state.shipments[0].arrivalDay, 5);
});

test('warehouse preparation delay blocks dispatch until order is ready', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [
      { id: 'warehouse-1', type: 'warehouse', name: 'Warehouse', inventory: 50, preparationTimeDays: 2, preparationCapacityPerDay: null, deliveryToPlantDays: 1, storageCapacity: 100 },
      { id: 'plant-1', type: 'plant', name: 'Plant', inventory: 0, consumptionRatePerDay: 0, safetyStock: 20, stockoutPenaltyPerUnit: 0 },
    ],
    links: [{ id: 'l1', from: 'warehouse-1', to: 'plant-1', materialName: 'Kits', priority: 1, maxDailyCapacity: 100, transportDelayDays: 1, costPerShipment: 0 }],
  });

  simulateDays(2);
  assert.equal(state.shipments.length, 0);

  simulateDays(1);
  assert.equal(state.shipments.length, 1);
  assert.equal(state.shipments[0].departureDay, 3);

  simulateDays(2);
  assert.equal(state.nodes.find((n) => n.id === 'plant-1').received, 20);
});

test('plant consumes inventory every simulated day', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [{ id: 'plant-1', type: 'plant', name: 'Plant', inventory: 30, consumptionRatePerDay: 7, safetyStock: 0, stockoutPenaltyPerUnit: 0 }],
    links: [],
  });

  simulateDays(3);

  const plant = state.nodes.find((node) => node.id === 'plant-1');
  assert.equal(plant.inventory, 9);
  assert.equal(plant.stockouts, 0);
});

test('stockout detection records event and penalty when demand exceeds inventory', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [{ id: 'plant-1', type: 'plant', name: 'Plant', inventory: 5, consumptionRatePerDay: 7, safetyStock: 0, stockoutPenaltyPerUnit: 2 }],
    links: [],
  });

  simulateDays(1);

  const plant = state.nodes.find((node) => node.id === 'plant-1');
  assert.equal(plant.inventory, 0);
  assert.equal(plant.stockouts, 1);
  assert.deepEqual(state.stockoutEvents, [{ day: 1, nodeId: 'plant-1', shortfall: 2 }]);
  assert.equal(state.finance.costBreakdown.plantStockoutPenalty, 4);
});

test('engine handles multiple shipments in transit on the same link', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [
      { id: 'supplier-1', type: 'supplier', name: 'Supplier', inventory: Infinity, deliveryFrequencyDays: 1, deliveryQuantity: 10, leadTimeDays: 2 },
      { id: 'plant-1', type: 'plant', name: 'Plant', inventory: 0, consumptionRatePerDay: 0, safetyStock: 0, stockoutPenaltyPerUnit: 0 },
    ],
    links: [{ id: 'l1', from: 'supplier-1', to: 'plant-1', materialName: 'Ore', priority: 1, maxDailyCapacity: 100, transportDelayDays: 0, costPerShipment: 0 }],
  });

  simulateDays(3);

  assert.equal(state.shipments.length, 2);
  assert.deepEqual(state.shipments.map((s) => s.departureDay), [2, 3]);
  assert.equal(state.nodes.find((n) => n.id === 'plant-1').received, 10);
});

test('supplier delivery quantity is a per-day budget across outbound links', () => {
  const { state, simulateDays } = buildHarness({
    nodes: [
      { id: 'supplier-1', type: 'supplier', name: 'Supplier', inventory: Infinity, deliveryFrequencyDays: 1, deliveryQuantity: 10, leadTimeDays: 0 },
      { id: 'plant-1', type: 'plant', name: 'Plant A', inventory: 0, consumptionRatePerDay: 0, safetyStock: 0, stockoutPenaltyPerUnit: 0 },
      { id: 'plant-2', type: 'plant', name: 'Plant B', inventory: 0, consumptionRatePerDay: 0, safetyStock: 0, stockoutPenaltyPerUnit: 0 },
    ],
    links: [
      { id: 'l1', from: 'supplier-1', to: 'plant-1', materialName: 'Ore', priority: 1, maxDailyCapacity: 100, transportDelayDays: 0, costPerShipment: 0 },
      { id: 'l2', from: 'supplier-1', to: 'plant-2', materialName: 'Ore', priority: 2, maxDailyCapacity: 100, transportDelayDays: 0, costPerShipment: 0 },
    ],
  });

  simulateDays(1);

  assert.equal(state.shipments.length, 1);
  assert.equal(state.shipments[0].to, 'plant-1');
  assert.equal(state.shipments[0].qty, 10);
});

test('end-to-end scenario is deterministic for a fixed graph and timeline', () => {
  const runScenario = () => {
    const { state, simulateDays } = buildHarness({
      nodes: [
        { id: 'supplier-1', type: 'supplier', name: 'Supplier', inventory: Infinity, deliveryFrequencyDays: 1, deliveryQuantity: 25, leadTimeDays: 1 },
        { id: 'warehouse-1', type: 'warehouse', name: 'Warehouse', inventory: 0, preparationTimeDays: 1, preparationCapacityPerDay: 15, deliveryToPlantDays: 1, storageCapacity: 200 },
        { id: 'plant-1', type: 'plant', name: 'Plant', inventory: 20, consumptionRatePerDay: 8, safetyStock: 12, stockoutPenaltyPerUnit: 3 },
      ],
      links: [
        { id: 'l-s-w', from: 'supplier-1', to: 'warehouse-1', materialName: 'Input', priority: 1, maxDailyCapacity: 30, transportDelayDays: 1, costPerShipment: 5 },
        { id: 'l-w-p', from: 'warehouse-1', to: 'plant-1', materialName: 'Input', priority: 1, maxDailyCapacity: 20, transportDelayDays: 0, costPerShipment: 7 },
      ],
    });

    simulateDays(8);

    return {
      day: state.day,
      inTransit: state.shipments.map((s) => ({ from: s.from, to: s.to, qty: s.qty, arrivalDay: s.arrivalDay })),
      dispatched: state.deliveryStats.dispatched,
      deliveredVolume: state.deliveryStats.deliveredVolume,
      queueEntries: state.deliveryStats.queueEntries,
      fulfillmentDelayTotal: state.deliveryStats.fulfillmentDelayTotal,
      stockouts: state.stockoutEvents,
      financeTotal: state.finance.totalCost,
      warehouseInventory: state.nodes.find((n) => n.id === 'warehouse-1').inventory,
      plantInventory: state.nodes.find((n) => n.id === 'plant-1').inventory,
      plantReceived: state.nodes.find((n) => n.id === 'plant-1').received,
    };
  };

  const first = runScenario();
  const second = runScenario();

  assert.deepEqual(first, second);
  assert.ok(first.plantReceived > 0);
  assert.ok(first.queueEntries > 0);
});
