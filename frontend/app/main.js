(() => {
  const workspace = document.getElementById('workspace');
  const linksSvg = document.getElementById('linksSvg');
  const nodeCreateToolbar = document.getElementById('nodeCreateToolbar');
  const nodeTemplate = document.getElementById('nodeTemplate');
  const selectionPanel = document.getElementById('selectionPanel');
  const dayValue = document.getElementById('dayValue');
  const transitValue = document.getElementById('transitValue');
  const simStatusValue = document.getElementById('simStatusValue');
  const eventLog = document.getElementById('eventLog');
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
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const stepBtn = document.getElementById('stepBtn');
  const resetBtn = document.getElementById('resetBtn');
  const tickSpeedInput = document.getElementById('tickSpeed');
  const tickSpeedValue = document.getElementById('tickSpeedValue');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const canvasContextMenu = document.getElementById('canvasContextMenu');
  const canvasContextActions = canvasContextMenu?.querySelector('.canvas-context-actions');
  const canvasContextSearch = document.getElementById('canvasContextSearch');
  const canvasContextEmpty = canvasContextMenu?.querySelector('.context-empty');
  const importNodePackageBtn = document.getElementById('importNodePackageBtn');
  const importNodePackageInput = document.getElementById('importNodePackageInput');
  const exportNodePackageBtn = document.getElementById('exportNodePackageBtn');
  const nodePackageList = document.getElementById('nodePackageList');

  const GRID_SIZE = 24;
  const SCENARIO_VERSION = 7;

  const state = {
    nodes: [],
    links: [],
    shipments: [],
    day: 0,
    selectedNodeIds: [],
    selectedLinkIds: [],
    nodeCounter: 1,
    linkCounter: 1,
    zCounter: 1,
    drag: null,
    linking: null,
    simulation: { status: 'idle', timerId: null, speedMs: 800, tickInProgress: false },
    eventLog: [],
    ui: {
      showLinkLabels: false,
      allowWarehouseToWarehouse: false,
      allowPlantOutbound: false,
      snapToGrid: false,
    },
    kpis: {},
    deliveryStats: {},
    shipmentsByDay: [],
    shipmentsByDayBySourceNode: {},
    stockoutEvents: [],
    inventoryHistoryByNode: {},
    transitHistory: [],
    pluginEvents: [],
    pluginLogs: [],
    nodePackage: { name: 'SCFL-node', customNodes: [] },
  };

  const linkSchema = [
    { key: 'transportDelayDays', label: 'Transport delay (days)', type: 'int', required: true, min: 0, step: 1, defaultValue: 1 },
    { key: 'maxDailyCapacity', label: 'Max daily capacity', type: 'int', required: true, min: 1, step: 1, defaultValue: 120 },
    { key: 'costPerShipment', label: 'Cost per shipment', type: 'number', required: false, min: 0, step: 0.01, defaultValue: null },
  ];

  const presets = {
    blank: { version: SCENARIO_VERSION, nodes: [], links: [], day: 0 },
    demo: {
      version: SCENARIO_VERSION,
      day: 0,
      nodes: [
        { id: 'node-1', type: 'supplier', x: 90, y: 90, name: 'Supplier North', deliveryFrequencyDays: 2, deliveryQuantity: 140, leadTimeDays: 1, initialInventory: null, inventory: Infinity, shipped: 0, received: 0, stockouts: 0 },
        { id: 'node-2', type: 'warehouse', x: 410, y: 160, name: 'Central Warehouse', preparationTimeDays: 1, preparationCapacityPerDay: 100, deliveryToPlantDays: 2, storageCapacity: 900, initialInventory: 220, reorderPoint: 300, inventory: 220, shipped: 0, received: 0, stockouts: 0, preparationQueue: [], preparingShipments: [], nextQueueRequestId: 1 },
        { id: 'node-3', type: 'plant', x: 750, y: 130, name: 'Plant Alpha', consumptionRatePerDay: 35, initialInventory: 140, safetyStock: 70, selectedMaterialIds: [], inventory: 140, shipped: 0, received: 0, stockouts: 0 },
      ],
      links: [
        { id: 'link-1', from: 'node-1', to: 'node-2', linkType: 'material', materialName: 'Alloy A', transportDelayDays: 1, maxDailyCapacity: 160, priority: 1, costPerShipment: 40 },
        { id: 'link-2', from: 'node-2', to: 'node-3', linkType: 'material', materialName: 'Component Kit', transportDelayDays: 2, maxDailyCapacity: 120, priority: 1, costPerShipment: 65 },
      ],
    },
  };

  function registry() {
    return window.SCFL_NodeRegistry;
  }

  function schema(type) {
    return registry().require(type);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value, (_key, item) => item === Infinity ? '__Infinity__' : item), (_key, item) => item === '__Infinity__' ? Infinity : item);
  }

  function snap(value) {
    return state.ui.snapToGrid ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
  }

  function getNode(id) {
    return state.nodes.find((node) => node.id === id);
  }

  function getDefaults(type) {
    const nodeSchema = schema(type);
    const values = {};
    nodeSchema.fields.forEach((field) => {
      values[field.key] = typeof field.defaultValue === 'function' ? field.defaultValue(state.nodeCounter) : clone(field.defaultValue);
    });
    return values;
  }

  function initialInventoryFor(type, data) {
    if (type === 'supplier') return data.initialInventory == null ? Infinity : Number(data.initialInventory);
    if (type === 'analytics') return 0;
    return Number(data.initialInventory ?? 0);
  }

  function createNode(type, x = 80, y = 80) {
    const defaults = getDefaults(type);
    const id = `node-${state.nodeCounter++}`;
    const node = {
      id,
      type,
      x: snap(x),
      y: snap(y),
      z: state.zCounter++,
      ...defaults,
      inventory: initialInventoryFor(type, defaults),
      received: 0,
      shipped: 0,
      stockouts: 0,
      validationErrors: {},
    };
    if (type === 'warehouse') {
      node.preparationQueue = [];
      node.preparingShipments = [];
      node.nextQueueRequestId = 1;
    }
    state.nodes.push(node);
    selectNode(id);
    validateAndRender();
  }

  function normalizeNode(raw) {
    const defaults = getDefaults(raw.type);
    const node = {
      id: raw.id,
      type: raw.type,
      x: raw.x ?? raw.position?.x ?? 80,
      y: raw.y ?? raw.position?.y ?? 80,
      z: raw.z ?? state.zCounter++,
      ...defaults,
      ...(raw.config ?? {}),
      ...raw,
      validationErrors: {},
    };
    node.inventory = raw.inventory ?? initialInventoryFor(node.type, node);
    node.received = raw.received ?? 0;
    node.shipped = raw.shipped ?? 0;
    node.stockouts = raw.stockouts ?? 0;
    if (node.type === 'warehouse') {
      node.preparationQueue = node.preparationQueue ?? [];
      node.preparingShipments = node.preparingShipments ?? [];
      node.nextQueueRequestId = node.nextQueueRequestId ?? 1;
    }
    return node;
  }

  function loadScenario(input) {
    const scenario = clone(input);
    state.nodes = (scenario.nodes ?? []).map(normalizeNode);
    state.links = (scenario.links ?? []).map((link) => ({ linkType: 'material', priority: 1, ...link }));
    state.shipments = scenario.shipments ?? [];
    state.day = scenario.day ?? 0;
    state.pluginEvents = scenario.pluginEvents ?? [];
    state.pluginLogs = scenario.pluginLogs ?? [];
    state.selectedNodeIds = [];
    state.selectedLinkIds = [];
    state.nodeCounter = nextCounter(state.nodes, 'node');
    state.linkCounter = nextCounter(state.links, 'link');
    state.zCounter = Math.max(1, ...state.nodes.map((node) => node.z ?? 1)) + 1;
    log(`Loaded scenario with ${state.nodes.length} nodes and ${state.links.length} links.`);
    validateAndRender();
    saveScenario();
  }

  function nextCounter(items, prefix) {
    const max = items.reduce((value, item) => {
      const match = String(item.id ?? '').match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Math.max(value, Number(match[1])) : value;
    }, 0);
    return max + 1;
  }

  function saveScenario() {
    window.SCFL_ScenarioStorage.save(exportState());
  }

  function exportState() {
    return {
      version: SCENARIO_VERSION,
      day: state.day,
      nodes: state.nodes,
      links: state.links,
      shipments: state.shipments,
      ui: state.ui,
      pluginEvents: state.pluginEvents,
      pluginLogs: state.pluginLogs,
    };
  }

  function validateAll() {
    state.nodes.forEach((node) => {
      node.validationErrors = window.SCFL_Validation.validateNode(node, schema(node.type), {
        optionsResolver: getSelectableFieldOptions,
      });
    });
    state.links.forEach((link) => {
      const errors = window.SCFL_Validation.validateLink(link, state.nodes, state.ui);
      link.validationErrors = window.SCFL_Validation.toErrorMap(errors);
    });
  }

  function getSelectableFieldOptions(node, field) {
    if (field.type === 'select_analytics_source') {
      return state.nodes.filter((item) => item.id !== node.id).map((item) => ({ value: item.id, label: `${item.name} (${item.type})` }));
    }
    if (field.type === 'multiselect_materials') {
      return state.nodes.filter((item) => item.type === 'material').map((item) => ({ value: item.id, label: item.name }));
    }
    return field.options ?? [];
  }

  function validateAndRender() {
    validateAll();
    render();
    saveScenario();
  }

  function render() {
    renderToolbar();
    renderNodes();
    renderLinks();
    renderSelection();
    renderStatus();
    renderNodePackageList();
  }

  function renderToolbar() {
    const types = registry().getAll().filter((definition) => definition.type !== 'analytics');
    nodeCreateToolbar.innerHTML = types.map((definition) => `<button class="toolbar-action" data-node-type="${definition.type}">+ ${definition.label}</button>`).join('');
    nodeCreateToolbar.querySelectorAll('[data-node-type]').forEach((button) => {
      button.addEventListener('click', () => createNode(button.dataset.nodeType, 80 + state.nodes.length * 30, 80 + state.nodes.length * 20));
    });

    if (canvasContextActions) {
      canvasContextActions.innerHTML = types.map((definition) => `<button class="context-action" data-node-type="${definition.type}" role="menuitem">Add ${definition.label}</button>`).join('');
      canvasContextActions.querySelectorAll('[data-node-type]').forEach((button) => {
        button.addEventListener('click', () => {
          createNode(button.dataset.nodeType, 120, 120);
          canvasContextMenu.classList.add('hidden');
        });
      });
    }
  }

  function renderNodes() {
    workspace.querySelectorAll('.node-card').forEach((node) => node.remove());
    state.nodes.forEach((node) => {
      const fragment = nodeTemplate.content.cloneNode(true);
      const element = fragment.querySelector('.node-card');
      element.dataset.id = node.id;
      element.classList.add(`type-${node.type}`);
      element.style.transform = `translate(${node.x}px, ${node.y}px)`;
      element.style.zIndex = node.z;
      if (state.selectedNodeIds.includes(node.id)) element.classList.add('selected');

      const title = element.querySelector('.node-title');
      title.value = node.name ?? schema(node.type).label;
      title.addEventListener('input', (event) => {
        node.name = event.target.value;
        validateAndRender();
      });

      element.querySelector('.node-type-chip').textContent = schema(node.type).label;
      element.querySelector('.delete-node').addEventListener('click', () => deleteSelectedOrNode(node.id));
      element.querySelector('.node-body').innerHTML = window.SCFL_Rendering.renderNodeBody(node, schema(node.type), {
        getOptions: getSelectableFieldOptions,
        metricValue: '—',
        trendPoints: 0,
      });
      bindFieldEvents(element, node);
      bindNodeDrag(element, node);
      bindPorts(element, node);
      workspace.appendChild(fragment);
    });
  }

  function bindFieldEvents(element, node) {
    element.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const key = event.target.dataset.field;
        const field = schema(node.type).fields.find((item) => item.key === key);
        if (field?.type === 'int' || field?.type === 'number') {
          node[key] = event.target.value === '' ? null : Number(event.target.value);
        } else if (field?.type === 'multiselect_materials') {
          node[key] = Array.from(event.target.selectedOptions).map((option) => option.value);
        } else {
          node[key] = event.target.value;
        }
        if (key === 'initialInventory') node.inventory = initialInventoryFor(node.type, node);
        validateAndRender();
      });
    });
  }

  function bindNodeDrag(element, node) {
    element.querySelector('.node-header').addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectNode(node.id);
      const startX = event.clientX;
      const startY = event.clientY;
      const original = { x: node.x, y: node.y };
      function move(moveEvent) {
        node.x = snap(original.x + moveEvent.clientX - startX);
        node.y = snap(original.y + moveEvent.clientY - startY);
        element.style.transform = `translate(${node.x}px, ${node.y}px)`;
        renderLinks();
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        saveScenario();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    element.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('input, select, textarea, button, .port')) selectNode(node.id);
    });
  }

  function bindPorts(element, node) {
    element.querySelectorAll('.out-port').forEach((port) => {
      port.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        state.linking = { from: node.id, linkType: port.dataset.portKind ?? 'material' };
        log(`Started ${state.linking.linkType} link from ${node.name}.`);
      });
    });
    element.querySelector('.in-port').addEventListener('pointerup', (event) => {
      event.stopPropagation();
      if (!state.linking || state.linking.from === node.id) return;
      createLink(state.linking.from, node.id, state.linking.linkType);
      state.linking = null;
    });
  }

  function createLink(from, to, linkType = 'material') {
    const link = {
      id: `link-${state.linkCounter++}`,
      from,
      to,
      linkType,
      materialName: linkType === 'information' ? 'Information' : 'Material',
      priority: 1,
    };
    linkSchema.forEach((field) => {
      link[field.key] = clone(field.defaultValue);
    });
    const errors = window.SCFL_Validation.validateLink(link, state.nodes, state.ui);
    if (errors.length) {
      log(`Cannot create link: ${errors.join(' ')}`);
      return;
    }
    state.links.push(link);
    log(`Created link ${getNode(from).name} → ${getNode(to).name}.`);
    validateAndRender();
  }

  function renderLinks() {
    linksSvg.innerHTML = '';
    state.links.forEach((link) => {
      const from = getNode(link.from);
      const to = getNode(link.to);
      if (!from || !to) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const x1 = from.x + 240;
      const y1 = from.y + 70;
      const x2 = to.x;
      const y2 = to.y + 70;
      const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', `link-path ${link.linkType === 'information' ? 'information-link' : ''}`);
      path.addEventListener('click', () => {
        state.selectedLinkIds = [link.id];
        state.selectedNodeIds = [];
        renderSelection();
      });
      linksSvg.appendChild(path);
      if (state.ui.showLinkLabels) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', (x1 + x2) / 2);
        label.setAttribute('y', (y1 + y2) / 2 - 8);
        label.setAttribute('class', 'link-label');
        label.textContent = `${link.transportDelayDays}d · cap ${link.maxDailyCapacity}`;
        linksSvg.appendChild(label);
      }
    });
  }

  function renderSelection() {
    if (state.selectedNodeIds.length === 1) {
      const node = getNode(state.selectedNodeIds[0]);
      const issues = Object.values(node.validationErrors ?? {}).map((message) => ({ message }));
      selectionPanel.innerHTML = `
        <div class="selection-summary">
          <h3>${window.SCFL_Rendering.escapeHtml(node.name)}</h3>
          <p>${window.SCFL_Rendering.escapeHtml(schema(node.type).label)} · ${window.SCFL_Rendering.escapeHtml(node.id)}</p>
        </div>
        ${window.SCFL_Rendering.renderValidationIssues(issues)}
      `;
      return;
    }
    if (state.selectedLinkIds.length === 1) {
      const link = state.links.find((item) => item.id === state.selectedLinkIds[0]);
      selectionPanel.innerHTML = `<strong>${link.id}</strong><p>${getNode(link.from)?.name ?? '?'} → ${getNode(link.to)?.name ?? '?'}</p>`;
      return;
    }
    selectionPanel.innerHTML = '<div class="empty-state">Select a node to inspect it.</div>';
  }

  function renderStatus() {
    dayValue.textContent = state.day;
    transitValue.textContent = state.shipments.length;
    simStatusValue.textContent = state.simulation.status;
    tickSpeedValue.textContent = `${state.simulation.speedMs} ms/day`;
  }

  function renderNodePackageList() {
    if (!nodePackageList) return;
    const installed = registry().getAll().filter((definition) => definition.source === 'package');
    nodePackageList.innerHTML = installed.length
      ? installed.map((definition) => `<div>${definition.label} <small>${definition.type}</small></div>`).join('')
      : 'No community nodes installed.';
  }

  function selectNode(id) {
    state.selectedNodeIds = [id];
    state.selectedLinkIds = [];
    render();
  }

  function deleteSelectedOrNode(id) {
    const ids = new Set(state.selectedNodeIds.length ? state.selectedNodeIds : [id]);
    state.nodes = state.nodes.filter((node) => !ids.has(node.id));
    state.links = state.links.filter((link) => !ids.has(link.from) && !ids.has(link.to));
    state.selectedNodeIds = [];
    validateAndRender();
  }

  function log(message) {
    state.eventLog.unshift(`[Day ${state.day}] ${message}`);
    state.eventLog = state.eventLog.slice(0, 80);
    eventLog.innerHTML = state.eventLog.map((item) => `<div>${window.SCFL_Rendering.escapeHtml(item)}</div>`).join('');
  }

  function runPluginTick() {
    if (!window.SCFL_PluginRuntime) return;
    const result = window.SCFL_PluginRuntime.runHook(state, 'onTick');
    result.logs.forEach((entry) => log(`[Plugin:${entry.nodeId}] ${entry.message}`));
    result.emitted.forEach((event) => log(`[Plugin:${event.nodeId}] emitted ${event.type ?? 'event'}.`));
    result.errors.forEach((error) => log(`[Plugin:${error.nodeId}] ${error.message}`));
  }

  async function stepSimulation() {
    if (state.simulation.tickInProgress) return;
    state.simulation.tickInProgress = true;
    try {
      runPluginTick();
      const payload = exportState();
      const result = await window.SCFL_SimulationApi.stepSimulation(payload);
      state.day = result.day ?? state.day + 1;
      state.nodes = (result.nodes ?? state.nodes).map(normalizeNode);
      state.links = result.links ?? state.links;
      state.shipments = result.shipments ?? [];
      state.kpis = result.kpis ?? {};
      state.deliveryStats = result.deliveryStats ?? {};
      state.shipmentsByDay = result.shipmentsByDay ?? [];
      state.shipmentsByDayBySourceNode = result.shipmentsByDayBySourceNode ?? {};
      state.stockoutEvents = result.stockoutEvents ?? [];
      state.inventoryHistoryByNode = result.inventoryHistoryByNode ?? {};
      state.transitHistory = result.transitHistory ?? [];
      (result.events ?? []).forEach(log);
      validateAndRender();
    } catch (error) {
      log(error.message);
      pauseSimulation();
    } finally {
      state.simulation.tickInProgress = false;
    }
  }

  function startSimulation() {
    pauseSimulation();
    state.simulation.status = 'running';
    state.simulation.timerId = setInterval(stepSimulation, state.simulation.speedMs);
    renderStatus();
  }

  function pauseSimulation() {
    if (state.simulation.timerId) clearInterval(state.simulation.timerId);
    state.simulation.timerId = null;
    state.simulation.status = 'paused';
    renderStatus();
  }

  function resetSimulation() {
    state.day = 0;
    state.shipments = [];
    state.pluginEvents = [];
    state.pluginLogs = [];
    state.nodes.forEach((node) => {
      node.inventory = initialInventoryFor(node.type, node);
      node.received = 0;
      node.shipped = 0;
      node.stockouts = 0;
      if (node.type === 'warehouse') {
        node.preparationQueue = [];
        node.preparingShipments = [];
      }
    });
    validateAndRender();
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function wireUi() {
    document.getElementById('addMaterial')?.addEventListener('click', () => createNode('material'));
    document.getElementById('addSupplier')?.addEventListener('click', () => createNode('supplier'));
    document.getElementById('addWarehouse')?.addEventListener('click', () => createNode('warehouse'));
    document.getElementById('addPlant')?.addEventListener('click', () => createNode('plant'));
    document.getElementById('addAnalytics')?.addEventListener('click', () => createNode('analytics'));
    document.getElementById('clearLinks')?.addEventListener('click', () => { state.links = []; validateAndRender(); });
    startBtn?.addEventListener('click', startSimulation);
    pauseBtn?.addEventListener('click', pauseSimulation);
    resumeBtn?.addEventListener('click', startSimulation);
    stepBtn?.addEventListener('click', stepSimulation);
    resetBtn?.addEventListener('click', resetSimulation);
    clearLogBtn?.addEventListener('click', () => { state.eventLog = []; eventLog.innerHTML = ''; });

    tickSpeedInput?.addEventListener('input', (event) => {
      state.simulation.speedMs = Number(event.target.value);
      if (state.simulation.timerId) startSimulation();
      renderStatus();
    });

    showLinkLabelsInput?.addEventListener('change', (event) => { state.ui.showLinkLabels = event.target.checked; validateAndRender(); });
    allowWarehouseToWarehouseInput?.addEventListener('change', (event) => { state.ui.allowWarehouseToWarehouse = event.target.checked; validateAndRender(); });
    allowPlantOutboundInput?.addEventListener('change', (event) => { state.ui.allowPlantOutbound = event.target.checked; validateAndRender(); });
    snapToGridInput?.addEventListener('change', (event) => { state.ui.snapToGrid = event.target.checked; });

    loadPresetBtn?.addEventListener('click', () => loadScenario(presets[scenarioPresetSelect.value] ?? presets.blank));
    resetScenarioBtn?.addEventListener('click', () => loadScenario(presets.blank));
    exportScenarioBtn?.addEventListener('click', () => download('scenario.scfl.json', window.SCFL_ScenarioStorage.exportScenario(exportState())));
    importScenarioBtn?.addEventListener('click', () => importScenarioInput.click());
    importScenarioInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const result = window.SCFL_ScenarioStorage.importScenario(await file.text());
      if (!result.ok) log(result.error);
      else loadScenario(result.scenario);
      event.target.value = '';
    });

    importNodePackageBtn?.addEventListener('click', () => importNodePackageInput.click());
    importNodePackageInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const result = window.SCFL_NodePackages.importPackage(await file.text());
      log(result.ok ? 'Imported node package.' : result.errors?.join(' ') ?? result.error);
      validateAndRender();
      event.target.value = '';
    });
    exportNodePackageBtn?.addEventListener('click', () => download('scfl-node-packages.json', window.SCFL_NodePackages.exportAllPackages()));

    workspace.addEventListener('pointerdown', (event) => {
      if (event.target === workspace) {
        state.selectedNodeIds = [];
        state.selectedLinkIds = [];
        render();
      }
    });

    workspace.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      canvasContextMenu?.classList.remove('hidden');
      if (canvasContextMenu) {
        canvasContextMenu.style.left = `${event.clientX}px`;
        canvasContextMenu.style.top = `${event.clientY}px`;
      }
    });

    canvasContextSearch?.addEventListener('input', () => {
      const term = canvasContextSearch.value.toLowerCase();
      let shown = 0;
      canvasContextActions?.querySelectorAll('button').forEach((button) => {
        const visible = button.textContent.toLowerCase().includes(term);
        button.hidden = !visible;
        if (visible) shown += 1;
      });
      canvasContextEmpty?.classList.toggle('hidden', shown > 0);
    });
  }

  function boot() {
    window.state = state;
    wireUi();
    const saved = window.SCFL_ScenarioStorage.load();
    loadScenario(saved?.nodes ? saved : presets.demo);
    log('Modular frontend loaded. Plugin runtime is enabled.');
  }

  boot();
})();
