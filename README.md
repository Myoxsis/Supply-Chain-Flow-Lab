# Supply Chain Flow Lab

Supply Chain Flow Lab is a ComfyUI-inspired visual node editor for modeling, simulating, and extending supply-chain flows.

The current frontend is a modular, plugin-driven graph runtime. Nodes are defined through a registry, rendered from schema, validated independently, and executed by a browser-side simulation engine.

## What is included

```text
index.html
styles.css
frontend/
  app/main.js
  coreNodes.js
  nodeRegistry.js
  rendering.js
  validation.js
  scenarioStorage.js
  nodePackages.js
  pluginRuntime.js
  simulationEngine.js
  plugins/example-package.json
backend/
  app.py
  simulation_engine.py
requirements.txt
tests/
docs/modularization-roadmap.md
```

The Python backend remains in the repository for compatibility and future hybrid execution work, but the active branch now runs the primary simulation loop in the browser through `frontend/simulationEngine.js`.

## How to run

### Static frontend

Open `index.html` directly in a browser, or serve the repository with any static file server.

Example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Backend compatibility mode

The backend can still be started for legacy or future hybrid workflows:

```bash
pip install -r requirements.txt
python -m backend.app
```

Then open:

```text
http://localhost:5000
```

## Run tests

```bash
pytest
```

## Current capabilities

- ComfyUI-inspired dark node canvas.
- Schema-driven node rendering.
- Registry-based built-in and community node definitions.
- Browser-side simulation engine with declarative plugin commands.
- Import/export scenario JSON.
- Import/export SCFL-node packages.
- Bounded declarative plugin commands through `runtime.onTick`.
- Visual node editor interactions:
  - drag nodes
  - create links through ports
  - pan canvas
  - zoom around cursor
  - fit graph to viewport
  - compact node mode
  - lightweight minimap
  - execution highlighting
- Event log and node inspector.
- Scenario autosave through localStorage.

## Architecture

```text
index.html
  ↓
frontend/app/main.js
  ↓
SCFL_NodeRegistry       node type definitions
SCFL_Rendering          schema-driven UI rendering
SCFL_Validation         node/link/graph validation
SCFL_ScenarioStorage    local persistence and import/export
SCFL_NodePackages       plugin package install/export
SCFL_PluginRuntime      runtime hook compilation and execution
SCFL_SimulationEngine   graph execution loop
```

## Runtime flow

Each simulation tick runs through the local graph engine:

```text
SimulationEngine.step(state)
  → apply arrivals
  → run plugin hooks
  → run default supply-chain rules
  → consume plant demand
  → update KPIs and histories
  → render graph
```

Plugin hooks run before default supply-chain rules, which allows plugin nodes to modify inventory, emit events, or create shipments.

## SCFL-node plugin packages

Node packages are JSON files that define additional node types.

Example package shape:

```json
{
  "schemaVersion": 1,
  "name": "example-supply-nodes",
  "displayName": "Example Supply Nodes",
  "version": "1.0.0",
  "author": "SCFL",
  "description": "Example plugin package with custom nodes.",
  "nodes": [
    {
      "type": "demand-generator",
      "label": "Demand Generator",
      "category": "Demand",
      "inputs": [],
      "outputs": ["information"],
      "fields": [
        { "key": "name", "label": "Name", "type": "string", "defaultValue": "Demand Generator" },
        { "key": "dailyDemand", "label": "Daily demand", "type": "int", "min": 0, "defaultValue": 50 }
      ],
      "runtime": {
        "onTick": [{"action": "emit", "type": "demand", "valueField": "dailyDemand"}]
      }
    }
  ]
}
```

An example package is available at:

```text
frontend/plugins/example-package.json
```

## Plugin execution

Imported JavaScript hooks are disabled. Runtime hooks now contain up to 100 declarative commands per node per tick. Supported actions are `emit`, `shipment`, and `log`; they have no DOM, network, or arbitrary app-state access. Shipment commands pass through the same stock, link, and warehouse capacity checks as built-in rules. Migrate legacy string hooks to command arrays before importing them.

```json
{"onTick": [{"action": "emit", "type": "demand", "valueField": "dailyDemand"}]}
```

## Scenario JSON versioning

Current scenario version: `8`. Versions 1–7 are migrated on import; newer unsupported versions are rejected.

Scenario exports include:

```text
nodes
links
shipments
ui
camera
pluginEvents
pluginLogs
```

The scenario storage module validates basic import shape and keeps the branch ready for migration hooks.

## Development notes

- `frontend/app/main.js` is now the active frontend entrypoint.
- Legacy adapter files have been removed from the active branch.
- `app.js` is no longer loaded by `index.html` on this branch.
- The visual style is inspired by node-editor tools like ComfyUI, but it is an original implementation.
- The project is still a prototype and should not yet be treated as a production scheduler.

## Recommended next work

- Move built-in supply-chain rules into built-in node runtime packages.
- Add dependency-aware graph scheduler.
- Add node execution trace and flow animations.
- Add plugin compatibility metadata and permissions.


## Reliability and editor improvements

- Undo/redo (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z), duplicate selection (Ctrl/Cmd+D), select all (Ctrl/Cmd+A), Shift selection and group dragging, Delete and Escape.
- Changes to fields commit on change so editing does not recreate the focused input on every keystroke.
- Scenario imports validate IDs, endpoints, timing, camera and versions before replacing the current graph. Infinity survives export/import. Autosave keeps a previous valid copy; failures appear beside scenario controls.
- Results panel includes service level (fulfilled units / demand), unmet demand, shipment cost, stockouts, inventory/demand charts, current link utilization and a captured baseline for comparison. Baselines last for the current browser session.

### Browser simulation semantics

A tick advances the day, receives due shipments, applies plugin commands, dispatches default flows, receives same-day shipments, then consumes plant demand. Link priority (lowest first) breaks allocation ties. All dispatches debit finite inventory and share per-day link and warehouse preparation capacity.

Arrival delay is link transport time plus supplier lead time, or warehouse preparation time plus warehouse delivery time. These are additive. Warehouse preparation reserves inventory immediately; preparation and transit are represented by the scheduled shipment. The legacy Python compatibility engine retains its existing queue implementation.

Supplier deliveries obey frequency and warehouse reorder points using on-hand plus incoming stock. Warehouse-to-plant replenishment targets safety stock and subtracts incoming stock. Overflow is logged and discarded. Custom material links are validated against registry ports; built-in topology restrictions still apply. Histories are bounded while cumulative KPIs remain totals.

### Verification

```bash
python -m pytest
npm ci
npm test
npx playwright install chromium
python -m http.server 8000
# In another terminal:
npm run test:browser
```

Frontend regressions run with Node's built-in test runner. The Playwright smoke test checks create, duplicate, undo/redo, stepping, reload and invalid import without browser errors. CI runs both suites.
