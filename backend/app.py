from __future__ import annotations

from pathlib import Path
from typing import Any
import logging
import os
import socket
import sys

from flask import Flask, jsonify, request, send_from_directory

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parent))
    from simulation_engine import simulate_day
else:
    from .simulation_engine import simulate_day

ROOT_DIR = Path(__file__).resolve().parent.parent

app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path="")
logger = logging.getLogger(__name__)


def _resolve_port(default_port: int = 5000) -> int:
    configured_port = int(os.environ.get("PORT", default_port))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if sock.connect_ex(("127.0.0.1", configured_port)) != 0:
            return configured_port

    fallback_port = configured_port + 1
    print(
        f"Port {configured_port} is busy. Starting Flask on fallback port {fallback_port}."
    )
    return fallback_port


@app.after_request
def add_api_cors_headers(response):
    if request.path.startswith("/api/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response


@app.get("/")
def index():
    return send_from_directory(ROOT_DIR, "index.html")


@app.get("/<path:asset_path>")
def static_assets(asset_path: str):
    return send_from_directory(ROOT_DIR, asset_path)


def _validate_node(node: Any, index: int) -> list[str]:
    errors: list[str] = []

    if not isinstance(node, dict):
        return [f"nodes[{index}] must be an object"]

    node_id = node.get("id")
    node_type = node.get("type")

    if not isinstance(node_id, str) or not node_id.strip():
        errors.append(f"nodes[{index}].id must be a non-empty string")

    if not isinstance(node_type, str) or not node_type.strip():
        errors.append(f"nodes[{index}].type must be a non-empty string")

    if "inventory" in node and node["inventory"] is not None and not isinstance(node["inventory"], (int, float)):
        errors.append(f"nodes[{index}].inventory must be a number or null")

    return errors


def _validate_link(link: Any, index: int) -> list[str]:
    errors: list[str] = []

    if not isinstance(link, dict):
        return [f"links[{index}] must be an object"]

    for field in ("id", "from", "to"):
        value = link.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"links[{index}].{field} must be a non-empty string")

    if "transportDelayDays" in link and not isinstance(link["transportDelayDays"], int):
        errors.append(f"links[{index}].transportDelayDays must be an integer")

    if "maxDailyCapacity" in link and not isinstance(link["maxDailyCapacity"], (int, float)):
        errors.append(f"links[{index}].maxDailyCapacity must be a number")

    if "costPerShipment" in link and link["costPerShipment"] is not None and not isinstance(link["costPerShipment"], (int, float)):
        errors.append(f"links[{index}].costPerShipment must be a number or null")

    return errors


def _validate_payload(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    required_keys = ["nodes", "links"]
    for key in required_keys:
        if key not in payload:
            errors.append(f"Missing required field: {key}")

    if "nodes" in payload and not isinstance(payload["nodes"], list):
        errors.append("nodes must be a list")

    if "links" in payload and not isinstance(payload["links"], list):
        errors.append("links must be a list")

    if "day" in payload and not isinstance(payload["day"], int):
        errors.append("day must be an integer")

    list_fields = [
        "shipments",
        "shipmentsByDay",
        "stockoutEvents",
        "transitHistory",
    ]
    for field in list_fields:
        if field in payload and not isinstance(payload[field], list):
            errors.append(f"{field} must be a list")

    dict_fields = [
        "deliveryStats",
        "shipmentsByDayBySourceNode",
        "inventoryHistoryByNode",
    ]
    for field in dict_fields:
        if field in payload and not isinstance(payload[field], dict):
            errors.append(f"{field} must be an object")

    if isinstance(payload.get("nodes"), list):
        for index, node in enumerate(payload["nodes"]):
            errors.extend(_validate_node(node, index))

    if isinstance(payload.get("links"), list):
        node_ids = {
            node.get("id")
            for node in payload.get("nodes", [])
            if isinstance(node, dict) and isinstance(node.get("id"), str)
        }
        for index, link in enumerate(payload["links"]):
            errors.extend(_validate_link(link, index))
            if isinstance(link, dict):
                from_id = link.get("from")
                to_id = link.get("to")
                if isinstance(from_id, str) and node_ids and from_id not in node_ids:
                    errors.append(f"links[{index}].from references unknown node id: {from_id}")
                if isinstance(to_id, str) and node_ids and to_id not in node_ids:
                    errors.append(f"links[{index}].to references unknown node id: {to_id}")

    return errors


def _invalid_payload_response(details: list[str], status_code: int = 400):
    return jsonify({"error": "Invalid payload", "details": details}), status_code


@app.post("/api/simulation/step")
def simulation_step():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return _invalid_payload_response(["Expected a JSON object"])

    validation_errors = _validate_payload(payload)
    if validation_errors:
        return _invalid_payload_response(validation_errors)

    try:
        result = simulate_day(payload)
    except Exception:
        logger.exception("Simulation engine failed")
        if app.debug:
            raise
        return jsonify({"error": "Simulation engine error"}), 500

    return jsonify(result.payload)


@app.route("/api/simulation/step", methods=["OPTIONS"])
def simulation_step_options():
    return ("", 204)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=_resolve_port(), debug=True)
