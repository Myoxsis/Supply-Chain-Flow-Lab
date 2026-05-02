# Modularization Roadmap

This roadmap controls the step-by-step refactor of `app.js` into maintainable modules, followed by a full ComfyUI-style plugin system.

## Non-negotiable rule

All repository file writes must be complete-file writes. Do not write placeholder content such as `omitted`, `unchanged`, `truncated`, or `rest of file` into source files.

If a full file cannot be retrieved or reconstructed safely, stop and do not modify that file.

## Branch

Work happens on:

```text
refactor/modular-app
```

## Phase 1: Preserve behavior and prepare module boundaries

Goal: add module scaffolding and documentation without changing runtime behavior.

Deliverables:

- `frontend/bootstrap.js`
- `frontend/state.js`
- `frontend/simulationApi.js`
- `frontend/scenarioStorage.js`
- `frontend/validation.js`
- `frontend/rendering.js`
- `frontend/canvasInteractions.js`
- `frontend/charts.js`
- `frontend/nodePackages.js`

At this stage, modules may expose functions but should not require a full rewrite of `app.js`.

## Phase 2: Extract low-risk concerns

Extract code in this order:

1. API base URL resolution and simulation step fetch calls.
2. Scenario version constants and localStorage keys.
3. Node registry access and core node definitions.
4. Link schema helpers.

Each extraction should preserve the public behavior of the app.

## Phase 3: Extract validation

Move node, link, and graph validation into `frontend/validation.js`.

Rules:

- Keep validation messages stable where possible.
- Keep custom/community node behavior compatible.
- Add browser-independent validation tests if practical.

## Phase 4: Extract scenario storage and migration

Move scenario import/export, migration, persistence, and built-in presets into `frontend/scenarioStorage.js`.

Rules:

- Preserve scenario JSON compatibility.
- Keep `SCENARIO_VERSION` centralized.
- Add migration tests before changing migration rules.

## Phase 5: Extract rendering and canvas behavior

Move DOM rendering and canvas interaction logic after validation and storage are stable.

Recommended order:

1. Node field rendering.
2. Link SVG rendering.
3. Selection inspector rendering.
4. Toolbar and context menu rendering.
5. Pan/zoom/drag/link interactions.

This is the riskiest phase and should be split into small commits.

## Phase 6: Full ComfyUI-style plugin system

After the app is modular, build the plugin system.

Plugin requirements:

- Versioned SCFL-node package manifest.
- Node package install/uninstall lifecycle.
- Package validation before install.
- Dependency metadata.
- Node categories.
- Compatibility checks against app schema version.
- Safe import/export of package definitions.
- Registry isolation between built-in nodes and community nodes.

Suggested package shape:

```json
{
  "schemaVersion": 1,
  "name": "example-pack",
  "displayName": "Example Pack",
  "version": "0.1.0",
  "description": "Example custom nodes",
  "author": "Unknown",
  "compatibility": {
    "minAppScenarioVersion": 7
  },
  "nodes": [
    {
      "type": "example.buffer",
      "label": "Buffer",
      "category": "Logistics",
      "inputs": [{ "name": "inbound", "type": "material" }],
      "outputs": [{ "name": "outbound", "type": "material" }],
      "fields": [],
      "defaults": {}
    }
  ]
}
```

## Completion criteria

The refactor is complete when:

- `app.js` is reduced to bootstrapping and orchestration.
- Built-in nodes are defined only in `frontend/coreNodes.js`.
- Node lookup happens through `SCFL_NodeRegistry`.
- Scenario migrations live in a scenario module.
- API calls live in an API module.
- Validation lives in a validation module.
- Rendering lives in rendering/canvas modules.
- Tests still pass in GitHub Actions.
