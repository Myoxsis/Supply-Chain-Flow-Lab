# Node Contract (ComfyUI-style)

This document defines how nodes should be structured and managed in Supply Chain Flow Lab.

## Node definition shape

```js
{
  type: "warehouse",
  label: "Warehouse",
  category: "Logistics",

  inputs: [
    { name: "inbound", type: "material" }
  ],

  outputs: [
    { name: "outbound", type: "material" }
  ],

  fields: [
    { key: "storageCapacity", type: "number", label: "Storage Capacity" },
    { key: "preparationTimeDays", type: "number", label: "Prep Time (days)" }
  ],

  defaults: {
    storageCapacity: 500,
    preparationTimeDays: 1
  },

  validate(config, graph) {
    const errors = [];
    if (config.storageCapacity < 0) {
      errors.push("Storage capacity must be >= 0");
    }
    return errors;
  }
}
```

## Key ideas

- Nodes are **data-driven**, not hard-coded UI logic.
- The registry is the single source of truth.
- UI renders based on node definition.
- Validation is delegated to node definition.

## Benefits

- Add new node types without touching core UI
- Import/export community node packages safely
- Aligns with ComfyUI extensibility model

## Migration strategy

- Existing nodes continue to work
- Registry wraps current schema
- Gradually replace hard-coded logic
