window.SCFL_Workbench = (() => {
  function mount(api) {
    const { state, exportState, loadScenario, pause, changed, download } = api;
    const root = document.createElement("section");
    root.className = "panel workbench";
    root.innerHTML = `<h2>Scenario lab</h2>
      <details><summary>Quick walkthrough</summary><ol><li>Load the Production recipe example.</li><li>Steel and Widget nodes define material IDs. Select the factory to inspect its stock and recipe: two steel units make one widget.</li><li>Step a day, then open Results to inspect production, queues and event explanations.</li><li>Capture a baseline variant below. Add an outage or change capacity, capture another, then run the same horizon.</li></ol><p>Legacy scenarios use one material named default. Link material labels are descriptive; assign a material ID in the link inspector.</p></details>
      <details id="disruptionEditor"><summary>Disruptions</summary><form id="disruptionForm"><label>Kind<select id="disruptionKind"><option value="outage">Outage</option><option value="capacity">Capacity multiplier</option><option value="delay">Extra delay (days)</option></select></label><label>Target<select id="disruptionTarget"></select></label><label>First day<input id="disruptionStart" type="number" min="1" value="10" required></label><label>Last day<input id="disruptionEnd" type="number" min="1" value="15" required></label><label>Multiplier or extra days<input id="disruptionValue" type="number" min="0" step="any" value="0.5" required></label><button>Add disruption</button></form><ul id="disruptionList"></ul></details>
      <details id="experimentEditor"><summary>Saved experiments</summary><p>Runs restart from configured initial stock, day 0. Capture up to 12 alternatives; results survive reload.</p><label>Variant name<input id="variantName" maxlength="80" value="Baseline"></label><button id="captureVariant">Capture current scenario</button><ul id="variantList"></ul><label>Horizon (days)<input id="experimentDays" type="number" min="1" max="365" value="90"></label><div class="button-grid"><button id="runExperiments">Run comparisons</button><button id="cancelExperiments" disabled>Cancel</button></div><progress id="experimentProgress" value="0" max="1"></progress><button id="exportResultsCsv">Export results CSV</button></details>
      <details><summary>CSV data</summary><p>Node CSV replaces nodes and retains links, so existing endpoint IDs must remain. Demand CSV uses nodeId, day, quantity and replaces schedules only for listed plants. Import is atomic.</p><label>Import data<select id="csvKind"><option value="nodes">Nodes</option><option value="demand">Daily demand</option></select></label><input id="csvInput" type="file" accept=".csv,text/csv"><button id="exportNodesCsv">Export nodes CSV</button><button id="demandTemplate">Download demand template</button></details>
      <p id="labStatus" role="status"></p>`;
    document.querySelector(".inspector-panel").before(root);
    const byId = (id) => root.querySelector("#" + id),
      message = (text) => {
        byId("labStatus").textContent = text;
      };
    function refreshTargets() {
      const select = byId("disruptionTarget"),
        current = select.value;
      select.replaceChildren();
      for (const item of [
        ...state.nodes.filter(
          (n) => n.type !== "material" && n.type !== "analytics",
        ),
        ...state.links,
      ]) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.name ?? item.id} (${item.type ?? "route"})`;
        select.appendChild(option);
      }
      select.value = current || select.options[0]?.value || "";
    }
    function refreshDisruptions() {
      const list = byId("disruptionList");
      list.replaceChildren();
      (state.disruptions ?? []).forEach((event, i) => {
        const li = document.createElement("li");
        li.textContent = `${event.kind}: ${event.targetId}, days ${event.startDay}–${event.endDay}${event.kind === "outage" ? "" : `, value ${event.value}`} `;
        const button = document.createElement("button");
        button.textContent = "Remove";
        button.onclick = () => {
          pause();
          state.disruptions.splice(i, 1);
          changed();
          refreshDisruptions();
        };
        li.appendChild(button);
        list.appendChild(li);
      });
    }
    function refreshVariants() {
      const list = byId("variantList");
      list.replaceChildren();
      for (const v of window.SCFL_Experiments.read().variants) {
        const li = document.createElement("li");
        li.textContent = v.name + " ";
        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.onclick = () => {
          message(
            window.SCFL_Experiments.remove(v.id).error ?? "Removed variant.",
          );
          refreshVariants();
          window.SCFL_Dashboard.render(state);
        };
        li.appendChild(remove);
        list.appendChild(li);
      }
    }
    byId("disruptionEditor").addEventListener("toggle", () => {
      refreshTargets();
      refreshDisruptions();
    });
    byId("experimentEditor").addEventListener("toggle", refreshVariants);
    byId("disruptionForm").onsubmit = (event) => {
      event.preventDefault();
      const disruption = {
        kind: byId("disruptionKind").value,
        targetId: byId("disruptionTarget").value,
        startDay: Number(byId("disruptionStart").value),
        endDay: Number(byId("disruptionEnd").value),
        value: Number(byId("disruptionValue").value),
      };
      const candidate = {
        ...exportState(),
        disruptions: [...(state.disruptions ?? []), disruption],
      };
      const errors = window.SCFL_ModelValidation.errors(candidate);
      if (errors.length) {
        message(errors.join(" "));
        return;
      }
      pause();
      state.disruptions = candidate.disruptions;
      changed();
      refreshDisruptions();
      message("Disruption added.");
    };
    byId("captureVariant").onclick = () => {
      pause();
      const validated =
        window.SCFL_ScenarioStorage.importScenario(exportState());
      if (!validated.ok) {
        message(validated.error);
        return;
      }
      const r = window.SCFL_Experiments.capture(
        byId("variantName").value,
        exportState(),
      );
      message(r.error ?? "Scenario variant saved.");
      refreshVariants();
    };
    byId("runExperiments").onclick = async () => {
      pause();
      byId("runExperiments").disabled = true;
      byId("cancelExperiments").disabled = false;
      byId("captureVariant").disabled = true;
      message("Running experiments…");
      try {
        const result = await window.SCFL_Experiments.run(
          Number(byId("experimentDays").value),
          (p) => {
            byId("experimentProgress").max = p.total;
            byId("experimentProgress").value = p.completed;
          },
        );
        message(
          result.warning ||
            "Comparisons complete. Open Results to compare alternatives.",
        );
        document.querySelector(".results-panel").open = true;
        window.SCFL_Dashboard.render(state);
      } catch (error) {
        message(error.message);
      } finally {
        byId("runExperiments").disabled = false;
        byId("cancelExperiments").disabled = true;
        byId("captureVariant").disabled = false;
      }
    };
    byId("cancelExperiments").onclick = () => window.SCFL_Experiments.cancel();
    byId("exportResultsCsv").onclick = () =>
      download(
        "experiment-results.csv",
        window.SCFL_CSV.results(window.SCFL_Experiments.read().results),
      );
    byId("exportNodesCsv").onclick = () =>
      download("nodes.csv", window.SCFL_CSV.nodes(exportState()));
    byId("demandTemplate").onclick = () =>
      download(
        "demand-template.csv",
        window.SCFL_CSV.encode(
          [
            {
              nodeId:
                state.nodes.find((n) => n.type === "plant")?.id ?? "plant-id",
              day: 1,
              quantity: 20,
            },
          ],
          ["nodeId", "day", "quantity"],
        ),
      );
    byId("csvInput").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const candidate =
          byId("csvKind").value === "nodes"
            ? window.SCFL_CSV.importNodes(text, exportState())
            : window.SCFL_CSV.importDemand(text, exportState());
        loadScenario(candidate);
        message("CSV imported.");
      } catch (error) {
        message(error.message);
      }
      event.target.value = "";
    };
    // Scenario loads notify these views without replacing the user's open forms.
    window.addEventListener("scfl:scenario", () => {
      refreshTargets();
      refreshDisruptions();
    });
    refreshVariants();
  }
  return { mount };
})();
