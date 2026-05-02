window.SCFL_PluginRuntime = (function () {
  const compiledHandlers = new Map();

  function getHandlerKey(nodeType, hookName) {
    return `${nodeType}:${hookName}`;
  }

  function compileHandler(nodeDefinition, hookName) {
    const source = nodeDefinition?.runtime?.[hookName];
    if (!source || typeof source !== 'string') return null;

    const key = getHandlerKey(nodeDefinition.type, hookName);
    if (compiledHandlers.has(key)) return compiledHandlers.get(key);

    try {
      const factory = new Function(`return (${source});`);
      const handler = factory();
      if (typeof handler !== 'function') {
        throw new Error(`${hookName} must evaluate to a function.`);
      }
      compiledHandlers.set(key, handler);
      return handler;
    } catch (error) {
      console.warn(`Failed to compile plugin handler ${key}:`, error);
      compiledHandlers.set(key, null);
      return null;
    }
  }

  function createRuntimeState(appState) {
    return {
      inventory: Object.fromEntries(appState.nodes.map((node) => [node.id, node.inventory ?? 0])),
      emitted: [],
      logs: [],
    };
  }

  function createContext(appState, runtimeState, node, nodeDefinition) {
    return {
      node,
      nodeDefinition,
      appState,
      state: runtimeState,
      day: appState.day,
      emit(event) {
        runtimeState.emitted.push({
          day: appState.day,
          nodeId: node.id,
          nodeType: node.type,
          ...event,
        });
      },
      log(message) {
        runtimeState.logs.push({
          day: appState.day,
          nodeId: node.id,
          message: String(message),
        });
      },
      getInputs(type = null) {
        return appState.links
          .filter((link) => link.to === node.id && (type == null || link.linkType === type))
          .map((link) => ({ link, node: appState.nodes.find((item) => item.id === link.from) }))
          .filter((entry) => entry.node);
      },
      getOutputs(type = null) {
        return appState.links
          .filter((link) => link.from === node.id && (type == null || link.linkType === type))
          .map((link) => ({ link, node: appState.nodes.find((item) => item.id === link.to) }))
          .filter((entry) => entry.node);
      },
    };
  }

  function applyRuntimeState(appState, runtimeState) {
    appState.nodes.forEach((node) => {
      if (Object.prototype.hasOwnProperty.call(runtimeState.inventory, node.id)) {
        node.inventory = runtimeState.inventory[node.id];
      }
    });

    appState.pluginEvents = [
      ...(appState.pluginEvents ?? []),
      ...runtimeState.emitted,
    ].slice(-500);

    appState.pluginLogs = [
      ...(appState.pluginLogs ?? []),
      ...runtimeState.logs,
    ].slice(-500);
  }

  function runHook(appState, hookName = 'onTick') {
    const runtimeState = createRuntimeState(appState);
    const errors = [];

    appState.nodes.forEach((node) => {
      const nodeDefinition = window.SCFL_NodeRegistry.get(node.type);
      const handler = compileHandler(nodeDefinition, hookName);
      if (!handler) return;

      try {
        handler(createContext(appState, runtimeState, node, nodeDefinition));
      } catch (error) {
        errors.push({ nodeId: node.id, nodeType: node.type, hookName, message: error.message });
      }
    });

    applyRuntimeState(appState, runtimeState);
    return {
      ok: errors.length === 0,
      errors,
      emitted: runtimeState.emitted,
      logs: runtimeState.logs,
    };
  }

  function clearCompiledHandlers() {
    compiledHandlers.clear();
  }

  return {
    compileHandler,
    runHook,
    clearCompiledHandlers,
  };
})();
