window.SCFL_SimulationEngine = (function () {
  function ensureRuntimeCollections(state) {
    state.shipments = state.shipments ?? [];
    state.eventLog = state.eventLog ?? [];
    state.pluginEvents = state.pluginEvents ?? [];
    state.pluginLogs = state.pluginLogs ?? [];
    state.deliveryStats = state.deliveryStats ?? {};
    state.shipmentsByDay = state.shipmentsByDay ?? [];
    state.shipmentsByDayBySourceNode = state.shipmentsByDayBySourceNode ?? {};
    state.stockoutEvents = state.stockoutEvents ?? [];
    state.inventoryHistoryByNode = state.inventoryHistoryByNode ?? {};
    state.transitHistory = state.transitHistory ?? [];
    state.kpis = state.kpis ?? {};
  }

  function finiteInventory(value) {
    return Number.isFinite(value) ? value : Infinity;
  }

  function applyArrivals(state, events) {
    const today = state.day;
    const remaining = [];

    state.shipments.forEach((shipment) => {
      if (shipment.arrivalDay > today) {
        remaining.push(shipment);
        return;
      }

      const node = state.nodes.find((item) => item.id === shipment.to);
      if (!node) return;

      const capacity = Number.isFinite(node.storageCapacity) ? node.storageCapacity : Infinity;
      const current = finiteInventory(node.inventory ?? 0);
      const accepted = Math.min(shipment.qty, Math.max(0, capacity - current));
      const overflow = shipment.qty - accepted;

      node.inventory = current === Infinity ? Infinity : current + accepted;
      node.received = (node.received ?? 0) + accepted;
      events.push(`${node.name ?? node.id} received ${accepted} from ${shipment.fromName ?? shipment.from}.`);
      if (overflow > 0) events.push(`${node.name ?? node.id} overflowed by ${overflow}.`);
    });

    state.shipments = remaining;
  }

  function pushShipment(state, shipment, events) {
    const source = state.nodes.find((node) => node.id === shipment.from);
    const target = state.nodes.find((node) => node.id === shipment.to);
    const qty = Number(shipment.qty ?? shipment.quantity ?? 0);
    if (!source || !target || qty <= 0) return null;

    const departureDay = state.day;
    const arrivalDay = departureDay + Number(shipment.delayDays ?? shipment.transportDelayDays ?? 0);
    const normalized = {
      id: shipment.id ?? `shipment-${state.day}-${state.shipments.length + 1}`,
      from: source.id,
      to: target.id,
      fromName: source.name,
      toName: target.name,
      linkId: shipment.linkId ?? null,
      linkType: shipment.linkType ?? 'material',
      materialName: shipment.materialName ?? 'Material',
      qty,
      departureDay,
      arrivalDay,
      shipmentCost: shipment.shipmentCost ?? null,
      source: shipment.source ?? 'plugin',
    };

    state.shipments.push(normalized);
    source.shipped = (source.shipped ?? 0) + qty;
    state.shipmentsByDay.push({ day: state.day, volume: qty });
    events.push(`${source.name ?? source.id} shipped ${qty} to ${target.name ?? target.id}.`);
    return normalized;
  }

  function consumePlants(state, events) {
    state.nodes.filter((node) => node.type === 'plant').forEach((plant) => {
      const demand = Number(plant.consumptionRatePerDay ?? 0);
      if (demand <= 0) return;
      const available = Number(plant.inventory ?? 0);
      const consumed = Math.min(available, demand);
      plant.inventory = available - consumed;
      const shortfall = demand - consumed;
      if (shortfall > 0) {
        plant.stockouts = (plant.stockouts ?? 0) + 1;
        state.stockoutEvents.push({ day: state.day, nodeId: plant.id, shortfall });
        events.push(`${plant.name ?? plant.id} stocked out by ${shortfall}.`);
      }
    });
  }

  function runDefaultSupplyRules(state, events) {
    state.links.filter((link) => link.linkType !== 'information').forEach((link) => {
      const from = state.nodes.find((node) => node.id === link.from);
      const to = state.nodes.find((node) => node.id === link.to);
      if (!from || !to) return;

      let desired = 0;
      if (from.type === 'supplier' && state.day % Number(from.deliveryFrequencyDays || 1) === 0) {
        desired = Number(from.deliveryQuantity ?? 0);
      } else if (from.type === 'warehouse' && to.type === 'plant') {
        const targetStock = Number(to.safetyStock ?? to.consumptionRatePerDay ?? 0);
        desired = Math.max(0, targetStock - Number(to.inventory ?? 0));
      }

      const available = from.inventory === Infinity ? Infinity : Number(from.inventory ?? 0);
      const capacity = Number(link.maxDailyCapacity ?? desired);
      const qty = Math.min(desired, capacity, available);
      if (qty <= 0) return;
      if (from.inventory !== Infinity) from.inventory -= qty;
      pushShipment(state, {
        from: from.id,
        to: to.id,
        linkId: link.id,
        linkType: link.linkType,
        materialName: link.materialName,
        qty,
        delayDays: Number(link.transportDelayDays ?? 0),
        shipmentCost: link.costPerShipment,
        source: 'default-rule',
      }, events);
    });
  }

  function runPluginHooks(state, events) {
    if (!window.SCFL_PluginRuntime) return;
    const result = window.SCFL_PluginRuntime.runHook(state, 'onTick');
    result.logs.forEach((entry) => events.push(`[Plugin:${entry.nodeId}] ${entry.message}`));
    result.errors.forEach((error) => events.push(`[Plugin:${error.nodeId}] ${error.message}`));
    result.emitted.forEach((event) => {
      if (event.type === 'shipment') {
        pushShipment(state, event, events);
      } else {
        events.push(`[Plugin:${event.nodeId}] emitted ${event.type ?? 'event'}.`);
      }
    });
  }

  function updateKpis(state) {
    const totalShippedVolume = state.shipmentsByDay.reduce((sum, item) => sum + Number(item.volume ?? 0), 0);
    state.kpis = {
      totalShippedVolume,
      stockoutCount: state.stockoutEvents.length,
      inTransit: state.shipments.length,
      pluginEvents: state.pluginEvents.length,
    };
    state.nodes.forEach((node) => {
      state.inventoryHistoryByNode[node.id] = state.inventoryHistoryByNode[node.id] ?? [];
      state.inventoryHistoryByNode[node.id].push({ day: state.day, value: node.inventory });
      state.inventoryHistoryByNode[node.id] = state.inventoryHistoryByNode[node.id].slice(-100);
    });
    state.transitHistory.push({ day: state.day, value: state.shipments.length });
    state.transitHistory = state.transitHistory.slice(-100);
  }

  function step(state) {
    ensureRuntimeCollections(state);
    state.day = (state.day ?? 0) + 1;
    const events = [];

    applyArrivals(state, events);
    runPluginHooks(state, events);
    runDefaultSupplyRules(state, events);
    consumePlants(state, events);
    updateKpis(state);

    return {
      day: state.day,
      nodes: state.nodes,
      links: state.links,
      shipments: state.shipments,
      events,
      kpis: state.kpis,
      deliveryStats: state.deliveryStats,
      shipmentsByDay: state.shipmentsByDay,
      shipmentsByDayBySourceNode: state.shipmentsByDayBySourceNode,
      stockoutEvents: state.stockoutEvents,
      inventoryHistoryByNode: state.inventoryHistoryByNode,
      transitHistory: state.transitHistory,
      pluginEvents: state.pluginEvents,
      pluginLogs: state.pluginLogs,
    };
  }

  return {
    step,
    pushShipment,
  };
})();
