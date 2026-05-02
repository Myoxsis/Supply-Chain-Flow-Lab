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
- Browser-side plugin-driven simulation engine.
- Import/export scenario JSON.
- Import/export SCFL-node packages.
- Runtime plugin hooks through `runtime.onTick`.
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
        "onTick": "function (ctx) { ctx.emit({ type: 'demand', value: ctx.node.dailyDemand }); }"
      }
    }
  ]
}
```

An example package is available at:

```text
frontend/plugins/example-package.json
```

## Plugin runtime context

A plugin `onTick` function receives a context object:

```js
function (ctx) {
  ctx.log('Running custom node');
  ctx.emit({ type: 'event', value: 1 });
}
```

Available context fields and helpers:

```text
ctx.node              current node
ctx.nodeDefinition    registry definition
ctx.appState          full app state
ctx.state             isolated mutable runtime state
ctx.day               current simulation day
ctx.emit(event)       emit event or shipment request
ctx.log(message)      write plugin log message
ctx.getInputs(type)   read upstream graph connections
ctx.getOutputs(type)  read downstream graph connections
```

To create a shipment from a plugin, emit:

```js
ctx.emit({
  type: 'shipment',
  from: ctx.node.id,
  to: 'target-node-id',
  quantity: 25,
  delayDays: 2
});
```

## Security note

Plugin runtime code is currently compiled from imported package JSON. This is powerful but should be treated as trusted-code execution.

Do not import untrusted plugins in production deployments until plugin execution is sandboxed, for example through a Web Worker or a restricted DSL.

## Scenario JSON versioning

Current scenario version: `7`.

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

- Add automated browser smoke tests.
- Sandbox plugin runtime execution.
- Move built-in supply-chain rules into built-in node runtime packages.
- Add dependency-aware graph scheduler.
- Add node execution trace and flow animations.
- Add plugin compatibility metadata and permissions.
