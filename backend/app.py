from __future__ import annotations

from pathlib import Path
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


def _validate_payload(payload: dict) -> list[str]:
    errors: list[str] = []

    required_keys = ["nodes", "links"]
    for key in required_keys:
        if key not in payload:
            errors.append(f"Missing required field: {key}")

    if "nodes" in payload and not isinstance(payload["nodes"], list):
        errors.append("'nodes' must be a list")

    if "links" in payload and not isinstance(payload["links"], list):
        errors.append("'links' must be a list")

    if "day" in payload and not isinstance(payload["day"], int):
        errors.append("'day' must be an integer")

    return errors


@app.post("/api/simulation/step")
def simulation_step():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({
            "error": "Invalid payload",
            "details": ["Expected a JSON object"]
        }), 400

    validation_errors = _validate_payload(payload)
    if validation_errors:
        return jsonify({
            "error": "Invalid payload",
            "details": validation_errors
        }), 400

    try:
        result = simulate_day(payload)
    except Exception:
        # Avoid leaking internal errors unless debug mode is enabled
        if app.debug:
            raise
        return jsonify({
            "error": "Simulation engine error"
        }), 500

    return jsonify(result.payload)


@app.route("/api/simulation/step", methods=["OPTIONS"])
def simulation_step_options():
    return ("", 204)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=_resolve_port(), debug=True)
