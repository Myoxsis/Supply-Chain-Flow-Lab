const workspace = document.getElementById('workspace');
const linksSvg = document.getElementById('linksSvg');
const nodeTemplate = document.getElementById('nodeTemplate');
const selectionPanel = document.getElementById('selectionPanel');
const dayValue = document.getElementById('dayValue');
const transitValue = document.getElementById('transitValue');
const eventLog = document.getElementById('eventLog');
const tempWire = document.getElementById('tempWire');
const kpiBar = document.getElementById('kpiBar');
const inventoryChart = document.getElementById('inventoryChart');
const shipmentChart = document.getElementById('shipmentChart');
const analyticsNodeSelect = document.getElementById('analyticsNodeSelect');
const tempLinkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
tempLinkPath.setAttribute('class', 'link-path temp-link hidden');
linksSvg.appendChild(tempLinkPath);

const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box hidden';
workspace.appendChild(selectionBox);

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

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
};

const state = {
  nodes: [],
  links: [],
  shipments: [],
  eventLog: [],
  inventoryHistoryByNode: {},
  transitHistory: [],
  deliveryStats: { dispatched: 0, onTime: 0, deliveredVolume: 0 },
  shipmentsByDay: [],
  stockoutEvents: [],
  analyticsNodeId: null,
  kpis: {
    stockoutCount: 0,
    averagePlantInventory: 0,
    warehouseUtilization: 0,
    onTimeDeliveries: { onTime: 0, total: 0, rate: 0 },
    totalShippedVolume: 0,
  },
  day: 0,
  drag: null,
  pan: null,
  boxSelection: null,
  linking: null,
  selectedNodeIds: [],
  selectedLinkIds: [],
  timer: null,
  nodeCounter: 1,
  linkCounter: 1,
  zCounter: 1,
  camera: { x: 0, y: 0, zoom: 1 },
  keyState: { space: false },
  graphErrors: [],
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
  const data = createNodeData(type);
  const id = `node-${state.nodeCounter++}`;
  const node = {
    id,
    type,
    x,
    y,
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

function resolveInitialInventory(type, data) {
  if (type === 'supplier') return data.initialInventory == null ? Infinity : data.initialInventory;
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
      return `
        <div class="field ${error ? 'invalid' : ''}">
          <label>${field.label}</label>
          <input type="number" min="${field.min ?? 0}" step="${field.step ?? 1}" data-field="${field.key}" value="${value}" />
          ${error ? `<div class="field-error">${error}</div>` : ''}
        </div>`;
    })
    .join('');

  const commonKpis = {
    supplier: `
      <div class="kpis">
        <div class="kpi"><span class="label">Shipped</span><span class="value">${node.shipped}</span></div>
        <div class="kpi"><span class="label">Frequency</span><span class="value">${node.deliveryFrequencyDays} d</span></div>
      </div>`,
    warehouse: `
      <div class="kpis">
        <div class="kpi"><span class="label">On hand</span><span class="value">${node.inventory}</span></div>
        <div class="kpi"><span class="label">Shipped</span><span class="value">${node.shipped}</span></div>
      </div>`,
    plant: `
      <div class="kpis">
        <div class="kpi"><span class="label">On hand</span><span class="value">${node.inventory}</span></div>
        <div class="kpi"><span class="label">Stockouts</span><span class="value">${node.stockouts}</span></div>
      </div>`,
  };

  return `${fieldsHtml}${commonKpis[node.type]}`;
}

function bindFieldEvents(body, node) {
  body.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      const raw = e.target.value.trim();
      const value = raw === '' ? null : Number(raw);
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
    if (field.type === 'string') {
      if (field.required && (!value || !String(value).trim())) {
        errors[field.key] = `${field.label} is required.`;
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
    if (!from || !to || !isValidLink(from, to)) {
      state.graphErrors.push(`Invalid link ${link.id}. Allowed: Supplier→Warehouse/Plant, Warehouse→Plant.`);
    }
  });
}

function hasValidationErrors() {
  return state.nodes.some((n) => Object.keys(n.validationErrors).length) || state.graphErrors.length > 0;
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
}

function deleteNodes(nodeIds) {
  if (!nodeIds.length) return;
  const idSet = new Set(nodeIds);
  state.nodes = state.nodes.filter((n) => !idSet.has(n.id));
  state.links = state.links.filter((l) => !idSet.has(l.from) && !idSet.has(l.to));
  state.shipments = state.shipments.filter((s) => !idSet.has(s.from) && !idSet.has(s.to));
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
    node.x = Math.max(16, start.x + dx);
    node.y = Math.max(16, start.y + dy);
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
  state.boxSelection = { pointerId: e.pointerId, start, current: start };
  selectNodes([]);
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
  selectNodes(hits, { keepLinks: false });
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

  const link = { id: `link-${state.linkCounter++}`, from: from.id, to: to.id };
  state.links.push(link);
  state.selectedLinkIds = [link.id];
  state.selectedNodeIds = [];
  validateAll();
  log(`Linked ${from.name} → ${to.name}`);
  drawLinks();
  renderSelection();
}

function isValidLink(from, to) {
  if (from.type === 'supplier' && (to.type === 'warehouse' || to.type === 'plant')) return true;
  if (from.type === 'warehouse' && to.type === 'plant') return true;
  return false;
}

function drawLinks() {
  linksSvg.querySelectorAll('.link-path:not(.temp-link)').forEach((path) => path.remove());
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
      selectionPanel.innerHTML = `
        <div class="selection-grid">
          <div class="selection-row"><span>Selection</span><strong>Link</strong></div>
          <div class="selection-row"><span>From</span><strong>${getNode(link.from)?.name ?? 'Unknown'}</strong></div>
          <div class="selection-row"><span>To</span><strong>${getNode(link.to)?.name ?? 'Unknown'}</strong></div>
        </div>`;
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
      <div class="selection-row"><span>Inventory</span><strong>${Number.isFinite(node.inventory) ? node.inventory : '∞'}</strong></div>
      ${node.type === 'supplier' ? `<div class="selection-row"><span>Frequency</span><strong>${node.deliveryFrequencyDays} days</strong></div>` : ''}
      ${node.type === 'warehouse' ? `<div class="selection-row"><span>Prep + Delivery</span><strong>${node.preparationTimeDays + node.deliveryToPlantDays} days</strong></div>` : ''}
      ${node.type === 'plant' ? `<div class="selection-row"><span>Consumption</span><strong>${node.consumptionRatePerDay}/day</strong></div>` : ''}
    </div>
    ${nodeErrors.length ? `<div class="validation-block"><strong>Validation errors</strong><ul>${nodeErrors.map((e) => `<li>${e}</li>`).join('')}</ul></div>` : '<div class="validation-ok">No validation errors.</div>'}
    ${graphErrorsHtml}`;
}

function canRunSimulation() {
  validateAll();
  if (!hasValidationErrors()) return true;
  log('Simulation blocked: resolve validation errors first.');
  renderSelection();
  state.nodes.forEach((n) => refreshNode(n.id));
  return false;
}

function stepSimulation() {
  if (!canRunSimulation()) return;
  simulateDay();
  updateStats();
  state.nodes.forEach((n) => refreshNode(n.id));
  renderSelection();
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
    log(`${receivedQty} units arrived at ${toNode.name} from ${shipment.fromName}`);
  });
}

function suppliersShip() {
  state.nodes.filter((n) => n.type === 'supplier').forEach((supplier) => {
    if (state.day % supplier.deliveryFrequencyDays !== 0) return;
    const targets = state.links.filter((l) => l.from === supplier.id).map((l) => getNode(l.to)).filter(Boolean);
    targets.forEach((target) => {
      if (Number.isFinite(supplier.inventory) && supplier.inventory <= 0) return;
      const qty = Number.isFinite(supplier.inventory) ? Math.min(supplier.deliveryQuantity, supplier.inventory) : supplier.deliveryQuantity;
      if (qty <= 0) return;
      queueShipment(supplier, target, qty, supplier.leadTimeDays);
      if (Number.isFinite(supplier.inventory)) supplier.inventory -= qty;
      supplier.shipped += qty;
    });
  });
}

function warehousesDispatch() {
  state.nodes.filter((n) => n.type === 'warehouse').forEach((warehouse) => {
    const plants = state.links.filter((l) => l.from === warehouse.id).map((l) => getNode(l.to)).filter((n) => n?.type === 'plant');
    plants.forEach((plant) => {
      const safety = plant.safetyStock ?? 0;
      const desired = safety + plant.consumptionRatePerDay;
      const need = Math.max(0, desired - plant.inventory);
      if (need <= 0 || warehouse.inventory <= 0) return;
      if (warehouse.reorderPoint != null && warehouse.inventory <= warehouse.reorderPoint) return;
      const qty = Math.min(need, warehouse.inventory);
      const totalLead = warehouse.preparationTimeDays + warehouse.deliveryToPlantDays;
      warehouse.inventory -= qty;
      warehouse.shipped += qty;
      queueShipment(warehouse, plant, qty, totalLead);
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
  };
}

function simulateDays(days) {
  if (!canRunSimulation()) return null;
  const totalDays = Number(days);
  if (!Number.isInteger(totalDays) || totalDays < 0) throw new Error('days must be a non-negative integer');
  for (let i = 0; i < totalDays; i += 1) simulateDay();
  updateStats();
  state.nodes.forEach((n) => refreshNode(n.id));
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

function queueShipment(from, to, qty, leadTime) {
  state.deliveryStats.dispatched += 1;
  const dayBucket = state.shipmentsByDay[state.shipmentsByDay.length - 1];
  if (dayBucket) {
    dayBucket.count += 1;
    dayBucket.volume += qty;
  }
  state.shipments.push({
    from: from.id,
    to: to.id,
    qty,
    departureDay: state.day,
    arrivalDay: state.day + leadTime,
    fromName: from.name,
  });
  log(`${from.name} shipped ${qty} units to ${to.name} (ETA day ${state.day + leadTime})`);
}

function initializeSimulationTracking() {
  state.eventLog = [];
  state.inventoryHistoryByNode = {};
  state.transitHistory = [];
  state.deliveryStats = { dispatched: 0, onTime: 0, deliveredVolume: 0 };
  state.shipmentsByDay = [];
  state.stockoutEvents = [];
  state.nodes.forEach((node) => {
    state.inventoryHistoryByNode[node.id] = [{
      day: state.day,
      inventory: Number.isFinite(node.inventory) ? node.inventory : null,
      onHandLabel: Number.isFinite(node.inventory) ? node.inventory : '∞',
    }];
  });
  computeKpis();
  renderAnalyticsNodeOptions();
  renderAnalytics();
}

function resetSimulation() {
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

function serializeGraph() {
  return {
    version: 1,
    day: state.day,
    nodes: state.nodes.map((node) => {
      const schemaKeys = NODE_SCHEMAS[node.type].fields.map((f) => f.key);
      const config = schemaKeys.reduce((acc, key) => {
        acc[key] = node[key] ?? null;
        return acc;
      }, {});
      return { id: node.id, type: node.type, position: { x: node.x, y: node.y }, config };
    }),
    links: state.links.map((l) => ({ id: l.id, from: l.from, to: l.to })),
  };
}

function updateStats() {
  dayValue.textContent = state.day;
  transitValue.textContent = state.shipments.length;
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
}

function renderKpiBar() {
  const plants = state.nodes.filter((n) => n.type === 'plant');
  const warehouses = state.nodes.filter((n) => n.type === 'warehouse');
  const stockoutPlants = new Set(state.stockoutEvents.map((e) => e.nodeId)).size;
  const recentShipmentCount = state.shipmentsByDay.at(-1)?.count ?? 0;
  const utilizationRows = warehouses
    .map((warehouse) => {
      const history = state.inventoryHistoryByNode[warehouse.id] ?? [];
      if (!history.length || !warehouse.storageCapacity) return null;
      const avg = history.reduce((sum, pt) => sum + (pt.inventory ?? 0), 0) / history.length;
      return `<div class="selection-row"><span>${warehouse.name}</span><strong>${Math.round((avg / warehouse.storageCapacity) * 100)}%</strong></div>`;
    })
    .filter(Boolean)
    .join('');

  kpiBar.innerHTML = `
    <div class="kpi-pill"><span>Stockout events</span><strong>${state.kpis.stockoutCount}</strong></div>
    <div class="kpi-pill"><span>Plants hit</span><strong>${stockoutPlants}/${plants.length}</strong></div>
    <div class="kpi-pill"><span>Avg plant inventory</span><strong>${Math.round(state.kpis.averagePlantInventory)}</strong></div>
    <div class="kpi-pill"><span>Warehouse utilization</span><strong>${Math.round(state.kpis.warehouseUtilization * 100)}%</strong></div>
    <div class="kpi-pill"><span>Total shipped</span><strong>${state.kpis.totalShippedVolume}</strong></div>
    <div class="kpi-pill"><span>Shipments today</span><strong>${recentShipmentCount}</strong></div>
    ${utilizationRows ? `<div class="kpi-pill" style="grid-column: 1 / -1;"><span>Warehouse utilization by node</span><div class="selection-grid">${utilizationRows}</div></div>` : ''}
  `;
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
  if (!state.selectedNodeIds.length) return;
  const originalNodes = state.selectedNodeIds.map(getNode).filter(Boolean);
  if (!originalNodes.length) return;

  const cloneMap = new Map();
  const duplicates = originalNodes.map((node, idx) => {
    const id = `node-${state.nodeCounter++}`;
    const copy = structuredClone(node);
    copy.id = id;
    copy.name = `${node.name} Copy`;
    copy.x = node.x + 36 + idx * 8;
    copy.y = node.y + 36 + idx * 8;
    copy.z = state.zCounter++;
    copy.initial = structuredClone(copy.initial);
    cloneMap.set(node.id, id);
    state.nodes.push(copy);
    renderNode(copy);
    return copy.id;
  });

  state.links.filter((link) => cloneMap.has(link.from) && cloneMap.has(link.to)).forEach((link) => {
    state.links.push({ id: `link-${state.linkCounter++}`, from: cloneMap.get(link.from), to: cloneMap.get(link.to) });
  });

  validateAll();
  selectNodes(duplicates);
  drawLinks();
  log(`Duplicated ${duplicates.length} node${duplicates.length > 1 ? 's' : ''}`);
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
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `Day ${state.day}: ${message}`;
  eventLog.prepend(entry);
}

function togglePlay(play) {
  clearInterval(state.timer);
  state.timer = null;
  if (play) {
    if (!canRunSimulation()) return;
    const speed = Number(document.getElementById('tickSpeed').value);
    state.timer = setInterval(stepSimulation, speed);
  }
}

workspace.addEventListener('pointerdown', (e) => {
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

  if (!inInput && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    fitToGraph();
    return;
  }

  if (e.key === 'Escape') {
    clearLinkingState();
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
document.getElementById('clearLinks').addEventListener('click', () => {
  state.links = [];
  state.selectedLinkIds = [];
  validateAll();
  drawLinks();
  log('All links cleared');
  renderSelection();
});
document.getElementById('stepBtn').addEventListener('click', stepSimulation);
document.getElementById('playBtn').addEventListener('click', () => togglePlay(true));
document.getElementById('pauseBtn').addEventListener('click', () => togglePlay(false));
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('tickSpeed').addEventListener('change', () => { if (state.timer) togglePlay(true); });
analyticsNodeSelect.addEventListener('change', (e) => {
  state.analyticsNodeId = e.target.value;
  renderInventoryChart();
});
document.getElementById('clearLogBtn').addEventListener('click', () => {
  eventLog.innerHTML = '';
  state.eventLog = [];
});

addNode('supplier', 80, 90);
addNode('warehouse', 430, 120);
addNode('plant', 800, 150);
state.links.push({ id: `link-${state.linkCounter++}`, from: state.nodes[0].id, to: state.nodes[1].id });
state.links.push({ id: `link-${state.linkCounter++}`, from: state.nodes[1].id, to: state.nodes[2].id });
validateAll();
initializeSimulationTracking();
fitToGraph();
updateStats();
selectNodes([state.nodes[0].id]);
log('Starter scenario loaded');

window.SupplyChainFlowLab = {
  serializeGraph,
  getState: () => structuredClone({ nodes: state.nodes, links: state.links, graphErrors: state.graphErrors }),
  stepSimulation,
  simulateDays,
  getSimulationOutput: buildSimulationOutput,
};
