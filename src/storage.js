// Storage adapters. The store talks to one small interface:
//   load() -> data | null      putSettings(s)   putHabits(list)
//   putDay(date, day)          deleteDay(date)
//   putWeight(entry)           deleteWeight(date)
//   replaceAll(data)           clear()
//   meta.get(key) / meta.set(key, value)
// IndexedDB is the real backend (async, no 5 MB cap, indexed by date).
// localStorage is a fallback for browsers that block IndexedDB; the in-memory
// adapter backs the unit tests.

import { normalize } from './core/schema.js';

export const LEGACY_KEY = 'steady.v1'; // where v1 of the app kept everything
const FALLBACK_KEY = 'steady.v2';

/* ---------- IndexedDB ---------- */

const DB_NAME = 'steady';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('meta', { keyPath: 'key' });
      db.createObjectStore('days', { keyPath: 'date' });
      db.createObjectStore('weights', { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

// Runs `fn(tx)` inside one transaction; `fn` may return a function that reads results.
function run(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let read;
    try {
      read = fn(tx);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(typeof read === 'function' ? read() : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function createIdbAdapter(db) {
  const putMeta = (tx, key, value) => tx.objectStore('meta').put({ key, value });
  return {
    kind: 'indexeddb',
    async load() {
      return run(db, ['meta', 'days', 'weights'], 'readonly', (tx) => {
        const settings = tx.objectStore('meta').get('settings');
        const habits = tx.objectStore('meta').get('habits');
        const days = tx.objectStore('days').getAll();
        const weights = tx.objectStore('weights').getAll();
        return () => {
          if (!settings.result && !days.result.length && !weights.result.length) return null;
          const dayMap = {};
          for (const { date, ...rest } of days.result) dayMap[date] = rest;
          return {
            settings: settings.result?.value,
            habits: habits.result?.value,
            days: dayMap,
            weights: weights.result,
          };
        };
      });
    },
    putSettings: (s) => run(db, ['meta'], 'readwrite', (tx) => putMeta(tx, 'settings', s)),
    putHabits: (list) => run(db, ['meta'], 'readwrite', (tx) => putMeta(tx, 'habits', list)),
    putDay: (date, day) => run(db, ['days'], 'readwrite', (tx) => tx.objectStore('days').put({ ...day, date })),
    deleteDay: (date) => run(db, ['days'], 'readwrite', (tx) => tx.objectStore('days').delete(date)),
    putWeight: (entry) => run(db, ['weights'], 'readwrite', (tx) => tx.objectStore('weights').put(entry)),
    deleteWeight: (date) => run(db, ['weights'], 'readwrite', (tx) => tx.objectStore('weights').delete(date)),
    replaceAll: (data) =>
      run(db, ['meta', 'days', 'weights'], 'readwrite', (tx) => {
        tx.objectStore('days').clear();
        tx.objectStore('weights').clear();
        putMeta(tx, 'settings', data.settings);
        putMeta(tx, 'habits', data.habits);
        for (const [date, day] of Object.entries(data.days)) tx.objectStore('days').put({ ...day, date });
        for (const w of data.weights) tx.objectStore('weights').put(w);
      }),
    clear: () =>
      run(db, ['meta', 'days', 'weights'], 'readwrite', (tx) => {
        tx.objectStore('days').clear();
        tx.objectStore('weights').clear();
        tx.objectStore('meta').delete('settings');
        tx.objectStore('meta').delete('habits');
      }),
    meta: {
      get: (key) => run(db, ['meta'], 'readonly', (tx) => {
        const r = tx.objectStore('meta').get(key);
        return () => r.result?.value;
      }),
      set: (key, value) => run(db, ['meta'], 'readwrite', (tx) => putMeta(tx, key, value)),
    },
  };
}

/* ---------- in-memory (tests) and localStorage (fallback) ---------- */

export function createMemoryAdapter(initial = null) {
  let data = initial ? structuredClone(initial) : null;
  const metaStore = new Map();
  const ensure = () => (data ??= { settings: undefined, habits: undefined, days: {}, weights: [] });
  const adapter = {
    kind: 'memory',
    calls: [], // handy for asserting how often the store writes
    async load() {
      return data ? structuredClone(data) : null;
    },
    async putSettings(s) { adapter.calls.push('putSettings'); ensure().settings = structuredClone(s); },
    async putHabits(l) { adapter.calls.push('putHabits'); ensure().habits = structuredClone(l); },
    async putDay(date, day) { adapter.calls.push(`putDay:${date}`); ensure().days[date] = structuredClone(day); },
    async deleteDay(date) { adapter.calls.push(`deleteDay:${date}`); delete ensure().days[date]; },
    async putWeight(w) {
      adapter.calls.push(`putWeight:${w.date}`);
      const d = ensure();
      d.weights = d.weights.filter((x) => x.date !== w.date).concat(structuredClone(w));
    },
    async deleteWeight(date) {
      adapter.calls.push(`deleteWeight:${date}`);
      const d = ensure();
      d.weights = d.weights.filter((x) => x.date !== date);
    },
    async replaceAll(next) { adapter.calls.push('replaceAll'); data = structuredClone(next); },
    async clear() { adapter.calls.push('clear'); data = null; },
    meta: {
      async get(key) { return metaStore.get(key); },
      async set(key, value) { metaStore.set(key, value); },
    },
  };
  return adapter;
}

export function createLocalAdapter(storage) {
  const read = () => {
    try { return JSON.parse(storage.getItem(FALLBACK_KEY)); } catch { return null; }
  };
  let data = read();
  const write = () => storage.setItem(FALLBACK_KEY, JSON.stringify(data));
  const ensure = () => (data ??= { settings: undefined, habits: undefined, days: {}, weights: [], meta: {} });
  return {
    kind: 'localstorage',
    async load() { return data && (data.settings || Object.keys(data.days).length || data.weights.length) ? structuredClone(data) : null; },
    async putSettings(s) { ensure().settings = s; write(); },
    async putHabits(l) { ensure().habits = l; write(); },
    async putDay(date, day) { ensure().days[date] = day; write(); },
    async deleteDay(date) { delete ensure().days[date]; write(); },
    async putWeight(w) { const d = ensure(); d.weights = d.weights.filter((x) => x.date !== w.date).concat(w); write(); },
    async deleteWeight(date) { const d = ensure(); d.weights = d.weights.filter((x) => x.date !== date); write(); },
    async replaceAll(next) { data = { ...structuredClone(next), meta: data?.meta ?? {} }; write(); },
    async clear() { data = { settings: undefined, habits: undefined, days: {}, weights: [], meta: data?.meta ?? {} }; write(); },
    meta: {
      async get(key) { return ensure().meta?.[key]; },
      async set(key, value) { const d = ensure(); d.meta = { ...d.meta, [key]: value }; write(); },
    },
  };
}

/* ---------- opening + legacy migration ---------- */

/** Prefer IndexedDB; fall back to localStorage if it's unavailable or blocked. */
export async function openAdapter() {
  try {
    if (!('indexedDB' in globalThis)) throw new Error('no indexedDB');
    return createIdbAdapter(await openDb());
  } catch {
    return createLocalAdapter(globalThis.localStorage);
  }
}

/** Data written by v1 of the app (single JSON blob in localStorage), or null. */
export function readLegacy(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Load saved data. On the very first run after upgrading, pull in the v1
 * localStorage blob once. The old blob is left in place as a safety copy.
 * Returns { data, migrated }.
 */
export async function loadWithMigration(adapter, legacyStorage = globalThis.localStorage) {
  const saved = await adapter.load();
  if (saved) return { data: normalize(saved), migrated: false };
  if (!(await adapter.meta.get('legacyImported'))) {
    const legacy = readLegacy(legacyStorage);
    if (legacy) {
      const data = normalize(legacy);
      await adapter.replaceAll(data);
      await adapter.meta.set('legacyImported', true);
      return { data, migrated: true };
    }
  }
  return { data: normalize(null), migrated: false };
}

/** Mark legacy data as handled (used by "erase everything" so it can't come back). */
export async function discardLegacy(adapter, legacyStorage = globalThis.localStorage) {
  try { legacyStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  await adapter.meta.set('legacyImported', true);
}
