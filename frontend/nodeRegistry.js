window.SCFL_NodeRegistry = (function () {
  const registry = new Map();

  function normalizeDefinition(def) {
    if (!def?.type) throw new Error('Node definition must have type');
    return {
      category: 'Custom',
      inputs: [],
      outputs: ['information'],
      fields: [],
      ...def,
    };
  }

  function register(def) {
    const normalized = normalizeDefinition(def);
    registry.set(normalized.type, normalized);
    return normalized;
  }

  function registerCore(coreDefs) {
    Object.values(coreDefs).forEach(register);
  }

  function registerPackage(packageDefinition) {
    const customNodes = packageDefinition?.customNodes ?? [];
    customNodes
      .filter((node) => node?.enabled !== false)
      .forEach((node) => {
        const schema = node.schema ?? node;
        register({
          type: node.type ?? schema.type,
          label: schema.label ?? node.label ?? node.type,
          category: schema.category ?? 'Community',
          inputs: schema.inputs ?? [],
          outputs: schema.outputs ?? ['information'],
          fields: schema.fields ?? [],
          packageName: packageDefinition?.name ?? 'SCFL-node',
          source: 'package',
        });
      });
  }

  function unregister(type) {
    registry.delete(type);
  }

  function get(type) {
    return registry.get(type) || null;
  }

  function require(type) {
    const definition = get(type);
    if (!definition) throw new Error(`Unknown node type: ${type}`);
    return definition;
  }

  function getAll() {
    return Array.from(registry.values());
  }

  function getTypes() {
    return Array.from(registry.keys());
  }

  function clearPackageNodes() {
    for (const [type, definition] of registry.entries()) {
      if (definition.source === 'package') registry.delete(type);
    }
  }

  return {
    register,
    registerCore,
    registerPackage,
    unregister,
    get,
    require,
    getAll,
    getTypes,
    clearPackageNodes,
  };
})();

if (window.SCFL_CORE_NODE_DEFINITIONS) {
  window.SCFL_NodeRegistry.registerCore(window.SCFL_CORE_NODE_DEFINITIONS);
}
