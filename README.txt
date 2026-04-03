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
- Drag nodes on the canvas.
- Create links by clicking an output port, then an input port.
- Simulate daily flows:
  - Supplier ships on its delivery frequency.
  - Warehouse dispatches with preparation + delivery lead time.
  - Plant consumes at its consumption rate.
- Event log and selected-node inspector.

Notes
- This is a front-end prototype, not a production scheduler.
- The visual style is inspired by node-editor tools like ComfyUI, but it is an original implementation.
