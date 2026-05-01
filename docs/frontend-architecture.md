# Frontend Architecture

Supply Chain Flow Lab currently uses a single vanilla JavaScript entrypoint (`app.js`) for the full node-editor experience. This document describes the current responsibilities, the target ComfyUI-style node architecture, and a staged modularization plan that avoids a risky rewrite.

## Current frontend responsibilities

`app.js` currently owns these concerns:

- DOM element lookup and event binding
- Global runtime state
- Core node schemas and custom node package loading
- Scenario import/export and migration
- Node creation, duplication, deletion, selection, and z-order
- Canvas pan, zoom, box selection, context menu, and keyboard shortcuts
- Link creation, validation, drawing, selection, and deletion
- Field rendering and field validation
- Simulation API calls
- KPI calculation display, chart rendering, and event log rendering
- Local persistence through `localStorage`

This is acceptable for an early prototype, but it creates three maintenance risks:

1. Node behavior is mixed with canvas behavior.
2. Data schema, UI rendering, and simulation concerns are tightly coupled.
3. Adding new node types requires editing large shared areas of `app.js`.

## Target design: ComfyUI-style node management

The long-term goal is to make each node type self-describing and isolated, similar to ComfyUI's node management model.

Each node type should define:

- `type`: stable machine-readable node type key
- `label`: human-readable display name
- `category`: grouping in the node creation menu
- `inputs`: named input ports with accepted data/link types
- `outputs`: named output ports with produced data/link types
- `fields`: editable configuration fields
- `defaults`: initial field values
- `validate(config, graphContext)`: node-specific validation
- `migrate(node, fromVersion, toVersion)`: optional node-specific migration
- `runtime`: backend-facing simulation behavior identifier or mapping

The frontend should not need hard-coded logic for every node type. The node registry should answer questions such as:

- What fields should be rendered for this node?
- Which ports does this node expose?
- Which connections are valid?
- Which category should the node appear under?
- How should older node configs migrate?

## Proposed module boundaries

The app can be split incrementally into these modules:

```text
app.js
frontend/
  state.js
  nodeRegistry.js
  coreNodes.js
  validation.js
  scenarioStorage.js
  simulationApi.js
  canvasInteractions.js
  rendering.js
  charts.js
  nodePackages.js
```

### `state.js`
Owns initial state creation and runtime-only state helpers.

### `nodeRegistry.js`
Registers node definitions, resolves custom nodes, and exposes ComfyUI-style registry methods.

Suggested API:

```js
registerNodeType(definition)
registerNodePackage(packageDefinition)
getNodeDefinition(type)
getCreatableNodeTypes()
getNodeInputs(type)
getNodeOutputs(type)
validateNodeConfig(node, graphContext)
```

### `coreNodes.js`
Contains built-in node definitions:

- Material
- Supplier
- Warehouse
- Plant
- Analytics

### `validation.js`
Owns graph, node, field, and link validation.

### `scenarioStorage.js`
Owns scenario import/export, localStorage persistence, and schema migration.

### `simulationApi.js`
Owns API base URL resolution and calls to `/api/simulation/step`.

### `canvasInteractions.js`
Owns pointer, pan, zoom, box selection, keyboard shortcuts, and context menu behavior.

### `rendering.js`
Owns DOM rendering of nodes, links, panels, event log, and inspector output.

### `charts.js`
Owns KPI and analytics chart rendering.

### `nodePackages.js`
Owns import/export of SCFL-node community packages.

## Staged extraction plan

### Stage 1: Document and freeze contracts

- Keep `app.js` working as-is.
- Add this architecture document.
- Add `docs/node-contract.md` as the source of truth for node definitions.
- Avoid moving runtime logic until contracts are clear.

### Stage 2: Extract node definitions

- Move built-in node schemas into `frontend/coreNodes.js`.
- Add `frontend/nodeRegistry.js`.
- Replace direct reads of `NODE_SCHEMAS` with registry calls.
- Preserve the existing node data shape so scenarios remain compatible.

### Stage 3: Extract validation

- Move `validateNode`, `validateLink`, and graph validation helpers into `frontend/validation.js`.
- Keep validation behavior unchanged.
- Add browser-friendly smoke tests later if a frontend test runner is introduced.

### Stage 4: Extract scenario storage and migration

- Move scenario version, migration, import/export, and localStorage helpers into `frontend/scenarioStorage.js`.
- Keep scenario JSON compatibility unchanged.

### Stage 5: Extract simulation API

- Move API base URL resolution and simulation step calls into `frontend/simulationApi.js`.
- Keep the backend request payload unchanged.

### Stage 6: Extract rendering and canvas behavior

- Split rendering from interaction logic only after the registry, validation, and scenario code are stable.
- This is the riskiest stage and should be done in smaller PRs.

## Node management principles

1. Node types should be registered, not hard-coded throughout the UI.
2. Node definitions should be declarative whenever possible.
3. Node packages should be additive and removable without corrupting scenario data.
4. Node IDs and type keys must remain stable across exports/imports.
5. Runtime-only UI state should not leak into simulation data unnecessarily.
6. Existing scenario JSON should remain backward compatible.
7. Built-in nodes and community nodes should use the same registry path.

## Recommended next implementation step

Create `frontend/nodeRegistry.js` and `frontend/coreNodes.js`, then update `app.js` to use the registry while keeping the rest of the file intact. This gives the biggest maintainability improvement for ComfyUI-style node management with the least risk.
