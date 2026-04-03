import { COST_CATEGORY_KEYS, createCostBreakdown } from './graph-model.js';

/**
 * @param {{state: any, getNode: Function, log: Function, getRemainingLinkCapacity: Function, initializeNodeRuntime: Function}} context
 */
export function createSimulationEngine(context) {
  const { state, getNode, log, getRemainingLinkCapacity, initializeNodeRuntime } = context;

  function getPlantCostBucket(plantId) {
    if (!plantId) return null;
    const plant = getNode(plantId);
    if (!plant || plant.type !== 'plant') return null;
    if (!state.finance.costPerPlantServed[plantId]) {
      state.finance.costPerPlantServed[plantId] = { plantId, plantName: plant.name, totalCost: 0, costBreakdown: createCostBreakdown() };
    }
    return state.finance.costPerPlantServed[plantId];
  }

  function getNodeCostBucket(nodeId) {
    if (!nodeId) return null;
    const node = getNode(nodeId);
    if (!node) return null;
    if (!state.finance.costByNode[nodeId]) {
      state.finance.costByNode[nodeId] = { nodeId, nodeName: node.name, nodeType: node.type, totalCost: 0, costBreakdown: createCostBreakdown() };
    }
    return state.finance.costByNode[nodeId];
  }

  function addCost(categoryKey, amount, options = {}) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    if (!(categoryKey in state.finance.costBreakdown)) return;
    state.finance.totalCost += numeric;
    state.finance.costBreakdown[categoryKey] += numeric;

    const nodeBucket = getNodeCostBucket(options.nodeId ?? null);
    if (nodeBucket) {
      nodeBucket.totalCost += numeric;
      nodeBucket.costBreakdown[categoryKey] += numeric;
    }

    const plantBucket = getPlantCostBucket(options.plantId ?? null);
    if (plantBucket) {
      plantBucket.totalCost += numeric;
      plantBucket.costBreakdown[categoryKey] += numeric;
    }
  }

  function queueShipment(from, to, link, qty, leadTime, options = {}) {
    state.deliveryStats.dispatched += 1;
    const shipmentCost = link.costPerShipment == null ? 0 : Number(link.costPerShipment);
    if (Number.isFinite(shipmentCost)) state.deliveryStats.shipmentCost += shipmentCost;
    addCost(COST_CATEGORY_KEYS.transport, shipmentCost, { nodeId: from.id, plantId: options.plantId ?? null });

    const supplierShipmentCost = from.type === 'supplier' ? Number(from.shipmentCost ?? 0) : 0;
    addCost(COST_CATEGORY_KEYS.supplierShipment, supplierShipmentCost, { nodeId: from.id, plantId: options.plantId ?? null });
    if (from.type === 'warehouse') {
      const handlingCostPerUnit = Number(from.handlingCostPerUnit ?? 0);
      addCost(COST_CATEGORY_KEYS.warehouseHandling, qty * handlingCostPerUnit, { nodeId: from.id, plantId: options.plantId ?? null });
    }

    const dayBucket = state.shipmentsByDay[state.shipmentsByDay.length - 1];
    if (dayBucket) {
      dayBucket.count += 1;
      dayBucket.volume += qty;
    }

    state.shipments.push({
      from: from.id, to: to.id, linkId: link.id, materialName: link.materialName, priority: link.priority,
      shipmentCost: link.costPerShipment == null ? null : Number(link.costPerShipment), qty,
      departureDay: state.day, arrivalDay: state.day + leadTime, fromName: from.name,
    });
    log(`${from.name} shipped ${qty} ${link.materialName} to ${to.name} via ${link.id} (ETA day ${state.day + leadTime})`);
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
        if (receivedQty < shipment.qty) log(`${toNode.name} overflowed by ${shipment.qty - receivedQty} units (discarded).`);
      }
      if (Number.isFinite(toNode.inventory)) toNode.inventory += receivedQty;
      toNode.received += receivedQty;
      if (shipment.arrivalDay === state.day) state.deliveryStats.onTime += 1;
      state.deliveryStats.deliveredVolume += receivedQty;
      log(`${receivedQty} ${shipment.materialName} arrived at ${toNode.name} from ${shipment.fromName}`);
    });
  }

  function getCommittedWarehouseToPlantVolume(warehouse, link, plant) {
    const queued = (warehouse.preparationQueue ?? []).filter((r) => r.linkId === link.id && r.plantId === plant.id).reduce((sum, r) => sum + r.qty, 0);
    const preparing = (warehouse.preparingShipments ?? []).filter((r) => r.linkId === link.id && r.plantId === plant.id).reduce((sum, r) => sum + r.qty, 0);
    const inTransit = state.shipments.filter((s) => s.from === warehouse.id && s.to === plant.id && s.linkId === link.id).reduce((sum, s) => sum + s.qty, 0);
    return queued + preparing + inTransit;
  }

  function createWarehouseOutboundRequests(warehouse) {
    state.links.filter((l) => l.from === warehouse.id).slice().sort((a, b) => a.priority - b.priority).forEach((link) => {
      const plant = getNode(link.to);
      if (plant?.type !== 'plant') return;
      const desired = (plant.safetyStock ?? 0) + plant.consumptionRatePerDay;
      const committed = getCommittedWarehouseToPlantVolume(warehouse, link, plant);
      const need = Math.max(0, desired - (plant.inventory + committed));
      if (need <= 0) return;
      const request = { id: `${warehouse.id}-req-${warehouse.nextQueueRequestId++}`, linkId: link.id, plantId: plant.id, plantName: plant.name, materialName: link.materialName, qty: need, queuedDay: state.day };
      warehouse.preparationQueue.push(request);
      state.deliveryStats.queueEntries += 1;
      log(`${warehouse.name} queued outbound request ${request.id}: ${need} ${link.materialName} for ${plant.name}.`);
    });
  }

  function processWarehousePreparation(warehouse) {
    let capacityLeft = warehouse.preparationCapacityPerDay == null ? Infinity : warehouse.preparationCapacityPerDay;
    if (capacityLeft <= 0) {
      if (warehouse.preparationQueue.length) log(`${warehouse.name} preparation paused today (0 capacity). ${warehouse.preparationQueue.length} requests waiting.`);
      return;
    }
    while (warehouse.preparationQueue.length > 0 && capacityLeft > 0 && warehouse.inventory > 0) {
      const request = warehouse.preparationQueue[0];
      const prepQty = Math.min(request.qty, warehouse.inventory, capacityLeft);
      if (prepQty <= 0) break;
      warehouse.preparationQueue.shift();
      warehouse.inventory -= prepQty;
      const queueDays = Math.max(0, state.day - request.queuedDay);
      state.deliveryStats.queueDaysTotal += queueDays;
      const prepOrder = { requestId: request.id, linkId: request.linkId, plantId: request.plantId, materialName: request.materialName, qty: prepQty, queuedDay: request.queuedDay, prepStartDay: state.day, readyDay: state.day + warehouse.preparationTimeDays };
      warehouse.preparingShipments.push(prepOrder);
      capacityLeft = Number.isFinite(capacityLeft) ? Math.max(0, capacityLeft - prepQty) : capacityLeft;
      log(`${warehouse.name} started preparing ${prepQty} ${request.materialName} for ${request.plantName} (queued ${queueDays} day(s), ready day ${prepOrder.readyDay}).`);
      if (prepQty < request.qty) {
        const remainingQty = request.qty - prepQty;
        warehouse.preparationQueue.unshift({ ...request, qty: remainingQty, queuedDay: request.queuedDay });
        log(`${warehouse.name} partially prepared request ${request.id}; ${remainingQty} units remain in queue.`);
      }
    }
  }

  function dispatchPreparedShipments(warehouse) {
    if (!warehouse.preparingShipments.length) return;
    const remainingPrep = [];
    const ready = warehouse.preparingShipments.filter((prep) => prep.readyDay <= state.day).sort((a, b) => a.queuedDay - b.queuedDay);
    const notReady = warehouse.preparingShipments.filter((prep) => prep.readyDay > state.day);
    const readyByLink = new Map();
    ready.forEach((prep) => { if (!readyByLink.has(prep.linkId)) readyByLink.set(prep.linkId, []); readyByLink.get(prep.linkId).push(prep); });
    readyByLink.forEach((orders, linkId) => {
      const link = state.links.find((l) => l.id === linkId);
      if (!link) return remainingPrep.push(...orders);
      let linkCapacity = getRemainingLinkCapacity(link, state.day);
      orders.forEach((order) => {
        const plant = getNode(order.plantId);
        if (!plant || plant.type !== 'plant') return remainingPrep.push(order);
        const dispatchQty = Math.min(order.qty, linkCapacity);
        if (dispatchQty > 0) {
          warehouse.shipped += dispatchQty;
          queueShipment(warehouse, plant, link, dispatchQty, warehouse.deliveryToPlantDays + link.transportDelayDays, { plantId: plant.id });
          linkCapacity -= dispatchQty;
          const delay = Math.max(0, state.day - order.queuedDay);
          state.deliveryStats.fulfilledRequests += 1;
          state.deliveryStats.fulfillmentDelayTotal += delay;
          log(`${warehouse.name} dispatched prepared order ${order.requestId} (${dispatchQty} ${order.materialName}) to ${plant.name} after ${delay} day(s) total delay.`);
        }
        if (dispatchQty < order.qty) {
          remainingPrep.push({ ...order, qty: order.qty - dispatchQty });
          log(`${warehouse.name} dispatch delayed for ${order.requestId}; ${order.qty - dispatchQty} units waiting on link capacity.`);
        }
      });
    });
    warehouse.preparingShipments = [...notReady, ...remainingPrep];
  }

  function simulateDay() {
    state.day += 1;
    state.shipmentsByDay.push({ day: state.day, count: 0, volume: 0 });
    processArrivals();
    state.nodes.filter((n) => n.type === 'supplier').forEach((supplier) => {
      if (state.day % supplier.deliveryFrequencyDays !== 0) return;
      let remainingSupplierBudget = Number(supplier.deliveryQuantity);
      if (!Number.isFinite(remainingSupplierBudget) || remainingSupplierBudget <= 0) return;
      let shippedToday = 0;
      state.links.filter((l) => l.from === supplier.id).slice().sort((a, b) => a.priority - b.priority).forEach((link) => {
        if (remainingSupplierBudget <= 0) return;
        const target = getNode(link.to);
        if (!target || (Number.isFinite(supplier.inventory) && supplier.inventory <= 0)) return;
        const cap = getRemainingLinkCapacity(link, state.day);
        if (cap <= 0) return;
        const qtyCap = Math.min(remainingSupplierBudget, cap);
        const qty = Number.isFinite(supplier.inventory) ? Math.min(qtyCap, supplier.inventory) : qtyCap;
        if (qty <= 0) return;
        queueShipment(supplier, target, link, qty, supplier.leadTimeDays + link.transportDelayDays, { plantId: target.type === 'plant' ? target.id : null });
        if (Number.isFinite(supplier.inventory)) supplier.inventory -= qty;
        remainingSupplierBudget -= qty;
        supplier.shipped += qty;
        shippedToday += qty;
      });
      if (state.links.some((l) => l.from === supplier.id) && shippedToday === 0) supplier.lastMissedShipmentDay = state.day;
    });

    state.nodes.filter((n) => n.type === 'warehouse').forEach((warehouse) => {
      if (!Array.isArray(warehouse.preparationQueue)) initializeNodeRuntime(warehouse);
      createWarehouseOutboundRequests(warehouse);
      processWarehousePreparation(warehouse);
      dispatchPreparedShipments(warehouse);
      const storageRate = Number(warehouse.storageCostPerUnitPerDay ?? 0);
      if (Number.isFinite(storageRate) && storageRate > 0 && Number.isFinite(warehouse.inventory) && warehouse.inventory > 0) {
        addCost(COST_CATEGORY_KEYS.warehouseStorage, warehouse.inventory * storageRate, { nodeId: warehouse.id });
      }
    });

    state.nodes.filter((n) => n.type === 'plant').forEach((plant) => {
      plant.inventory -= plant.consumptionRatePerDay;
      if (plant.inventory >= 0) return log(`${plant.name} consumed ${plant.consumptionRatePerDay} units`);
      const shortfall = Math.abs(plant.inventory);
      plant.inventory = 0;
      plant.stockouts += 1;
      addCost(COST_CATEGORY_KEYS.plantStockoutPenalty, Number(plant.stockoutPenaltyPerUnit ?? 0) * shortfall, { nodeId: plant.id, plantId: plant.id });
      state.stockoutEvents.push({ day: state.day, nodeId: plant.id, shortfall });
      log(`${plant.name} stockout (${shortfall} units short)`);
    });
  }

  return { simulateDay };
}
