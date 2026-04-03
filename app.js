const workspace = document.getElementById('workspace');
const linksSvg = document.getElementById('linksSvg');
const nodeTemplate = document.getElementById('nodeTemplate');
const selectionPanel = document.getElementById('selectionPanel');
const dayValue = document.getElementById('dayValue');
const transitValue = document.getElementById('transitValue');
const eventLog = document.getElementById('eventLog');
const tempWire = document.getElementById('tempWire');
const tempLinkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
tempLinkPath.setAttribute('class', 'link-path temp-link hidden');
linksSvg.appendChild(tempLinkPath);

const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box hidden';
workspace.appendChild(selectionBox);

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

const state = {
  nodes: [],
  links: [],
  shipments: [],
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
};

const presets = {
  supplier: () => ({
    name: `Supplier ${state.nodeCounter}`,
    deliveryFrequency: 3,
    batchSize: 120,
    inventory: Infinity,
    received: 0,
    shipped: 0,
  }),
  warehouse: () => ({
    name: `Warehouse ${state.nodeCounter}`,
    prepTime: 1,
    deliveryTime: 2,
    dispatchBatch: 80,
    inventory: 0,
    received: 0,
    shipped: 0,
  }),
  plant: () => ({
    name: `Plant ${state.nodeCounter}`,
    consumptionRate: 20,
    inventory: 100,
    received: 0,
    stockouts: 0,
  }),
};

function addNode(type, x = 80 + state.nodes.length * 40, y = 60 + state.nodes.length * 30) {
  const data = presets[type]();
  const id = `node-${state.nodeCounter++}`;
  const node = { id, type, x, y, z: state.zCounter++, ...data, initial: structuredClone(data) };
  state.nodes.push(node);
  renderNode(node);
  selectNodes([node.id]);
  drawLinks();
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

function getNodeBody(node) {
  const commonKpis = {
    supplier: `
      <div class="kpis">
        <div class="kpi"><span class="label">Shipped</span><span class="value">${node.shipped}</span></div>
        <div class="kpi"><span class="label">Frequency</span><span class="value">${node.deliveryFrequency} d</span></div>
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

  if (node.type === 'supplier') {
    return `
      <div class="field"><label>Delivery frequency (days)</label><input type="number" min="1" step="1" data-field="deliveryFrequency" value="${node.deliveryFrequency}" /></div>
      <div class="field"><label>Shipment batch size</label><input type="number" min="1" step="1" data-field="batchSize" value="${node.batchSize}" /></div>
      ${commonKpis.supplier}`;
  }
  if (node.type === 'warehouse') {
    return `
      <div class="field"><label>Preparation time (days)</label><input type="number" min="0" step="1" data-field="prepTime" value="${node.prepTime}" /></div>
      <div class="field"><label>Delivery time to plant (days)</label><input type="number" min="0" step="1" data-field="deliveryTime" value="${node.deliveryTime}" /></div>
      <div class="field"><label>Dispatch batch size</label><input type="number" min="1" step="1" data-field="dispatchBatch" value="${node.dispatchBatch}" /></div>
      ${commonKpis.warehouse}`;
  }
  return `
    <div class="field"><label>Consumption rate / day</label><input type="number" min="0" step="1" data-field="consumptionRate" value="${node.consumptionRate}" /></div>
    <div class="field"><label>Initial inventory</label><input type="number" min="0" step="1" data-field="inventory" value="${node.inventory}" /></div>
    ${commonKpis.plant}`;
}

function bindFieldEvents(body, node) {
  body.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      node[field] = Number(e.target.value);
      if (field === 'inventory') {
        node.initial.inventory = node.inventory;
      } else {
        node.initial[field] = node[field];
      }
      refreshNode(node.id);
      renderSelection();
    });
  });
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
  if (!state.selectedNodeIds.length && state.nodes.length) {
    state.selectedNodeIds = [state.nodes[0].id];
  }
  state.selectedLinkIds = [];
  drawLinks();
  renderSelection();
  updateStats();
}

function startNodeDrag(e, nodeId) {
  if (e.button !== 0 || state.keyState.space) return;
  if (e.target.closest('input, button')) return;
  e.preventDefault();

  if (!state.selectedNodeIds.includes(nodeId)) {
    selectNodes([nodeId]);
  }
  state.selectedNodeIds.forEach(bringNodeToFront);

  const pointerWorld = screenToWorld(e.clientX, e.clientY);
  state.drag = {
    pointerId: e.pointerId,
    starts: state.selectedNodeIds
      .map((id) => getNode(id))
      .filter(Boolean)
      .map((node) => ({ id: node.id, x: node.x, y: node.y })),
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
  state.pan = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    originX: state.camera.x,
    originY: state.camera.y,
  };
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
  const hits = state.nodes
    .filter((node) => {
      const rect = nodeRect(node);
      return rect.x2 >= bounds.x1 && rect.x1 <= bounds.x2 && rect.y2 >= bounds.y1 && rect.y1 <= bounds.y2;
    })
    .map((node) => node.id);
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
  state.linking = {
    pointerId: e.pointerId,
    from: nodeId,
    origin: portCenter(fromPort),
    pointer: portCenter(fromPort),
    targetNodeId: null,
  };
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
  selectionPanel.innerHTML = `
    <div class="selection-grid">
      <div class="selection-row"><span>Name</span><strong>${node.name}</strong></div>
      <div class="selection-row"><span>Type</span><strong>${node.type}</strong></div>
      <div class="selection-row"><span>Incoming</span><strong>${incoming}</strong></div>
      <div class="selection-row"><span>Outgoing</span><strong>${outgoing}</strong></div>
      <div class="selection-row"><span>Inventory</span><strong>${Number.isFinite(node.inventory) ? node.inventory : '∞'}</strong></div>
      ${node.type === 'supplier' ? `<div class="selection-row"><span>Frequency</span><strong>${node.deliveryFrequency} days</strong></div>` : ''}
      ${node.type === 'warehouse' ? `<div class="selection-row"><span>Prep + Delivery</span><strong>${node.prepTime + node.deliveryTime} days</strong></div>` : ''}
      ${node.type === 'plant' ? `<div class="selection-row"><span>Consumption</span><strong>${node.consumptionRate}/day</strong></div>` : ''}
    </div>`;
}

function stepSimulation() {
  state.day += 1;
  processArrivals();
  suppliersShip();
  warehousesDispatch();
  plantsConsume();
  updateStats();
  state.nodes.forEach((n) => refreshNode(n.id));
  renderSelection();
}

function processArrivals() {
  const arriving = state.shipments.filter((s) => s.arrivalDay <= state.day);
  state.shipments = state.shipments.filter((s) => s.arrivalDay > state.day);
  arriving.forEach((shipment) => {
    const toNode = getNode(shipment.to);
    if (!toNode) return;
    if (Number.isFinite(toNode.inventory)) toNode.inventory += shipment.qty;
    toNode.received += shipment.qty;
    log(`${shipment.qty} units arrived at ${toNode.name} from ${shipment.fromName}`);
  });
}

function suppliersShip() {
  state.nodes.filter((n) => n.type === 'supplier').forEach((supplier) => {
    if (state.day % supplier.deliveryFrequency !== 0) return;
    const targets = state.links.filter((l) => l.from === supplier.id).map((l) => getNode(l.to)).filter(Boolean);
    targets.forEach((target) => {
      queueShipment(supplier, target, supplier.batchSize, 1);
      supplier.shipped += supplier.batchSize;
    });
  });
}

function warehousesDispatch() {
  state.nodes.filter((n) => n.type === 'warehouse').forEach((warehouse) => {
    const plants = state.links.filter((l) => l.from === warehouse.id).map((l) => getNode(l.to)).filter((n) => n?.type === 'plant');
    plants.forEach((plant) => {
      if (warehouse.inventory <= 0) return;
      const qty = Math.min(warehouse.dispatchBatch, warehouse.inventory);
      const totalLead = warehouse.prepTime + warehouse.deliveryTime;
      warehouse.inventory -= qty;
      warehouse.shipped += qty;
      queueShipment(warehouse, plant, qty, totalLead);
    });
  });
}

function plantsConsume() {
  state.nodes.filter((n) => n.type === 'plant').forEach((plant) => {
    if (plant.inventory >= plant.consumptionRate) {
      plant.inventory -= plant.consumptionRate;
      log(`${plant.name} consumed ${plant.consumptionRate} units`);
    } else {
      const consumed = plant.inventory;
      plant.inventory = 0;
      plant.stockouts += 1;
      log(`${plant.name} stocked out after consuming ${consumed} units`);
    }
  });
}

function queueShipment(from, to, qty, leadTime) {
  state.shipments.push({
    from: from.id,
    to: to.id,
    qty,
    arrivalDay: state.day + leadTime,
    fromName: from.name,
  });
  log(`${from.name} shipped ${qty} units to ${to.name} (ETA day ${state.day + leadTime})`);
}

function resetSimulation() {
  state.day = 0;
  state.shipments = [];
  state.nodes.forEach((node) => {
    Object.assign(node, structuredClone(node.initial));
    node.received = 0;
    node.shipped = 0;
    node.stockouts = 0;
    refreshNode(node.id);
  });
  updateStats();
  log('Simulation reset');
  renderSelection();
}

function updateStats() {
  dayValue.textContent = state.day;
  transitValue.textContent = state.shipments.length;
}

function getNode(id) {
  return state.nodes.find((n) => n.id === id);
}

function getNodeElement(nodeId) {
  return workspace.querySelector(`.node-card[data-id="${nodeId}"]`);
}

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
  if (!options.keepLinks) state.selectedLinkIds = [];
  updateSelectionClasses();
  renderSelection();
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

  // Duplicate nodes with a small offset and reconnect links only within the duplicated set.
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

  state.links
    .filter((link) => cloneMap.has(link.from) && cloneMap.has(link.to))
    .forEach((link) => {
      state.links.push({
        id: `link-${state.linkCounter++}`,
        from: cloneMap.get(link.from),
        to: cloneMap.get(link.to),
      });
    });

  selectNodes(duplicates);
  drawLinks();
  log(`Duplicated ${duplicates.length} node${duplicates.length > 1 ? 's' : ''}`);
}

function fitToGraph() {
  if (!state.nodes.length) return;
  const bounds = state.nodes.reduce((acc, node) => {
    const rect = nodeRect(node);
    return {
      x1: Math.min(acc.x1, rect.x1),
      y1: Math.min(acc.y1, rect.y1),
      x2: Math.max(acc.x2, rect.x2),
      y2: Math.max(acc.y2, rect.y2),
    };
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
  // Nodes are rendered in world space, then transformed to screen space via camera.
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
  return {
    x: (screen.x - state.camera.x) / state.camera.zoom,
    y: (screen.y - state.camera.y) / state.camera.zoom,
  };
}

function worldToScreen(x, y) {
  return {
    x: state.camera.x + x * state.camera.zoom,
    y: state.camera.y + y * state.camera.zoom,
  };
}

function zoomAt(clientX, clientY, nextZoom) {
  const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  if (clampedZoom === state.camera.zoom) return;

  // Keep the world point under the cursor stable while zooming.
  const before = screenToWorld(clientX, clientY);
  state.camera.zoom = clampedZoom;
  const rect = workspace.getBoundingClientRect();
  state.camera.x = clientX - rect.left - before.x * state.camera.zoom;
  state.camera.y = clientY - rect.top - before.y * state.camera.zoom;
  renderViewport();
}

function nodeRect(node) {
  const width = 264;
  const height = 170;
  return { x1: node.x, y1: node.y, x2: node.x + width, y2: node.y + height };
}

function normalizedBounds(a, b) {
  return {
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const end = state.linking.targetNodeId
    ? portCenter(workspace.querySelector(`.node-card[data-id="${state.linking.targetNodeId}"] .in-port`))
    : pointer;
  const dx = Math.max(55 * state.camera.zoom, Math.abs(end.x - start.x) * 0.45);
  tempLinkPath.setAttribute('d', `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`);
  tempLinkPath.classList.remove('hidden');
}

function log(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `Day ${state.day}: ${message}`;
  eventLog.prepend(entry);
}

function togglePlay(play) {
  clearInterval(state.timer);
  state.timer = null;
  if (play) {
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
    return;
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
  drawLinks();
  log('All links cleared');
  renderSelection();
});
document.getElementById('stepBtn').addEventListener('click', stepSimulation);
document.getElementById('playBtn').addEventListener('click', () => togglePlay(true));
document.getElementById('pauseBtn').addEventListener('click', () => togglePlay(false));
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('tickSpeed').addEventListener('change', () => { if (state.timer) togglePlay(true); });
document.getElementById('clearLogBtn').addEventListener('click', () => eventLog.innerHTML = '');

addNode('supplier', 80, 90);
addNode('warehouse', 430, 120);
addNode('plant', 800, 150);
state.links.push({ id: `link-${state.linkCounter++}`, from: state.nodes[0].id, to: state.nodes[1].id });
state.links.push({ id: `link-${state.linkCounter++}`, from: state.nodes[1].id, to: state.nodes[2].id });
fitToGraph();
updateStats();
selectNodes([state.nodes[0].id]);
log('Starter scenario loaded');
