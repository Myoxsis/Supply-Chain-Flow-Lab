from __future__ import annotations

from copy import deepcopy

import pytest

from backend.simulation_engine import simulate_day


def base_state(nodes: list[dict], links: list[dict]) -> dict:
    return {
        "day": 0,
        "nodes": deepcopy(nodes),
        "links": deepcopy(links),
        "shipments": [],
        "deliveryStats": {},
        "shipmentsByDay": [],
        "shipmentsByDayBySourceNode": {},
        "stockoutEvents": [],
        "inventoryHistoryByNode": {},
        "transitHistory": [],
    }


def step_many(state: dict, days: int) -> dict:
    current = deepcopy(state)
    for _ in range(days):
        current = simulate_day(current).payload
        current["links"] = deepcopy(state["links"])
    return current


def supplier_node(**overrides) -> dict:
    node = {
        "id": "supplier-1",
        "type": "supplier",
        "name": "Supplier",
        "deliveryFrequencyDays": 2,
        "deliveryQuantity": 100,
        "leadTimeDays": 1,
        "inventory": 1_000,
        "isInfiniteInventory": False,
        "shipped": 0,
        "received": 0,
        "stockouts": 0,
    }
    node.update(overrides)
    return node


def warehouse_node(**overrides) -> dict:
    node = {
        "id": "warehouse-1",
        "type": "warehouse",
        "name": "Warehouse",
        "preparationTimeDays": 1,
        "preparationCapacityPerDay": None,
        "deliveryToPlantDays": 1,
        "storageCapacity": 500,
        "inventory": 0,
        "received": 0,
        "shipped": 0,
        "stockouts": 0,
        "preparationQueue": [],
        "preparingShipments": [],
        "nextQueueRequestId": 1,
    }
    node.update(overrides)
    return node


def plant_node(**overrides) -> dict:
    node = {
        "id": "plant-1",
        "type": "plant",
        "name": "Plant",
        "consumptionRatePerDay": 10,
        "inventory": 100,
        "received": 0,
        "shipped": 0,
        "stockouts": 0,
        "safetyStock": 20,
    }
    node.update(overrides)
    return node


def material_link(**overrides) -> dict:
    link = {
        "id": "link-1",
        "from": "supplier-1",
        "to": "warehouse-1",
        "linkType": "material",
        "materialName": "Material",
        "transportDelayDays": 0,
        "maxDailyCapacity": 100,
        "priority": 1,
        "costPerShipment": None,
    }
    link.update(overrides)
    return link


def node_by_id(state: dict, node_id: str) -> dict:
    return next(node for node in state["nodes"] if node["id"] == node_id)


def test_supplier_dispatch_frequency_and_lead_time() -> None:
    nodes = [
        supplier_node(deliveryFrequencyDays=2, deliveryQuantity=50, leadTimeDays=1),
        warehouse_node(storageCapacity=500),
    ]
    links = [material_link(transportDelayDays=2, maxDailyCapacity=100)]
    state = base_state(nodes, links)

    day_1 = step_many(state, 1)
    assert day_1["shipments"] == []
    assert node_by_id(day_1, "supplier-1")["shipped"] == 0

    day_2 = step_many(state, 2)
    assert len(day_2["shipments"]) == 1
    shipment = day_2["shipments"][0]
    assert shipment["qty"] == 50
    assert shipment["departureDay"] == 2
    assert shipment["arrivalDay"] == 5
    assert node_by_id(day_2, "supplier-1")["shipped"] == 50


def test_warehouse_storage_overflow_discards_excess_arrival() -> None:
    nodes = [warehouse_node(storageCapacity=100, inventory=90)]
    state = base_state(nodes, [])
    state["shipments"] = [
        {
            "from": "supplier-1",
            "to": "warehouse-1",
            "linkId": "link-1",
            "materialName": "Material",
            "priority": 1,
            "shipmentCost": None,
            "qty": 25,
            "departureDay": 0,
            "arrivalDay": 1,
            "fromName": "Supplier",
        }
    ]

    result = step_many(state, 1)
    warehouse = node_by_id(result, "warehouse-1")

    assert warehouse["inventory"] == 100
    assert warehouse["received"] == 10
    assert any("overflowed by 15" in event for event in result["events"])


def test_warehouse_preparation_queue_respects_daily_capacity() -> None:
    nodes = [
        warehouse_node(inventory=100, preparationTimeDays=1, preparationCapacityPerDay=15),
        plant_node(inventory=0, safetyStock=40, consumptionRatePerDay=10),
    ]
    links = [
        material_link(
            id="link-warehouse-plant",
            from="warehouse-1",
            to="plant-1",
            transportDelayDays=0,
            maxDailyCapacity=100,
        )
    ]
    state = base_state(nodes, links)

    result = step_many(state, 1)
    warehouse = node_by_id(result, "warehouse-1")

    assert warehouse["inventory"] == 85
    assert len(warehouse["preparingShipments"]) == 1
    assert warehouse["preparingShipments"][0]["qty"] == 15
    assert len(warehouse["preparationQueue"]) == 1
    assert warehouse["preparationQueue"][0]["qty"] == 35


def test_plant_consumption_creates_stockout_event() -> None:
    nodes = [plant_node(inventory=5, consumptionRatePerDay=10)]
    state = base_state(nodes, [])

    result = step_many(state, 1)
    plant = node_by_id(result, "plant-1")

    assert plant["inventory"] == 0
    assert plant["stockouts"] == 1
    assert result["stockoutEvents"] == [
        {"day": 1, "nodeId": "plant-1", "shortfall": 5.0}
    ]


def test_link_max_daily_capacity_limits_supplier_dispatch() -> None:
    nodes = [
        supplier_node(deliveryFrequencyDays=1, deliveryQuantity=100, leadTimeDays=0),
        warehouse_node(storageCapacity=500),
    ]
    links = [material_link(maxDailyCapacity=30, transportDelayDays=1)]
    state = base_state(nodes, links)

    result = step_many(state, 1)

    assert len(result["shipments"]) == 1
    assert result["shipments"][0]["qty"] == 30
    assert node_by_id(result, "supplier-1")["shipped"] == 30
    assert result["shipmentsByDay"][-1]["volume"] == 30


def test_kpis_track_shipped_volume_stockouts_queue_time_and_cost() -> None:
    nodes = [
        warehouse_node(inventory=100, preparationTimeDays=0, preparationCapacityPerDay=None),
        plant_node(inventory=0, safetyStock=10, consumptionRatePerDay=0),
    ]
    links = [
        material_link(
            id="link-warehouse-plant",
            from="warehouse-1",
            to="plant-1",
            transportDelayDays=0,
            maxDailyCapacity=100,
            costPerShipment=12.5,
        )
    ]
    state = base_state(nodes, links)

    day_1 = step_many(state, 1)
    day_2 = simulate_day({**day_1, "links": links}).payload

    kpis = day_2["kpis"]

    assert kpis["stockoutCount"] == 0
    assert kpis["totalShippedVolume"] == 10
    assert kpis["totalShipmentCost"] == 12.5
    assert kpis["averageQueueTimeDays"] == 0
    assert kpis["onTimeDeliveries"]["total"] == 1
