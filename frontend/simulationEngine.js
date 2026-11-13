window.SCFL_SimulationEngine = (() => {
  const M = window.SCFL_Materials;
  const frames = new WeakMap();
  const order = (a, b) =>
    (a.priority ?? 1) - (b.priority ?? 1) ||
    String(a.id).localeCompare(String(b.id), "en");
  function ensure(state) {
    for (const key of [
      "shipments",
      "eventLog",
      "pluginEvents",
      "pluginLogs",
      "shipmentsByDay",
      "stockoutEvents",
      "transitHistory",
      "trace",
      "disruptions",
    ])
      state[key] ??= [];
    for (const key of [
      "deliveryStats",
      "shipmentsByDayBySourceNode",
      "inventoryHistoryByNode",
      "kpis",
      "linkUsage",
      "preparationUsage",
    ])
      state[key] ??= {};
    state.totals = {
      demand: 0,
      fulfilled: 0,
      cost: 0,
      shipped: 0,
      stockouts: 0,
      produced: 0,
      discarded: 0,
      ...state.totals,
    };
    state.nodes.forEach((n) => {
      M.initialize(n);
      n.preparationQueue ??= [];
      n.preparingShipments ??= [];
    });
    state.sequence ??= 0;
  }
  function frame(state) {
    const nodes = new Map(state.nodes.map((n) => [n.id, n]));
    const links = new Map(state.links.map((l) => [l.id, l]));
    const incoming = new Map(),
      incomingTotal = new Map(),
      outgoing = new Map();
    for (const l of state.links) {
      if (!outgoing.has(l.from)) outgoing.set(l.from, []);
      outgoing.get(l.from).push(l);
    }
    for (const list of outgoing.values()) list.sort(order);
    const activeEffects = new Map();
    for (const e of state.disruptions)
      if (state.day >= e.startDay && state.day <= e.endDay) {
        const result = activeEffects.get(e.targetId) ?? {
          outage: false,
          capacity: 1,
          delay: 0,
        };
        if (e.kind === "outage") result.outage = true;
        if (e.kind === "capacity") result.capacity *= e.value;
        if (e.kind === "delay") result.delay += e.value;
        activeEffects.set(e.targetId, result);
      }
    const f = {
      nodes,
      links,
      incoming,
      incomingTotal,
      outgoing,
      activeEffects,
      events: [],
    };
    frames.set(state, f);
    for (const s of state.shipments)
      incomingAdd(f, s.to, s.materialId || "default", s.qty);
    for (const n of state.nodes)
      for (const s of [...n.preparationQueue, ...n.preparingShipments])
        incomingAdd(f, s.to, s.materialId || "default", s.qty);
    return f;
  }
  const key = (id, material) => JSON.stringify([id, material]);
  function incomingAdd(f, id, material, qty) {
    const k = key(id, material);
    f.incoming.set(k, (f.incoming.get(k) ?? 0) + qty);
    f.incomingTotal.set(id, (f.incomingTotal.get(id) ?? 0) + qty);
  }
  const incoming = (f, id, material) => f.incoming.get(key(id, material)) ?? 0;
  function trace(state, type, details) {
    const entry = {
      id: `event-${++state.sequence}`,
      day: state.day,
      type,
      ...details,
    };
    state.trace.push(entry);
    if (state.trace.length > 500) state.trace.shift();
    return entry;
  }
  function effects(state, id) {
    return (
      frames.get(state)?.activeEffects.get(id) ?? {
        outage: false,
        capacity: 1,
        delay: 0,
      }
    );
  }
  function demand(state, node) {
    const override = (node.demandSchedule ?? []).find(
      (row) => row.day === state.day,
    );
    let value = override?.quantity ?? node.consumptionRatePerDay ?? 0;
    for (const row of node.demandProfile ?? [])
      if (state.day >= row.startDay && state.day <= row.endDay)
        value *= row.multiplier;
    return value;
  }
  function reserved(node) {
    return node.preparingShipments.reduce((sum, s) => sum + s.qty, 0);
  }
  function arrivals(state, f) {
    const rest = [];
    for (const s of state.shipments) {
      if (s.arrivalDay > state.day) {
        rest.push(s);
        continue;
      }
      incomingAdd(f, s.to, s.materialId || "default", -s.qty);
      const node = f.nodes.get(s.to);
      if (!node) continue;
      const accepted = Math.min(
        s.qty,
        Math.max(
          0,
          (node.storageCapacity ?? Infinity) - node.inventory - reserved(node),
        ),
      );
      M.add(node, s.materialId || "default", accepted);
      node.received = (node.received ?? 0) + accepted;
      state.totals.discarded += s.qty - accepted;
      const entry = trace(state, "arrival", {
        nodeId: node.id,
        linkId: s.linkId,
        shipmentId: s.id,
        materialId: s.materialId || "default",
        qty: accepted,
        reason:
          s.qty > accepted
            ? `Storage full: ${s.qty - accepted} units discarded.`
            : "Shipment received.",
      });
      f.events.push(
        `${node.name ?? node.id} received ${accepted} (${entry.materialId}).${s.qty > accepted ? ` Overflowed by ${s.qty - accepted}.` : ""}`,
      );
    }
    state.shipments = rest;
  }
  function dispatch(
    state,
    f,
    source,
    target,
    link,
    material,
    qty,
    alreadyReserved = false,
    requestDay = state.day,
  ) {
    const se = effects(state, source.id),
      le = effects(state, link.id);
    const remaining = Math.max(
      0,
      link.maxDailyCapacity * le.capacity - (state.linkUsage[link.id] ?? 0),
    );
    const accepted =
      se.outage || le.outage
        ? 0
        : Math.min(
            qty,
            remaining,
            alreadyReserved ? Infinity : M.get(source, material),
          );
    if (!(accepted > 0)) {
      trace(state, "blocked", {
        nodeId: source.id,
        linkId: link.id,
        materialId: material,
        qty,
        reason:
          se.outage || le.outage
            ? "Source or route outage."
            : remaining <= 0
              ? "Daily transport capacity exhausted."
              : "Insufficient material inventory.",
      });
      return null;
    }
    if (!alreadyReserved) {
      M.add(source, material, -accepted);
      incomingAdd(f, target.id, material, accepted);
    }
    state.linkUsage[link.id] = (state.linkUsage[link.id] ?? 0) + accepted;
    const delay =
      (link.transportDelayDays ?? 0) +
      le.delay +
      se.delay +
      (source.type === "supplier"
        ? (source.leadTimeDays ?? 0)
        : source.type === "warehouse"
          ? (source.deliveryToPlantDays ?? 0)
          : 0);
    const s = {
      id: `shipment-${++state.sequence}`,
      from: source.id,
      to: target.id,
      fromName: source.name,
      toName: target.name,
      linkId: link.id,
      linkType: "material",
      materialId: material,
      materialName: material,
      qty: accepted,
      requestDay,
      departureDay: state.day,
      arrivalDay: state.day + delay,
      shipmentCost: link.costPerShipment ?? 0,
    };
    state.shipments.push(s);
    source.shipped = (source.shipped ?? 0) + accepted;
    state.totals.shipped += accepted;
    state.totals.cost += s.shipmentCost;
    state.shipmentsByDay.push({ day: state.day, volume: accepted });
    state.shipmentsByDay = state.shipmentsByDay.slice(-1000);
    trace(state, "shipment", {
      nodeId: source.id,
      linkId: link.id,
      shipmentId: s.id,
      materialId: material,
      qty: accepted,
      reason: `Departed on day ${state.day}; arrival day ${s.arrivalDay}.`,
      limits: { requested: qty, routeRemaining: remaining },
    });
    f.events.push(
      `${source.name ?? source.id} shipped ${accepted} ${material} to ${target.name ?? target.id}.`,
    );
    return s;
  }
  function pushShipment(state, request, events = []) {
    if (!frames.has(state)) ensure(state);
    const f = frames.get(state) ?? frame(state);
    const source = f.nodes.get(request.from),
      target = f.nodes.get(request.to);
    const link = request.linkId
      ? f.links.get(request.linkId)
      : (f.outgoing.get(request.from) ?? []).find(
          (l) => l.to === request.to && l.linkType !== "information",
        );
    const qty = Number(request.qty ?? request.quantity);
    // An explicit link must actually join the requested endpoints.
    if (
      !source ||
      !target ||
      !link ||
      link.from !== source.id ||
      link.to !== target.id ||
      link.linkType === "information" ||
      !Number.isFinite(qty) ||
      qty <= 0
    )
      return null;
    const material = link.materialId || "default";
    if (request.materialId && request.materialId !== material) return null;
    let result;
    if (source.type === "warehouse") {
      result = {
        id: `order-${++state.sequence}`,
        to: target.id,
        linkId: link.id,
        materialId: material,
        qty,
        requestDay: state.day,
      };
      source.preparationQueue.push(result);
      incomingAdd(f, target.id, material, qty);
      trace(state, "queued", {
        nodeId: source.id,
        linkId: link.id,
        materialId: material,
        qty,
        reason: "Waiting for stock and warehouse preparation capacity.",
      });
    } else result = dispatch(state, f, source, target, link, material, qty);
    if (events !== f.events && result && source.type !== "warehouse")
      events.push(`${source.name ?? source.id} dispatched ${result.qty}.`);
    return result;
  }
  function cleanQueues(state, f) {
    for (const n of state.nodes)
      for (const field of ["preparationQueue", "preparingShipments"])
        n[field] = n[field].filter((s) => {
          const l = f.links.get(s.linkId);
          if (
            l &&
            l.from === n.id &&
            l.to === s.to &&
            l.linkType !== "information" &&
            (l.materialId || "default") === (s.materialId || "default")
          )
            return true;
          if (field === "preparingShipments")
            M.add(n, s.materialId || "default", s.qty);
          incomingAdd(f, s.to, s.materialId || "default", -s.qty);
          trace(state, "cancelled", {
            nodeId: n.id,
            qty: s.qty,
            materialId: s.materialId || "default",
            reason: "Route removed; reserved stock returned.",
          });
          return false;
        });
  }
  function defaultRules(state, f) {
    for (const l of [...state.links].sort(order)) {
      if (l.linkType === "information") continue;
      const from = f.nodes.get(l.from),
        to = f.nodes.get(l.to);
      if (!from || !to) continue;
      const material = l.materialId || "default",
        se = effects(state, from.id);
      let desired = 0;
      if (
        from.type === "supplier" &&
        state.day % (from.deliveryFrequencyDays || 1) === 0
      ) {
        desired = (from.deliveryQuantity ?? 0) * se.capacity;
        const position =
          to.inventory +
          to.preparingShipments.reduce((a, s) => a + s.qty, 0) +
          (f.incomingTotal.get(to.id) ?? 0);
        if (
          to.type === "warehouse" &&
          to.reorderPoint != null &&
          position > to.reorderPoint
        )
          desired = 0;
        desired = Math.min(
          desired,
          Math.max(0, (to.storageCapacity ?? Infinity) - position),
        );
      } else if (
        (from.type === "warehouse" || from.type === "plant") &&
        to.type === "plant"
      ) {
        const units = to.safetyStock ?? demand(state, to);
        const factor = to.recipe?.inputs?.[material];
        const target = factor
          ? Math.ceil(units / to.recipe.outputQuantity) * factor
          : material === (to.materialId || "default")
            ? units
            : 0;
        desired = Math.max(
          0,
          target - M.get(to, material) - incoming(f, to.id, material),
        );
      } else if (from.type === "warehouse" && to.type === "warehouse") {
        desired = Math.max(
          0,
          (to.reorderPoint ?? 0) -
            M.get(to, material) -
            incoming(f, to.id, material),
        );
      }
      if (desired > 0)
        pushShipment(
          state,
          { from: from.id, to: to.id, linkId: l.id, qty: desired },
          f.events,
        );
    }
  }
  function prepareAndDispatch(state, f) {
    for (const n of [...state.nodes].sort((a, b) =>
      String(a.id).localeCompare(String(b.id), "en"),
    )) {
      if (n.type !== "warehouse") continue;
      const e = effects(state, n.id);
      let capacity = e.outage
        ? 0
        : (n.preparationCapacityPerDay ?? Infinity) * e.capacity;
      n.preparationQueue.sort(
        (a, b) =>
          order(f.links.get(a.linkId), f.links.get(b.linkId)) ||
          a.requestDay - b.requestDay,
      );
      const waiting = [];
      for (const q of n.preparationQueue) {
        const link = f.links.get(q.linkId);
        if (!link) continue;
        const qty = effects(state, link.id).outage
          ? 0
          : Math.min(q.qty, capacity, M.get(n, q.materialId));
        if (qty > 0) {
          M.add(n, q.materialId, -qty);
          capacity -= qty;
          n.preparingShipments.push({
            ...q,
            id: `prep-${++state.sequence}`,
            qty,
            readyDay: state.day + (n.preparationTimeDays ?? 0),
          });
          trace(state, "preparing", {
            nodeId: n.id,
            linkId: q.linkId,
            materialId: q.materialId,
            qty,
            reason: `Stock reserved; preparation completes day ${state.day + (n.preparationTimeDays ?? 0)}.`,
          });
        }
        if (qty < q.qty) {
          waiting.push({ ...q, qty: q.qty - qty });
          trace(state, "blocked", {
            nodeId: n.id,
            linkId: q.linkId,
            materialId: q.materialId,
            qty: q.qty - qty,
            reason: e.outage
              ? "Warehouse outage."
              : effects(state, link.id).outage
                ? "Route outage."
                : capacity <= 0
                  ? "Preparation capacity exhausted."
                  : "Missing material stock.",
          });
        }
      }
      n.preparationQueue = waiting;
      state.preparationUsage[n.id] =
        (n.preparationCapacityPerDay ?? Infinity) * e.capacity - capacity;
      if (!Number.isFinite(state.preparationUsage[n.id]))
        state.preparationUsage[n.id] = n.preparingShipments
          .filter(
            (q) => q.readyDay === state.day + (n.preparationTimeDays ?? 0),
          )
          .reduce((a, q) => a + q.qty, 0);
      const preparing = [];
      n.preparingShipments.sort(
        (a, b) =>
          order(f.links.get(a.linkId), f.links.get(b.linkId)) ||
          a.requestDay - b.requestDay,
      );
      for (const q of n.preparingShipments) {
        if (q.readyDay > state.day) {
          preparing.push(q);
          continue;
        }
        const l = f.links.get(q.linkId),
          target = f.nodes.get(q.to);
        const sent = target
          ? dispatch(
              state,
              f,
              n,
              target,
              l,
              q.materialId,
              q.qty,
              true,
              q.requestDay,
            )
          : null;
        if ((sent?.qty ?? 0) < q.qty)
          preparing.push({ ...q, qty: q.qty - (sent?.qty ?? 0) });
      }
      n.preparingShipments = preparing;
    }
  }
  function produceAndConsume(state, f) {
    for (const plant of state.nodes
      .filter((n) => n.type === "plant")
      .sort((a, b) => String(a.id).localeCompare(String(b.id), "en"))) {
      const requested = demand(state, plant),
        material = plant.materialId || "default",
        recipe = plant.recipe;
      if (recipe && !effects(state, plant.id).outage) {
        const missing = Math.max(0, requested - M.get(plant, material));
        const capacity =
          (plant.productionCapacityPerDay ?? requested) *
          effects(state, plant.id).capacity;
        let batches = Math.min(
          Math.ceil(missing / recipe.outputQuantity),
          Math.floor(capacity / recipe.outputQuantity),
        );
        const limits = [];
        for (const [input, qty] of Object.entries(recipe.inputs)) {
          const possible = Math.floor(M.get(plant, input) / qty);
          batches = Math.min(batches, possible);
          if (possible < Math.ceil(missing / recipe.outputQuantity))
            limits.push(input);
        }
        if (batches > 0) {
          for (const [input, qty] of Object.entries(recipe.inputs))
            M.add(plant, input, -qty * batches);
          M.add(plant, material, batches * recipe.outputQuantity);
          plant.produced =
            (plant.produced ?? 0) + batches * recipe.outputQuantity;
          state.totals.produced += batches * recipe.outputQuantity;
          trace(state, "production", {
            nodeId: plant.id,
            materialId: material,
            qty: batches * recipe.outputQuantity,
            inputs: Object.fromEntries(
              Object.entries(recipe.inputs).map(([k, v]) => [k, v * batches]),
            ),
            reason: "Recipe inputs converted into finished output.",
          });
        }
        if (M.get(plant, material) < requested)
          trace(state, "blocked", {
            nodeId: plant.id,
            materialId: material,
            reason: limits.length
              ? `Missing recipe inputs: ${limits.join(", ")}.`
              : "Production capacity exhausted.",
          });
      }
      const consumed = Math.min(M.get(plant, material), requested);
      M.add(plant, material, -consumed);
      state.totals.demand += requested;
      state.totals.fulfilled += consumed;
      if (requested > consumed) {
        const shortfall = requested - consumed;
        plant.stockouts = (plant.stockouts ?? 0) + 1;
        state.totals.stockouts++;
        const causes = state.trace
          .filter(
            (t) =>
              t.day === state.day &&
              (t.nodeId === plant.id ||
                f.links.get(t.linkId)?.to === plant.id) &&
              t.type === "blocked",
          )
          .slice(-5)
          .map((t) => t.reason);
        const entry = trace(state, "stockout", {
          nodeId: plant.id,
          materialId: material,
          qty: shortfall,
          reason:
            causes.join(" ") ||
            "Demand exceeded available finished stock. Inspect incoming shipment arrival dates.",
        });
        state.stockoutEvents.push({
          day: state.day,
          nodeId: plant.id,
          shortfall,
          traceId: entry.id,
        });
        state.stockoutEvents = state.stockoutEvents.slice(-1000);
        f.events.push(`${plant.name ?? plant.id} stocked out by ${shortfall}.`);
      }
    }
  }
  function update(state) {
    state.kpis = {
      totalShippedVolume: state.totals.shipped,
      serviceLevel: state.totals.demand
        ? (100 * state.totals.fulfilled) / state.totals.demand
        : 100,
      unmetDemand: state.totals.demand - state.totals.fulfilled,
      transportCost: state.totals.cost,
      stockoutCount: state.totals.stockouts,
      inTransit: state.shipments.length,
      produced: state.totals.produced,
      discarded: state.totals.discarded,
    };
    for (const n of state.nodes) {
      const h = (state.inventoryHistoryByNode[n.id] ??= []);
      h.push({
        day: state.day,
        value: n.inventory,
        byMaterial: { ...n.inventoryByMaterial },
        demand: n.type === "plant" ? demand(state, n) : 0,
      });
      state.inventoryHistoryByNode[n.id] = h.slice(-100);
    }
    state.transitHistory.push({
      day: state.day,
      value: state.shipments.length,
    });
    state.transitHistory = state.transitHistory.slice(-100);
  }
  function step(state) {
    ensure(state);
    state.linkUsage = {};
    state.preparationUsage = {};
    state.day = (state.day ?? 0) + 1;
    const f = frame(state);
    cleanQueues(state, f);
    arrivals(state, f);
    if (window.SCFL_PluginRuntime) {
      const result = window.SCFL_PluginRuntime.runHook(state);
      for (const event of result.emitted)
        if (event.type === "shipment") pushShipment(state, event, f.events);
      for (const item of [...result.logs, ...result.errors])
        f.events.push(`[Plugin:${item.nodeId}] ${item.message}`);
    }
    defaultRules(state, f);
    prepareAndDispatch(state, f);
    arrivals(state, f);
    produceAndConsume(state, f);
    update(state);
    return { ...state, events: f.events };
  }
  function reset(state) {
    state.nodes.forEach(M.reset);
    state.day = 0;
    state.sequence = 0;
    for (const k of [
      "shipments",
      "trace",
      "stockoutEvents",
      "shipmentsByDay",
      "transitHistory",
      "pluginEvents",
      "pluginLogs",
    ])
      state[k] = [];
    for (const k of [
      "totals",
      "kpis",
      "inventoryHistoryByNode",
      "linkUsage",
      "preparationUsage",
    ])
      state[k] = {};
    frames.delete(state);
    ensure(state);
    return state;
  }
  function reconcile(state) {
    ensure(state);
    const f = frame(state);
    cleanQueues(state, f);
  }
  return { step, pushShipment, reset, demand, reconcile };
})();
