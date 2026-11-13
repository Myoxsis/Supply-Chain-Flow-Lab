window.SCFL_Experiments = (() => {
  const KEY = "supply-chain-flow-lab:experiments:v1";
  const clone = (value) =>
    window.SCFL_ScenarioStorage.parse(
      window.SCFL_ScenarioStorage.serialize(value),
    );
  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        variants: Array.isArray(data.variants)
          ? data.variants.slice(0, 12)
          : [],
        results: Array.isArray(data.results) ? data.results.slice(0, 12) : [],
        baseline: data.baseline ?? null,
      };
    } catch {
      return { variants: [], results: [], baseline: null };
    }
  }
  let saved = read(),
    active = null;
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
      return { ok: true };
    } catch {
      return {
        ok: false,
        error:
          "Comparison storage is full or unavailable. Export your results.",
      };
    }
  }
  // Scenarios may contain unlimited suppliers; use the same serializer as scenarios.
  function capture(name, scenario) {
    if (active)
      return {
        ok: false,
        error: "Cancel the running experiment before changing variants.",
      };
    const errors = window.SCFL_ModelValidation.errors(scenario);
    if (errors.length) return { ok: false, error: errors.join(" ") };
    const variant = {
      id: `variant-${Date.now()}-${saved.variants.length}`,
      name: String(name || `Variant ${saved.variants.length + 1}`).slice(0, 80),
      scenario: window.SCFL_ScenarioStorage.serialize(scenario),
    };
    if (saved.variants.length >= 12)
      return {
        ok: false,
        error: "Keep at most 12 variants; remove one first.",
      };
    saved.variants.push(variant);
    saved.results = [];
    return persist();
  }
  function remove(id) {
    if (active)
      return {
        ok: false,
        error: "Cancel the running experiment before changing variants.",
      };
    saved.variants = saved.variants.filter((v) => v.id !== id);
    saved.results = [];
    return persist();
  }
  function baseline(state) {
    saved.baseline = { day: state.day, kpis: { ...state.kpis } };
    return persist();
  }
  async function calculate(
    variants,
    days,
    {
      progress = () => {},
      cancelled = () => false,
      yieldControl = () => Promise.resolve(),
    } = {},
  ) {
    if (!Number.isInteger(days) || days < 1 || days > 365)
      throw Error("Horizon must be 1–365 days.");
    if (!Array.isArray(variants) || !variants.length || variants.length > 12)
      throw Error("Capture 1–12 variants first.");
    const results = [];
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i],
        state =
          typeof variant.scenario === "string"
            ? window.SCFL_ScenarioStorage.parse(variant.scenario)
            : clone(variant.scenario);
      const imported = window.SCFL_ScenarioStorage.importScenario(state);
      if (!imported.ok) throw Error(`${variant.name}: ${imported.error}`);
      window.SCFL_SimulationEngine.reset(state);
      for (let day = 0; day < days; day++) {
        if (cancelled()) throw Error("Experiment cancelled.");
        window.SCFL_SimulationEngine.step(state);
        if (day % 10 === 0 || day === days - 1) {
          progress({
            completed: i * days + day + 1,
            total: days * variants.length,
          });
          await yieldControl();
        }
      }
      results.push({
        id: variant.id,
        name: variant.name,
        days,
        kpis: { ...state.kpis },
        totals: { ...state.totals },
        createdAt: new Date().toISOString(),
      });
    }
    return results;
  }
  function run(days, progress = () => {}) {
    if (active)
      return Promise.reject(Error("An experiment is already running."));
    const variants = clone(saved.variants),
      packages = window.SCFL_NodeRegistry.getAll().filter(
        (d) => d.source === "package",
      );
    return new Promise((resolve, reject) => {
      const job = { cancelled: false, worker: null, reject };
      active = job;
      const finish = (error, results) => {
        if (active !== job) return;
        job.worker?.terminate();
        active = null;
        if (error) reject(error);
        else {
          saved.results = results;
          const result = persist();
          resolve({ results, warning: result.ok ? "" : result.error });
        }
      };
      const fallback = () => {
        job.worker?.terminate();
        job.worker = null;
        calculate(variants, days, {
          progress,
          cancelled: () => job.cancelled,
          yieldControl: () => new Promise((r) => setTimeout(r, 0)),
        }).then(
          (results) => finish(null, results),
          (error) => finish(error),
        );
      };
      try {
        if (typeof Worker === "undefined" || location.protocol === "file:") {
          fallback();
          return;
        }
        job.worker = new Worker("frontend/simulationWorker.js");
        job.worker.onmessage = (event) => {
          if (event.data.progress) progress(event.data.progress);
          else if (event.data.error) finish(Error(event.data.error));
          else finish(null, event.data.results);
        };
        job.worker.onerror = (event) => {
          event.preventDefault();
          fallback();
        };
        job.worker.postMessage({ variants, days, packages });
      } catch {
        fallback();
      }
    });
  }
  function cancel() {
    if (active) {
      const job = active;
      job.cancelled = true;
      job.worker?.terminate();
      active = null;
      job.reject(Error("Experiment cancelled."));
    }
  }
  return {
    read: () => clone(saved),
    capture,
    remove,
    baseline,
    calculate,
    run,
    cancel,
  };
})();
