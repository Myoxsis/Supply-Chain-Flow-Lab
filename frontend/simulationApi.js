window.SCFL_SimulationApi = (function () {
  const DEFAULT_BASE = '/api/simulation';

  function resolveBaseUrl() {
    const stored = localStorage.getItem('supply-chain-flow-lab:api-base-url');
    if (stored) return stored;

    if (location.protocol === 'file:') {
      return 'http://localhost:5000/api/simulation';
    }

    return DEFAULT_BASE;
  }

  async function stepSimulation(payload) {
    const base = resolveBaseUrl();
    const response = await fetch(`${base}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Simulation API error: ${response.status} ${text}`);
    }

    return response.json();
  }

  return {
    resolveBaseUrl,
    stepSimulation,
  };
})();
