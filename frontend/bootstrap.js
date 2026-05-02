window.SCFL_Bootstrap = (function () {
  function requireNamespace(name) {
    const namespace = window[name];
    if (!namespace) {
      throw new Error(`Missing frontend namespace: ${name}`);
    }
    return namespace;
  }

  function collectNamespaces() {
    return {
      state: window.SCFL_State ?? null,
      simulationApi: window.SCFL_SimulationApi ?? null,
      scenarioStorage: window.SCFL_ScenarioStorage ?? null,
      validation: window.SCFL_Validation ?? null,
      rendering: window.SCFL_Rendering ?? null,
      canvasInteractions: window.SCFL_CanvasInteractions ?? null,
      charts: window.SCFL_Charts ?? null,
      nodePackages: window.SCFL_NodePackages ?? null,
      nodeRegistry: window.SCFL_NodeRegistry ?? null,
    };
  }

  function assertPhaseOneModulesLoaded() {
    return [
      'SCFL_State',
      'SCFL_SimulationApi',
      'SCFL_ScenarioStorage',
      'SCFL_Validation',
      'SCFL_Rendering',
      'SCFL_CanvasInteractions',
      'SCFL_Charts',
      'SCFL_NodePackages',
      'SCFL_NodeRegistry',
    ].map(requireNamespace);
  }

  return {
    collectNamespaces,
    assertPhaseOneModulesLoaded,
  };
})();
