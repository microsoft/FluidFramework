// Add mock localStorage to globalThis context for test runs under jest-puppeteer
const mock = (function() {
    var store = {};
    return {
      getItem: function(key) {
        return store[key] ?? null; // localStorage API uses `null`, not `undefined` to signal no entry
      },
      setItem: function(key, value) {
        store[key] = value.toString();
      },
      clear: function() {
        store = {};
      }
    };
  })();

Object.defineProperty(globalThis, 'localStorage', { value: mock });
