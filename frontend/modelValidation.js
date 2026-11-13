window.SCFL_ModelValidation = (() => {
  const record = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  const nonnegative = (value) => Number.isFinite(value) && value >= 0;
  const safeId = (key) =>
    typeof key === "string" &&
    key.length > 0 &&
    !["__proto__", "constructor", "prototype"].includes(key);
  function errors(scenario) {
    const runtimeErrors = [];
    if (scenario.trace != null && !Array.isArray(scenario.trace))
      runtimeErrors.push("Invalid trace history.");
    if (
      scenario.sequence != null &&
      (!Number.isSafeInteger(scenario.sequence) || scenario.sequence < 0)
    )
      runtimeErrors.push("Invalid event sequence.");
    if (
      scenario.totals != null &&
      (!record(scenario.totals) ||
        Object.values(scenario.totals).some((v) => !nonnegative(v)))
    )
      runtimeErrors.push("Invalid cumulative totals.");
    const errors = [...runtimeErrors],
      nodes = new Map(scenario.nodes.map((n) => [n.id, n])),
      links = new Map(scenario.links.map((l) => [l.id, l]));
    const materials = new Set([
      "default",
      ...scenario.nodes.filter((n) => n.type === "material").map((n) => n.id),
    ]);
    function inventory(map, label, unlimited = false) {
      if (
        !record(map) ||
        Object.entries(map).some(
          ([key, value]) =>
            !safeId(key) ||
            !materials.has(key) ||
            !(nonnegative(value) || (unlimited && value === Infinity)),
        )
      )
        errors.push(
          `${label}: use known material IDs and nonnegative quantities.`,
        );
    }
    for (const node of scenario.nodes) {
      if (!safeId(node.id)) errors.push("Reserved or invalid node ID.");
      if (
        node.storageCapacity != null &&
        node.initialInventoryByMaterial &&
        Object.values(node.initialInventoryByMaterial).reduce(
          (a, b) => a + b,
          0,
        ) > node.storageCapacity
      )
        errors.push(
          `${node.id}: initial material stock exceeds storage capacity.`,
        );
      if (node.materialId && !materials.has(node.materialId))
        errors.push(`${node.id}: unknown material.`);
      if (node.initialInventoryByMaterial != null)
        inventory(node.initialInventoryByMaterial, `${node.id} initial stock`);
      if (node.inventoryByMaterial != null)
        inventory(
          node.inventoryByMaterial,
          `${node.id} stock`,
          node.type === "supplier",
        );
      if (
        node.productionCapacityPerDay != null &&
        !nonnegative(node.productionCapacityPerDay)
      )
        errors.push(`${node.id}: invalid production capacity.`);
      if (node.recipe != null) {
        const r = node.recipe;
        if (
          !record(r) ||
          !record(r.inputs) ||
          !Object.keys(r.inputs).length ||
          Object.entries(r.inputs).some(
            ([key, v]) => !materials.has(key) || !Number.isFinite(v) || v <= 0,
          ) ||
          !materials.has(r.outputMaterialId) ||
          !Number.isFinite(r.outputQuantity) ||
          r.outputQuantity <= 0 ||
          r.inputs[r.outputMaterialId] != null
        )
          errors.push(
            `${node.id}: recipe needs positive inputs and a different, known output material.`,
          );
        if (node.type !== "plant")
          errors.push(`${node.id}: only plants support recipes.`);
        if (r.outputMaterialId !== (node.materialId || "default"))
          errors.push(
            `${node.id}: recipe output must match the plant demand material.`,
          );
      }
      for (const key of ["demandProfile", "demandSchedule"]) {
        if (
          node[key] != null &&
          (!Array.isArray(node[key]) || node[key].length > 1000)
        ) {
          errors.push(`${node.id}: invalid ${key}.`);
          continue;
        }
        for (const row of node[key] ?? []) {
          if (
            !record(row) ||
            (key === "demandProfile"
              ? !Number.isInteger(row.startDay) ||
                row.startDay < 1 ||
                !Number.isInteger(row.endDay) ||
                row.endDay < row.startDay ||
                !nonnegative(row.multiplier)
              : !Number.isInteger(row.day) ||
                row.day < 1 ||
                !nonnegative(row.quantity))
          )
            errors.push(`${node.id}: invalid ${key} row.`);
        }
        if (
          key === "demandSchedule" &&
          new Set((node[key] ?? []).map((row) => row?.day)).size !==
            (node[key] ?? []).length
        )
          errors.push(`${node.id}: duplicate demand day.`);
      }
      for (const key of ["preparationQueue", "preparingShipments"]) {
        if (node[key] != null && !Array.isArray(node[key])) {
          errors.push(`${node.id}: invalid queue.`);
          continue;
        }
        for (const item of node[key] ?? []) {
          const link = links.get(item?.linkId);
          if (
            !item ||
            !link ||
            link.from !== node.id ||
            link.to !== item.to ||
            !materials.has(item.materialId || "default") ||
            !Number.isFinite(item.qty) ||
            item.qty <= 0 ||
            !Number.isInteger(item.requestDay) ||
            item.requestDay < 0 ||
            (key === "preparingShipments" &&
              (!Number.isInteger(item.readyDay) || item.readyDay < 0))
          )
            errors.push(`${node.id}: invalid preparation record.`);
        }
      }
    }
    for (const link of scenario.links) {
      if (link.materialId && !materials.has(link.materialId))
        errors.push(`${link.id}: unknown material.`);
      if (!Number.isInteger(link.priority ?? 1) || (link.priority ?? 1) < 1)
        errors.push(`${link.id}: priority must be a positive integer.`);
      if (link.costPerShipment != null && !nonnegative(link.costPerShipment))
        errors.push(`${link.id}: invalid shipment cost.`);
    }
    if (
      scenario.disruptions != null &&
      (!Array.isArray(scenario.disruptions) ||
        scenario.disruptions.length > 1000)
    )
      errors.push("Invalid disruptions list.");
    else
      for (const e of scenario.disruptions ?? []) {
        if (
          !record(e) ||
          !["outage", "capacity", "delay"].includes(e.kind) ||
          !(nodes.has(e.targetId) || links.has(e.targetId)) ||
          !Number.isInteger(e.startDay) ||
          e.startDay < 1 ||
          !Number.isInteger(e.endDay) ||
          e.endDay < e.startDay ||
          (e.kind !== "outage" &&
            (!nonnegative(e.value) ||
              (e.kind === "delay" && !Number.isInteger(e.value))))
        )
          errors.push(
            "Disruptions need a known target, valid day range and nonnegative value.",
          );
      }
    for (const s of scenario.shipments ?? [])
      if (!materials.has(s.materialId || "default"))
        errors.push("Shipment has unknown material.");
    return errors;
  }
  return { errors, record };
})();
