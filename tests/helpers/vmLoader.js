import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function makeStorageMock() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

export function makeSupabaseMock() {
  const _state = { data: null, error: null };

  function makeChain() {
    const c = {
      select: () => c,
      insert: () => c,
      update: () => c,
      eq: () => c,
      single: () => c,
      order: () => c,
      filter: () => c,
      then(resolve, reject) {
        return Promise.resolve({ data: _state.data, error: _state.error }).then(resolve, reject);
      },
    };
    return c;
  }

  return {
    from: () => makeChain(),
    rpc: () => makeChain(),
    channel: () => ({
      on() { return this; },
      subscribe() { return {}; },
    }),
    _setResult(data, error = null) {
      _state.data = data;
      _state.error = error;
    },
  };
}

/**
 * Load source files into an isolated vm context with browser-like globals.
 * Functions declared with `function` keyword are accessible on the returned ctx.
 * Extra globals override the defaults (pass window, CONFIG, fetch, etc. here).
 */
export function loadFiles(filePaths, extraGlobals = {}) {
  const ctx = createContext({
    Math,
    Date,
    JSON,
    console,
    Array,
    Object,
    Promise,
    Error,
    Boolean,
    Number,
    String,
    RegExp,
    Set,
    Map,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: () => {},
    clearTimeout: () => {},
    sessionStorage: makeStorageMock(),
    localStorage: makeStorageMock(),
    fetch: async () => { throw new Error('fetch not mocked — pass fetch in extraGlobals'); },
    crypto: { randomUUID: () => crypto.randomUUID() },
    window: {},
    CONFIG: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    ...extraGlobals,
  });

  for (const relPath of filePaths) {
    const src = readFileSync(join(ROOT, relPath), 'utf8');
    runInContext(src, ctx);
  }

  return ctx;
}
