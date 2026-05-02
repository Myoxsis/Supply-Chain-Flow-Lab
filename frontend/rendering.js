window.SCFL_Rendering = (function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderOptions(options, selectedValue) {
    return (options ?? [])
      .map((option) => {
        const selected = String(option.value) === String(selectedValue) ? 'selected' : '';
        return `<option value="${escapeHtml(option.value)}" ${selected}>${escapeHtml(option.label)}</option>`;
      })
      .join('');
  }

  function renderField(field, value, error, options = []) {
    const safeValue = value == null ? '' : value;
    let inputHtml = '';

    if (field.type === 'select' || field.type === 'select_analytics_source') {
      const autoOption = field.type === 'select_analytics_source'
        ? '<option value="">Auto-select (first connected source)</option>'
        : '';
      inputHtml = `<select data-field="${escapeHtml(field.key)}">${autoOption}${renderOptions(options, safeValue)}</select>`;
    } else if (field.type === 'multiselect_materials') {
      inputHtml = `<select data-field="${escapeHtml(field.key)}" multiple>${renderOptions(options, safeValue)}</select>`;
    } else if (field.type === 'text') {
      inputHtml = `<textarea data-field="${escapeHtml(field.key)}" spellcheck="false">${escapeHtml(safeValue)}</textarea>`;
    } else if (field.type === 'string') {
      inputHtml = `<input type="text" data-field="${escapeHtml(field.key)}" value="${escapeHtml(safeValue)}" />`;
    } else {
      inputHtml = `<input type="number" min="${escapeHtml(field.min ?? 0)}" step="${escapeHtml(field.step ?? 1)}" data-field="${escapeHtml(field.key)}" value="${escapeHtml(safeValue)}" />`;
    }

    return `
      <div class="field ${error ? 'invalid' : ''}">
        <label>${escapeHtml(field.label)}</label>
        ${inputHtml}
        ${error ? `<div class="field-error">${escapeHtml(error)}</div>` : ''}
      </div>`;
  }

  function renderNodeFields(node, schema, context = {}) {
    return schema.fields
      .filter((field) => field.key !== 'name')
      .map((field) => renderField(
        field,
        node[field.key],
        node.validationErrors?.[field.key] ?? '',
        context.getOptions ? context.getOptions(node, field) : (field.options ?? []),
      ))
      .join('');
  }

  function formatInventory(value) {
    return Number.isFinite(value) ? value : '∞';
  }

  function renderNodeKpis(node, schema, metricValue = '—', trendPoints = 0) {
    if (node.type === 'supplier') {
      return `
        <div class="kpis">
          <div class="kpi"><span class="label">Shipped</span><span class="value" data-kpi="shipped">${escapeHtml(node.shipped)}</span></div>
          <div class="kpi"><span class="label">Frequency</span><span class="value">${escapeHtml(node.deliveryFrequencyDays)} d</span></div>
        </div>`;
    }

    if (node.type === 'warehouse') {
      return `
        <div class="kpis">
          <div class="kpi"><span class="label">On hand</span><span class="value" data-kpi="inventory">${escapeHtml(formatInventory(node.inventory))}</span></div>
          <div class="kpi"><span class="label">Shipped</span><span class="value" data-kpi="shipped">${escapeHtml(node.shipped)}</span></div>
          <div class="kpi"><span class="label">Queued</span><span class="value" data-kpi="queue">${escapeHtml(node.preparationQueue?.length ?? 0)}</span></div>
        </div>`;
    }

    if (node.type === 'plant') {
      return `
        <div class="kpis">
          <div class="kpi"><span class="label">On hand</span><span class="value" data-kpi="inventory">${escapeHtml(formatInventory(node.inventory))}</span></div>
          <div class="kpi"><span class="label">Stockouts</span><span class="value" data-kpi="stockouts">${escapeHtml(node.stockouts)}</span></div>
        </div>`;
    }

    if (node.type === 'analytics') {
      return `
        <div class="kpis">
          <div class="kpi"><span class="label">Metric</span><span class="value" data-kpi="metric-value">${escapeHtml(metricValue)}</span></div>
          <div class="kpi"><span class="label">Trend points</span><span class="value" data-kpi="metric-points">${escapeHtml(trendPoints)}</span></div>
        </div>`;
    }

    return `
      <div class="kpis">
        <div class="kpi"><span class="label">Type</span><span class="value">${escapeHtml(schema.label)}</span></div>
        <div class="kpi"><span class="label">Shipped</span><span class="value" data-kpi="shipped">${escapeHtml(node.shipped)}</span></div>
      </div>`;
  }

  function renderAnalyticsGraph(node) {
    if (node.type !== 'analytics') return '';
    return `<div class="field analytics-node-graph">
      <label>Metric trend</label>
      <svg class="analytics-node-chart" data-analytics-chart="${escapeHtml(node.id)}" viewBox="0 0 240 84" preserveAspectRatio="none"></svg>
    </div>`;
  }

  function renderNodeBody(node, schema, context = {}) {
    return [
      renderNodeFields(node, schema, context),
      renderAnalyticsGraph(node),
      renderNodeKpis(node, schema, context.metricValue, context.trendPoints),
    ].join('');
  }

  function renderValidationIssues(issues) {
    if (!issues?.length) return '';
    return `<ul class="validation-issues">${issues.map((issue) => `<li>${escapeHtml(issue.message ?? issue)}</li>`).join('')}</ul>`;
  }

  return {
    escapeHtml,
    renderOptions,
    renderField,
    renderNodeFields,
    renderNodeKpis,
    renderAnalyticsGraph,
    renderNodeBody,
    renderValidationIssues,
  };
})();
