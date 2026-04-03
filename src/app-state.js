import { SCENARIO_VERSION, createCostBreakdown, createFinanceState } from './graph-model.js';

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.5;
export const GRID_SIZE = 24;
export const SCENARIO_STORAGE_KEY = 'supply-chain-flow-lab:scenario';

export function createInitialState() {
  return {
    nodes: [],
    links: [],
    shipments: [],
    eventLog: [],
    inventoryHistoryByNode: {},
    analyticsMetricHistoryByNode: {},
    transitHistory: [],
    deliveryStats: {
      dispatched: 0,
      onTime: 0,
      deliveredVolume: 0,
      shipmentCost: 0,
      queueEntries: 0,
      queueDaysTotal: 0,
      fulfilledRequests: 0,
      fulfillmentDelayTotal: 0,
    },
    shipmentsByDay: [],
    stockoutEvents: [],
    finance: createFinanceState(),
    analyticsNodeId: null,
    kpis: {
      stockoutCount: 0,
      averagePlantInventory: 0,
      warehouseUtilization: 0,
      onTimeDeliveries: { onTime: 0, total: 0, rate: 0 },
      averageQueueTimeDays: 0,
      averageFulfillmentDelayDays: 0,
      totalShippedVolume: 0,
      totalShipmentCost: 0,
      totalCost: 0,
      costBreakdown: createCostBreakdown(),
      costPerPlantServed: {},
    },
    day: 0,
    drag: null,
    pan: null,
    boxSelection: null,
    linking: null,
    selectedNodeIds: [],
    selectedLinkIds: [],
    simulation: {
      status: 'idle',
      timerId: null,
      speedMs: 800,
      tickInProgress: false,
    },
    logBuffer: [],
    logFlushHandle: null,
    nodeCounter: 1,
    linkCounter: 1,
    zCounter: 1,
    camera: { x: 0, y: 0, zoom: 1 },
    keyState: { space: false },
    graphErrors: [],
    nodeStatusById: {},
    alerts: { activeByKey: {} },
    globalPythonCode: '',
    ui: {
      showLinkLabels: false,
      allowWarehouseToWarehouse: false,
      allowPlantOutbound: false,
      showCreateToolbar: true,
      snapToGrid: false,
    },
    contextCreateAt: null,
    clipboard: null,
  };
}

export const BUILT_IN_SCENARIOS = {
  blank: {
    version: SCENARIO_VERSION,
    day: 0,
    globalPythonCode: '',
    ui: { showLinkLabels: false, allowWarehouseToWarehouse: false, allowPlantOutbound: false, showCreateToolbar: true, snapToGrid: false },
    nodes: [],
    links: [],
  },
  demo: {
    version: SCENARIO_VERSION,
    day: 0,
    globalPythonCode: '',
    ui: { showLinkLabels: true, allowWarehouseToWarehouse: false, allowPlantOutbound: false, showCreateToolbar: true, snapToGrid: false },
    nodes: [
      {
        id: 'node-1',
        type: 'supplier',
        position: { x: 90, y: 80 },
        config: { name: 'Supplier North', deliveryFrequencyDays: 2, deliveryQuantity: 140, leadTimeDays: 1, initialInventory: null },
      },
      {
        id: 'node-2',
        type: 'supplier',
        position: { x: 90, y: 260 },
        config: { name: 'Supplier South', deliveryFrequencyDays: 3, deliveryQuantity: 110, leadTimeDays: 2, initialInventory: null },
      },
      {
        id: 'node-3',
        type: 'warehouse',
        position: { x: 430, y: 170 },
        config: { name: 'Central Warehouse', preparationTimeDays: 1, preparationCapacityPerDay: 100, deliveryToPlantDays: 2, storageCapacity: 900, initialInventory: 220, reorderPoint: 300 },
      },
      {
        id: 'node-4',
        type: 'plant',
        position: { x: 790, y: 100 },
        config: { name: 'Plant Alpha', consumptionRatePerDay: 35, initialInventory: 140, safetyStock: 70 },
      },
      {
        id: 'node-5',
        type: 'plant',
        position: { x: 790, y: 290 },
        config: { name: 'Plant Beta', consumptionRatePerDay: 28, initialInventory: 120, safetyStock: 60 },
      },
    ],
    links: [
      { id: 'link-1', from: 'node-1', to: 'node-3', materialName: 'Alloy A', transportDelayDays: 1, maxDailyCapacity: 160, priority: 1, costPerShipment: 40 },
      { id: 'link-2', from: 'node-2', to: 'node-3', materialName: 'Polymer B', transportDelayDays: 2, maxDailyCapacity: 130, priority: 1, costPerShipment: 45 },
      { id: 'link-3', from: 'node-3', to: 'node-4', materialName: 'Component Kit', transportDelayDays: 2, maxDailyCapacity: 120, priority: 1, costPerShipment: 65 },
      { id: 'link-4', from: 'node-3', to: 'node-5', materialName: 'Component Kit', transportDelayDays: 2, maxDailyCapacity: 120, priority: 1, costPerShipment: 65 },
    ],
  },
};
