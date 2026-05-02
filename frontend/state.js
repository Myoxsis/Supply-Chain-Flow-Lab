window.SCFL_State = (function () {
  const VERSION = 1;

  function createEmptyState() {
    return {
      version: VERSION,
      nodes: [],
      links: [],
      shipments: [],
      deliveryStats: {},
      shipmentsByDay: [],
      shipmentsByDayBySourceNode: {},
      stockoutEvents: [],
      inventoryHistoryByNode: {},
      transitHistory: [],
      ui: {
        selectedNodeIds: [],
        selectedLinkIds: [],
        camera: { x: 0, y: 0, zoom: 1 },
      },
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function isValidStateShape(state) {
    return !!state && Array.isArray(state.nodes) && Array.isArray(state.links);
  }

  return {
    VERSION,
    createEmptyState,
    cloneState,
    isValidStateShape,
  };
})();
