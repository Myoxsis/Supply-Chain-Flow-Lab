window.SCFL_ModelEditor = (() => {
  function mount(root, node, state, changed) {
    if (!["supplier", "warehouse", "plant"].includes(node.type)) return;
    const panel = document.createElement("section");
    panel.className = "model-editor";
    root.appendChild(panel);
    const materials = [
      { id: "default", name: "Default" },
      ...state.nodes.filter((n) => n.type === "material"),
    ];
    function select(value) {
      const el = document.createElement("select");
      for (const m of materials) {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.name;
        el.appendChild(o);
      }
      el.value = value || "default";
      return el;
    }
    function input(value, min = 0) {
      const el = document.createElement("input");
      el.type = "number";
      el.min = min;
      el.step = "any";
      el.value = value;
      return el;
    }
    function label(text, control) {
      const el = document.createElement("label");
      el.textContent = text;
      el.appendChild(control);
      return el;
    }
    function button(text, action) {
      const el = document.createElement("button");
      el.textContent = text;
      el.type = "button";
      el.onclick = action;
      return el;
    }
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    function commit(patch) {
      const candidate = { ...node, ...patch };
      const graph = {
        ...state,
        nodes: state.nodes.map((n) => (n === node ? candidate : n)),
      };
      const errors = window.SCFL_ModelValidation.errors(graph);
      if (errors.length) {
        status.textContent = errors.join(" ");
        return;
      }
      Object.assign(node, patch);
      if (state.day === 0 && "initialInventoryByMaterial" in patch)
        window.SCFL_Materials.reset(node);
      document.activeElement?.blur();
      changed();
    }
    const stock = document.createElement("details");
    stock.innerHTML =
      "<summary>Set initial stock by material</summary><p>These values replace scalar initial stock. Reset the simulation to apply them after a run.</p>";
    const stockInputs = materials.map((material) => {
      const el = input(node.initialInventoryByMaterial?.[material.id] ?? 0);
      stock.appendChild(label(material.name, el));
      return [material.id, el];
    });
    stock.append(
      button("Apply material stock", () =>
        commit({
          initialInventoryByMaterial: Object.fromEntries(
            stockInputs.map(([id, el]) => [id, Number(el.value)]),
          ),
        }),
      ),
      button("Use scalar initial stock", () =>
        commit({ initialInventoryByMaterial: {} }),
      ),
    );
    panel.appendChild(stock);
    if (node.type === "plant") {
      const recipe = document.createElement("details");
      recipe.innerHTML =
        "<summary>Production recipe</summary><p>Choose inputs consumed per batch. Output uses the plant’s Demand material above. Production runs to meet daily demand.</p>";
      const rows = document.createElement("div");
      recipe.appendChild(rows);
      const inputs = [];
      function row(material = "default", qty = 1) {
        const line = document.createElement("div"),
          materialSelect = select(material),
          quantity = input(qty, 0.000001);
        line.append(
          label("Input material", materialSelect),
          label("Units per batch", quantity),
        );
        const entry = { line, materialSelect, quantity };
        inputs.push(entry);
        line.appendChild(
          button("Remove input", () => {
            inputs.splice(inputs.indexOf(entry), 1);
            line.remove();
          }),
        );
        rows.appendChild(line);
      }
      for (const [material, qty] of Object.entries(node.recipe?.inputs ?? {}))
        row(material, qty);
      const output = input(node.recipe?.outputQuantity ?? 1, 0.000001),
        capacity = input(
          node.productionCapacityPerDay ?? node.consumptionRatePerDay ?? 0,
        );
      recipe.append(
        button("Add input", () => row()),
        label("Output units per batch", output),
        label("Maximum output units per day", capacity),
        button("Apply recipe", () => {
          const ids = inputs.map((r) => r.materialSelect.value);
          if (new Set(ids).size !== ids.length) {
            status.textContent = "Each recipe input material must be unique.";
            return;
          }
          commit({
            recipe: {
              inputs: Object.fromEntries(
                inputs.map((r) => [
                  r.materialSelect.value,
                  Number(r.quantity.value),
                ]),
              ),
              outputMaterialId: node.materialId || "default",
              outputQuantity: Number(output.value),
            },
            productionCapacityPerDay: Number(capacity.value),
          });
        }),
        button("Disable recipe", () => commit({ recipe: null })),
      );
      panel.appendChild(recipe);
      const profile = document.createElement("details");
      profile.innerHTML =
        "<summary>Seasonal demand</summary><p>Multiply daily demand within a day range. Overlapping multipliers combine. Use CSV for exact daily quantities.</p>";
      const start = input(1, 1),
        end = input(30, 1),
        multiplier = input(1.5);
      profile.append(
        label("First day", start),
        label("Last day", end),
        label("Demand multiplier", multiplier),
        button("Add demand period", () =>
          commit({
            demandProfile: [
              ...(node.demandProfile ?? []),
              {
                startDay: Number(start.value),
                endDay: Number(end.value),
                multiplier: Number(multiplier.value),
              },
            ],
          }),
        ),
      );
      (node.demandProfile ?? []).forEach((period, i) => {
        const line = document.createElement("p");
        line.textContent = `Days ${period.startDay}–${period.endDay}: ×${period.multiplier} `;
        line.appendChild(
          button("Remove", () =>
            commit({
              demandProfile: node.demandProfile.filter(
                (_, index) => index !== i,
              ),
            }),
          ),
        );
        profile.appendChild(line);
      });
      panel.appendChild(profile);
    }
    panel.appendChild(status);
  }
  return { mount };
})();
