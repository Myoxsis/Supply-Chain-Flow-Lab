window.SCFL_AppApiAdapter = (function () {
  const nativeFetch = window.fetch.bind(window);

  function isSimulationStepRequest(input) {
    const url = typeof input === 'string' ? input : input?.url;
    if (!url) return false;

    return url === '/api/simulation/step'
      || url.endsWith('/api/simulation/step')
      || url.endsWith('/api/simulation/step/');
  }

  async function parsePayload(init) {
    if (!init?.body) return null;

    if (typeof init.body === 'string') {
      return JSON.parse(init.body);
    }

    return init.body;
  }

  function responseFromJson(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function adaptedFetch(input, init) {
    if (!isSimulationStepRequest(input)) {
      return nativeFetch(input, init);
    }

    try {
      const payload = await parsePayload(init);
      const result = await window.SCFL_SimulationApi.stepSimulation(payload);
      return responseFromJson(result, 200);
    } catch (error) {
      return responseFromJson({ error: error.message || 'Simulation API error' }, 500);
    }
  }

  function install() {
    if (window.fetch === adaptedFetch) return;
    window.fetch = adaptedFetch;
  }

  function uninstall() {
    window.fetch = nativeFetch;
  }

  return {
    install,
    uninstall,
    isSimulationStepRequest,
  };
})();

window.SCFL_AppApiAdapter.install();
