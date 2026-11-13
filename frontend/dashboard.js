window.SCFL_Dashboard = (() => {
  let baseline = window.SCFL_Experiments.read().baseline;
  const metrics = [
    ["serviceLevel", "Service level %"],
    ["unmetDemand", "Unmet demand"],
    ["transportCost", "Transport cost"],
    ["totalShippedVolume", "Shipped volume"],
    ["stockoutCount", "Stockouts"],
  ];
  const number = (n) =>
    Number.isFinite(n)
      ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : "—";
  function render(state) {
    const root = document.getElementById("results");
    if (!root.closest("details").open) return;
    baseline = window.SCFL_Experiments.read().baseline;
    const escape = window.SCFL_Rendering.escapeHtml;
    root.innerHTML = `<h3>Results · Day ${state.day}</h3><button id="captureBaseline">Capture comparison baseline</button><table><thead><tr><th>Metric</th><th>Current</th><th>Baseline${baseline ? ` · Day ${baseline.day}` : ""}</th></tr></thead><tbody>${metrics.map(([key, label]) => `<tr><th>${label}</th><td>${number(state.kpis[key])}</td><td>${number(baseline?.kpis[key])}</td></tr>`).join("")}</tbody></table><p>Service level = units consumed ÷ demand. Transport cost is charged per shipment.</p>`;
    root.querySelector("button").onclick = () => {
      baseline = { day: state.day, kpis: { ...state.kpis } };
      const result = window.SCFL_Experiments.baseline(state);
      if (!result.ok) root.querySelector("p").textContent = result.error;
      else render(state);
    };
    for (const node of state.nodes.filter(
      (n) => n.type === "warehouse" || n.type === "plant",
    )) {
      const history = state.inventoryHistoryByNode[node.id] ?? [];
      const demand = node.consumptionRatePerDay ?? 0;
      const max = Math.max(
        1,
        demand,
        ...history.map((p) => (Number.isFinite(p.value) ? p.value : 0)),
      );
      const points = history
        .map(
          (p, i) =>
            `${10 + (i * 280) / Math.max(1, history.length - 1)},${90 - (80 * (Number.isFinite(p.value) ? p.value : 0)) / max}`,
        )
        .join(" ");
      const utilization = node.storageCapacity
        ? ` · storage ${number((100 * node.inventory) / node.storageCapacity)}%`
        : "";
      const section = document.createElement("section");
      section.innerHTML = `<h4>${escape(node.name)}${utilization}</h4><svg viewBox="0 0 300 110" role="img" aria-label="${escape(node.name)} inventory history, last 100 days"><polyline points="${points}" fill="none" stroke="#6bd5b0" stroke-width="2"/><line x1="10" x2="290" y1="${90 - (80 * demand) / max}" y2="${90 - (80 * demand) / max}" stroke="#ecb86b" stroke-dasharray="4"/><text x="10" y="108" fill="currentColor">Inventory (green), daily demand (gold)</text></svg>`;
      root.appendChild(section);
    }
    const usage = document.createElement("p");
    usage.textContent =
      "Link capacity used today: " +
      state.links
        .filter((l) => l.linkType !== "information")
        .map(
          (l) =>
            `${l.id}: ${number((100 * (state.linkUsage?.[l.id] ?? 0)) / l.maxDailyCapacity)}%`,
        )
        .join(" · ");
    root.appendChild(usage);
    const comparisons = window.SCFL_Experiments.read().results;
    const comparison = document.createElement("div");
    comparison.innerHTML = `<h3>Saved scenario experiments</h3>${comparisons.length ? `<table><thead><tr><th>Variant</th><th>Days</th>${metrics.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${comparisons.map((row) => `<tr><th>${escape(row.name)}</th><td>${row.days}</td>${metrics.map(([key]) => `<td>${number(row.kpis[key])}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "<p>Capture alternatives and run them in Scenario lab.</p>"}`;
    root.appendChild(comparison);
    const queues = document.createElement("div");
    queues.innerHTML = "<h3>Warehouse stages</h3>";
    for (const node of state.nodes.filter((n) => n.type === "warehouse")) {
      const waiting = (node.preparationQueue ?? []).reduce(
          (a, q) => a + q.qty,
          0,
        ),
        preparing = (node.preparingShipments ?? [])
          .filter((q) => q.readyDay > state.day)
          .reduce((a, q) => a + q.qty, 0),
        ready = (node.preparingShipments ?? [])
          .filter((q) => q.readyDay <= state.day)
          .reduce((a, q) => a + q.qty, 0);
      const section = document.createElement("details");
      section.innerHTML = `<summary>${escape(node.name)}: ${number(waiting)} waiting · ${number(preparing)} preparing · ${number(ready)} ready · ${number(state.shipments.filter((s) => s.from === node.id).reduce((a, s) => a + s.qty, 0))} in transit</summary><table><thead><tr><th>Material</th><th>Units</th><th>Stage</th><th>Requested</th><th>Ready</th></tr></thead><tbody>${[...(node.preparationQueue ?? []).map((q) => ({ ...q, stage: "Waiting" })), ...(node.preparingShipments ?? []).map((q) => ({ ...q, stage: q.readyDay > state.day ? "Preparing" : "Ready" }))].map((q) => `<tr><td>${escape(q.materialId)}</td><td>${number(q.qty)}</td><td>${q.stage}</td><td>${q.requestDay}</td><td>${q.readyDay ?? "—"}</td></tr>`).join("")}</tbody></table>`;
      queues.appendChild(section);
    }
    root.appendChild(queues);
    const traces = document.createElement("div");
    traces.innerHTML =
      "<h3>Explain an event</h3><p>Open an event to inspect the cause, material, route and shipment. Showing the latest 60 of up to 500 retained events.</p>";
    for (const event of (state.trace ?? []).slice(-60).reverse()) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Day ${event.day} · ${event.type} · ${event.nodeId ?? ""}${event.qty != null ? " · " + number(event.qty) + " units" : ""}`;
      const reason = document.createElement("p");
      reason.textContent = event.reason;
      const data = document.createElement("p");
      data.textContent = [
        event.materialId && `Material: ${event.materialId}`,
        event.linkId && `Route: ${event.linkId}`,
        event.shipmentId && `Shipment: ${event.shipmentId}`,
        event.inputs &&
          `Inputs consumed: ${Object.entries(event.inputs)
            .map(([id, qty]) => `${id}: ${qty}`)
            .join(", ")}`,
      ]
        .filter(Boolean)
        .join(" · ");
      details.append(summary, reason, data);
      traces.appendChild(details);
    }
    root.appendChild(traces);
  }
  return { render };
})();
