window.SCFL_ScenarioStorage = (() => {
  const STORAGE_KEY = "supply-chain-flow-lab:scenario",
    SCENARIO_VERSION = 9;
  let lastError = "";
  const serialize = (value) =>
    JSON.stringify(value, (_k, v) => (v === Infinity ? "__Infinity__" : v), 2);
  function parse(raw) {
    try {
      return JSON.parse(raw, (_k, v) => (v === "__Infinity__" ? Infinity : v));
    } catch {
      return null;
    }
  }
  function importScenario(raw) {
    const value = typeof raw === "string" ? parse(raw) : raw;
    const fail = (error) => ({ ok: false, error });
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fail("Scenario must be an object.");
    if (!Array.isArray(value.nodes) || !Array.isArray(value.links))
      return fail("Scenario needs nodes and links arrays.");
    if (
      !Number.isInteger(value.version ?? 1) ||
      (value.version ?? 1) < 1 ||
      value.version > SCENARIO_VERSION
    )
      return fail("Unsupported scenario version.");
    if (value.nodes.length > 5000 || value.links.length > 20000)
      return fail("Scenario exceeds size limits.");
    const ids = new Set(),
      links = new Set();
    for (const node of value.nodes) {
      if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id))
        return fail("Missing or duplicate node ID.");
      if (!window.SCFL_NodeRegistry.get(node.type))
        return fail(`Install the package for node type: ${node.type}.`);
      if (
        ![
          node.x ?? node.position?.x ?? 0,
          node.y ?? node.position?.y ?? 0,
        ].every(Number.isFinite)
      )
        return fail("Node coordinates must be finite.");
      for (const field of window.SCFL_NodeRegistry.get(node.type).fields) {
        const value = node[field.key];
        if (
          value != null &&
          ["int", "number"].includes(field.type) &&
          (!Number.isFinite(value) ||
            (field.type === "int" && !Number.isInteger(value)) ||
            (field.min != null && value < field.min))
        )
          return fail(`${node.id}: invalid ${field.key}.`);
      }
      ids.add(node.id);
    }
    for (const link of value.links) {
      if (
        !link ||
        typeof link.id !== "string" ||
        links.has(link.id) ||
        !ids.has(link.from) ||
        !ids.has(link.to)
      )
        return fail("Invalid link ID or endpoint.");
      if (
        !Number.isInteger(link.transportDelayDays) ||
        link.transportDelayDays < 0 ||
        !Number.isFinite(link.maxDailyCapacity) ||
        link.maxDailyCapacity < 1
      )
        return fail("Invalid link delay or capacity.");
      links.add(link.id);
    }
    if (
      value.camera &&
      (![value.camera.x, value.camera.y, value.camera.zoom].every(
        Number.isFinite,
      ) ||
        value.camera.zoom <= 0)
    )
      return fail("Invalid camera.");
    if (!Number.isInteger(value.day ?? 0) || (value.day ?? 0) < 0)
      return fail("Invalid simulation day.");
    if (
      value.shipments != null &&
      (!Array.isArray(value.shipments) ||
        value.shipments.some(
          (s) =>
            !s ||
            !ids.has(s.from) ||
            !ids.has(s.to) ||
            !Number.isFinite(s.qty) ||
            s.qty <= 0 ||
            !Number.isFinite(s.arrivalDay),
        ))
    )
      return fail("Invalid shipment.");
    const modelErrors = window.SCFL_ModelValidation?.errors(value) ?? [];
    if (modelErrors.length) return fail(modelErrors.join(" "));
    // Existing graphs keep a single default material; labels are never guessed as IDs.
    // v8 shipments already include preparation time in arrivalDay: preserve in-flight dates.
    return {
      ok: true,
      scenario: {
        ...value,
        version: SCENARIO_VERSION,
        shipments: value.shipments ?? [],
        ui: value.ui ?? {},
      },
    };
  }
  function save(state) {
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous && importScenario(previous).ok)
        localStorage.setItem(STORAGE_KEY + ":backup", previous);
      localStorage.setItem(STORAGE_KEY, serialize(state));
      lastError = "";
      return { ok: true };
    } catch {
      lastError = "Autosave unavailable. Export JSON to keep your work.";
      return { ok: false, error: lastError };
    }
  }
  function load() {
    try {
      for (const key of [STORAGE_KEY, STORAGE_KEY + ":backup"]) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const result = importScenario(raw);
        if (result.ok) return result.scenario;
        lastError = result.error;
      }
    } catch {
      lastError = "Browser storage unavailable.";
    }
    return null;
  }
  return {
    STORAGE_KEY,
    SCENARIO_VERSION,
    serialize,
    parse,
    importScenario,
    save,
    load,
    get lastError() {
      return lastError;
    },
    clear() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    },
    exportScenario(state) {
      return serialize({
        ...state,
        version: SCENARIO_VERSION,
        exportedAt: new Date().toISOString(),
      });
    },
  };
})();
