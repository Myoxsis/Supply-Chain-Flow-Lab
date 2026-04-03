export function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = sortObject(value[key]);
    return acc;
  }, {});
}

export function hashScenarioPayload(payload) {
  const text = typeof payload === 'string' ? payload : stableStringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function withScenarioMeta(scenario, options = {}) {
  const copy = structuredClone(scenario);
  const payloadWithoutMeta = { ...copy, meta: undefined };
  const checksum = hashScenarioPayload(payloadWithoutMeta);
  copy.meta = {
    label: options.label ?? copy.meta?.label ?? 'Untitled scenario',
    savedAt: options.savedAt ?? new Date().toISOString(),
    checksum,
  };
  return copy;
}

export function verifyScenarioChecksum(scenario) {
  const checksum = scenario?.meta?.checksum;
  if (!checksum) return { ok: true, reason: 'missing-checksum' };
  const payloadWithoutMeta = { ...scenario, meta: undefined };
  const expected = hashScenarioPayload(payloadWithoutMeta);
  return { ok: checksum === expected, expected, received: checksum };
}
