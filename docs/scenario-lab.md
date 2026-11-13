# Scenario lab

## Walkthrough

1. Choose **Production recipe example**, then **Load preset**. Steel and Widget are material definitions; the material node's ID is its stable key.
2. Select the factory. The inspector shows material stock. Expand **Production recipe**: two steel units produce one widget, with a capacity of 12 output units per day and demand of 10 widgets per day.
3. Use **Step** and open **Results and scenario comparison**. Inspect event explanations, recipe inputs consumed and warehouse stages.
4. Expand **Saved experiments** in Scenario lab. Name and capture a baseline. Add an outage under **Disruptions**, change capacities or add seasonal demand in the inspector, and capture another variant.
5. Choose a horizon and run comparisons. Every variant restarts at day 0 from its configured initial inventory, with its own demand and disruption settings. The live graph is not changed by a batch run.
6. Compare service level, unmet demand, shipment cost and stockouts. Export the results as CSV. Variants, results and the manual baseline survive browser reloads in local storage.

The experiment list holds at most 12 variants; the horizon is 1–365 days. Cancellation does not replace the previous completed results. Results describe deterministic configured scenarios; there is no random-demand distribution or optimization solver. Workers keep batch execution off the UI thread. When Workers cannot start, a cooperative fallback yields between small groups of days. For very large graphs, serving the app over HTTP is recommended to enable Workers.

## Materials and recipes

All operational nodes have `inventoryByMaterial`; their old `inventory` property is a derived total for compatibility and aggregate charts. `initialInventoryByMaterial` is the configured starting stock, edited through **Set initial stock by material** in the inspector. A nonempty map replaces the scalar initial inventory. An empty map uses scalar initial inventory under the node's primary material. Suppliers with no finite scalar initial inventory have unlimited stock of their primary material only.

Existing scalar scenarios use `default`. Assigning a route's Material carried field changes what it transports; a materialName string remains only a label. Material definition nodes do not hold operational supply stock. Other materials cannot substitute for a missing input. Warehouse capacity is shared across all materials and includes stock reserved for preparation.

A plant's Demand material is also its recipe output. Recipes are edited using the inspector form, with JSON available for advanced configuration:

```json
{
  "inputs": {"steel": 2},
  "outputMaterialId": "widget",
  "outputQuantity": 1
}
```

Recipe batches are whole batches. `productionCapacityPerDay` limits output units, so available batches are rounded down. Production runs to cover the day's finished-product demand; surplus from a batch stays in output inventory. Missing ingredients and insufficient production capacity are explained in event traces. A plant without a recipe consumes its configured demand material directly. Production on one plant is available for outbound shipment on a subsequent day because production follows dispatch.

## Demand and disruptions

`consumptionRatePerDay` is the baseline demand. Exact `demandSchedule` entries override it on a specific day. Active `demandProfile` multipliers are applied afterward; overlapping ranges multiply together. Unmet demand is lost demand, not a backlog.

```json
{
  "demandProfile": [{"startDay": 11, "endDay": 20, "multiplier": 1.5}],
  "demandSchedule": [{"day": 25, "quantity": 40}]
}
```

Disruptions use inclusive day ranges, a node or link ID, and a kind:

```json
[
  {"kind": "outage", "targetId": "source", "startDay": 10, "endDay": 15},
  {"kind": "capacity", "targetId": "parts", "startDay": 20, "endDay": 25, "value": 0.5},
  {"kind": "delay", "targetId": "parts", "startDay": 30, "endDay": 35, "value": 2}
]
```

Outages stop dispatch and warehouse preparation or plant production, but already departed shipments still arrive and customers still demand stock. Capacity multipliers affect supplier quantity, warehouse preparation, plant production or link transport capacity according to the target. Extra delay is added at departure and does not retroactively reschedule in-transit shipments. Delay values are whole days. Source and route delays add together. Node/link IDs should be distinct when used as disruption targets.

## Queues and allocation

A warehouse replenishment request enters **Waiting** without reserving stock. Daily preparation capacity and available stock move part or all of it to **Preparing**, which reserves material immediately. On ready day, it may depart within the daily link capacity; the unsent part stays **Ready**. Transit starts on departure and finishes on arrival day. Waiting, reserved and in-transit quantities all count toward the destination's outstanding replenishment to prevent duplicate orders.

Source stock is shared across routes. Lower numerical link priority runs first; equal priorities use link ID order. Warehouse preparation uses the same route priority. Graph array order is not an allocation policy. Removing or changing a queued route cancels affected orders and returns reserved stock. Arrivals can overflow a full warehouse; discarded quantities are recorded explicitly.

Supplier warehouse reorder points use aggregate stock plus reservations/incoming supply. Recipe input replenishment converts a plant's target finished stock to required input quantities. Multi-stage graphs execute in fixed daily phases; there is no recursive same-day execution through arbitrary chains or cycle solver.

## CSV

**Export nodes CSV** provides a template for replacing node configuration. Node imports replace nodes, retain existing links and clear runtime/disruption state. Existing link endpoints must therefore remain valid; use a blank graph when importing an unrelated network. The imported graph is validated before replacement. Layout coordinates, scalar settings, primary material and JSON recipe/initial-stock/demand fields are included. Current runtime balances are exported with full scenario JSON, not node configuration CSV.

Demand CSV uses exactly:

```csv
nodeId,day,quantity
factory,1,10
factory,2,25
```

Import replaces the schedule for listed plants only. Other plants keep their schedules; duplicate days and negative values are rejected. Quoted CSV cells support commas, escaped quotes and newlines. Text exports escape spreadsheet formula prefixes. Node and demand imports report errors without replacing the current graph.

## Migration and engine boundary

Scenario version 9 preserves old scalar inventory as the `default` material and retains existing in-flight arrival dates. New preparation records store material, request day and ready day. Graph JSON saves ledgers, queues, traces, demand settings and disruptions; comparisons are stored separately by the browser.

The browser engine is the authoritative implementation for this feature set. The Flask/Python compatibility engine still uses scalar inventory and its original queue semantics; it does not execute recipes, per-material balances, demand profiles, disruptions or experiment batches. Do not compare its outputs to material-aware browser runs as if they were equivalent. Python regression tests remain in CI for compatibility users.

Histories retain 100 days, traces 500 events, shipment/stockout detail 1,000 records. Cumulative KPIs are independent of these detail limits. Trace explanations give observed constraints and shipment dates, not a global causal proof or optimal scheduling decision.
