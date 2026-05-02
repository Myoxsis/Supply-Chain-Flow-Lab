window.SCFL_ScenarioStorage = (function () {
  const STORAGE_KEY = 'supply-chain-flow-lab:scenario';

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    STORAGE_KEY,
    save,
    load,
    clear,
  };
})();
