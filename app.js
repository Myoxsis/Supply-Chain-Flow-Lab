const workspace = document.getElementById('workspace');
const linksSvg = document.getElementById('linksSvg');
const nodeCreateToolbar = document.getElementById('nodeCreateToolbar');
const toggleCreateToolbarBtn = document.getElementById('toggleCreateToolbar');
const canvasContextMenu = document.getElementById('canvasContextMenu');
const canvasContextSearch = document.getElementById('canvasContextSearch');
const nodeTemplate = document.getElementById('nodeTemplate');
const selectionPanel = document.getElementById('selectionPanel');
const dayValue = document.getElementById('dayValue');
const transitValue = document.getElementById('transitValue');
const simStatusValue = document.getElementById('simStatusValue');
const eventLog = document.getElementById('eventLog');
const tempWire = document.getElementById('tempWire');
const kpiBar = document.getElementById('kpiBar');
const inventoryChart = document.getElementById('inventoryChart');
const shipmentChart = document.getElementById('shipmentChart');
const analyticsNodeSelect = document.getElementById('analyticsNodeSelect');
const globalPythonCodeEl = document.getElementById('globalPythonCode');
const showLinkLabelsInput = document.getElementById('showLinkLabels');
const allowWarehouseToWarehouseInput = document.getElementById('allowWarehouseToWarehouse');
const allowPlantOutboundInput = document.getElementById('allowPlantOutbound');
const snapToGridInput = document.getElementById('snapToGrid');
const scenarioPresetSelect = document.getElementById('scenarioPreset');
const loadPresetBtn = document.getElementById('loadPresetBtn');
const resetScenarioBtn = document.getElementById('resetScenarioBtn');
const exportScenarioBtn = document.getElementById('exportScenarioBtn');
const importScenarioBtn = document.getElementById('importScenarioBtn');
const importScenarioInput = document.getElementById('importScenarioInput');
const tickSpeedInput = document.getElementById('tickSpeed');
const tickSpeedValue = document.getElementById('tickSpeedValue');
const copySelectionBtn = document.getElementById('copySelectionBtn');
const pasteSelectionBtn = document.getElementById('pasteSelectionBtn');
const alignLeftBtn = document.getElementById('alignLeftBtn');
const alignRightBtn = document.getElementById('alignRightBtn');
const alignTopBtn = document.getElementById('alignTopBtn');
const alignBottomBtn = document.getElementById('alignBottomBtn');
const distributeHorizontalBtn = document.getElementById('distributeHorizontalBtn');
const distributeVerticalBtn = document.getElementById('distributeVerticalBtn');
const canvasContextActions = canvasContextMenu?.querySelector('.canvas-context-actions');
const canvasContextEmpty = canvasContextMenu?.querySelector('.context-empty');
const tempLinkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
tempLinkPath.setAttribute('class', 'link-path temp-link hidden');
linksSvg.appendChild(tempLinkPath);

const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box hidden';
workspace.appendChild(selectionBox);

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const GRID_SIZE = 24;
const SCENARIO_STORAGE_KEY = 'supply-chain-flow-lab:scenario';
const SCENARIO_VERSION = 3;

const NODE_SCHEMAS = {
  supplier: {
    label: 'Supplier',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Supplier ${i}` },
      { key: 'deliveryFrequencyDays', label: 'Delivery frequency (days)', type: 'int', required: true, min: 1, step: 1, defaultValue: 3 },
      { key: 'deliveryQuantity', label: 'Delivery quantity', type: 'int', required: true, min: 1, step: 1, defaultValue: 120 },
      { key: 'leadTimeDays', label: 'Lead time (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
      { key: 'initialInventory', label: 'Initial inventory (optional)', type: 'int', required: false, min: 0, step: 1, defaultValue: null },
    ],
  },
  warehouse: {
    label: 'Warehouse',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Warehouse ${i}` },
      { key: 'preparationTimeDays', label: 'Preparation time (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
      { key: 'deliveryToPlantDays', label: 'Delivery to plant (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 2 },
      { key: 'storageCapacity', label: 'Storage capacity', type: 'int', required: true, min: 1, step: 1, defaultValue: 600 },
      { key: 'initialInventory', label: 'Initial inventory', type: 'int', required: true, min: 0, step: 1, defaultValue: 120 },
      { key: 'reorderPoint', label: 'Reorder point (optional)', type: 'int', required: false, min: 0, step: 1, defaultValue: null },
    ],
  },
  plant: {
    label: 'Plant',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Plant ${i}` },
      { key: 'consumptionRatePerDay', label: 'Consumption rate / day', type: 'int', required: true, min: 0, step: 1, defaultValue: 20 },
      { key: 'initialInventory', label: 'Initial inventory', type: 'int', required: true, min: 0, step: 1, defaultValue: 100 },
      { key: 'safetyStock', label: 'Safety stock (optional)', type: 'int', required: false, min: 0, step: 1, defaultValue: null },
    ],
  },
  analytics: {
    label: 'Analytics',
    fields: [
      { key: 'name', label: 'Name', type: 'string', required: true, defaultValue: (i) => `Analytics ${i}` },
      {
        key: 'metric',
        label: 'Metric',
        type: 'select',
        required: true,
        options: [
          { value: 'stockout_count', label: 'Stockout events' },
          { value: 'avg_plant_inventory', label: 'Avg plant inventory' },
          { value: 'warehouse_utilization', label: 'Warehouse utilization %' },
          { value: 'on_time_rate', label: 'On-time delivery %' },
          { value: 'total_shipped', label: 'Total shipped volume' },
          { value: 'shipments_today', label: 'Shipments today' },
          { value: 'node_inventory', label: 'Connected node inventory' },
          { value: 'node_shipped', label: 'Connected node shipped' },
          { value: 'node_stockouts', label: 'Connected node stockouts' },
        ],
        defaultValue: 'stockout_count',
      },
    ],
  },
};

const state = {
  nodes: [],
  links: [],
  shipments: [],
  eventLog: [],
  inventoryHistoryByNode: {},
  analyticsMetricHistoryByNode: {},
  transitHistory: [],
  deliveryStats: { dispatched: 0, onTime: 0, deliveredVolume: 0, shipmentCost: 0 },
  shipmentsByDay: [],
  stockoutEvents: [],
  analyticsNodeId: null,
  kpis: {
    stockoutCount: 0,
    averagePlantInventory: 0,
    warehouseUtilization: 0,
    onTimeDeliveries: { onTime: 0, total: 0, rate: 0 },
    totalShippedVolume: 0,
    totalShipmentCost: 0,
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

const LINK_SCHEMA = [
  { key: 'materialName', label: 'Material name', type: 'string', required: true, defaultValue: 'Raw material' },
  { key: 'transportDelayDays', label: 'Transport delay (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
  { key: 'maxDailyCapacity', label: 'Max daily capacity', type: 'int', required: true, min: 1, step: 1, defaultValue: 120 },
  { key: 'priority', label: 'Priority', type: 'int', required: true, min: 1, step: 1, defaultValue: 1 },
  { key: 'costPerShipment', label: 'Cost per shipment (optional)', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
];

const BUILT_IN_SCENARIOS = {
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
        config: { name: 'Central Warehouse', preparationTimeDays: 1, deliveryToPlantDays: 2, storageCapacity: 900, initialInventory: 220, reorderPoint: 300 },
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

function createNodeData(type) {
  const schema = NODE_SCHEMAS[type];
  const data = {};
  schema.fields.forEach((field) => {
    const raw = typeof field.defaultValue === 'function' ? field.defaultValue(state.nodeCounter) : field.defaultValue;
    data[field.key] = raw;
  });
  return data;
}

function addNode(type, x = 80 + state.nodes.length * 40, y = 60 + state.nodes.length * 30) {
  const position = snapPosition(x, y);
  const data = createNodeData(type);
  const id = `node-${state.nodeCounter++}`;
  const node = {
    id,
    type,
    x: position.x,
    y: position.y,
    z: state.zCounter++,
    ...data,
    inventory: resolveInitialInventory(type, data),
    received: 0,
    shipped: 0,
    stockouts: 0,
    initial: structuredClone(data),
    validationErrors: {},
  };
  state.nodes.push(node);
  if (!state.analyticsNodeId) state.analyticsNodeId = node.id;
  validateAll();
  renderNode(node);
  renderAnalyticsNodeOptions();
  selectNodes([node.id]);
  drawLinks();
}

function addNodeFromContext(type) {
  if (!state.contextCreateAt) return;
  addNode(type, state.contextCreateAt.x, state.contextCreateAt.y);
  hideCanvasContextMenu();
}

function resolveInitialInventory(type, data) {
  if (type === 'supplier') return data.initialInventory == null ? Infinity : data.initialInventory;
  if (type === 'analytics') return 0;
  return data.initialInventory;
}

function renderNode(node) {
  const fragment = nodeTemplate.content.cloneNode(true);
  const el = fragment.querySelector('.node-card');
  el.dataset.id = node.id;
  el.classList.add(`type-${node.type}`);

  const titleInput = fragment.querySelector('.node-title');
  titleInput.value = node.name;
  titleInput.addEventListener('input', (e) => {
    node.name = e.target.value;
    node.initial.name = node.name;
    validateAll();
    refreshNode(node.id);
    renderSelection();
    drawLinks();
  });

  fragment.querySelector('.node-type-chip').textContent = node.type;
  fragment.querySelector('.delete-node').addEventListener('click', () => deleteNodes([node.id]));

  const body = fragment.querySelector('.node-body');
  body.innerHTML = getNodeBody(node);
  bindFieldEvents(body, node);

  const header = fragment.querySelector('.node-header');
  header.addEventListener('pointerdown', (e) => startNodeDrag(e, node.id));

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || state.keyState.space) return;
    if (e.target.closest('.port, input, button')) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (additive) {
      toggleNodeSelection(node.id);
    } else if (!state.selectedNodeIds.includes(node.id)) {
      selectNodes([node.id]);
    }
    bringNodeToFront(node.id);
  });

  fragment.querySelector('.out-port').addEventListener('pointerdown', (e) => startLinkDrag(e, node.id));
  fragment.querySelector('.in-port').addEventListener('pointerup', (e) => tryCompleteLink(e, node.id));

  workspace.appendChild(fragment);
  applyNodeStyles(node);
}

function getFieldError(node, fieldKey) {
  return node.validationErrors[fieldKey] || '';
}

function getNodeBody(node) {
  const schema = NODE_SCHEMAS[node.type];
  const fieldsHtml = schema.fields
    .filter((f) => f.key !== 'name')
    .map((field) => {
      const value = node[field.key] == null ? '' : node[field.key];
      const error = getFieldError(node, field.key);
      const inputHtml = field.type === 'select'
        ? `<select data-field="${field.key}">
            ${(field.options ?? []).map((option) => `<option value="${option.value}" ${String(value) === String(option.value) ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>`
        : field.type === 'text'
          ? `<textarea data-field="${field.key}" spellcheck="false">${value}</textarea>`
          : `<input type="number" min="${field.min ?? 0}" step="${field.step ?? 1}" data-field="${field.key}" value="${value}" />`;
      return `
        <div class="field ${error ? 'invalid' : ''}">
          <label>${field.label}</label>
          ${inputHtml}
          ${error ? `<div class="field-error">${error}</div>` : ''}
        </div>`;
    })
    .join('');

  const commonKpis = {
    supplier: `
      <div class="kpis">
        <div class="kpi"><span class="label">Shipped</span><span class="value" data-kpi="shipped">${node.shipped}</span></div>
        <div class="kpi"><span class="label">Frequency</span><span class="value">${node.deliveryFrequencyDays} d</span></div>
      </div>`,
    warehouse: `
      <div class="kpis">
        <div class="kpi"><span class="label">On hand</span><span class="value" data-kpi="inventory">${Number.isFinite(node.inventory) ? node.inventory : '∞'}</span></div>
        <div class="kpi"><span class="label">Shipped</span><span class="value" data-kpi="shipped">${node.shipped}</span></div>
      </div>`,
    plant: `
      <div class="kpis">
        <div class="kpi"><span class="label">On hand</span><span class="value" data-kpi="inventory">${Number.isFinite(node.inventory) ? node.inventory : '∞'}</span></div>
        <div class="kpi"><span class="label">Stockouts</span><span class="value" data-kpi="stockouts">${node.stockouts}</span></div>
      </div>`,
    analytics: `
      <div class="kpis">
        <div class="kpi"><span class="label">Metric</span><span class="value" data-kpi="metric-value">${readMetricValue(node)}</span></div>
        <div class="kpi"><span class="label">Trend points</span><span class="value" data-kpi="metric-points">${state.analyticsMetricHistoryByNode[node.id]?.length ?? 0}</span></div>
      </div>`,
  };

  const analyticsGraph = node.type === 'analytics'
    ? `<div class="field analytics-node-graph">
        <label>Metric trend</label>
        <svg class="analytics-node-chart" data-analytics-chart="${node.id}" viewBox="0 0 240 84" preserveAspectRatio="none"></svg>
      </div>`
    : '';

  return `${fieldsHtml}${analyticsGraph}${commonKpis[node.type]}`;
}

function bindFieldEvents(body, node) {
  body.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      const fieldSchema = NODE_SCHEMAS[node.type].fields.find((item) => item.key === field);
      const raw = e.target.value;
      let value = raw;
      if (fieldSchema?.type === 'int') {
        const trimmed = raw.trim();
        value = trimmed === '' ? null : Number(trimmed);
      }
      node[field] = value;
      node.initial[field] = value;
      if (field === 'initialInventory') {
        node.inventory = resolveInitialInventory(node.type, node);
      }
      validateAll();
      refreshNode(node.id);
      renderSelection();
    });
  });
}

function validateNode(node) {
  const schema = NODE_SCHEMAS[node.type];
  const errors = {};
  schema.fields.forEach((field) => {
    const value = node[field.key];
    if (field.type === 'string' || field.type === 'text') {
      if (field.required && (!value || !String(value).trim())) {
        errors[field.key] = `${field.label} is required.`;
      }
      return;
    }
    if (field.type === 'select') {
      if (field.required && !value) {
        errors[field.key] = `${field.label} is required.`;
        return;
      }
      if (value && !(field.options ?? []).some((option) => option.value === value)) {
        errors[field.key] = `${field.label} has an invalid selection.`;
      }
      return;
    }

    if (value == null || Number.isNaN(value)) {
      if (field.required) errors[field.key] = `${field.label} is required.`;
      return;
    }

    if (!Number.isFinite(value)) {
      errors[field.key] = `${field.label} must be finite.`;
      return;
    }

    if (!Number.isInteger(value)) {
      errors[field.key] = `${field.label} must be an integer.`;
      return;
    }

    if (field.min != null && value < field.min) {
      errors[field.key] = `${field.label} must be ≥ ${field.min}.`;
    }
  });

  if (node.type === 'warehouse') {
    if (Number.isFinite(node.initialInventory) && Number.isFinite(node.storageCapacity) && node.initialInventory > node.storageCapacity) {
      errors.initialInventory = 'Initial inventory must be ≤ storage capacity.';
    }
    if (node.reorderPoint != null && Number.isFinite(node.storageCapacity) && node.reorderPoint > node.storageCapacity) {
      errors.reorderPoint = 'Reorder point must be ≤ storage capacity.';
    }
  }

  return errors;
}

function validateAll() {
  state.nodes.forEach((node) => {
    node.validationErrors = validateNode(node);
  });

  state.graphErrors = [];
  state.links.forEach((link) => {
    const from = getNode(link.from);
    const to = getNode(link.to);
    const linkErrors = validateLink(link);
    link.validationErrors = Object.fromEntries(linkErrors.map((message, idx) => [idx, message]));
    if (linkErrors.length) {
      state.graphErrors.push(`Invalid link ${link.id}: ${linkErrors.join(' ')}`);
    }
  });
}

function hasValidationErrors() {
  return state.nodes.some((n) => Object.keys(n.validationErrors).length)
    || state.links.some((l) => Object.keys(l.validationErrors ?? {}).length)
    || state.graphErrors.length > 0;
}

function createLinkData() {
  return LINK_SCHEMA.reduce((acc, field) => {
    acc[field.key] = typeof field.defaultValue === 'function' ? field.defaultValue() : field.defaultValue;
    return acc;
  }, {});
}

function getLinkLabel(link) {
  const delay = `${link.transportDelayDays}d`;
  const cap = `cap ${link.maxDailyCapacity}`;
  return `${link.materialName} • ${delay} • ${cap} • p${link.priority}`;
}

function formatLinkCost(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `$${Number(value).toFixed(2)}`;
}

function validateLink(link) {
  const errors = [];
  const from = getNode(link.from);
  const to = getNode(link.to);
  if (!from || !to) return ['Missing endpoint node.'];
  if (!isValidLink(from, to)) errors.push(`Connection ${from.type} → ${to.type} is not allowed.`);

  LINK_SCHEMA.forEach((field) => {
    const value = link[field.key];
    if (field.type === 'string') {
      if (field.required && (!value || !String(value).trim())) {
        errors.push(`${field.label} is required.`);
      }
      return;
    }
    if (value == null || value === '') {
      if (field.required) errors.push(`${field.label} is required.`);
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      errors.push(`${field.label} must be numeric.`);
      return;
    }
    if (field.type === 'int' && !Number.isInteger(numeric)) {
      errors.push(`${field.label} must be an integer.`);
      return;
    }
    if (field.min != null && numeric < field.min) {
      errors.push(`${field.label} must be ≥ ${field.min}.`);
    }
  });
  return errors;
}

function getRemainingLinkCapacity(link, day) {
  const shippedToday = state.shipments
    .filter((shipment) => shipment.linkId === link.id && shipment.departureDay === day)
    .reduce((sum, shipment) => sum + shipment.qty, 0);
  return Math.max(0, link.maxDailyCapacity - shippedToday);
}

function refreshNode(nodeId) {
  const node = getNode(nodeId);
  const el = getNodeElement(nodeId);
  if (!node || !el) return;
  const body = el.querySelector('.node-body');
  body.innerHTML = getNodeBody(node);
  bindFieldEvents(body, node);
  el.querySelector('.node-title').value = node.name;
  applyNodeStyles(node);
  renderAnalyticsNodeOptions();
  drawLinks();
  renderAnalytics();
}

function deleteNodes(nodeIds) {
  if (!nodeIds.length) return;
  const idSet = new Set(nodeIds);
  state.nodes = state.nodes.filter((n) => !idSet.has(n.id));
  state.links = state.links.filter((l) => !idSet.has(l.from) && !idSet.has(l.to));
  state.shipments = state.shipments.filter((s) => !idSet.has(s.from) && !idSet.has(s.to));
  nodeIds.forEach((nodeId) => {
    delete state.inventoryHistoryByNode[nodeId];
    delete state.analyticsMetricHistoryByNode[nodeId];
  });
  nodeIds.forEach((nodeId) => getNodeElement(nodeId)?.remove());
  state.selectedNodeIds = state.selectedNodeIds.filter((id) => !idSet.has(id));
  if (!state.selectedNodeIds.length && state.nodes.length) state.selectedNodeIds = [state.nodes[0].id];
  state.selectedLinkIds = [];
  if (nodeIds.includes(state.analyticsNodeId)) {
    state.analyticsNodeId = state.nodes[0]?.id ?? null;
  }
  validateAll();
  drawLinks();
  renderSelection();
  renderAnalyticsNodeOptions();
  updateStats();
}

function startNodeDrag(e, nodeId) {
  if (e.button !== 0 || state.keyState.space) return;
  if (e.target.closest('input, button')) return;
  e.preventDefault();
  if (!state.selectedNodeIds.includes(nodeId)) selectNodes([nodeId]);
  state.selectedNodeIds.forEach(bringNodeToFront);

  const pointerWorld = screenToWorld(e.clientX, e.clientY);
  state.drag = {
    pointerId: e.pointerId,
    starts: state.selectedNodeIds.map((id) => getNode(id)).filter(Boolean).map((node) => ({ id: node.id, x: node.x, y: node.y })),
    pointerStart: pointerWorld,
  };

  window.addEventListener('pointermove', onNodeDrag);
  window.addEventListener('pointerup', stopNodeDrag, { once: true });
}

function onNodeDrag(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;
  const pointer = screenToWorld(e.clientX, e.clientY);
  const dx = pointer.x - state.drag.pointerStart.x;
  const dy = pointer.y - state.drag.pointerStart.y;
  state.drag.starts.forEach((start) => {
    const node = getNode(start.id);
    if (!node) return;
    const next = snapPosition(start.x + dx, start.y + dy);
    node.x = Math.max(16, next.x);
    node.y = Math.max(16, next.y);
    applyNodeStyles(node);
  });
  drawLinks();
}

function stopNodeDrag() {
  state.drag = null;
  window.removeEventListener('pointermove', onNodeDrag);
}

function startPan(e) {
  e.preventDefault();
  state.pan = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: state.camera.x, originY: state.camera.y };
  workspace.classList.add('is-panning');
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', stopPan, { once: true });
}

function onPanMove(e) {
  if (!state.pan || state.pan.pointerId !== e.pointerId) return;
  state.camera.x = state.pan.originX + (e.clientX - state.pan.startX);
  state.camera.y = state.pan.originY + (e.clientY - state.pan.startY);
  renderViewport();
}

function stopPan() {
  state.pan = null;
  workspace.classList.remove('is-panning');
  window.removeEventListener('pointermove', onPanMove);
}

function startBoxSelection(e) {
  const start = screenToWorld(e.clientX, e.clientY);
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  state.boxSelection = {
    pointerId: e.pointerId,
    start,
    current: start,
    additive,
    initialSelected: additive ? [...state.selectedNodeIds] : [],
  };
  if (!additive) selectNodes([]);
  selectionBox.classList.remove('hidden');
  updateSelectionBox();
  window.addEventListener('pointermove', onBoxSelectionMove);
  window.addEventListener('pointerup', stopBoxSelection, { once: true });
}

function onBoxSelectionMove(e) {
  if (!state.boxSelection || state.boxSelection.pointerId !== e.pointerId) return;
  state.boxSelection.current = screenToWorld(e.clientX, e.clientY);
  updateSelectionBox();

  const bounds = normalizedBounds(state.boxSelection.start, state.boxSelection.current);
  const hits = state.nodes.filter((node) => {
    const rect = nodeRect(node);
    return rect.x2 >= bounds.x1 && rect.x1 <= bounds.x2 && rect.y2 >= bounds.y1 && rect.y1 <= bounds.y2;
  }).map((node) => node.id);
  const nextSelection = state.boxSelection.additive
    ? [...new Set([...state.boxSelection.initialSelected, ...hits])]
    : hits;
  selectNodes(nextSelection, { keepLinks: false });
}

function stopBoxSelection() {
  state.boxSelection = null;
  selectionBox.classList.add('hidden');
  window.removeEventListener('pointermove', onBoxSelectionMove);
}

function updateSelectionBox() {
  if (!state.boxSelection) return;
  const bounds = normalizedBounds(state.boxSelection.start, state.boxSelection.current);
  const topLeft = worldToScreen(bounds.x1, bounds.y1);
  selectionBox.style.left = `${topLeft.x}px`;
  selectionBox.style.top = `${topLeft.y}px`;
  selectionBox.style.width = `${(bounds.x2 - bounds.x1) * state.camera.zoom}px`;
  selectionBox.style.height = `${(bounds.y2 - bounds.y1) * state.camera.zoom}px`;
}

function startLinkDrag(e, nodeId) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const fromPort = e.currentTarget;
  state.linking = { pointerId: e.pointerId, from: nodeId, origin: portCenter(fromPort), pointer: portCenter(fromPort), targetNodeId: null };
  tempWire.classList.remove('hidden');
  drawTempLink(state.linking.pointer);
  window.addEventListener('pointermove', onLinkDragMove);
  window.addEventListener('pointerup', stopLinkDrag, { once: true });
  log(`Started link from ${getNode(nodeId).name}`);
}

function onLinkDragMove(e) {
  if (!state.linking || e.pointerId !== state.linking.pointerId) return;
  const pointer = screenToWorkspace(e.clientX, e.clientY);
  state.linking.pointer = pointer;

  const targetInput = document.elementFromPoint(e.clientX, e.clientY)?.closest('.in-port');
  const targetCard = targetInput?.closest('.node-card');
  const candidateNodeId = targetCard?.dataset.id;
  const from = getNode(state.linking.from);
  const to = getNode(candidateNodeId);
  state.linking.targetNodeId = from && to && isValidLink(from, to) ? to.id : null;

  tempWire.style.left = `${pointer.x + 12}px`;
  tempWire.style.top = `${pointer.y + 12}px`;
  drawTempLink(pointer);
}

function stopLinkDrag(e) {
  if (!state.linking || e.pointerId !== state.linking.pointerId) return;
  const targetInput = document.elementFromPoint(e.clientX, e.clientY)?.closest('.in-port');
  const targetNodeId = targetInput?.closest('.node-card')?.dataset.id;
  tryCreateLink(state.linking.from, targetNodeId);
  clearLinkingState();
}

function tryCompleteLink(e, nodeId) {
  e.stopPropagation();
  if (!state.linking) return;
  tryCreateLink(state.linking.from, nodeId);
  clearLinkingState();
}

function tryCreateLink(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const from = getNode(fromId);
  const to = getNode(toId);
  if (!from || !to) return;
  if (!isValidLink(from, to)) {
    log(`Invalid link: ${from.type} → ${to.type}`);
    return;
  }
  if (state.links.some((l) => l.from === from.id && l.to === to.id)) return;

  const link = {
    id: `link-${state.linkCounter++}`,
    from: from.id,
    to: to.id,
    ...createLinkData(),
    validationErrors: {},
  };
  state.links.push(link);
  state.selectedLinkIds = [link.id];
  state.selectedNodeIds = [];
  validateAll();
  log(`Linked ${from.name} → ${to.name}`);
  drawLinks();
  renderSelection();
}

function isValidLink(from, to) {
  if (to.type === 'analytics' && from.type !== 'analytics') return true;
  if (from.type === 'plant' && !state.ui.allowPlantOutbound) return false;
  if (from.type === 'supplier' && (to.type === 'warehouse' || to.type === 'plant')) return true;
  if (from.type === 'warehouse' && to.type === 'plant') return true;
  if (from.type === 'warehouse' && to.type === 'warehouse' && state.ui.allowWarehouseToWarehouse) return true;
  return false;
}

function drawLinks() {
  linksSvg.querySelectorAll('.link-path:not(.temp-link), .link-label').forEach((el) => el.remove());
  state.links.forEach((link) => {
    const fromEl = workspace.querySelector(`.node-card[data-id="${link.from}"] .out-port`);
    const toEl = workspace.querySelector(`.node-card[data-id="${link.to}"] .in-port`);
    if (!fromEl || !toEl) return;
    const p1 = portCenter(fromEl);
    const p2 = portCenter(toEl);
    const dx = Math.max(70 * state.camera.zoom, Math.abs(p2.x - p1.x) * 0.55);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.dataset.id = link.id;
    path.setAttribute('class', `link-path${state.selectedLinkIds.includes(link.id) ? ' selected' : ''}`);
    path.setAttribute('d', `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`);
    path.style.pointerEvents = 'stroke';
    path.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      state.selectedLinkIds = [link.id];
      state.selectedNodeIds = [];
      updateSelectionClasses();
      renderSelection();
    });
    linksSvg.appendChild(path);
    if (state.ui.showLinkLabels) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'link-label');
      label.setAttribute('x', String((p1.x + p2.x) / 2));
      label.setAttribute('y', String((p1.y + p2.y) / 2 - 8));
      label.textContent = getLinkLabel(link);
      linksSvg.appendChild(label);
    }
  });
  linksSvg.appendChild(tempLinkPath);
}

function portCenter(el) {
  const rect = el.getBoundingClientRect();
  const wRect = workspace.getBoundingClientRect();
  return { x: rect.left - wRect.left + rect.width / 2, y: rect.top - wRect.top + rect.height / 2 };
}

function renderSelection() {
  if (state.selectedLinkIds.length === 1) {
    const link = state.links.find((l) => l.id === state.selectedLinkIds[0]);
    if (link) {
      const linkErrors = Object.values(link.validationErrors ?? {});
      const fieldRows = LINK_SCHEMA.map((field) => {
        const value = link[field.key] == null ? '' : link[field.key];
        const input = field.type === 'string'
          ? `<input type="text" data-link-field="${field.key}" value="${value}" />`
          : `<input type="number" min="${field.min ?? 0}" step="${field.step ?? 1}" data-link-field="${field.key}" value="${value}" />`;
        return `<label class="field"><span>${field.label}</span>${input}</label>`;
      }).join('');
      selectionPanel.innerHTML = `
        <div class="selection-grid">
          <div class="selection-row"><span>Selection</span><strong>Link</strong></div>
          <div class="selection-row"><span>From</span><strong>${getNode(link.from)?.name ?? 'Unknown'}</strong></div>
          <div class="selection-row"><span>To</span><strong>${getNode(link.to)?.name ?? 'Unknown'}</strong></div>
          <div class="selection-row"><span>Cost / shipment</span><strong>${formatLinkCost(link.costPerShipment)}</strong></div>
        </div>
        <div class="link-editor">${fieldRows}</div>
        ${linkErrors.length ? `<div class="validation-block"><strong>Link validation errors</strong><ul>${linkErrors.map((e) => `<li>${e}</li>`).join('')}</ul></div>` : '<div class="validation-ok">No link validation errors.</div>'}`;
      selectionPanel.querySelectorAll('[data-link-field]').forEach((input) => {
        input.addEventListener('input', (e) => {
          const fieldKey = e.target.dataset.linkField;
          const fieldSchema = LINK_SCHEMA.find((item) => item.key === fieldKey);
          let value = e.target.value;
          if (fieldSchema.type !== 'string') {
            value = value.trim() === '' ? null : Number(value);
            if (fieldSchema.type === 'int' && value != null) value = Math.trunc(value);
          }
          link[fieldKey] = value;
          validateAll();
          renderSelection();
          drawLinks();
        });
      });
      return;
    }
  }

  if (!state.selectedNodeIds.length) {
    selectionPanel.innerHTML = '<div class="empty-state">Select nodes or links to inspect them.</div>';
    return;
  }

  if (state.selectedNodeIds.length > 1) {
    selectionPanel.innerHTML = `<div class="empty-state">${state.selectedNodeIds.length} nodes selected.</div>`;
    return;
  }

  const node = getNode(state.selectedNodeIds[0]);
  if (!node) return;
  const outgoing = state.links.filter((l) => l.from === node.id).map((l) => getNode(l.to)?.name).join(', ') || 'None';
  const incoming = state.links.filter((l) => l.to === node.id).map((l) => getNode(l.from)?.name).join(', ') || 'None';
  const nodeErrors = Object.values(node.validationErrors);
  const graphErrorsHtml = state.graphErrors.length ? `<div class="validation-block"><strong>Graph errors</strong><ul>${state.graphErrors.map((e) => `<li>${e}</li>`).join('')}</ul></div>` : '';

  selectionPanel.innerHTML = `
    <div class="selection-grid">
      <div class="selection-row"><span>Name</span><strong>${node.name}</strong></div>
      <div class="selection-row"><span>Type</span><strong>${node.type}</strong></div>
      <div class="selection-row"><span>Incoming</span><strong>${incoming}</strong></div>
      <div class="selection-row"><span>Outgoing</span><strong>${outgoing}</strong></div>
      ${node.type !== 'analytics' ? `<div class="selection-row"><span>Current simulated inventory</span><strong>${Number.isFinite(node.inventory) ? node.inventory : '∞'}</strong></div>` : ''}
      ${node.type === 'supplier' ? `<div class="selection-row"><span>Frequency</span><strong>${node.deliveryFrequencyDays} days</strong></div>` : ''}
      ${node.type === 'warehouse' ? `<div class="selection-row"><span>Prep + Delivery</span><strong>${node.preparationTimeDays + node.deliveryToPlantDays} days</strong></div>` : ''}
      ${node.type === 'plant' ? `<div class="selection-row"><span>Consumption</span><strong>${node.consumptionRatePerDay}/day</strong></div>` : ''}
      ${node.type === 'analytics' ? `<div class="selection-row"><span>Metric</span><strong>${node.metric}</strong></div>` : ''}
    </div>
    ${nodeErrors.length ? `<div class="validation-block"><strong>Validation errors</strong><ul>${nodeErrors.map((e) => `<li>${e}</li>`).join('')}</ul></div>` : '<div class="validation-ok">No validation errors.</div>'}
    ${graphErrorsHtml}`;
}

function canRunSimulation() {
  validateAll();
  if (!hasValidationErrors()) return true;
  log('Simulation blocked: resolve validation errors first.');
  setSimulationStatus('paused');
  renderSelection();
  state.nodes.forEach((n) => refreshNode(n.id));
  return false;
}

const ALLOWED_SIMULATION_TRANSITIONS = {
  idle: ['running'],
  running: ['paused', 'idle'],
  paused: ['running', 'idle'],
};

function setSimulationStatus(nextStatus) {
  const current = state.simulation.status;
  if (current === nextStatus) {
    updateSimulationControls();
    return true;
  }
  if (!(ALLOWED_SIMULATION_TRANSITIONS[current] ?? []).includes(nextStatus)) return false;

  state.simulation.status = nextStatus;
  if (nextStatus !== 'running' && state.simulation.timerId) {
    clearTimeout(state.simulation.timerId);
    state.simulation.timerId = null;
  }
  updateSimulationControls();
  return true;
}

function updateSimulationControls() {
  const status = state.simulation.status;
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const stepBtn = document.getElementById('stepBtn');
  const resetBtn = document.getElementById('resetBtn');

  if (simStatusValue) simStatusValue.textContent = status[0].toUpperCase() + status.slice(1);
  if (startBtn) startBtn.disabled = status !== 'idle';
  if (pauseBtn) pauseBtn.disabled = status !== 'running';
  if (resumeBtn) resumeBtn.disabled = status !== 'paused';
  if (stepBtn) stepBtn.disabled = status === 'running';
  if (resetBtn) resetBtn.disabled = false;
}

function refreshSimulationNodeViews() {
  state.nodes.forEach((node) => {
    const el = getNodeElement(node.id);
    if (!el) return;
    const inventoryEl = el.querySelector('[data-kpi="inventory"]');
    if (inventoryEl) inventoryEl.textContent = Number.isFinite(node.inventory) ? node.inventory : '∞';
    const shippedEl = el.querySelector('[data-kpi="shipped"]');
    if (shippedEl) shippedEl.textContent = node.shipped;
    const stockoutsEl = el.querySelector('[data-kpi="stockouts"]');
    if (stockoutsEl) stockoutsEl.textContent = node.stockouts;
    const metricValueEl = el.querySelector('[data-kpi="metric-value"]');
    if (metricValueEl) metricValueEl.textContent = readMetricValue(node);
    const metricPointsEl = el.querySelector('[data-kpi="metric-points"]');
    if (metricPointsEl) metricPointsEl.textContent = state.analyticsMetricHistoryByNode[node.id]?.length ?? 0;
  });
}

function runOneSimulationDay() {
  if (!canRunSimulation()) return false;
  simulateDay();
  updateStats();
  refreshSimulationNodeViews();
  renderSelection();
  return true;
}

function stepSimulation() {
  if (state.simulation.status === 'running') return;
  runOneSimulationDay();
}

function simulateDay() {
  state.day += 1;
  state.shipmentsByDay.push({ day: state.day, count: 0, volume: 0 });
  processArrivals();
  suppliersShip();
  warehousesDispatch();
  plantsConsume();
  recordDailyHistory();
  computeKpis();
}

function processArrivals() {
  const arriving = state.shipments.filter((s) => s.arrivalDay <= state.day);
  state.shipments = state.shipments.filter((s) => s.arrivalDay > state.day);
  arriving.forEach((shipment) => {
    const toNode = getNode(shipment.to);
    if (!toNode) return;

    let receivedQty = shipment.qty;
    if (toNode.type === 'warehouse') {
      const capacityLeft = Math.max(0, toNode.storageCapacity - toNode.inventory);
      receivedQty = Math.min(receivedQty, capacityLeft);
      if (receivedQty < shipment.qty) {
        log(`${toNode.name} overflowed by ${shipment.qty - receivedQty} units (discarded).`);
      }
    }

    if (Number.isFinite(toNode.inventory)) toNode.inventory += receivedQty;
    toNode.received += receivedQty;
    if (shipment.arrivalDay === state.day) {
      state.deliveryStats.onTime += 1;
    }
    state.deliveryStats.deliveredVolume += receivedQty;
    log(`${receivedQty} ${shipment.materialName} arrived at ${toNode.name} from ${shipment.fromName}`);
  });
}

function suppliersShip() {
  state.nodes.filter((n) => n.type === 'supplier').forEach((supplier) => {
    if (state.day % supplier.deliveryFrequencyDays !== 0) return;
    const outgoingLinks = state.links
      .filter((l) => l.from === supplier.id)
      .slice()
      .sort((a, b) => a.priority - b.priority);
    outgoingLinks.forEach((link) => {
      const target = getNode(link.to);
      if (!target) return;
      if (Number.isFinite(supplier.inventory) && supplier.inventory <= 0) return;
      const linkCapacity = getRemainingLinkCapacity(link, state.day);
      if (linkCapacity <= 0) return;
      const qtyCap = Math.min(supplier.deliveryQuantity, linkCapacity);
      const qty = Number.isFinite(supplier.inventory) ? Math.min(qtyCap, supplier.inventory) : qtyCap;
      if (qty <= 0) return;
      queueShipment(supplier, target, link, qty, supplier.leadTimeDays + link.transportDelayDays);
      if (Number.isFinite(supplier.inventory)) supplier.inventory -= qty;
      supplier.shipped += qty;
    });
  });
}

function warehousesDispatch() {
  state.nodes.filter((n) => n.type === 'warehouse').forEach((warehouse) => {
    const outboundLinks = state.links
      .filter((l) => l.from === warehouse.id)
      .slice()
      .sort((a, b) => a.priority - b.priority);
    outboundLinks.forEach((link) => {
      const plant = getNode(link.to);
      if (plant?.type !== 'plant') return;
      const safety = plant.safetyStock ?? 0;
      const desired = safety + plant.consumptionRatePerDay;
      const need = Math.max(0, desired - plant.inventory);
      if (need <= 0 || warehouse.inventory <= 0) return;
      if (warehouse.reorderPoint != null && warehouse.inventory <= warehouse.reorderPoint) return;
      const linkCapacity = getRemainingLinkCapacity(link, state.day);
      if (linkCapacity <= 0) return;
      const qty = Math.min(need, warehouse.inventory, linkCapacity);
      const totalLead = warehouse.preparationTimeDays + warehouse.deliveryToPlantDays + link.transportDelayDays;
      if (qty <= 0) return;
      warehouse.inventory -= qty;
      warehouse.shipped += qty;
      queueShipment(warehouse, plant, link, qty, totalLead);
    });
  });
}

function plantsConsume() {
  state.nodes.filter((n) => n.type === 'plant').forEach((plant) => {
    plant.inventory -= plant.consumptionRatePerDay;
    if (plant.inventory >= 0) {
      log(`${plant.name} consumed ${plant.consumptionRatePerDay} units`);
      return;
    }

    const shortfall = Math.abs(plant.inventory);
    plant.inventory = 0;
    plant.stockouts += 1;
    state.stockoutEvents.push({ day: state.day, nodeId: plant.id, shortfall });
    log(`${plant.name} stockout (${shortfall} units short)`);
  });
}

function recordDailyHistory() {
  state.nodes.forEach((node) => {
    if (!state.inventoryHistoryByNode[node.id]) state.inventoryHistoryByNode[node.id] = [];
    state.inventoryHistoryByNode[node.id].push({
      day: state.day,
      inventory: Number.isFinite(node.inventory) ? node.inventory : null,
      onHandLabel: Number.isFinite(node.inventory) ? node.inventory : '∞',
    });
  });

  state.transitHistory.push({
    day: state.day,
    shipmentsInTransit: state.shipments.length,
    inTransitVolume: state.shipments.reduce((sum, shipment) => sum + shipment.qty, 0),
    shipments: state.shipments.map((shipment) => ({
      from: shipment.from,
      to: shipment.to,
      linkId: shipment.linkId,
      materialName: shipment.materialName,
      qty: shipment.qty,
      departureDay: shipment.departureDay,
      arrivalDay: shipment.arrivalDay,
    })),
  });
}

function computeKpis() {
  const plants = state.nodes.filter((n) => n.type === 'plant');
  const warehouses = state.nodes.filter((n) => n.type === 'warehouse');

  const stockoutCount = plants.reduce((sum, p) => sum + p.stockouts, 0);

  const plantSamples = plants.reduce((sum, plant) => sum + (state.inventoryHistoryByNode[plant.id]?.length ?? 0), 0);
  const averagePlantInventory = plantSamples
    ? plants.reduce((sum, plant) => {
      const history = state.inventoryHistoryByNode[plant.id] ?? [];
      return sum + history.reduce((inner, pt) => inner + (pt.inventory ?? 0), 0);
    }, 0) / plantSamples
    : 0;

  const warehouseUtilization = warehouses.length
    ? warehouses.reduce((sum, warehouse) => {
      const history = state.inventoryHistoryByNode[warehouse.id] ?? [];
      if (!history.length || !warehouse.storageCapacity) return sum;
      const avgOnHand = history.reduce((inner, pt) => inner + (pt.inventory ?? 0), 0) / history.length;
      return sum + (avgOnHand / warehouse.storageCapacity);
    }, 0) / warehouses.length
    : 0;

  const totalDeliveries = state.deliveryStats.dispatched;
  const onTime = state.deliveryStats.onTime;
  const onTimeRate = totalDeliveries ? onTime / totalDeliveries : 1;

  state.kpis = {
    stockoutCount,
    averagePlantInventory: Number(averagePlantInventory.toFixed(2)),
    warehouseUtilization: Number(warehouseUtilization.toFixed(4)),
    onTimeDeliveries: {
      onTime,
      total: totalDeliveries,
      rate: Number(onTimeRate.toFixed(4)),
    },
    totalShippedVolume: state.nodes.reduce((sum, node) => sum + node.shipped, 0),
    totalShipmentCost: Number(state.deliveryStats.shipmentCost.toFixed(2)),
  };
}

function simulateDays(days) {
  if (!canRunSimulation()) return null;
  const totalDays = Number(days);
  if (!Number.isInteger(totalDays) || totalDays < 0) throw new Error('days must be a non-negative integer');
  for (let i = 0; i < totalDays; i += 1) simulateDay();
  updateStats();
  refreshSimulationNodeViews();
  renderSelection();
  return buildSimulationOutput();
}

function buildSimulationOutput() {
  return {
    deterministicSimulationState: {
      day: state.day,
      nodes: state.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        inventory: Number.isFinite(node.inventory) ? node.inventory : null,
        shipped: node.shipped,
        received: node.received,
        stockouts: node.stockouts,
      })),
      shipmentsInTransit: state.shipments.map((shipment) => ({
        from: shipment.from,
        to: shipment.to,
        linkId: shipment.linkId,
        materialName: shipment.materialName,
        qty: shipment.qty,
        departureDay: shipment.departureDay,
        arrivalDay: shipment.arrivalDay,
      })),
    },
    eventLog: structuredClone(state.eventLog),
    inventoryTimeSeriesByNode: structuredClone(state.inventoryHistoryByNode),
    shipmentsInTransitHistory: structuredClone(state.transitHistory),
    kpiSummary: structuredClone(state.kpis),
  };
}

function queueShipment(from, to, link, qty, leadTime) {
  state.deliveryStats.dispatched += 1;
  const shipmentCost = link.costPerShipment == null ? 0 : Number(link.costPerShipment);
  if (Number.isFinite(shipmentCost)) state.deliveryStats.shipmentCost += shipmentCost;
  const dayBucket = state.shipmentsByDay[state.shipmentsByDay.length - 1];
  if (dayBucket) {
    dayBucket.count += 1;
    dayBucket.volume += qty;
  }
  state.shipments.push({
    from: from.id,
    to: to.id,
    linkId: link.id,
    materialName: link.materialName,
    priority: link.priority,
    shipmentCost: link.costPerShipment == null ? null : Number(link.costPerShipment),
    qty,
    departureDay: state.day,
    arrivalDay: state.day + leadTime,
    fromName: from.name,
  });
  log(`${from.name} shipped ${qty} ${link.materialName} to ${to.name} via ${link.id} (ETA day ${state.day + leadTime})`);
}

function initializeSimulationTracking() {
  setSimulationStatus('idle');
  state.eventLog = [];
  state.logBuffer = [];
  if (state.logFlushHandle) {
    cancelAnimationFrame(state.logFlushHandle);
    state.logFlushHandle = null;
  }
  eventLog.innerHTML = '';
  state.inventoryHistoryByNode = {};
  state.analyticsMetricHistoryByNode = {};
  state.transitHistory = [];
  state.deliveryStats = { dispatched: 0, onTime: 0, deliveredVolume: 0, shipmentCost: 0 };
  state.shipmentsByDay = [];
  state.stockoutEvents = [];
  state.nodes.forEach((node) => {
    state.inventoryHistoryByNode[node.id] = [{
      day: state.day,
      inventory: Number.isFinite(node.inventory) ? node.inventory : null,
      onHandLabel: Number.isFinite(node.inventory) ? node.inventory : '∞',
    }];
    if (node.type === 'analytics') state.analyticsMetricHistoryByNode[node.id] = [];
  });
  computeKpis();
  recordAnalyticsMetricHistory();
  renderAnalyticsNodeOptions();
  renderAnalytics();
}

function resetSimulation() {
  setSimulationStatus('idle');
  state.day = 0;
  state.shipments = [];
  state.nodes.forEach((node) => {
    Object.assign(node, structuredClone(node.initial));
    node.inventory = resolveInitialInventory(node.type, node);
    node.received = 0;
    node.shipped = 0;
    node.stockouts = 0;
    refreshNode(node.id);
  });
  validateAll();
  initializeSimulationTracking();
  updateStats();
  log('Simulation reset');
  renderSelection();
}

function clearGraph() {
  setSimulationStatus('idle');
  state.nodes = [];
  state.links = [];
  state.shipments = [];
  state.selectedNodeIds = [];
  state.selectedLinkIds = [];
  state.analyticsNodeId = null;
  state.analyticsMetricHistoryByNode = {};
  state.graphErrors = [];
  workspace.querySelectorAll('.node-card').forEach((el) => el.remove());
  drawLinks();
  renderSelection();
  renderAnalyticsNodeOptions();
}

function normalizeNodeConfig(type, config = {}, sequence = 1) {
  const defaults = createNodeData(type);
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

function migrateScenario(rawScenario) {
  if (!rawScenario || typeof rawScenario !== 'object') {
    throw new Error('Scenario must be a JSON object.');
  }

  const version = Number(rawScenario.version ?? 1);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('Scenario version must be a positive integer.');
  }
  if (version > SCENARIO_VERSION) {
    throw new Error(`Unsupported scenario version ${version}. This app supports up to version ${SCENARIO_VERSION}.`);
  }

  const migrated = structuredClone(rawScenario);

  if (version < 2) {
    migrated.globalPythonCode = migrated.globalPythonCode ?? '';
    migrated.ui = migrated.ui ?? {};
    migrated.links = (migrated.links ?? []).map((link) => ({ ...createLinkData(), ...link }));
  }

  if (version < 3) {
    migrated.ui = {
      showLinkLabels: Boolean(migrated.ui?.showLinkLabels),
      allowWarehouseToWarehouse: Boolean(migrated.ui?.allowWarehouseToWarehouse),
      allowPlantOutbound: Boolean(migrated.ui?.allowPlantOutbound),
      showCreateToolbar: true,
      snapToGrid: false,
    };
  }

  migrated.ui = {
    showLinkLabels: Boolean(migrated.ui?.showLinkLabels),
    allowWarehouseToWarehouse: Boolean(migrated.ui?.allowWarehouseToWarehouse),
    allowPlantOutbound: Boolean(migrated.ui?.allowPlantOutbound),
    showCreateToolbar: migrated.ui?.showCreateToolbar !== false,
    snapToGrid: Boolean(migrated.ui?.snapToGrid),
  };

  migrated.version = SCENARIO_VERSION;
  return migrated;
}

function importScenarioObject(rawScenario, options = {}) {
  const scenario = migrateScenario(rawScenario);
  const nodesInput = Array.isArray(scenario.nodes) ? scenario.nodes : [];
  const linksInput = Array.isArray(scenario.links) ? scenario.links : [];

  clearGraph();
  state.day = Number.isInteger(scenario.day) && scenario.day >= 0 ? scenario.day : 0;
  state.globalPythonCode = typeof scenario.globalPythonCode === 'string' ? scenario.globalPythonCode : '';
  globalPythonCodeEl.value = state.globalPythonCode;
  state.ui.showLinkLabels = Boolean(scenario.ui?.showLinkLabels);
  state.ui.allowWarehouseToWarehouse = Boolean(scenario.ui?.allowWarehouseToWarehouse);
  state.ui.allowPlantOutbound = Boolean(scenario.ui?.allowPlantOutbound);
  state.ui.showCreateToolbar = scenario.ui?.showCreateToolbar !== false;
  state.ui.snapToGrid = Boolean(scenario.ui?.snapToGrid);

  nodesInput.forEach((rawNode, idx) => {
    if (!rawNode || typeof rawNode !== 'object') return;
    if (!NODE_SCHEMAS[rawNode.type]) return;
    const config = normalizeNodeConfig(rawNode.type, rawNode.config, idx + 1);
    const x = Number(rawNode.position?.x ?? 80 + idx * 40);
    const y = Number(rawNode.position?.y ?? 80 + idx * 40);
    const node = {
      id: typeof rawNode.id === 'string' && rawNode.id ? rawNode.id : `node-${idx + 1}`,
      type: rawNode.type,
      x: Number.isFinite(x) ? x : 80 + idx * 40,
      y: Number.isFinite(y) ? y : 80 + idx * 40,
      z: state.zCounter++,
      ...config,
      inventory: resolveInitialInventory(rawNode.type, config),
      received: 0,
      shipped: 0,
      stockouts: 0,
      initial: structuredClone(config),
      validationErrors: {},
    };
    state.nodes.push(node);
    renderNode(node);
  });

  const nodeIds = new Set(state.nodes.map((n) => n.id));
  linksInput.forEach((rawLink, idx) => {
    if (!rawLink || typeof rawLink !== 'object') return;
    if (!nodeIds.has(rawLink.from) || !nodeIds.has(rawLink.to)) return;
    const defaults = createLinkData();
    const transportDelayDays = Number(rawLink.transportDelayDays ?? defaults.transportDelayDays);
    const maxDailyCapacity = Number(rawLink.maxDailyCapacity ?? defaults.maxDailyCapacity);
    const priority = Number(rawLink.priority ?? defaults.priority);
    const costPerShipment = rawLink.costPerShipment == null ? null : Number(rawLink.costPerShipment);
    state.links.push({
      id: typeof rawLink.id === 'string' && rawLink.id ? rawLink.id : `link-${idx + 1}`,
      from: rawLink.from,
      to: rawLink.to,
      materialName: String(rawLink.materialName ?? defaults.materialName),
      transportDelayDays: Number.isFinite(transportDelayDays) ? transportDelayDays : defaults.transportDelayDays,
      maxDailyCapacity: Number.isFinite(maxDailyCapacity) ? maxDailyCapacity : defaults.maxDailyCapacity,
      priority: Number.isFinite(priority) ? priority : defaults.priority,
      costPerShipment: costPerShipment == null || Number.isFinite(costPerShipment) ? costPerShipment : null,
      validationErrors: {},
    });
  });

  const maxNodeCounter = state.nodes.reduce((max, node) => {
    const parsed = Number.parseInt(String(node.id).replace('node-', ''), 10);
    return Number.isInteger(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  const maxLinkCounter = state.links.reduce((max, link) => {
    const parsed = Number.parseInt(String(link.id).replace('link-', ''), 10);
    return Number.isInteger(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  state.nodeCounter = Math.max(1, maxNodeCounter + 1);
  state.linkCounter = Math.max(1, maxLinkCounter + 1);

  showLinkLabelsInput.checked = state.ui.showLinkLabels;
  allowWarehouseToWarehouseInput.checked = state.ui.allowWarehouseToWarehouse;
  allowPlantOutboundInput.checked = state.ui.allowPlantOutbound;
  setCreateToolbarVisibility(state.ui.showCreateToolbar);
  setSnapToGrid(state.ui.snapToGrid);

  validateAll();
  initializeSimulationTracking();
  updateStats();
  if (state.nodes.length) {
    selectNodes([state.nodes[0].id]);
    fitToGraph();
  } else {
    renderViewport();
    renderAnalytics();
  }
  if (!options.silent) log(options.logMessage ?? 'Scenario loaded');
}

function serializeGraph() {
  return {
    version: SCENARIO_VERSION,
    day: state.day,
    globalPythonCode: state.globalPythonCode,
    ui: structuredClone(state.ui),
    nodes: state.nodes.map((node) => {
      const schemaKeys = NODE_SCHEMAS[node.type].fields.map((f) => f.key);
      const config = schemaKeys.reduce((acc, key) => {
        acc[key] = node[key] ?? null;
        return acc;
      }, {});
      return { id: node.id, type: node.type, position: { x: node.x, y: node.y }, config };
    }),
    links: state.links.map((l) => ({
      id: l.id,
      from: l.from,
      to: l.to,
      materialName: l.materialName,
      transportDelayDays: l.transportDelayDays,
      maxDailyCapacity: l.maxDailyCapacity,
      priority: l.priority,
      costPerShipment: l.costPerShipment,
    })),
  };
}

function persistScenarioToLocalStorage() {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(serializeGraph()));
  } catch (error) {
    console.warn('Failed to save scenario to localStorage', error);
  }
}

function loadScenarioFromLocalStorage() {
  const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
  if (!raw) return false;
  try {
    importScenarioObject(JSON.parse(raw), { logMessage: 'Scenario restored from local storage' });
    return true;
  } catch (error) {
    console.warn('Failed to restore scenario from localStorage', error);
    log(`Could not restore saved scenario (${error.message}). Loading demo instead.`);
    return false;
  }
}

let autosaveHandle = null;
function startScenarioAutosave() {
  clearInterval(autosaveHandle);
  autosaveHandle = setInterval(persistScenarioToLocalStorage, 1500);
  window.addEventListener('beforeunload', persistScenarioToLocalStorage);
}

function updateStats() {
  dayValue.textContent = state.day;
  transitValue.textContent = state.shipments.length;
  if (tickSpeedValue) tickSpeedValue.textContent = `${state.simulation.speedMs} ms/day`;
  updateSimulationControls();
  recordAnalyticsMetricHistory();
  renderAnalytics();
}

function renderAnalyticsNodeOptions() {
  const previous = state.analyticsNodeId;
  analyticsNodeSelect.innerHTML = state.nodes
    .map((node) => `<option value="${node.id}">${node.name} (${node.type})</option>`)
    .join('');
  if (!state.nodes.length) {
    state.analyticsNodeId = null;
    return;
  }
  if (!state.nodes.some((n) => n.id === previous)) {
    state.analyticsNodeId = state.nodes[0].id;
  } else {
    state.analyticsNodeId = previous;
  }
  analyticsNodeSelect.value = state.analyticsNodeId;
}

function renderAnalytics() {
  renderKpiBar();
  renderInventoryChart();
  renderShipmentChart();
  renderAnalyticsNodeCharts();
}

function getPrimaryAnalyticsSource(analyticsNode) {
  const inputLink = state.links.find((link) => link.to === analyticsNode.id);
  return inputLink ? getNode(inputLink.from) : null;
}

function readMetricValue(analyticsNode) {
  const source = getPrimaryAnalyticsSource(analyticsNode);
  switch (analyticsNode.metric) {
    case 'stockout_count':
      return state.kpis.stockoutCount;
    case 'avg_plant_inventory':
      return Math.round(state.kpis.averagePlantInventory);
    case 'warehouse_utilization':
      return `${Math.round(state.kpis.warehouseUtilization * 100)}%`;
    case 'on_time_rate':
      return `${Math.round(state.kpis.onTimeDeliveries.rate * 100)}%`;
    case 'total_shipped':
      return state.kpis.totalShippedVolume;
    case 'shipments_today':
      return state.shipmentsByDay.at(-1)?.count ?? 0;
    case 'node_inventory':
      return source ? (Number.isFinite(source.inventory) ? source.inventory : '∞') : '—';
    case 'node_shipped':
      return source ? source.shipped : '—';
    case 'node_stockouts':
      return source ? source.stockouts : '—';
    default:
      return '—';
  }
}

function readMetricNumericValue(analyticsNode) {
  const source = getPrimaryAnalyticsSource(analyticsNode);
  switch (analyticsNode.metric) {
    case 'stockout_count':
      return state.kpis.stockoutCount;
    case 'avg_plant_inventory':
      return state.kpis.averagePlantInventory;
    case 'warehouse_utilization':
      return Number((state.kpis.warehouseUtilization * 100).toFixed(2));
    case 'on_time_rate':
      return Number((state.kpis.onTimeDeliveries.rate * 100).toFixed(2));
    case 'total_shipped':
      return state.kpis.totalShippedVolume;
    case 'shipments_today':
      return state.shipmentsByDay.at(-1)?.count ?? 0;
    case 'node_inventory':
      return source && Number.isFinite(source.inventory) ? source.inventory : null;
    case 'node_shipped':
      return source ? source.shipped : null;
    case 'node_stockouts':
      return source ? source.stockouts : null;
    default:
      return null;
  }
}

function recordAnalyticsMetricHistory() {
  state.nodes.filter((node) => node.type === 'analytics').forEach((node) => {
    if (!state.analyticsMetricHistoryByNode[node.id]) state.analyticsMetricHistoryByNode[node.id] = [];
    const bucket = state.analyticsMetricHistoryByNode[node.id];
    const value = readMetricNumericValue(node);
    if (!Number.isFinite(value)) return;
    const last = bucket.at(-1);
    if (last?.day === state.day) {
      last.value = value;
      return;
    }
    bucket.push({ day: state.day, value });
  });
}

function renderAnalyticsNodeCharts() {
  state.nodes.filter((node) => node.type === 'analytics').forEach((node) => {
    const el = getNodeElement(node.id);
    if (!el) return;
    const svg = el.querySelector(`[data-analytics-chart="${node.id}"]`);
    if (!svg) return;
    const points = (state.analyticsMetricHistoryByNode[node.id] ?? []).map((pt) => ({ x: pt.day, y: pt.value }));
    drawCompactNodeChart(svg, points);
  });
}

function renderKpiBar() {
  const analyticsNodes = state.nodes.filter((node) => node.type === 'analytics');
  if (!analyticsNodes.length) {
    kpiBar.innerHTML = '<div class="kpi-pill" style="grid-column: 1 / -1;"><span>No analytics nodes yet</span><strong>Add an Analytics node to publish metrics.</strong></div>';
    return;
  }

  kpiBar.innerHTML = analyticsNodes.map((node) => {
    const source = getPrimaryAnalyticsSource(node);
    const value = readMetricValue(node);
    return `
      <div class="kpi-pill">
        <span>${node.name}</span>
        <strong>${value}</strong>
        <div class="chart-meta">${node.metric}${source ? ` · source: ${source.name}` : ''}</div>
      </div>
    `;
  }).join('');
}

function renderInventoryChart() {
  const nodeId = state.analyticsNodeId;
  const history = nodeId ? (state.inventoryHistoryByNode[nodeId] ?? []) : [];
  const stockoutsForNode = state.stockoutEvents.filter((event) => event.nodeId === nodeId);
  drawLineChart(inventoryChart, {
    points: history.map((pt) => ({ x: pt.day, y: pt.inventory ?? 0 })),
    className: 'inventory',
    yLabel: 'Inventory',
    emptyLabel: 'Run simulation to see inventory history.',
    markers: stockoutsForNode.map((event) => ({ x: event.day, y: 0 })),
  });
}

function renderShipmentChart() {
  drawLineChart(shipmentChart, {
    points: state.shipmentsByDay.map((pt) => ({ x: pt.day, y: pt.count })),
    className: 'shipments',
    yLabel: 'Shipments/day',
    emptyLabel: 'Run simulation to see shipment counts.',
  });
}

function drawLineChart(svg, config) {
  const width = 640;
  const height = 180;
  const pad = { top: 12, right: 14, bottom: 24, left: 34 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const points = config.points ?? [];
  svg.innerHTML = '';

  if (!points.length) {
    svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" class="empty-chart-label">${config.emptyLabel}</text>`;
    return;
  }

  const xMin = Math.min(...points.map((p) => p.x));
  const xMax = Math.max(...points.map((p) => p.x));
  const yMax = Math.max(1, ...points.map((p) => p.y));

  const toX = (x) => pad.left + ((x - xMin) / Math.max(1, xMax - xMin)) * chartW;
  const toY = (y) => pad.top + chartH - (y / yMax) * chartH;

  const gridValues = [0, 0.25, 0.5, 0.75, 1];
  gridValues.forEach((ratio) => {
    const y = pad.top + chartH * ratio;
    const value = Math.round(yMax * (1 - ratio));
    svg.insertAdjacentHTML('beforeend', `<line class="chart-gridline" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />`);
    svg.insertAdjacentHTML('beforeend', `<text class="chart-axis-label" x="${pad.left - 6}" y="${y + 3}" text-anchor="end">${value}</text>`);
  });

  const polyline = points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(' ');
  svg.insertAdjacentHTML('beforeend', `<polyline class="chart-line ${config.className}" points="${polyline}" />`);
  svg.insertAdjacentHTML('beforeend', `<text class="chart-axis-label" x="${width / 2}" y="${height - 6}" text-anchor="middle">Day ${xMin} - ${xMax}</text>`);
  svg.insertAdjacentHTML('beforeend', `<text class="chart-axis-label" x="${pad.left}" y="${pad.top - 2}">${config.yLabel}</text>`);

  (config.markers ?? []).forEach((marker) => {
    const cx = toX(marker.x);
    const cy = toY(marker.y);
    svg.insertAdjacentHTML('beforeend', `<circle class="stockout-marker" cx="${cx}" cy="${cy}" r="4" />`);
  });
}

function drawCompactNodeChart(svg, points) {
  const width = 240;
  const height = 84;
  const pad = { top: 8, right: 8, bottom: 12, left: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  svg.innerHTML = '';

  if (!points.length) {
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="empty-chart-label">Run simulation</text>';
    return;
  }

  const xMin = Math.min(...points.map((p) => p.x));
  const xMax = Math.max(...points.map((p) => p.x));
  const yMax = Math.max(1, ...points.map((p) => p.y));
  const toX = (x) => pad.left + ((x - xMin) / Math.max(1, xMax - xMin)) * chartW;
  const toY = (y) => pad.top + chartH - (y / yMax) * chartH;
  const polyline = points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(' ');
  svg.insertAdjacentHTML('beforeend', `<polyline class="chart-line inventory compact-node-line" points="${polyline}" />`);
}

function getNode(id) { return state.nodes.find((n) => n.id === id); }
function getNodeElement(nodeId) { return workspace.querySelector(`.node-card[data-id="${nodeId}"]`); }

function bringNodeToFront(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  node.z = state.zCounter++;
  applyNodeStyles(node);
}

function applyNodeStyles(node) {
  const el = getNodeElement(node.id);
  if (!el) return;
  const screen = worldToScreen(node.x, node.y);
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y}px`;
  el.style.transform = `scale(${state.camera.zoom})`;
  el.style.transformOrigin = 'top left';
  el.style.zIndex = `${node.z}`;
}

function updateSelectionClasses() {
  workspace.querySelectorAll('.node-card').forEach((el) => {
    el.classList.toggle('selected', state.selectedNodeIds.includes(el.dataset.id));
  });
  drawLinks();
}

function selectNodes(nodeIds, options = {}) {
  state.selectedNodeIds = [...new Set(nodeIds)];
  if (state.selectedNodeIds.length === 1) {
    state.analyticsNodeId = state.selectedNodeIds[0];
    analyticsNodeSelect.value = state.analyticsNodeId;
  }
  if (!options.keepLinks) state.selectedLinkIds = [];
  updateSelectionClasses();
  renderSelection();
  renderAnalytics();
}

function toggleNodeSelection(nodeId) {
  if (state.selectedNodeIds.includes(nodeId)) {
    selectNodes(state.selectedNodeIds.filter((id) => id !== nodeId));
    return;
  }
  selectNodes([...state.selectedNodeIds, nodeId]);
}

function deleteSelected() {
  if (state.selectedLinkIds.length) {
    const deleteSet = new Set(state.selectedLinkIds);
    state.links = state.links.filter((link) => !deleteSet.has(link.id));
    state.selectedLinkIds = [];
    validateAll();
    drawLinks();
    renderSelection();
    return;
  }
  deleteNodes(state.selectedNodeIds);
}

function duplicateSelected() {
  copySelectedNodes();
  pasteClipboard({ dx: 36, dy: 36, renameAsCopy: true });
}

function copySelectedNodes() {
  const selectedNodes = getSelectedNodes();
  if (!selectedNodes.length) return false;
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const minX = Math.min(...selectedNodes.map((node) => node.x));
  const minY = Math.min(...selectedNodes.map((node) => node.y));
  const links = state.links.filter((link) => selectedNodeIds.has(link.from) && selectedNodeIds.has(link.to));
  state.clipboard = {
    nodes: selectedNodes.map((node) => ({
      node: structuredClone(node),
      offsetX: node.x - minX,
      offsetY: node.y - minY,
    })),
    links: links.map((link) => structuredClone(link)),
  };
  log(`Copied ${selectedNodes.length} node${selectedNodes.length > 1 ? 's' : ''}`);
  return true;
}

function pasteClipboard(options = {}) {
  if (!state.clipboard?.nodes?.length) return false;
  const dx = Number(options.dx ?? 32);
  const dy = Number(options.dy ?? 32);
  const renameAsCopy = Boolean(options.renameAsCopy);
  const cloneMap = new Map();
  const pastedNodeIds = state.clipboard.nodes.map((entry, idx) => {
    const id = `node-${state.nodeCounter++}`;
    const copy = structuredClone(entry.node);
    const next = snapPosition(entry.node.x + dx, entry.node.y + dy);
    copy.id = id;
    if (renameAsCopy) copy.name = `${entry.node.name} Copy`;
    copy.x = Math.max(16, next.x);
    copy.y = Math.max(16, next.y);
    copy.z = state.zCounter++;
    copy.initial = structuredClone(copy.initial);
    copy.validationErrors = {};
    cloneMap.set(entry.node.id, id);
    state.nodes.push(copy);
    renderNode(copy);
    return copy.id;
  });

  state.clipboard.links.forEach((link) => {
    const from = cloneMap.get(link.from);
    const to = cloneMap.get(link.to);
    if (!from || !to) return;
    state.links.push({
      ...structuredClone(link),
      id: `link-${state.linkCounter++}`,
      from,
      to,
      validationErrors: {},
    });
  });

  validateAll();
  selectNodes(pastedNodeIds);
  drawLinks();
  log(`Pasted ${pastedNodeIds.length} node${pastedNodeIds.length > 1 ? 's' : ''}`);
  return true;
}

function alignSelected(axis, edge) {
  const nodes = getSelectedNodes();
  if (nodes.length < 2) return;
  const values = nodes.map((node) => (axis === 'x' ? (edge === 'start' ? node.x : nodeRect(node).x2) : (edge === 'start' ? node.y : nodeRect(node).y2)));
  const target = edge === 'start' ? Math.min(...values) : Math.max(...values);
  nodes.forEach((node) => {
    if (axis === 'x') {
      const x = edge === 'start' ? target : target - (nodeRect(node).x2 - node.x);
      node.x = Math.max(16, snapPosition(x, node.y).x);
    } else {
      const y = edge === 'start' ? target : target - (nodeRect(node).y2 - node.y);
      node.y = Math.max(16, snapPosition(node.x, y).y);
    }
    applyNodeStyles(node);
  });
  drawLinks();
}

function distributeSelected(axis) {
  const nodes = getSelectedNodes();
  if (nodes.length < 3) return;
  const sorted = [...nodes].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  const first = axis === 'x' ? sorted[0].x : sorted[0].y;
  const last = axis === 'x' ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y;
  const step = (last - first) / (sorted.length - 1);
  sorted.forEach((node, idx) => {
    if (idx === 0 || idx === sorted.length - 1) return;
    if (axis === 'x') {
      node.x = Math.max(16, snapPosition(first + step * idx, node.y).x);
    } else {
      node.y = Math.max(16, snapPosition(node.x, first + step * idx).y);
    }
    applyNodeStyles(node);
  });
  drawLinks();
}

function fitToGraph() {
  if (!state.nodes.length) return;
  const bounds = state.nodes.reduce((acc, node) => {
    const rect = nodeRect(node);
    return { x1: Math.min(acc.x1, rect.x1), y1: Math.min(acc.y1, rect.y1), x2: Math.max(acc.x2, rect.x2), y2: Math.max(acc.y2, rect.y2) };
  }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });

  const padding = 80;
  const width = Math.max(200, bounds.x2 - bounds.x1 + padding * 2);
  const height = Math.max(140, bounds.y2 - bounds.y1 + padding * 2);
  const zoomX = workspace.clientWidth / width;
  const zoomY = workspace.clientHeight / height;
  state.camera.zoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM);

  const centerX = (bounds.x1 + bounds.x2) / 2;
  const centerY = (bounds.y1 + bounds.y2) / 2;
  state.camera.x = workspace.clientWidth / 2 - centerX * state.camera.zoom;
  state.camera.y = workspace.clientHeight / 2 - centerY * state.camera.zoom;
  renderViewport();
}

function renderViewport() {
  state.nodes.forEach((node) => applyNodeStyles(node));
  drawLinks();
  if (state.boxSelection) updateSelectionBox();
}

function screenToWorkspace(clientX, clientY) {
  const rect = workspace.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function screenToWorld(clientX, clientY) {
  const screen = screenToWorkspace(clientX, clientY);
  return { x: (screen.x - state.camera.x) / state.camera.zoom, y: (screen.y - state.camera.y) / state.camera.zoom };
}

function worldToScreen(x, y) {
  return { x: state.camera.x + x * state.camera.zoom, y: state.camera.y + y * state.camera.zoom };
}

function zoomAt(clientX, clientY, nextZoom) {
  const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  if (clampedZoom === state.camera.zoom) return;
  const before = screenToWorld(clientX, clientY);
  state.camera.zoom = clampedZoom;
  const rect = workspace.getBoundingClientRect();
  state.camera.x = clientX - rect.left - before.x * state.camera.zoom;
  state.camera.y = clientY - rect.top - before.y * state.camera.zoom;
  renderViewport();
}

function nodeRect(node) {
  const width = 264;
  const height = 190;
  return { x1: node.x, y1: node.y, x2: node.x + width, y2: node.y + height };
}

function normalizedBounds(a, b) {
  return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function snapValue(value) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPosition(x, y) {
  if (!state.ui.snapToGrid) return { x, y };
  return { x: snapValue(x), y: snapValue(y) };
}

function getSelectedNodes() {
  return state.selectedNodeIds.map(getNode).filter(Boolean);
}

function setCreateToolbarVisibility(show) {
  state.ui.showCreateToolbar = !!show;
  nodeCreateToolbar?.classList.toggle('hidden', !state.ui.showCreateToolbar);
  if (toggleCreateToolbarBtn) {
    toggleCreateToolbarBtn.textContent = state.ui.showCreateToolbar ? 'Hide quick add' : 'Quick add';
  }
}

function setSnapToGrid(enabled) {
  state.ui.snapToGrid = Boolean(enabled);
  workspace.classList.toggle('grid-minimal', !state.ui.snapToGrid);
  if (snapToGridInput) snapToGridInput.checked = state.ui.snapToGrid;
}

function updateContextMenuFilter() {
  const query = (canvasContextSearch?.value ?? '').trim().toLowerCase();
  const buttons = canvasContextActions?.querySelectorAll('.context-action') ?? [];
  let visibleCount = 0;
  buttons.forEach((button) => {
    const show = !query || button.textContent.toLowerCase().includes(query);
    button.classList.toggle('hidden', !show);
    if (show) visibleCount += 1;
  });
  canvasContextEmpty?.classList.toggle('hidden', visibleCount > 0);
}

function showCanvasContextMenu(e) {
  if (!canvasContextMenu) return;
  const clickWorld = screenToWorld(e.clientX, e.clientY);
  state.contextCreateAt = {
    x: Math.max(16, clickWorld.x),
    y: Math.max(16, clickWorld.y),
  };
  const rect = workspace.getBoundingClientRect();
  const nextLeft = Math.min(rect.width - 246, Math.max(8, e.clientX - rect.left));
  const nextTop = Math.min(rect.height - 186, Math.max(8, e.clientY - rect.top));
  canvasContextMenu.style.left = `${nextLeft}px`;
  canvasContextMenu.style.top = `${nextTop}px`;
  canvasContextMenu.classList.remove('hidden');
  if (canvasContextSearch) {
    canvasContextSearch.value = '';
    updateContextMenuFilter();
    canvasContextSearch.focus();
  }
}

function hideCanvasContextMenu() {
  canvasContextMenu?.classList.add('hidden');
  state.contextCreateAt = null;
}

function clearLinkingState() {
  state.linking = null;
  tempWire.classList.add('hidden');
  tempLinkPath.classList.add('hidden');
  window.removeEventListener('pointermove', onLinkDragMove);
}

function drawTempLink(pointer) {
  if (!state.linking?.origin) return;
  const start = state.linking.origin;
  const end = state.linking.targetNodeId ? portCenter(workspace.querySelector(`.node-card[data-id="${state.linking.targetNodeId}"] .in-port`)) : pointer;
  const dx = Math.max(55 * state.camera.zoom, Math.abs(end.x - start.x) * 0.45);
  tempLinkPath.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`);
  tempLinkPath.classList.remove('hidden');
}

function log(message) {
  state.eventLog.push({ day: state.day, message });
  state.logBuffer.push({ day: state.day, message });
  if (!state.logFlushHandle) {
    state.logFlushHandle = window.requestAnimationFrame(flushEventLogBuffer);
  }
}

function flushEventLogBuffer() {
  state.logFlushHandle = null;
  if (!state.logBuffer.length) return;
  const entries = state.logBuffer.splice(0);
  const fragment = document.createDocumentFragment();
  entries.forEach((item) => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `Day ${item.day}: ${item.message}`;
    fragment.prepend(entry);
  });
  eventLog.prepend(fragment);
  while (eventLog.childElementCount > 600) {
    eventLog.lastElementChild?.remove();
  }
}

function scheduleNextSimulationTick() {
  if (state.simulation.status !== 'running') return;
  if (state.simulation.timerId) clearTimeout(state.simulation.timerId);
  state.simulation.timerId = setTimeout(runSimulationTick, state.simulation.speedMs);
}

function runSimulationTick() {
  state.simulation.timerId = null;
  if (state.simulation.status !== 'running') return;
  if (state.simulation.tickInProgress) {
    scheduleNextSimulationTick();
    return;
  }

  state.simulation.tickInProgress = true;
  window.requestAnimationFrame(() => {
    const ok = runOneSimulationDay();
    state.simulation.tickInProgress = false;
    if (!ok) {
      setSimulationStatus('paused');
      return;
    }
    scheduleNextSimulationTick();
  });
}

function startSimulation() {
  if (state.simulation.status !== 'idle') return;
  if (!canRunSimulation()) return;
  setSimulationStatus('running');
  scheduleNextSimulationTick();
}

function pauseSimulation() {
  setSimulationStatus('paused');
}

function resumeSimulation() {
  if (state.simulation.status !== 'paused') return;
  if (!canRunSimulation()) return;
  setSimulationStatus('running');
  scheduleNextSimulationTick();
}

workspace.addEventListener('pointerdown', (e) => {
  hideCanvasContextMenu();
  const onNode = e.target.closest('.node-card');
  const onPort = e.target.closest('.port');
  if (onNode || onPort) return;

  if (e.button === 1 || (e.button === 0 && state.keyState.space)) {
    startPan(e);
    return;
  }

  if (e.button !== 0) return;
  startBoxSelection(e);
});

workspace.addEventListener('contextmenu', (e) => {
  const onNode = e.target.closest('.node-card');
  const onPort = e.target.closest('.port');
  if (onNode || onPort || state.keyState.space) return;
  e.preventDefault();
  showCanvasContextMenu(e);
});

workspace.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 0.88;
  zoomAt(e.clientX, e.clientY, state.camera.zoom * factor);
}, { passive: false });

workspace.addEventListener('dblclick', fitToGraph);
workspace.addEventListener('pointerdown', () => {
  state.selectedLinkIds = [];
  updateSelectionClasses();
  renderSelection();
}, true);

window.addEventListener('pointerdown', (e) => {
  if (!canvasContextMenu || canvasContextMenu.classList.contains('hidden')) return;
  if (e.target.closest('#canvasContextMenu')) return;
  hideCanvasContextMenu();
});

window.addEventListener('resize', renderViewport);

window.addEventListener('keydown', (e) => {
  const inInput = e.target.matches('input, textarea');
  if (e.code === 'Space' && !inInput) {
    state.keyState.space = true;
    document.body.classList.add('space-pan');
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
    e.preventDefault();
    deleteSelected();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !inInput) {
    e.preventDefault();
    duplicateSelected();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !inInput) {
    e.preventDefault();
    copySelectedNodes();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !inInput) {
    e.preventDefault();
    pasteClipboard();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !inInput) {
    e.preventDefault();
    selectNodes(state.nodes.map((node) => node.id));
    return;
  }

  if (!inInput && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    fitToGraph();
    return;
  }

  if (e.key === 'Escape') {
    clearLinkingState();
    hideCanvasContextMenu();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    state.keyState.space = false;
    document.body.classList.remove('space-pan');
  }
});

document.getElementById('addSupplier').addEventListener('click', () => addNode('supplier'));
document.getElementById('addWarehouse').addEventListener('click', () => addNode('warehouse'));
document.getElementById('addPlant').addEventListener('click', () => addNode('plant'));
document.getElementById('addAnalytics').addEventListener('click', () => addNode('analytics'));
if (nodeCreateToolbar) {
  nodeCreateToolbar.querySelectorAll('[data-node-type]').forEach((button) => {
    button.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.nodeType;
      addNode(type, 48 + state.nodes.length * 18, 48 + state.nodes.length * 14);
    });
  });
}
if (toggleCreateToolbarBtn) {
  toggleCreateToolbarBtn.addEventListener('click', () => {
    setCreateToolbarVisibility(!state.ui.showCreateToolbar);
    persistScenarioToLocalStorage();
  });
}
copySelectionBtn?.addEventListener('click', copySelectedNodes);
pasteSelectionBtn?.addEventListener('click', () => pasteClipboard());
alignLeftBtn?.addEventListener('click', () => alignSelected('x', 'start'));
alignRightBtn?.addEventListener('click', () => alignSelected('x', 'end'));
alignTopBtn?.addEventListener('click', () => alignSelected('y', 'start'));
alignBottomBtn?.addEventListener('click', () => alignSelected('y', 'end'));
distributeHorizontalBtn?.addEventListener('click', () => distributeSelected('x'));
distributeVerticalBtn?.addEventListener('click', () => distributeSelected('y'));
snapToGridInput?.addEventListener('change', (e) => {
  setSnapToGrid(e.target.checked);
  persistScenarioToLocalStorage();
});
if (canvasContextActions) {
  canvasContextActions.querySelectorAll('.context-action').forEach((button) => {
    button.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.nodeType;
      addNodeFromContext(type);
    });
  });
}
canvasContextSearch?.addEventListener('input', updateContextMenuFilter);
canvasContextSearch?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const firstVisible = canvasContextActions?.querySelector('.context-action:not(.hidden)');
  if (!firstVisible) return;
  e.preventDefault();
  addNodeFromContext(firstVisible.dataset.nodeType);
});
document.getElementById('clearLinks').addEventListener('click', () => {
  state.links = [];
  state.selectedLinkIds = [];
  validateAll();
  drawLinks();
  log('All links cleared');
  renderSelection();
});
document.getElementById('startBtn').addEventListener('click', startSimulation);
document.getElementById('resumeBtn').addEventListener('click', resumeSimulation);
document.getElementById('pauseBtn').addEventListener('click', pauseSimulation);
document.getElementById('stepBtn').addEventListener('click', stepSimulation);
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
if (loadPresetBtn) {
  loadPresetBtn.addEventListener('click', () => {
    const preset = scenarioPresetSelect?.value ?? 'blank';
    if (!BUILT_IN_SCENARIOS[preset]) return;
    importScenarioObject(structuredClone(BUILT_IN_SCENARIOS[preset]), { logMessage: `${preset === 'demo' ? 'Demo' : 'Blank'} scenario loaded` });
    persistScenarioToLocalStorage();
  });
}
if (resetScenarioBtn) {
  resetScenarioBtn.addEventListener('click', () => {
    importScenarioObject(structuredClone(BUILT_IN_SCENARIOS.blank), { logMessage: 'Scenario reset to blank' });
    persistScenarioToLocalStorage();
  });
}
if (exportScenarioBtn) {
  exportScenarioBtn.addEventListener('click', () => {
    const payload = JSON.stringify(serializeGraph(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `supply-chain-scenario-v${SCENARIO_VERSION}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
    log('Scenario exported to JSON');
  });
}
if (importScenarioBtn && importScenarioInput) {
  importScenarioBtn.addEventListener('click', () => importScenarioInput.click());
  importScenarioInput.addEventListener('change', async (e) => {
    const [file] = e.target.files ?? [];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      importScenarioObject(parsed, { logMessage: `Scenario imported from ${file.name}` });
      persistScenarioToLocalStorage();
    } catch (error) {
      log(`Import failed: ${error.message}`);
      alert(`Could not import scenario. ${error.message}`);
    } finally {
      importScenarioInput.value = '';
    }
  });
}
if (tickSpeedInput) {
  tickSpeedInput.addEventListener('input', (e) => {
    const next = Number(e.target.value);
    if (!Number.isFinite(next)) return;
    state.simulation.speedMs = next;
    if (tickSpeedValue) tickSpeedValue.textContent = `${state.simulation.speedMs} ms/day`;
    if (state.simulation.status === 'running') scheduleNextSimulationTick();
  });
}
analyticsNodeSelect.addEventListener('change', (e) => {
  state.analyticsNodeId = e.target.value;
  renderInventoryChart();
});
document.getElementById('clearLogBtn').addEventListener('click', () => {
  eventLog.innerHTML = '';
  state.eventLog = [];
  state.logBuffer = [];
  if (state.logFlushHandle) {
    cancelAnimationFrame(state.logFlushHandle);
    state.logFlushHandle = null;
  }
});
globalPythonCodeEl.addEventListener('input', (e) => {
  state.globalPythonCode = e.target.value;
  persistScenarioToLocalStorage();
});
state.globalPythonCode = globalPythonCodeEl.value;
setSnapToGrid(state.ui.snapToGrid);
if (showLinkLabelsInput) {
  showLinkLabelsInput.checked = state.ui.showLinkLabels;
  showLinkLabelsInput.addEventListener('change', (e) => {
    state.ui.showLinkLabels = e.target.checked;
    drawLinks();
    persistScenarioToLocalStorage();
  });
}
if (allowWarehouseToWarehouseInput) {
  allowWarehouseToWarehouseInput.checked = state.ui.allowWarehouseToWarehouse;
  allowWarehouseToWarehouseInput.addEventListener('change', (e) => {
    state.ui.allowWarehouseToWarehouse = e.target.checked;
    validateAll();
    drawLinks();
    renderSelection();
    persistScenarioToLocalStorage();
  });
}
if (allowPlantOutboundInput) {
  allowPlantOutboundInput.checked = state.ui.allowPlantOutbound;
  allowPlantOutboundInput.addEventListener('change', (e) => {
    state.ui.allowPlantOutbound = e.target.checked;
    validateAll();
    drawLinks();
    renderSelection();
    persistScenarioToLocalStorage();
  });
}
startScenarioAutosave();
if (!loadScenarioFromLocalStorage()) {
  importScenarioObject(structuredClone(BUILT_IN_SCENARIOS.demo), { logMessage: 'Built-in demo scenario loaded' });
  persistScenarioToLocalStorage();
}

window.SupplyChainFlowLab = {
  serializeGraph,
  importScenarioObject,
  migrateScenario,
  loadBuiltInScenario: (name) => importScenarioObject(structuredClone(BUILT_IN_SCENARIOS[name] ?? BUILT_IN_SCENARIOS.blank)),
  getState: () => structuredClone({ nodes: state.nodes, links: state.links, graphErrors: state.graphErrors, globalPythonCode: state.globalPythonCode }),
  stepSimulation,
  simulateDays,
  getSimulationOutput: buildSimulationOutput,
};
