from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import simpy


@dataclass
class StepResult:
    payload: dict[str, Any]


def _node_map(nodes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {n["id"]: n for n in nodes}


def _is_material_link(link: dict[str, Any]) -> bool:
    return (link.get("linkType") or "material") == "material"


def _remaining_link_capacity(link: dict[str, Any], day: int, shipments: list[dict[str, Any]]) -> float:
    shipped_today = sum(
        s.get("qty", 0)
        for s in shipments
        if s.get("linkId") == link["id"] and s.get("departureDay") == day
    )
    return max(0, (link.get("maxDailyCapacity") or 0) - shipped_today)


def _queue_shipment(
    events: list[str],
    day: int,
    shipments: list[dict[str, Any]],
    delivery_stats: dict[str, Any],
    shipments_by_day: list[dict[str, Any]],
    from_node: dict[str, Any],
    to_node: dict[str, Any],
    link: dict[str, Any],
    qty: float,
    lead_time: int,
) -> None:
    delivery_stats["dispatched"] += 1
    shipment_cost = link.get("costPerShipment")
    if shipment_cost is not None:
      delivery_stats["shipmentCost"] += float(shipment_cost)

    day_bucket = shipments_by_day[-1]
    day_bucket["count"] += 1
    day_bucket["volume"] += qty

    shipments.append(
        {
            "from": from_node["id"],
            "to": to_node["id"],
            "linkId": link["id"],
            "materialName": link.get("materialName", "Material"),
            "priority": link.get("priority", 1),
            "shipmentCost": shipment_cost,
            "qty": qty,
            "departureDay": day,
            "arrivalDay": day + int(lead_time),
            "fromName": from_node.get("name", from_node["id"]),
        }
    )
    events.append(
        f"{from_node.get('name')} shipped {qty} {link.get('materialName')} to {to_node.get('name')} via {link['id']} (ETA day {day + int(lead_time)})"
    )


def _compute_kpis(state: dict[str, Any]) -> dict[str, Any]:
    nodes = state["nodes"]
    plants = [n for n in nodes if n.get("type") == "plant"]
    warehouses = [n for n in nodes if n.get("type") == "warehouse"]
    inv_hist = state["inventoryHistoryByNode"]
    delivery = state["deliveryStats"]

    stockout_count = sum(int(p.get("stockouts", 0)) for p in plants)
    plant_samples = sum(len(inv_hist.get(p["id"], [])) for p in plants)

    avg_plant_inventory = 0
    if plant_samples:
        total = 0
        for plant in plants:
            total += sum((point.get("inventory") or 0) for point in inv_hist.get(plant["id"], []))
        avg_plant_inventory = total / plant_samples

    warehouse_utilization = 0
    if warehouses:
        util_sum = 0
        for warehouse in warehouses:
            history = inv_hist.get(warehouse["id"], [])
            storage = warehouse.get("storageCapacity") or 0
            if not history or storage <= 0:
                continue
            avg_on_hand = sum((point.get("inventory") or 0) for point in history) / len(history)
            util_sum += avg_on_hand / storage
        warehouse_utilization = util_sum / len(warehouses)

    total_deliveries = delivery.get("dispatched", 0)
    on_time = delivery.get("onTime", 0)
    on_time_rate = (on_time / total_deliveries) if total_deliveries else 1
    avg_queue = (delivery.get("queueDaysTotal", 0) / delivery.get("queueEntries", 1)) if delivery.get("queueEntries", 0) else 0
    avg_fulfillment = (
        delivery.get("fulfillmentDelayTotal", 0) / delivery.get("fulfilledRequests", 1)
        if delivery.get("fulfilledRequests", 0)
        else 0
    )

    return {
        "stockoutCount": stockout_count,
        "averagePlantInventory": round(avg_plant_inventory, 2),
        "warehouseUtilization": round(warehouse_utilization, 4),
        "onTimeDeliveries": {
            "onTime": on_time,
            "total": total_deliveries,
            "rate": round(on_time_rate, 4),
        },
        "averageQueueTimeDays": round(avg_queue, 2),
        "averageFulfillmentDelayDays": round(avg_fulfillment, 2),
        "totalShippedVolume": sum(float(n.get("shipped", 0) or 0) for n in nodes),
        "totalShipmentCost": round(float(delivery.get("shipmentCost", 0)), 2),
    }


def simulate_day(payload: dict[str, Any]) -> StepResult:
    state = {
        "day": int(payload.get("day", 0)),
        "nodes": payload.get("nodes", []),
        "links": payload.get("links", []),
        "shipments": payload.get("shipments", []),
        "deliveryStats": payload.get("deliveryStats", {}),
        "shipmentsByDay": payload.get("shipmentsByDay", []),
        "stockoutEvents": payload.get("stockoutEvents", []),
        "inventoryHistoryByNode": payload.get("inventoryHistoryByNode", {}),
        "transitHistory": payload.get("transitHistory", []),
    }

    for key, default in {
        "dispatched": 0,
        "onTime": 0,
        "deliveredVolume": 0,
        "shipmentCost": 0,
        "queueEntries": 0,
        "queueDaysTotal": 0,
        "fulfilledRequests": 0,
        "fulfillmentDelayTotal": 0,
    }.items():
        state["deliveryStats"].setdefault(key, default)

    node_by_id = _node_map(state["nodes"])
    events: list[str] = []

    env = simpy.Environment()

    def day_process(environment: simpy.Environment):
        yield environment.timeout(1)

        state["day"] += 1
        day = state["day"]
        state["shipmentsByDay"].append({"day": day, "count": 0, "volume": 0})

        arriving = [s for s in state["shipments"] if s.get("arrivalDay", 0) <= day]
        state["shipments"] = [s for s in state["shipments"] if s.get("arrivalDay", 0) > day]
        for shipment in arriving:
            to_node = node_by_id.get(shipment.get("to"))
            if not to_node:
                continue
            received_qty = float(shipment.get("qty", 0))
            if to_node.get("type") == "warehouse":
                cap_left = max(0, float(to_node.get("storageCapacity", 0)) - float(to_node.get("inventory", 0) or 0))
                if received_qty > cap_left:
                    events.append(f"{to_node.get('name')} overflowed by {received_qty - cap_left} units (discarded).")
                received_qty = min(received_qty, cap_left)

            if not to_node.get("isInfiniteInventory"):
                to_node["inventory"] = float(to_node.get("inventory", 0) or 0) + received_qty
            to_node["received"] = float(to_node.get("received", 0) or 0) + received_qty
            if shipment.get("arrivalDay") == day:
                state["deliveryStats"]["onTime"] += 1
            state["deliveryStats"]["deliveredVolume"] += received_qty
            events.append(
                f"{received_qty} {shipment.get('materialName')} arrived at {to_node.get('name')} from {shipment.get('fromName')}"
            )

        suppliers = [n for n in state["nodes"] if n.get("type") == "supplier"]
        for supplier in suppliers:
            freq = int(supplier.get("deliveryFrequencyDays") or 1)
            if day % freq != 0:
                continue
            links = sorted(
                [l for l in state["links"] if l.get("from") == supplier["id"] and _is_material_link(l)],
                key=lambda l: l.get("priority", 1),
            )
            for link in links:
                target = node_by_id.get(link.get("to"))
                if not target:
                    continue
                link_cap = _remaining_link_capacity(link, day, state["shipments"])
                if link_cap <= 0:
                    continue
                qty_cap = min(float(supplier.get("deliveryQuantity") or 0), link_cap)
                if supplier.get("isInfiniteInventory"):
                    qty = qty_cap
                else:
                    qty = min(qty_cap, float(supplier.get("inventory", 0) or 0))
                if qty <= 0:
                    continue
                _queue_shipment(
                    events,
                    day,
                    state["shipments"],
                    state["deliveryStats"],
                    state["shipmentsByDay"],
                    supplier,
                    target,
                    link,
                    qty,
                    int(supplier.get("leadTimeDays") or 0) + int(link.get("transportDelayDays") or 0),
                )
                if not supplier.get("isInfiniteInventory"):
                    supplier["inventory"] = float(supplier.get("inventory", 0) or 0) - qty
                supplier["shipped"] = float(supplier.get("shipped", 0) or 0) + qty

        warehouses = [n for n in state["nodes"] if n.get("type") == "warehouse"]
        for warehouse in warehouses:
            warehouse.setdefault("preparationQueue", [])
            warehouse.setdefault("preparingShipments", [])
            warehouse.setdefault("nextQueueRequestId", 1)

            out_links = sorted(
                [l for l in state["links"] if l.get("from") == warehouse["id"] and _is_material_link(l)],
                key=lambda l: l.get("priority", 1),
            )
            for link in out_links:
                plant = node_by_id.get(link.get("to"))
                if not plant or plant.get("type") != "plant":
                    continue
                safety = float(plant.get("safetyStock") or 0)
                desired = safety + float(plant.get("consumptionRatePerDay") or 0)

                queued = sum(
                    float(req.get("qty", 0))
                    for req in warehouse["preparationQueue"]
                    if req.get("linkId") == link["id"] and req.get("plantId") == plant["id"]
                )
                preparing = sum(
                    float(req.get("qty", 0))
                    for req in warehouse["preparingShipments"]
                    if req.get("linkId") == link["id"] and req.get("plantId") == plant["id"]
                )
                in_transit = sum(
                    float(s.get("qty", 0))
                    for s in state["shipments"]
                    if s.get("from") == warehouse["id"] and s.get("to") == plant["id"] and s.get("linkId") == link["id"]
                )
                committed = queued + preparing + in_transit
                need = max(0, desired - (float(plant.get("inventory", 0) or 0) + committed))
                if need <= 0:
                    continue
                request = {
                    "id": f"{warehouse['id']}-req-{warehouse['nextQueueRequestId']}",
                    "linkId": link["id"],
                    "plantId": plant["id"],
                    "plantName": plant.get("name"),
                    "materialName": link.get("materialName"),
                    "qty": need,
                    "queuedDay": day,
                }
                warehouse["nextQueueRequestId"] += 1
                warehouse["preparationQueue"].append(request)
                state["deliveryStats"]["queueEntries"] += 1
                events.append(
                    f"{warehouse.get('name')} queued outbound request {request['id']}: {need} {link.get('materialName')} for {plant.get('name')}."
                )

            daily_capacity = warehouse.get("preparationCapacityPerDay")
            capacity_left = float("inf") if daily_capacity is None else float(daily_capacity)

            if capacity_left > 0:
                while warehouse["preparationQueue"] and capacity_left > 0 and float(warehouse.get("inventory", 0) or 0) > 0:
                    request = warehouse["preparationQueue"][0]
                    prep_qty = min(float(request.get("qty", 0)), float(warehouse.get("inventory", 0) or 0), capacity_left)
                    if prep_qty <= 0:
                        break
                    warehouse["preparationQueue"].pop(0)
                    warehouse["inventory"] = float(warehouse.get("inventory", 0) or 0) - prep_qty
                    queue_days = max(0, day - int(request.get("queuedDay", day)))
                    state["deliveryStats"]["queueDaysTotal"] += queue_days
                    prep_order = {
                        "requestId": request.get("id"),
                        "linkId": request.get("linkId"),
                        "plantId": request.get("plantId"),
                        "materialName": request.get("materialName"),
                        "qty": prep_qty,
                        "queuedDay": request.get("queuedDay"),
                        "prepStartDay": day,
                        "readyDay": day + int(warehouse.get("preparationTimeDays") or 0),
                    }
                    warehouse["preparingShipments"].append(prep_order)
                    if capacity_left != float("inf"):
                        capacity_left = max(0, capacity_left - prep_qty)
                    events.append(
                        f"{warehouse.get('name')} started preparing {prep_qty} {request.get('materialName')} for {request.get('plantName')} (queued {queue_days} day(s), ready day {prep_order['readyDay']})."
                    )
                    if prep_qty < float(request.get("qty", 0)):
                        remaining = float(request.get("qty", 0)) - prep_qty
                        warehouse["preparationQueue"].insert(0, {**request, "qty": remaining})
                        events.append(
                            f"{warehouse.get('name')} partially prepared request {request.get('id')}; {remaining} units remain in queue."
                        )

            ready = sorted(
                [p for p in warehouse["preparingShipments"] if int(p.get("readyDay", day + 1)) <= day],
                key=lambda p: p.get("queuedDay", day),
            )
            not_ready = [p for p in warehouse["preparingShipments"] if int(p.get("readyDay", day + 1)) > day]
            by_link: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for order in ready:
                by_link[order.get("linkId")].append(order)

            remaining = []
            for link_id, orders in by_link.items():
                link = next((l for l in state["links"] if l.get("id") == link_id), None)
                if not link:
                    remaining.extend(orders)
                    continue
                cap = _remaining_link_capacity(link, day, state["shipments"])
                for order in orders:
                    plant = node_by_id.get(order.get("plantId"))
                    if not plant or plant.get("type") != "plant":
                        remaining.append(order)
                        continue
                    dispatch = min(float(order.get("qty", 0)), cap)
                    if dispatch > 0:
                        warehouse["shipped"] = float(warehouse.get("shipped", 0) or 0) + dispatch
                        _queue_shipment(
                            events,
                            day,
                            state["shipments"],
                            state["deliveryStats"],
                            state["shipmentsByDay"],
                            warehouse,
                            plant,
                            link,
                            dispatch,
                            int(warehouse.get("deliveryToPlantDays") or 0) + int(link.get("transportDelayDays") or 0),
                        )
                        cap -= dispatch
                        fulfillment_delay = max(0, day - int(order.get("queuedDay", day)))
                        state["deliveryStats"]["fulfilledRequests"] += 1
                        state["deliveryStats"]["fulfillmentDelayTotal"] += fulfillment_delay
                        events.append(
                            f"{warehouse.get('name')} dispatched prepared order {order.get('requestId')} ({dispatch} {order.get('materialName')}) to {plant.get('name')} after {fulfillment_delay} day(s) total delay."
                        )
                    if dispatch < float(order.get("qty", 0)):
                        remaining_qty = float(order.get("qty", 0)) - dispatch
                        remaining.append({**order, "qty": remaining_qty})
                        events.append(
                            f"{warehouse.get('name')} dispatch delayed for {order.get('requestId')}; {remaining_qty} units waiting on link capacity."
                        )

            warehouse["preparingShipments"] = not_ready + remaining

        for plant in [n for n in state["nodes"] if n.get("type") == "plant"]:
            consume = float(plant.get("consumptionRatePerDay") or 0)
            plant["inventory"] = float(plant.get("inventory", 0) or 0) - consume
            if plant["inventory"] >= 0:
                events.append(f"{plant.get('name')} consumed {consume} units")
            else:
                shortfall = abs(float(plant["inventory"]))
                plant["inventory"] = 0
                plant["stockouts"] = int(plant.get("stockouts", 0)) + 1
                state["stockoutEvents"].append({"day": day, "nodeId": plant["id"], "shortfall": shortfall})
                events.append(f"{plant.get('name')} stockout ({shortfall} units short)")

        for node in state["nodes"]:
            history = state["inventoryHistoryByNode"].setdefault(node["id"], [])
            inv = None if node.get("isInfiniteInventory") else float(node.get("inventory", 0) or 0)
            history.append(
                {
                    "day": day,
                    "inventory": inv,
                    "onHandLabel": "∞" if node.get("isInfiniteInventory") else inv,
                }
            )

        state["transitHistory"].append(
            {
                "day": day,
                "shipmentsInTransit": len(state["shipments"]),
                "inTransitVolume": sum(float(s.get("qty", 0)) for s in state["shipments"]),
                "shipments": [
                    {
                        "from": s.get("from"),
                        "to": s.get("to"),
                        "linkId": s.get("linkId"),
                        "materialName": s.get("materialName"),
                        "qty": s.get("qty"),
                        "departureDay": s.get("departureDay"),
                        "arrivalDay": s.get("arrivalDay"),
                    }
                    for s in state["shipments"]
                ],
            }
        )

    env.process(day_process(env))
    env.run()

    payload_out = {
        "day": state["day"],
        "nodes": state["nodes"],
        "shipments": state["shipments"],
        "deliveryStats": state["deliveryStats"],
        "shipmentsByDay": state["shipmentsByDay"],
        "stockoutEvents": state["stockoutEvents"],
        "inventoryHistoryByNode": state["inventoryHistoryByNode"],
        "transitHistory": state["transitHistory"],
        "kpis": _compute_kpis(state),
        "events": events,
    }
    return StepResult(payload=payload_out)
