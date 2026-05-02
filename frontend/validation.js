window.SCFL_Validation = (function () {
  function toErrorMap(errors) {
    return Object.fromEntries(errors.map((message, index) => [index, message]));
  }

  function validateField(node, field, optionsResolver) {
    const value = node[field.key];
    const errors = [];

    if (field.type === 'string' || field.type === 'text') {
      if (field.required && (!value || !String(value).trim())) {
        errors.push(`${field.label} is required.`);
      }
      return errors;
    }

    if (field.type === 'select' || field.type === 'select_analytics_source') {
      if (field.required && !value) {
        errors.push(`${field.label} is required.`);
        return errors;
      }
      const options = optionsResolver ? optionsResolver(node, field) : (field.options ?? []);
      if (value && !options.some((option) => option.value === value)) {
        errors.push(`${field.label} has an invalid selection.`);
      }
      return errors;
    }

    if (field.type === 'multiselect_materials') {
      if (!Array.isArray(value)) {
        errors.push(`${field.label} must be a list.`);
      }
      return errors;
    }

    if (value == null || Number.isNaN(value)) {
      if (field.required) errors.push(`${field.label} is required.`);
      return errors;
    }

    if (!Number.isFinite(value)) {
      errors.push(`${field.label} must be finite.`);
      return errors;
    }

    if (field.type === 'int' && !Number.isInteger(value)) {
      errors.push(`${field.label} must be an integer.`);
      return errors;
    }

    if (field.min != null && value < field.min) {
      errors.push(`${field.label} must be ≥ ${field.min}.`);
    }

    return errors;
  }

  function validateNode(node, schema, context = {}) {
    const errors = {};
    if (!node?.id) errors.id = 'Node missing id.';
    if (!node?.type) errors.type = 'Node missing type.';
    if (!schema) {
      errors.type = `Unknown node type: ${node?.type ?? 'unknown'}.`;
      return errors;
    }

    schema.fields.forEach((field) => {
      const fieldErrors = validateField(node, field, context.optionsResolver);
      if (fieldErrors.length) errors[field.key] = fieldErrors.join(' ');
    });

    if (node.type === 'warehouse') {
      if (Number.isFinite(node.initialInventory) && Number.isFinite(node.storageCapacity) && node.initialInventory > node.storageCapacity) {
        errors.initialInventory = 'Initial inventory must be ≤ storage capacity.';
      }
      if (node.reorderPoint != null && Number.isFinite(node.storageCapacity) && node.reorderPoint > node.storageCapacity) {
        errors.reorderPoint = 'Reorder point must be ≤ storage capacity.';
      }
    }

    return errors;
  }

  function isValidConnection(from, to, linkType, ui = {}) {
    const type = linkType ?? 'material';
    if (!from || !to || from.id === to.id) return false;
    if (type === 'information') return true;
    if (from.type === 'supplier' && to.type === 'warehouse') return true;
    if (from.type === 'warehouse' && to.type === 'plant') return true;
    if (ui.allowWarehouseToWarehouse && from.type === 'warehouse' && to.type === 'warehouse') return true;
    if (ui.allowPlantOutbound && from.type === 'plant') return true;
    return false;
  }

  function validateLink(link, nodes, ui = {}) {
    const errors = [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const from = byId.get(link.from);
    const to = byId.get(link.to);

    if (!from || !to) return ['Missing endpoint node.'];
    if (!isValidConnection(from, to, link.linkType, ui)) {
      errors.push(`Connection ${from.type} → ${to.type} for ${(link.linkType ?? 'material')} flow is not allowed.`);
    }

    if (link.transportDelayDays == null || !Number.isInteger(link.transportDelayDays) || link.transportDelayDays < 0) {
      errors.push('Transport delay must be an integer ≥ 0.');
    }

    if (link.maxDailyCapacity == null || !Number.isFinite(link.maxDailyCapacity) || link.maxDailyCapacity < 1) {
      errors.push('Max daily capacity must be ≥ 1.');
    }

    if (link.costPerShipment != null && (!Number.isFinite(link.costPerShipment) || link.costPerShipment < 0)) {
      errors.push('Cost per shipment must be ≥ 0.');
    }

    return errors;
  }

  function validateGraph(state, schemaResolver, optionsResolver) {
    const graphErrors = [];
    const nodeErrors = new Map();
    const linkErrors = new Map();

    state.nodes.forEach((node) => {
      nodeErrors.set(node.id, validateNode(node, schemaResolver(node.type), { optionsResolver }));
    });

    state.links.forEach((link) => {
      const errors = validateLink(link, state.nodes, state.ui ?? {});
      linkErrors.set(link.id, toErrorMap(errors));
      if (errors.length) graphErrors.push(`Invalid link ${link.id}: ${errors.join(' ')}`);
    });

    return {
      graphErrors,
      nodeErrors,
      linkErrors,
    };
  }

  return {
    toErrorMap,
    validateField,
    validateNode,
    validateLink,
    validateGraph,
    isValidConnection,
  };
})();
