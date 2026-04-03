Supply Chain Flow Lab
=====================

What is included
- index.html
- styles.css
- app.js

How to run
1. Unzip the folder.
2. Open index.html in a browser.

What this draft does
- ComfyUI-inspired dark node canvas.
- Add Supplier, Warehouse, and Plant nodes.
- Add Analytics nodes that publish KPI cards from graph inputs.
- Pan canvas with middle mouse or hold Space + drag.
- Zoom with mouse wheel centered on cursor.
- Box-select nodes by dragging empty canvas space.
- Multi-select node drag with proper front-ordering.
- Create links by dragging from output port to compatible input port.
- Link preview while dragging and cancel with Escape.
- Delete selected node(s)/link(s) with Delete or Backspace.
- Duplicate selected node(s) with Ctrl/Cmd + D.
- Fit graph to viewport with F or double-click on the canvas.
- Simulate daily flows:
  - Supplier ships on its delivery frequency.
  - Warehouse stages outbound demand in a preparation queue.
  - Warehouse dispatches only after preparation time and optional per-day preparation capacity.
  - Plant consumes at its consumption rate.
- Event log and selection inspector.
- Global Python script box + per-Analytics-node Python snippets (stored in graph state for backend execution workflows).
- Scenario management:
  - Auto-saves current scenario to localStorage.
  - Import/export scenario JSON.
  - SCFL-node package manager with a ComfyUI-style `nodes/` folder view.
  - Built-in Supplier / Warehouse / Plant / Analytics are managed as core entries in `nodes/`.
  - Import/export community node definitions from either `nodes` or `folders.nodes` JSON payloads.
  - Built-in presets: Blank + Demo.
  - Versioned scenario schema with migration hooks.

Scenario JSON versioning strategy
- Current version: `6`.
- `migrateScenario()` upgrades old payloads to the latest format before import.
- Version migration rules currently include:
  - v1 → v2: adds `globalPythonCode`, `ui`, and fills missing link fields with defaults.
  - v2 → v3: normalizes UI flags (`showLinkLabels`, `allowWarehouseToWarehouse`, `allowPlantOutbound`).
  - v3 → v4: adds warehouse `preparationCapacityPerDay` (optional, defaults to unlimited).
  - v4 → v5: stores link flow type (`material` or `information`) explicitly.
  - v5 → v6: adds `nodePackage` (`SCFL-node`) for custom/community node type definitions.
- Future versions should add a new migration branch and keep previous branches intact for backward compatibility.

Keyboard shortcuts
- Delete / Backspace: delete selected node(s) or selected link.
- Ctrl/Cmd + D: duplicate selected node(s).
- F: fit graph to viewport.
- Escape: cancel active link creation.
- Space (hold) + drag: pan canvas.

State format changes
- Runtime UI state now tracks multiple selections (`selectedNodeIds` and `selectedLinkIds`) instead of a single selected node id.
- Runtime UI state now includes camera (`camera`) and node stacking (`z`) metadata for interaction rendering.
- Simulation data model for `nodes`, `links`, and `shipments` remains unchanged.

Notes
- This is a front-end prototype, not a production scheduler.
- The visual style is inspired by node-editor tools like ComfyUI, but it is an original implementation.
