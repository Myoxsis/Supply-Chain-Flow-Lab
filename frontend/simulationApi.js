window.SCFL_SimulationApi = (function () {
  const DEFAULT_BASE = '/api/simulation';
  const API_BASE_OVERRIDE_KEY = 'supply-chain-flow-lab:api-base-url';
  const FALLBACK_FILE_API_ORIGIN = 'http://localhost:5000';

  function normalizeBaseUrl(value) {
    return String(value ?? '').trim().replace(/\/+$/, '');
  }

  function resolveBaseUrl() {
    const stored = normalizeBaseUrl(localStorage.getItem(API_BASE_OVERRIDE_KEY));
    if (stored) return `${stored}/api/simulation`;

    if (location.protocol === 'file:') {
      return `${FALLBACK_FILE_API_ORIGIN}/api/simulation`;
    }

    return DEFAULT_BASE;
  }

  async function requestJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responsePayload = await response.json().catch(async () => ({
      error: await response.text().catch(() => 'Unknown API error'),
    }));

    if (!response.ok) {
      const details = Array.isArray(responsePayload.details)
        ? ` ${responsePayload.details.join('; ')}`
        : '';
      throw new Error(`${responsePayload.error || 'Simulation API error'}${details}`);
    }

    return responsePayload;
  }

  async function stepSimulation(payload) {
    return requestJson(`${resolveBaseUrl()}/step`, payload);
  }

  return {
    API_BASE_OVERRIDE_KEY,
    FALLBACK_FILE_API_ORIGIN,
    normalizeBaseUrl,
    resolveBaseUrl,
    requestJson,
    stepSimulation,
  };
})();
