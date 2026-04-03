export function cloneValue(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
