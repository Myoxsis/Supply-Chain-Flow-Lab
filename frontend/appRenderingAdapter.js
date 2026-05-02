window.SCFL_AppRenderingAdapter = (function () {
  function getSchemaForNode(node) {
    return window.SCFL_NodeRegistry?.get(node.type) ?? null;
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

  function renderWithModule(element, fallbackHtml) {
    const node = getNodeFromElement(element);
    if (!node) return fallbackHtml;

    const schema = getSchemaForNode(node);
    if (!schema) return fallbackHtml;

    try {
      return window.SCFL_Rendering.renderNodeBody(node, schema, {
        getOptions: window.getSelectableFieldOptions,
        metricValue: window.readMetricValue ? window.readMetricValue(node) : '—',
        trendPoints: window.getAnalyticsMetricHistoryPoints
          ? window.getAnalyticsMetricHistoryPoints(node).length
          : 0,
      });
    } catch {
      return fallbackHtml;
    }
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
        if (shouldRenderNodeBody(this, value)) {
          return descriptor.set.call(this, renderWithModule(this, value));
        }
        return descriptor.set.call(this, value);
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
  };
})();

window.SCFL_AppRenderingAdapter.install();
