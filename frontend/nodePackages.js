window.SCFL_NodePackages = (function () {
  function importPackage(json) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      window.SCFL_NodeRegistry.registerPackage(parsed);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function exportPackage(nodes) {
    return JSON.stringify({ nodes }, null, 2);
  }

  return {
    importPackage,
    exportPackage,
  };
})();
