const workspace = document.getElementById('workspace');
const linksSvg = document.getElementById('linksSvg');
const nodeTemplate = document.getElementById('nodeTemplate');
const selectionPanel = document.getElementById('selectionPanel');
const dayValue = document.getElementById('dayValue');
const transitValue = document.getElementById('transitValue');
const eventLog = document.getElementById('eventLog');
const tempWire = document.getElementById('tempWire');

const state = {
  nodes: [],
  links: [],
  shipments: [],
  day: 0,
  drag: null,
  linking: null,
  selectedNodeId: null,
  timer: null,
  nodeCounter: 1,
  linkCounter: 1,
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
  const node = { id, type, x, y, ...data, initial: structuredClone(data) };
  state.nodes.push(node);
  renderNode(node);
  renderSelection();
  drawLinks();
}

function renderNode(node) {
  const fragment = nodeTemplate.content.cloneNode(true);
  const el = fragment.querySelector('.node-card');
  el.dataset.id = node.id;
  el.classList.add(`type-${node.type}`);
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;

  const titleInput = fragment.querySelector('.node-title');
  titleInput.value = node.name;
  titleInput.addEventListener('input', (e) => {
    node.name = e.target.value;
    renderSelection();
    drawLinks();
  });

  fragment.querySelector('.node-type-chip').textContent = node.type;
  fragment.querySelector('.delete-node').addEventListener('click', () => deleteNode(node.id));

  const body = fragment.querySelector('.node-body');
  body.innerHTML = getNodeBody(node);
  bindFieldEvents(body, node);

  const header = fragment.querySelector('.node-header');
  header.addEventListener('pointerdown', (e) => startDrag(e, node.id));
  el.addEventListener('pointerdown', () => selectNode(node.id));

  fragment.querySelector('.in-port').addEventListener('click', (e) => handlePortClick(e, node.id, 'in'));
  fragment.querySelector('.out-port').addEventListener('click', (e) => handlePortClick(e, node.id, 'out'));

  workspace.appendChild(fragment);
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
  const node = state.nodes.find((n) => n.id === nodeId);
  const el = workspace.querySelector(`.node-card[data-id="${nodeId}"]`);
  if (!node || !el) return;
  const body = el.querySelector('.node-body');
  body.innerHTML = getNodeBody(node);
  bindFieldEvents(body, node);
  el.querySelector('.node-title').value = node.name;
  drawLinks();
}

function deleteNode(nodeId) {
  state.nodes = state.nodes.filter((n) => n.id !== nodeId);
  state.links = state.links.filter((l) => l.from !== nodeId && l.to !== nodeId);
  state.shipments = state.shipments.filter((s) => s.from !== nodeId && s.to !== nodeId);
  workspace.querySelector(`.node-card[data-id="${nodeId}"]`)?.remove();
  if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
  drawLinks();
  renderSelection();
  updateStats();
}

function startDrag(e, nodeId) {
  if (e.target.closest('input, button')) return;
  const node = state.nodes.find((n) => n.id === nodeId);
  const rect = workspace.getBoundingClientRect();
  state.drag = { nodeId, offsetX: e.clientX - rect.left - node.x, offsetY: e.clientY - rect.top - node.y };
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', stopDrag, { once: true });
}

function onDrag(e) {
  if (!state.drag) return;
  const rect = workspace.getBoundingClientRect();
  const node = state.nodes.find((n) => n.id === state.drag.nodeId);
  node.x = Math.max(16, e.clientX - rect.left - state.drag.offsetX);
  node.y = Math.max(16, e.clientY - rect.top - state.drag.offsetY);
  const el = workspace.querySelector(`.node-card[data-id="${node.id}"]`);
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  drawLinks();
}

function stopDrag() {
  state.drag = null;
  window.removeEventListener('pointermove', onDrag);
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  workspace.querySelectorAll('.node-card').forEach((n) => n.classList.toggle('selected', n.dataset.id === nodeId));
  renderSelection();
}

function handlePortClick(event, nodeId, side) {
  event.stopPropagation();
  if (side === 'out') {
    state.linking = { from: nodeId };
    tempWire.classList.remove('hidden');
    tempWire.style.left = `${event.clientX}px`;
    tempWire.style.top = `${event.clientY}px`;
    log(`Started link from ${getNode(nodeId).name}`);
    return;
  }

  if (!state.linking) return;
  if (state.linking.from === nodeId) {
    state.linking = null;
    tempWire.classList.add('hidden');
    return;
  }

  const from = getNode(state.linking.from);
  const to = getNode(nodeId);
  if (!isValidLink(from, to)) {
    log(`Invalid link: ${from.type} → ${to.type}`);
    state.linking = null;
    tempWire.classList.add('hidden');
    return;
  }

  if (!state.links.some((l) => l.from === from.id && l.to === to.id)) {
    state.links.push({ id: `link-${state.linkCounter++}`, from: from.id, to: to.id });
    log(`Linked ${from.name} → ${to.name}`);
  }
  state.linking = null;
  tempWire.classList.add('hidden');
  drawLinks();
  renderSelection();
}

function isValidLink(from, to) {
  if (from.type === 'supplier' && (to.type === 'warehouse' || to.type === 'plant')) return true;
  if (from.type === 'warehouse' && to.type === 'plant') return true;
  return false;
}

workspace.addEventListener('pointermove', (e) => {
  if (!state.linking) return;
  const rect = workspace.getBoundingClientRect();
  tempWire.style.left = `${e.clientX - rect.left + 16}px`;
  tempWire.style.top = `${e.clientY - rect.top + 16}px`;
});

workspace.addEventListener('dblclick', () => {
  state.linking = null;
  tempWire.classList.add('hidden');
});

function drawLinks() {
  linksSvg.innerHTML = '';
  state.links.forEach((link) => {
    const fromEl = workspace.querySelector(`.node-card[data-id="${link.from}"] .out-port`);
    const toEl = workspace.querySelector(`.node-card[data-id="${link.to}"] .in-port`);
    if (!fromEl || !toEl) return;
    const p1 = portCenter(fromEl);
    const p2 = portCenter(toEl);
    const dx = Math.max(80, Math.abs(p2.x - p1.x) * 0.5);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'link-path');
    path.setAttribute('d', `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`);
    linksSvg.appendChild(path);
  });
}

function portCenter(el) {
  const wRect = workspace.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return { x: rect.left - wRect.left + rect.width / 2, y: rect.top - wRect.top + rect.height / 2 };
}

function renderSelection() {
  const node = getNode(state.selectedNodeId);
  if (!node) {
    selectionPanel.innerHTML = '<div class="empty-state">Select a node to inspect it.</div>';
    return;
  }
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

document.getElementById('addSupplier').addEventListener('click', () => addNode('supplier'));
document.getElementById('addWarehouse').addEventListener('click', () => addNode('warehouse'));
document.getElementById('addPlant').addEventListener('click', () => addNode('plant'));
document.getElementById('clearLinks').addEventListener('click', () => { state.links = []; drawLinks(); log('All links cleared'); renderSelection(); });
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
drawLinks();
updateStats();
selectNode(state.nodes[0].id);
log('Starter scenario loaded');
