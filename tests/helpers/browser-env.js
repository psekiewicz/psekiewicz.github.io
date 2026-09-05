// Minimal stand-ins for the couple of browser globals the pure-logic
// modules under tests/ touch (window.location.origin, localStorage).
// Not a DOM shim - anything that needs real element/document behaviour
// belongs in a browser-driven test instead, not here.

export function installWindow(origin = 'https://example.com') {
  globalThis.window = { location: { origin } };
}

export function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  return globalThis.localStorage;
}
