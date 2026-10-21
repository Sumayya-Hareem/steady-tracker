// The app's single source of truth: in-memory state, a tiny pub/sub, and
// debounced write-through to a storage adapter. UI code reads `store.state`
// and calls actions; it never touches storage directly.
//
// Writes are queued per record and flushed after `debounceMs` of quiet, so
// typing in a text field costs one small IndexedDB write — not a whole-state
// JSON.stringify per keystroke.

import { normalize, SCHEMA_VERSION } from './core/schema.js';

export function createStore(adapter, { onError = () => {}, debounceMs = 300 } = {}) {
  let state = normalize(null);
  const listeners = new Map(); // topic -> Set<fn>
  const pending = new Map(); // record key -> async task
  let timer = null;

  function emit(topic) {
    for (const t of new Set([topic, '*'])) listeners.get(t)?.forEach((fn) => fn(state, topic));
  }

  /** Listen to one topic or a list of them: 'settings' | 'habits' | 'day' | 'weights' | '*'. */
  function subscribe(topics, fn) {
    const list = [].concat(topics);
    for (const t of list) {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t).add(fn);
    }
    return () => list.forEach((t) => listeners.get(t)?.delete(fn));
  }

  function queue(key, task) {
    pending.set(key, task);
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  }

  async function flush() {
    clearTimeout(timer);
    timer = null;
    const tasks = [...pending.values()];
    pending.clear();
    try {
      await Promise.all(tasks.map((t) => t()));
    } catch (err) {
      onError(err);
    }
  }

  const saveSettings = () => queue('settings', () => adapter.putSettings(state.settings));
  const saveHabits = () => queue('habits', () => adapter.putHabits(state.habits));

  return {
    get state() {
      return state;
    },
    subscribe,
    flush,

    /** Replace everything with already-loaded data (no write). */
    init(data) {
      state = normalize(data);
      emit('*');
    },

    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      saveSettings();
      emit('settings');
    },

    /** Mutate one day's record in place; creates it if needed. */
    updateDay(date, mutate) {
      const day = (state.days[date] ??= {});
      mutate(day);
      queue(`day:${date}`, () => (state.days[date] ? adapter.putDay(date, state.days[date]) : adapter.deleteDay(date)));
      emit('day');
    },

    setWeight(entry) {
      const rest = state.weights.filter((w) => w.date !== entry.date);
      state.weights = [...rest, entry].sort((a, b) => (a.date < b.date ? -1 : 1));
      queue(`weight:${entry.date}`, () => {
        const w = state.weights.find((x) => x.date === entry.date);
        return w ? adapter.putWeight(w) : adapter.deleteWeight(entry.date);
      });
      emit('weights');
    },

    removeWeight(date) {
      state.weights = state.weights.filter((w) => w.date !== date);
      queue(`weight:${date}`, () => adapter.deleteWeight(date));
      emit('weights');
    },

    /** Add a habit or replace one with the same id. */
    saveHabit(habit) {
      const i = state.habits.findIndex((h) => h.id === habit.id);
      state.habits = i >= 0 ? state.habits.map((h, j) => (j === i ? habit : h)) : [...state.habits, habit];
      saveHabits();
      emit('habits');
    },

    moveHabit(id, delta) {
      const i = state.habits.findIndex((h) => h.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= state.habits.length) return;
      const next = [...state.habits];
      [next[i], next[j]] = [next[j], next[i]];
      state.habits = next;
      saveHabits();
      emit('habits');
    },

    setHabitArchived(id, archived) {
      state.habits = state.habits.map((h) => (h.id === id ? { ...h, archived } : h));
      saveHabits();
      emit('habits');
    },

    /** Swap in a whole new dataset (backup restore, demo data) and persist it at once. */
    async replaceAll(raw) {
      state = normalize(raw);
      pending.clear();
      clearTimeout(timer);
      await adapter.replaceAll(state);
      emit('*');
    },

    async reset() {
      state = normalize(null);
      pending.clear();
      clearTimeout(timer);
      await adapter.clear();
      emit('*');
    },

    /** The shape written to backup files. */
    snapshot() {
      const { settings, habits, days, weights } = state;
      return { app: 'steady', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings, habits, days, weights };
    },
  };
}
