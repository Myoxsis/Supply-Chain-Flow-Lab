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
  - Warehouse dispatches with preparation + delivery lead time.
  - Plant consumes at its consumption rate.
- Event log and selection inspector.

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
