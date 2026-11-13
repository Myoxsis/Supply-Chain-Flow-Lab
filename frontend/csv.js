window.SCFL_CSV = (() => {
  function parse(text) {
    if (text.length > 5_000_000) throw Error("CSV exceeds 5 MB.");
    const rows = [];
    let row = [],
      value = "",
      quoted = false;
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          value += '"';
          i++;
        } else if (c === '"') quoted = false;
        else value += c;
      } else if (c === '"') {
        if (value) throw Error("Invalid CSV quoting.");
        quoted = true;
      } else if (c === ",") {
        row.push(value);
        value = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(value);
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
        value = "";
      } else value += c;
    }
    if (quoted) throw Error("Unclosed CSV quote.");
    row.push(value);
    if (row.some((v) => v !== "")) rows.push(row);
    if (!rows.length) throw Error("Empty CSV.");
    const headers = rows.shift();
    if (new Set(headers).size !== headers.length)
      throw Error("Duplicate CSV headers.");
    return rows.map((values) => {
      if (values.length !== headers.length)
        throw Error("CSV columns do not match header.");
      return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    });
  }
  // Protect spreadsheet exports against formula execution in text cells.
  function encode(rows, headers) {
    const cell = (value) => {
      let v = String(value ?? "");
      if (typeof value !== "number" && /^[=+@\-\t\r]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    };
    return [headers, ...rows.map((r) => headers.map((h) => r[h]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
  }
  const numeric = [
    "x",
    "y",
    "initialInventory",
    "deliveryFrequencyDays",
    "deliveryQuantity",
    "leadTimeDays",
    "preparationTimeDays",
    "preparationCapacityPerDay",
    "deliveryToPlantDays",
    "storageCapacity",
    "reorderPoint",
    "consumptionRatePerDay",
    "safetyStock",
    "productionCapacityPerDay",
  ];
  const json = [
    "initialInventoryByMaterial",
    "recipe",
    "demandProfile",
    "demandSchedule",
  ];
  function importNodes(text, scenario) {
    const rows = parse(text),
      allowed = new Set([
        "id",
        "type",
        "name",
        "materialId",
        ...numeric,
        ...json,
      ]);
    if (!rows.length) throw Error("No nodes in CSV.");
    const nodes = rows.map((row, index) => {
      const schema = window.SCFL_NodeRegistry.get(row.type);
      if (!schema) throw Error(`Row ${index + 2}: unknown type.`);
      if (Object.keys(row).some((k) => !allowed.has(k)))
        throw Error("Unknown node CSV column.");
      const node = {};
      for (const f of schema.fields)
        node[f.key] =
          typeof f.defaultValue === "function"
            ? f.defaultValue(index + 1)
            : structuredClone(f.defaultValue);
      for (const [key, value] of Object.entries(row)) {
        if (!value) continue;
        node[key] = numeric.includes(key)
          ? Number(value)
          : json.includes(key)
            ? JSON.parse(value)
            : value;
      }
      if (!node.id) throw Error(`Row ${index + 2}: node ID required.`);
      node.x ??= 80 + index * 320;
      node.y ??= 80;
      return node;
    });
    const candidate = {
      version: 9,
      nodes,
      links: scenario.links,
      disruptions: [],
      day: 0,
      ui: scenario.ui,
    };
    const result = window.SCFL_ScenarioStorage.importScenario(candidate);
    if (!result.ok) throw Error(result.error);
    return result.scenario;
  }
  function importDemand(text, scenario) {
    const rows = parse(text),
      next = window.SCFL_ScenarioStorage.parse(
        window.SCFL_ScenarioStorage.serialize(scenario),
      );
    const schedules = new Map();
    for (const row of rows) {
      const node = next.nodes.find(
        (n) => n.id === row.nodeId && n.type === "plant",
      );
      if (!node) throw Error(`Unknown plant ${row.nodeId}.`);
      if (!schedules.has(node.id)) schedules.set(node.id, []);
      schedules
        .get(node.id)
        .push({ day: Number(row.day), quantity: Number(row.quantity) });
    }
    for (const n of next.nodes)
      if (schedules.has(n.id)) n.demandSchedule = schedules.get(n.id);
    const errors = window.SCFL_ModelValidation.errors(next);
    if (errors.length) throw Error(errors.join(" "));
    return next;
  }
  function nodes(scenario) {
    const headers = ["id", "type", "name", "materialId", ...numeric, ...json];
    return encode(
      scenario.nodes.map((n) =>
        Object.fromEntries(
          headers.map((h) => [
            h,
            json.includes(h) ? JSON.stringify(n[h] ?? null) : n[h],
          ]),
        ),
      ),
      headers,
    );
  }
  function results(rows) {
    return encode(
      rows.map((r) => ({ name: r.name, days: r.days, ...r.kpis })),
      [
        "name",
        "days",
        "serviceLevel",
        "unmetDemand",
        "transportCost",
        "totalShippedVolume",
        "stockoutCount",
        "produced",
        "discarded",
      ],
    );
  }
  return { parse, encode, importNodes, importDemand, nodes, results };
})();
