import { cloneValue } from './clone.js';
/** @typedef {'supplier'|'warehouse'|'plant'|'analytics'} NodeType */

export const SCENARIO_VERSION = 6;

export const COST_CATEGORY_KEYS = {
  supplierShipment: 'supplierShipment',
  warehouseHandling: 'warehouseHandling',
  warehouseStorage: 'warehouseStorage',
  transport: 'transport',
  plantStockoutPenalty: 'plantStockoutPenalty',
};

export function createCostBreakdown() {
  return {
    [COST_CATEGORY_KEYS.supplierShipment]: 0,
    [COST_CATEGORY_KEYS.warehouseHandling]: 0,
    [COST_CATEGORY_KEYS.warehouseStorage]: 0,
    [COST_CATEGORY_KEYS.transport]: 0,
    [COST_CATEGORY_KEYS.plantStockoutPenalty]: 0,
  };
}

export function createFinanceState() {
  return {
    totalCost: 0,
    costBreakdown: createCostBreakdown(),
    costByNode: {},
    costPerPlantServed: {},
  };
}

export const NODE_SCHEMAS = {
  supplier: {
    label: 'Supplier',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Supplier ${i}` },
      { key: 'deliveryFrequencyDays', label: 'Delivery frequency (days)', type: 'int', required: true, min: 1, step: 1, defaultValue: 3 },
      { key: 'deliveryQuantity', label: 'Delivery quantity', type: 'int', required: true, min: 1, step: 1, defaultValue: 120 },
      { key: 'leadTimeDays', label: 'Lead time (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
      { key: 'initialInventory', label: 'Initial inventory (optional)', type: 'int', required: false, min: 0, step: 1, defaultValue: null },
      { key: 'shipmentCost', label: 'Shipment cost (optional)', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
    ],
  },
  warehouse: {
    label: 'Warehouse',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Warehouse ${i}` },
      { key: 'preparationTimeDays', label: 'Preparation time (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
      { key: 'preparationCapacityPerDay', label: 'Preparation capacity / day (optional)', type: 'int', required: false, min: 1, step: 1, defaultValue: null },
      { key: 'deliveryToPlantDays', label: 'Delivery to plant (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 2 },
      { key: 'storageCapacity', label: 'Storage capacity', type: 'int', required: true, min: 1, step: 1, defaultValue: 600 },
      { key: 'initialInventory', label: 'Initial inventory', type: 'int', required: true, min: 0, step: 1, defaultValue: 120 },
      { key: 'reorderPoint', label: 'Reorder point (optional)', type: 'int', required: false, min: 0, step: 1, defaultValue: null },
      { key: 'handlingCostPerUnit', label: 'Handling cost / unit (optional)', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
      { key: 'storageCostPerUnitPerDay', label: 'Storage cost / unit / day (optional)', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
    ],
  },
  plant: {
    label: 'Plant',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Plant ${i}` },
      { key: 'consumptionRatePerDay', label: 'Consumption rate / day', type: 'int', required: true, min: 0, step: 1, defaultValue: 20 },
      { key: 'initialInventory', label: 'Initial inventory', type: 'int', required: true, min: 0, step: 1, defaultValue: 100 },
      { key: 'safetyStock', label: 'Safety stock (optional)', type: 'int', required: false, min: 0, step: 1, defaultValue: null },
      { key: 'stockoutPenaltyPerUnit', label: 'Stockout penalty / unit (optional)', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
    ],
  },
  analytics: {
    label: 'Analytics',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Analytics ${i}` },
      { key: 'metric', label: 'Metric', type: 'select', required: true, options: [
        { value: 'stockout_count', label: 'Stockout events' },
        { value: 'avg_plant_inventory', label: 'Avg plant inventory' },
        { value: 'warehouse_utilization', label: 'Warehouse utilization %' },
        { value: 'on_time_rate', label: 'On-time delivery %' },
        { value: 'avg_queue_time', label: 'Avg warehouse queue time (days)' },
        { value: 'avg_fulfillment_delay', label: 'Avg fulfillment delay (days)' },
        { value: 'total_shipped', label: 'Total shipped volume' },
        { value: 'total_cost', label: 'Total cost' },
        { value: 'transport_cost', label: 'Transport cost' },
        { value: 'supplier_shipment_cost', label: 'Supplier shipment cost' },
        { value: 'warehouse_handling_cost', label: 'Warehouse handling cost' },
        { value: 'warehouse_storage_cost', label: 'Warehouse storage cost' },
        { value: 'stockout_penalty_cost', label: 'Plant stockout penalty cost' },
        { value: 'node_total_cost', label: 'Connected node total cost' },
        { value: 'node_plant_served_cost', label: 'Connected plant served cost' },
        { value: 'shipments_today', label: 'Shipments today' },
        { value: 'node_inventory', label: 'Connected node inventory' },
        { value: 'node_shipped', label: 'Connected node shipped' },
        { value: 'node_stockouts', label: 'Connected node stockouts' },
      ], defaultValue: 'stockout_count' },
    ],
  },
};

export const LINK_SCHEMA = [
  { key: 'materialName', label: 'Material name', type: 'string', required: true, defaultValue: 'Raw material' },
  { key: 'transportDelayDays', label: 'Transport delay (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
  { key: 'maxDailyCapacity', label: 'Max daily capacity', type: 'int', required: true, min: 1, step: 1, defaultValue: 120 },
  { key: 'priority', label: 'Priority', type: 'int', required: true, min: 1, step: 1, defaultValue: 1 },
  { key: 'costPerShipment', label: 'Cost per shipment (optional)', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
];

export function createNodeData(type, nodeCounter) {
  const schema = NODE_SCHEMAS[type];
  const data = {};
  schema.fields.forEach((field) => {
    const raw = typeof field.defaultValue === 'function' ? field.defaultValue(nodeCounter) : field.defaultValue;
    data[field.key] = raw;
  });
  return data;
}

export function resolveInitialInventory(type, data) {
  if (type === 'supplier') return data.initialInventory == null ? Infinity : data.initialInventory;
  if (type === 'analytics') return 0;
  return data.initialInventory;
}

export function createLinkData() {
  return LINK_SCHEMA.reduce((acc, field) => {
    acc[field.key] = typeof field.defaultValue === 'function' ? field.defaultValue() : field.defaultValue;
    return acc;
  }, {});
}

export function normalizeNodeConfig(type, config = {}, sequence = 1) {
  const defaults = createNodeData(type, sequence);
  const normalized = {};
  NODE_SCHEMAS[type].fields.forEach((field) => {
    const raw = config[field.key];
    if (field.type === 'string' || field.type === 'text' || field.type === 'select') {
      normalized[field.key] = raw == null ? defaults[field.key] : String(raw);
      return;
    }
    if (raw == null || raw === '') {
      normalized[field.key] = field.required ? defaults[field.key] : null;
      return;
    }
    const numeric = Number(raw);
    normalized[field.key] = Number.isFinite(numeric) ? numeric : (field.required ? defaults[field.key] : null);
  });
  if (!normalized.name) normalized.name = `${NODE_SCHEMAS[type].label} ${sequence}`;
  return normalized;
}

export function migrateScenario(rawScenario) {
  if (!rawScenario || typeof rawScenario !== 'object') throw new Error('Scenario must be a JSON object.');
  const version = Number(rawScenario.version ?? 1);
  if (!Number.isInteger(version) || version <= 0) throw new Error('Scenario version must be a positive integer.');
  if (version > SCENARIO_VERSION) throw new Error(`Unsupported scenario version ${version}. This app supports up to version ${SCENARIO_VERSION}.`);
  const migrated = cloneValue(rawScenario);

  if (version < 2) {
    migrated.globalPythonCode = migrated.globalPythonCode ?? '';
    migrated.ui = migrated.ui ?? {};
    migrated.links = (migrated.links ?? []).map((link) => ({ ...createLinkData(), ...link }));
  }
  if (version < 3) {
    migrated.ui = { showLinkLabels: Boolean(migrated.ui?.showLinkLabels), allowWarehouseToWarehouse: Boolean(migrated.ui?.allowWarehouseToWarehouse), allowPlantOutbound: Boolean(migrated.ui?.allowPlantOutbound), showCreateToolbar: true, snapToGrid: false };
  }
  if (version < 4) {
    migrated.nodes = (migrated.nodes ?? []).map((node) => node?.type !== 'warehouse' ? node : { ...node, config: { ...(node.config ?? {}), preparationCapacityPerDay: node.config?.preparationCapacityPerDay ?? null } });
  }
  if (version < 5) {
    migrated.nodes = (migrated.nodes ?? []).map((node) => {
      if (!node || typeof node !== 'object') return node;
      const config = node.config ?? {};
      if (node.type === 'supplier') return { ...node, config: { ...config, shipmentCost: config.shipmentCost ?? null } };
      if (node.type === 'warehouse') return { ...node, config: { ...config, handlingCostPerUnit: config.handlingCostPerUnit ?? null, storageCostPerUnitPerDay: config.storageCostPerUnitPerDay ?? null } };
      if (node.type === 'plant') return { ...node, config: { ...config, stockoutPenaltyPerUnit: config.stockoutPenaltyPerUnit ?? null } };
      return node;
    });
  }
  if (version < 6) {
    migrated.meta = {
      ...(migrated.meta ?? {}),
      label: typeof migrated.meta?.label === 'string' ? migrated.meta.label : 'Imported scenario',
      savedAt: typeof migrated.meta?.savedAt === 'string' ? migrated.meta.savedAt : null,
      checksum: typeof migrated.meta?.checksum === 'string' ? migrated.meta.checksum : null,
    };
  }

  migrated.ui = {
    showLinkLabels: Boolean(migrated.ui?.showLinkLabels),
    allowWarehouseToWarehouse: Boolean(migrated.ui?.allowWarehouseToWarehouse),
    allowPlantOutbound: Boolean(migrated.ui?.allowPlantOutbound),
    showCreateToolbar: migrated.ui?.showCreateToolbar !== false,
    snapToGrid: Boolean(migrated.ui?.snapToGrid),
  };
  migrated.meta = {
    label: typeof migrated.meta?.label === 'string' ? migrated.meta.label : 'Untitled scenario',
    savedAt: typeof migrated.meta?.savedAt === 'string' ? migrated.meta.savedAt : null,
    checksum: typeof migrated.meta?.checksum === 'string' ? migrated.meta.checksum : null,
  };
  migrated.version = SCENARIO_VERSION;
  return migrated;
}
