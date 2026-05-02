window.SCFL_Validation = (function () {
  function validateNode(node) {
    const errors = [];
    if (!node?.id) errors.push('Node missing id');
    if (!node?.type) errors.push('Node missing type');
    return errors;
  }

  function validateLink(link, nodes) {
    const errors = [];
    const ids = new Set(nodes.map((n) => n.id));
    if (!ids.has(link.from)) errors.push(`Unknown from node: ${link.from}`);
    if (!ids.has(link.to)) errors.push(`Unknown to node: ${link.to}`);
    return errors;
  }

  function validateGraph(state) {
    const errors = [];
    state.nodes.forEach((n) => errors.push(...validateNode(n)));
    state.links.forEach((l) => errors.push(...validateLink(l, state.nodes)));
    return errors;
  }

  return {
    validateNode,
    validateLink,
    validateGraph,
  };
})();
