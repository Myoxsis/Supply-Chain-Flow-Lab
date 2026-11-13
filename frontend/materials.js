// The material ledger is authoritative. `inventory` is a compatibility total.
window.SCFL_Materials = (() => {
  const DEFAULT = "default";
  const sum = (map) => Object.values(map).reduce((a, b) => a + b, 0);
  function initialize(node) {
    if (!node.inventoryByMaterial) {
      const initial = node.initialInventoryByMaterial;
      node.inventoryByMaterial =
        initial && Object.keys(initial).length
          ? { ...initial }
          : {
              [node.materialId || DEFAULT]:
                node.inventory ??
                (node.type === "supplier" && node.initialInventory == null
                  ? Infinity
                  : (node.initialInventory ?? 0)),
            };
    }
    sync(node);
  }
  function sync(node) {
    node.inventory = sum(node.inventoryByMaterial ?? {});
  }
  function get(node, material = DEFAULT) {
    initialize(node);
    return node.inventoryByMaterial[material] ?? 0;
  }
  function add(node, material, quantity) {
    const current = get(node, material);
    node.inventoryByMaterial[material] =
      current === Infinity ? Infinity : current + quantity;
    sync(node);
  }
  function reset(node) {
    delete node.inventoryByMaterial;
    node.inventory =
      node.type === "supplier" && node.initialInventory == null
        ? Infinity
        : (node.initialInventory ?? 0);
    initialize(node);
    node.received = node.shipped = node.stockouts = node.produced = 0;
    node.preparationQueue = [];
    node.preparingShipments = [];
  }
  return { DEFAULT, initialize, sync, get, add, reset, sum };
})();
