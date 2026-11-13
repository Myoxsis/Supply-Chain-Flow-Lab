// Declarative runtime: imported packages never execute JavaScript.
window.SCFL_PluginRuntime = (() => {
  function runHook(appState, hookName = "onTick") {
    const emitted = [],
      logs = [],
      errors = [];
    for (const node of appState.nodes) {
      const commands = window.SCFL_NodeRegistry.get(node.type)?.runtime?.[
        hookName
      ];
      if (commands == null) continue;
      if (!Array.isArray(commands) || commands.length > 100) {
        errors.push({
          nodeId: node.id,
          message:
            "Use at most 100 declarative runtime commands; JavaScript hooks are disabled.",
        });
        continue;
      }
      for (const command of commands) {
        if (!command || !["emit", "shipment", "log"].includes(command.action)) {
          errors.push({
            nodeId: node.id,
            message: "Unsupported runtime command.",
          });
          continue;
        }
        const value = command.valueField
          ? node[command.valueField]
          : command.value;
        if (command.action === "log")
          logs.push({
            nodeId: node.id,
            message: String(command.message ?? "").slice(0, 1000),
          });
        else
          emitted.push({
            nodeId: node.id,
            day: appState.day,
            type:
              command.action === "shipment"
                ? "shipment"
                : String(command.type ?? "event"),
            from: node.id,
            to: command.to,
            linkId: command.linkId,
            quantity: value,
            value,
          });
      }
    }
    appState.pluginEvents = [
      ...(appState.pluginEvents ?? []),
      ...emitted,
    ].slice(-500);
    appState.pluginLogs = [...(appState.pluginLogs ?? []), ...logs].slice(-500);
    return { ok: !errors.length, emitted, logs, errors };
  }
  return { runHook, clearCompiledHandlers() {} };
})();
