window.SCFL_AppRenderingAdapter = (function () {
  function getRegistrySchemaForNode(node) {
    if (!node?.type) return null;
    return window.SCFL_NodeRegistry?.require
      ? window.SCFL_NodeRegistry.require(node.type)
      : window.SCFL_NodeRegistry?.get(node.type) ?? null;
  }

  function getNodeFromElement(element) {
    const card = element.closest?.('.node-card');
    const id = card?.dataset?.id;
    const state = window.state;
    if (!id || !state?.nodes) return null;
    return state.nodes.find((node) => node.id === id) ?? null;
  }

  function shouldRenderNodeBody(element, value) {
    return element?.classList?.contains('node-body') && typeof value === 'string';
  }

  function shouldRenderSelectionPanel(element, value) {
    return element?.id === 'selectionPanel' && typeof value === 'string';
  }

  function resolveOptions(node, field) {
    if (typeof window.getSelectableFieldOptions === 'function') {
      return window.getSelectableFieldOptions(node, field);
    }
    return field.options ?? [];
  }

  function renderNodeBodyWithModule(element, fallbackHtml) {
    const node = getNodeFromElement(element);
    if (!node) return fallbackHtml;

    try {
      const schema = getRegistrySchemaForNode(node);
      return window.SCFL_Rendering.renderNodeBody(node, schema, {
        getOptions: resolveOptions,
        metricValue: typeof window.readMetricValue === 'function' ? window.readMetricValue(node) : '—',
        trendPoints: typeof window.getAnalyticsMetricHistoryPoints === 'function'
          ? window.getAnalyticsMetricHistoryPoints(node).length
          : 0,
      });
    } catch {
      return fallbackHtml;
    }
  }

  function renderSelectionWithModule(element, fallbackHtml) {
    const selectedIds = window.state?.selectedNodeIds ?? [];
    if (selectedIds.length !== 1) return fallbackHtml;
    const node = window.state?.nodes?.find((item) => item.id === selectedIds[0]);
    if (!node) return fallbackHtml;

    try {
      const schema = getRegistrySchemaForNode(node);
      const issues = Object.values(node.validationErrors ?? {}).map((message) => ({ message }));
      return `
        <div class="selection-summary">
          <h3>${window.SCFL_Rendering.escapeHtml(node.name ?? schema.label)}</h3>
          <p>${window.SCFL_Rendering.escapeHtml(schema.label)} · ${window.SCFL_Rendering.escapeHtml(node.id)}</p>
        </div>
        ${window.SCFL_Rendering.renderValidationIssues(issues)}
      `;
    } catch {
      return fallbackHtml;
    }
  }

  function renderWithModule(element, fallbackHtml) {
    if (shouldRenderNodeBody(element, fallbackHtml)) return renderNodeBodyWithModule(element, fallbackHtml);
    if (shouldRenderSelectionPanel(element, fallbackHtml)) return renderSelectionWithModule(element, fallbackHtml);
    return fallbackHtml;
  }

  function install() {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (!descriptor || !descriptor.set || !descriptor.get) return;
    if (Element.prototype.__scflRenderingAdapterInstalled) return;

    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        return descriptor.set.call(this, renderWithModule(this, value));
      },
    });

    Object.defineProperty(Element.prototype, '__scflRenderingAdapterInstalled', {
      value: true,
      configurable: true,
    });
  }

  return {
    install,
    renderWithModule,
    renderNodeBodyWithModule,
    renderSelectionWithModule,
  };
})();

window.SCFL_AppRenderingAdapter.install();
