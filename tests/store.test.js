import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { createMemoryAdapter, loadWithMigration, discardLegacy, LEGACY_KEY, PRE_V3_KEY } from '../src/storage.js';
import { normalize, SCHEMA_VERSION } from '../src/core/schema.js';

const fakeStorage = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), has: (k) => m.has(k) };
};

test('many rapid edits to one day produce a single write', async () => {
  const adapter = createMemoryAdapter();
  const store = createStore(adapter, { debounceMs: 5 });
  for (let i = 1; i <= 25; i++) store.updateDay('2026-10-20', (d) => (d.note = 'x'.repeat(i)));
  await store.flush();
  assert.deepEqual(adapter.calls, ['putDay:2026-10-20']);
  assert.equal((await adapter.load()).days['2026-10-20'].note.length, 25);
});

test('edits to different records write each record once', async () => {
  const adapter = createMemoryAdapter();
  const store = createStore(adapter, { debounceMs: 5 });
  store.updateDay('2026-10-20', (d) => (d.note = 'a'));
  store.updateDay('2026-10-19', (d) => (d.note = 'b'));
  store.updateSettings({ name: 'Sumu' });
  store.updateSettings({ name: 'Sumayya' });
  await store.flush();
  assert.deepEqual([...adapter.calls].sort(), ['putDay:2026-10-19', 'putDay:2026-10-20', 'putSettings']);
  assert.equal((await adapter.load()).settings.name, 'Sumayya');
});

test('subscribers hear only the topics they asked for', () => {
  const store = createStore(createMemoryAdapter(), { debounceMs: 1000 });
  const seen = [];
  const off = store.subscribe(['day'], (_s, topic) => seen.push(topic));
  store.updateDay('2026-10-20', (d) => (d.note = 'x'));
  store.updateSettings({ name: 'n' });
  off();
  store.updateDay('2026-10-20', (d) => (d.note = 'y'));
  assert.deepEqual(seen, ['day']);
});

test('weights stay sorted, replace by date, and can be removed', async () => {
  const adapter = createMemoryAdapter();
  const store = createStore(adapter, { debounceMs: 5 });
  store.setWeight({ date: '2026-10-23', kg: 69 });
  store.setWeight({ date: '2026-10-16', kg: 70 });
  store.setWeight({ date: '2026-10-23', kg: 68.8 });
  assert.deepEqual(store.state.weights.map((w) => w.kg), [70, 68.8]);
  store.removeWeight('2026-10-16');
  await store.flush();
  assert.deepEqual((await adapter.load()).weights.map((w) => w.date), ['2026-10-23']);
});

test('habits: add, edit, reorder and archive', () => {
  const store = createStore(createMemoryAdapter(), { debounceMs: 1000 });
  store.saveHabit({ id: 'h_x', label: 'Stretch', unit: 'min', target: 10, hint: '', schedule: 'daily', archived: false });
  assert.equal(store.state.habits.at(-1).id, 'h_x');
  store.saveHabit({ id: 'h_x', label: 'Stretching', unit: 'min', target: 15, hint: '', schedule: 'daily', archived: false });
  assert.equal(store.state.habits.filter((h) => h.id === 'h_x').length, 1);
  assert.equal(store.state.habits.at(-1).target, 15);
  store.moveHabit('h_x', -1);
  assert.equal(store.state.habits.at(-2).id, 'h_x');
  store.moveHabit('walk', -1); // already first: no-op
  assert.equal(store.state.habits[0].id, 'walk');
  store.setHabitArchived('h_x', true);
  assert.equal(store.state.habits.find((h) => h.id === 'h_x').archived, true);
});

test('replaceAll normalises and persists immediately; reset clears', async () => {
  const adapter = createMemoryAdapter();
  const store = createStore(adapter, { debounceMs: 1000 });
  await store.replaceAll({ settings: { name: 'Imported', evil: 1 }, days: { 'bad': {} }, weights: [] });
  assert.equal(store.state.settings.name, 'Imported');
  assert.equal('evil' in store.state.settings, false);
  assert.deepEqual(adapter.calls, ['replaceAll']);
  await store.reset();
  assert.equal(await adapter.load(), null);
  assert.equal(store.state.settings.onboarded, false);
});

test('snapshot is a versioned, re-importable backup', () => {
  const store = createStore(createMemoryAdapter(), { debounceMs: 1000 });
  store.updateDay('2026-10-20', (d) => (d.note = 'hello'));
  const snap = JSON.parse(JSON.stringify(store.snapshot()));
  assert.equal(snap.app, 'steady');
  assert.equal(snap.version, SCHEMA_VERSION);
  assert.deepEqual(normalize(snap).days['2026-10-20'], { note: 'hello' });
});

test('first run after upgrade imports v1 localStorage data once and keeps the old copy', async () => {
  const v1 = { settings: { name: 'Sumu', onboarded: true, walkGoal: 40 }, days: { '2026-10-17': { checks: { walk: true } } }, weights: [{ date: '2026-10-16', kg: 70 }] };
  const ls = fakeStorage({ [LEGACY_KEY]: JSON.stringify(v1) });
  const adapter = createMemoryAdapter();

  const first = await loadWithMigration(adapter, ls);
  assert.equal(first.migrated, true);
  assert.equal(first.data.settings.name, 'Sumu');
  assert.equal(first.data.habits.find((h) => h.id === 'walk').target, 4000); // 40 min → steps
  assert.equal(ls.has(LEGACY_KEY), true); // safety copy untouched

  const second = await loadWithMigration(adapter, ls);
  assert.equal(second.migrated, false);
  assert.equal(second.data.settings.name, 'Sumu');
});

test('erasing everything stops legacy data from coming back', async () => {
  const ls = fakeStorage({ [LEGACY_KEY]: JSON.stringify({ settings: { name: 'Old', onboarded: true }, days: {}, weights: [] }) });
  const adapter = createMemoryAdapter();
  await loadWithMigration(adapter, ls);
  await adapter.clear();
  await discardLegacy(adapter, ls);
  const after = await loadWithMigration(adapter, ls);
  assert.equal(after.migrated, false);
  assert.equal(after.data.settings.onboarded, false);
  assert.equal(ls.has(LEGACY_KEY), false);
});

test('corrupt legacy data is ignored, not fatal', async () => {
  const ls = fakeStorage({ [LEGACY_KEY]: '{not json' });
  const { data, migrated } = await loadWithMigration(createMemoryAdapter(), ls);
  assert.equal(migrated, false);
  assert.equal(data.settings.onboarded, false);
});

/* ---------- the steps update on an existing install ---------- */

const D17 = '2026-10-17';
const v2Install = () => ({
  settings: { name: 'Sumu', onboarded: true },
  habits: [{ id: 'walk', label: 'Evening walk', unit: 'min', target: 30, hint: '', schedule: 'daily' }],
  days: { [D17]: { checks: { walk: true }, amounts: { walk: 35 } } },
  weights: [{ date: '2026-10-16', kg: 70 }],
});

test('existing data is converted to steps once, with a copy of the original kept', async () => {
  const adapter = createMemoryAdapter(v2Install());
  const ls = fakeStorage();

  const first = await loadWithMigration(adapter, ls);
  assert.equal(first.upgraded, true);
  assert.equal(first.data.days[D17].amounts.walk, 3500);
  assert.equal(first.data.habits[0].unit, 'steps');
  assert.equal(first.data.settings.name, 'Sumu');
  assert.deepEqual(first.data.weights, [{ date: '2026-10-16', kg: 70 }]);

  const kept = await adapter.meta.get(PRE_V3_KEY);
  assert.equal(kept.data.days[D17].amounts.walk, 35); // exactly what it was before
  assert.equal(kept.data.habits[0].unit, 'min');
  assert.equal(await adapter.meta.get('schemaVersion'), 3);

  for (let i = 0; i < 3; i++) { // every later start leaves it alone
    const again = await loadWithMigration(adapter, ls);
    assert.equal(again.upgraded, false);
    assert.equal(again.data.days[D17].amounts.walk, 3500);
    assert.equal(again.data.habits[0].target, 3000);
  }
});

test('already-upgraded data is never converted, whatever the numbers look like', async () => {
  const seed = v2Install();
  seed.habits[0] = { ...seed.habits[0], unit: 'steps', target: 3000 };
  seed.days[D17].amounts.walk = 40; // 40 steps, not 40 minutes
  const adapter = createMemoryAdapter(seed);
  await adapter.meta.set('schemaVersion', 3);
  const { data, upgraded } = await loadWithMigration(adapter, fakeStorage());
  assert.equal(upgraded, false);
  assert.equal(data.days[D17].amounts.walk, 40);
  assert.equal(await adapter.meta.get(PRE_V3_KEY), undefined);
});

test('a fresh install is stamped so nothing is converted later', async () => {
  const adapter = createMemoryAdapter();
  const ls = fakeStorage();
  const first = await loadWithMigration(adapter, ls);
  assert.equal(first.upgraded, false);
  assert.equal(await adapter.meta.get('schemaVersion'), 3);
  assert.equal(first.data.habits.find((h) => h.id === 'walk').unit, 'steps');

  await adapter.putDay(D17, { amounts: { walk: 40 } });
  await adapter.putHabits(first.data.habits);
  const second = await loadWithMigration(adapter, ls);
  assert.equal(second.data.days[D17].amounts.walk, 40);
});

test('if the upgrade cannot be saved it stops and leaves the original data untouched', async () => {
  const adapter = createMemoryAdapter(v2Install());
  adapter.replaceAll = async () => { throw new Error('disk full'); };
  await assert.rejects(loadWithMigration(adapter, fakeStorage()), /disk full/);
  const stored = await adapter.load();
  assert.equal(stored.days[D17].amounts.walk, 35);
  assert.equal(stored.habits[0].unit, 'min');
  assert.equal(await adapter.meta.get('schemaVersion'), undefined); // so it tries again next time
});

test('restoring an old backup converts it, and the next backup is the new version', async () => {
  const store = createStore(createMemoryAdapter(), { debounceMs: 1000 });
  await store.replaceAll({ app: 'steady', version: 2, ...v2Install() });
  assert.equal(store.state.days[D17].amounts.walk, 3500);
  assert.equal(store.state.habits[0].unit, 'steps');
  const snap = JSON.parse(JSON.stringify(store.snapshot()));
  assert.equal(snap.version, 3);
  assert.equal(normalize(snap).days[D17].amounts.walk, 3500); // restoring that backup again changes nothing
});
