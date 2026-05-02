window.SCFL_AppValidationAdapter = (function () {
  function install() {
    window.validateNode = function (node, schema, context) {
      return window.SCFL_Validation.validateNode(node, schema, context);
    };

    window.validateLink = function (link, nodes, ui) {
      return window.SCFL_Validation.validateLink(link, nodes, ui);
    };

    window.validateGraph = function (state, schemaResolver, optionsResolver) {
      return window.SCFL_Validation.validateGraph(state, schemaResolver, optionsResolver);
    };
  }

  return {
    install,
  };
})();

window.SCFL_AppValidationAdapter.install();
