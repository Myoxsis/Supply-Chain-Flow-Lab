window.SCFL_NodeRegistry = (function () {
  const registry = new Map();

  function register(def) {
    if (!def?.type) throw new Error('Node definition must have type');
    registry.set(def.type, def);
  }

  function registerCore(coreDefs) {
    Object.values(coreDefs).forEach(register);
  }

  function get(type) {
    return registry.get(type) || null;
  }

  function getAll() {
    return Array.from(registry.values());
  }

  function getTypes() {
    return Array.from(registry.keys());
  }

  return {
    register,
    registerCore,
    get,
    getAll,
    getTypes,
  };
})();

// Bootstrap core nodes
if (window.SCFL_CORE_NODE_DEFINITIONS) {
  window.SCFL_NodeRegistry.registerCore(window.SCFL_CORE_NODE_DEFINITIONS);
}
