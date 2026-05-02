window.SCFL_NodePackages = (function () {
  const PACKAGE_SCHEMA_VERSION = 1;
  const installedPackages = new Map();

  function parsePackage(input) {
    if (typeof input === 'string') return JSON.parse(input);
    return input;
  }

  function normalizeNodes(pkg) {
    if (Array.isArray(pkg.nodes)) return pkg.nodes;
    if (Array.isArray(pkg.customNodes)) return pkg.customNodes.map((node) => node.schema ?? node);
    return [];
  }

  function validatePackage(pkg) {
    const errors = [];
    if (!pkg || typeof pkg !== 'object') errors.push('Package must be an object.');
    if (!pkg?.name || typeof pkg.name !== 'string') errors.push('Package name is required.');
    if ((pkg.schemaVersion ?? PACKAGE_SCHEMA_VERSION) !== PACKAGE_SCHEMA_VERSION) {
      errors.push(`Unsupported package schema version: ${pkg.schemaVersion}.`);
    }

    const nodes = normalizeNodes(pkg);
    if (!nodes.length) errors.push('Package must include at least one node.');

    const seen = new Set();
    nodes.forEach((node, index) => {
      if (!node.type || typeof node.type !== 'string') errors.push(`nodes[${index}].type is required.`);
      if (!node.label || typeof node.label !== 'string') errors.push(`nodes[${index}].label is required.`);
      if (seen.has(node.type)) errors.push(`Duplicate node type: ${node.type}.`);
      seen.add(node.type);
      if (!Array.isArray(node.fields)) errors.push(`nodes[${index}].fields must be an array.`);
      if (node.inputs && !Array.isArray(node.inputs)) errors.push(`nodes[${index}].inputs must be an array.`);
      if (node.outputs && !Array.isArray(node.outputs)) errors.push(`nodes[${index}].outputs must be an array.`);
    });

    return { ok: errors.length === 0, errors };
  }

  function normalizeNodeDefinition(pkg, node) {
    return {
      type: node.type,
      label: node.label,
      category: node.category ?? pkg.displayName ?? pkg.name,
      inputs: node.inputs ?? [],
      outputs: node.outputs ?? ['information'],
      fields: node.fields ?? [],
      defaults: node.defaults ?? {},
      packageName: pkg.name,
      packageVersion: pkg.version ?? '0.0.0',
      source: 'package',
      description: node.description ?? '',
      runtime: node.runtime ?? null,
    };
  }

  function installPackage(input) {
    let pkg;
    try {
      pkg = parsePackage(input);
    } catch (error) {
      return { ok: false, errors: [`Invalid JSON: ${error.message}`] };
    }

    const validation = validatePackage(pkg);
    if (!validation.ok) return validation;

    const nodes = normalizeNodes(pkg).map((node) => normalizeNodeDefinition(pkg, node));
    nodes.forEach((node) => window.SCFL_NodeRegistry.register(node));
    installedPackages.set(pkg.name, {
      schemaVersion: pkg.schemaVersion ?? PACKAGE_SCHEMA_VERSION,
      name: pkg.name,
      displayName: pkg.displayName ?? pkg.name,
      version: pkg.version ?? '0.0.0',
      description: pkg.description ?? '',
      author: pkg.author ?? '',
      nodes: nodes.map((node) => node.type),
      manifest: pkg,
    });

    return { ok: true, package: installedPackages.get(pkg.name), nodes };
  }

  function uninstallPackage(name) {
    const pkg = installedPackages.get(name);
    if (!pkg) return { ok: false, errors: [`Package not installed: ${name}`] };
    pkg.nodes.forEach((type) => window.SCFL_NodeRegistry.unregister(type));
    installedPackages.delete(name);
    return { ok: true };
  }

  function listPackages() {
    return Array.from(installedPackages.values());
  }

  function exportPackage(name) {
    const pkg = installedPackages.get(name);
    if (!pkg) return JSON.stringify({ schemaVersion: PACKAGE_SCHEMA_VERSION, name: 'empty-package', nodes: [] }, null, 2);
    return JSON.stringify(pkg.manifest, null, 2);
  }

  function exportAllPackages() {
    return JSON.stringify({
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      packages: listPackages().map((pkg) => pkg.manifest),
    }, null, 2);
  }

  function importPackage(input) {
    const parsed = parsePackage(input);
    if (Array.isArray(parsed.packages)) {
      const results = parsed.packages.map(installPackage);
      const failed = results.filter((result) => !result.ok);
      return failed.length ? { ok: false, errors: failed.flatMap((result) => result.errors) } : { ok: true, results };
    }
    return installPackage(parsed);
  }

  return {
    PACKAGE_SCHEMA_VERSION,
    validatePackage,
    installPackage,
    uninstallPackage,
    listPackages,
    importPackage,
    exportPackage,
    exportAllPackages,
  };
})();
