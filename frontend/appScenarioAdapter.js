window.SCFL_AppScenarioAdapter = (function () {
  const nativeSetItem = localStorage.setItem.bind(localStorage);
  const nativeGetItem = localStorage.getItem.bind(localStorage);

  const KEY = window.SCFL_ScenarioStorage?.STORAGE_KEY;

  function setItem(key, value) {
    if (key === KEY) {
      try {
        const parsed = JSON.parse(value);
        window.SCFL_ScenarioStorage.save(parsed);
        return;
      } catch {
        // fallback
      }
    }
    return nativeSetItem(key, value);
  }

  function getItem(key) {
    if (key === KEY) {
      const scenario = window.SCFL_ScenarioStorage.load();
      return scenario ? JSON.stringify(scenario) : null;
    }
    return nativeGetItem(key);
  }

  function install() {
    localStorage.setItem = setItem;
    localStorage.getItem = getItem;
  }

  function uninstall() {
    localStorage.setItem = nativeSetItem;
    localStorage.getItem = nativeGetItem;
  }

  return {
    install,
    uninstall,
  };
})();

window.SCFL_AppScenarioAdapter.install();
