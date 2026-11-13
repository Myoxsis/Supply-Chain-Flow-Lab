window.SCFL_Dashboard = (() => {
  let baseline = null;
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
    const escape = window.SCFL_Rendering.escapeHtml;
    root.innerHTML = `<h3>Results · Day ${state.day}</h3><button id="captureBaseline">Capture comparison baseline</button><table><thead><tr><th>Metric</th><th>Current</th><th>Baseline${baseline ? ` · Day ${baseline.day}` : ""}</th></tr></thead><tbody>${metrics.map(([key, label]) => `<tr><th>${label}</th><td>${number(state.kpis[key])}</td><td>${number(baseline?.kpis[key])}</td></tr>`).join("")}</tbody></table><p>Service level = units consumed ÷ demand. Transport cost is charged per shipment.</p>`;
    root.querySelector("button").onclick = () => {
      baseline = { day: state.day, kpis: { ...state.kpis } };
      render(state);
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
            `${10 + (i * 280) / Math.max(1, history.length - 1)},${90 - (80 * p.value) / max}`,
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
  }
  return { render };
})();
