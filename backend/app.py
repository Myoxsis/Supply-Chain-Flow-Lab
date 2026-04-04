from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from .simulation_engine import simulate_day

ROOT_DIR = Path(__file__).resolve().parent.parent

app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path="")


@app.get("/")
def index():
    return send_from_directory(ROOT_DIR, "index.html")


@app.get("/<path:asset_path>")
def static_assets(asset_path: str):
    return send_from_directory(ROOT_DIR, asset_path)


@app.post("/api/simulation/step")
def simulation_step():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Expected a JSON object payload."}), 400
    try:
        result = simulate_day(payload)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Simulation engine error: {exc}"}), 500
    return jsonify(result.payload)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
