window.SCFL_ScenarioStorage = (function () {
  const STORAGE_KEY = 'supply-chain-flow-lab:scenario';
  const SCENARIO_VERSION = 7;

  function serialize(scenario) {
    return JSON.stringify(scenario, null, 2);
  }

  function parse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  }

  function load() {
    return parse(localStorage.getItem(STORAGE_KEY));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function exportScenario(state) {
    return serialize({
      version: SCENARIO_VERSION,
      exportedAt: new Date().toISOString(),
      ...state,
    });
  }

  function importScenario(raw) {
    const parsed = typeof raw === 'string' ? parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Scenario JSON must be an object.' };
    }
    if (!Array.isArray(parsed.nodes)) {
      return { ok: false, error: 'Scenario must include a nodes array.' };
    }
    if (!Array.isArray(parsed.links)) {
      return { ok: false, error: 'Scenario must include a links array.' };
    }
    return { ok: true, scenario: parsed };
  }

  return {
    STORAGE_KEY,
    SCENARIO_VERSION,
    serialize,
    parse,
    save,
    load,
    clear,
    exportScenario,
    importScenario,
  };
})();
