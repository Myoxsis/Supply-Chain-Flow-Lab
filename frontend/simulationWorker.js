// Long runs use the same deterministic engine as single-day stepping.
self.window = self;
importScripts(
  "coreNodes.js",
  "nodeRegistry.js",
  "materials.js",
  "modelValidation.js",
  "scenarioStorage.js",
  "validation.js",
  "pluginRuntime.js",
  "simulationEngine.js",
  "experiments.js",
);
self.onmessage = async (event) => {
  try {
    for (const definition of event.data.packages ?? [])
      self.SCFL_NodeRegistry.register(definition);
    const results = await self.SCFL_Experiments.calculate(
      event.data.variants,
      event.data.days,
      { progress: (progress) => self.postMessage({ progress }) },
    );
    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
