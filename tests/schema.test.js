import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isBackupShape, cleanHabit, SCHEMA_VERSION } from '../src/core/schema.js';
import { generateDemo } from '../src/core/demo.js';
import { score } from '../src/core/habits.js';

test('normalize(null) gives clean defaults', () => {
  const d = normalize(null);
  assert.equal(d.version, SCHEMA_VERSION);
  assert.equal(d.settings.onboarded, false);
  assert.equal(d.habits.length, 9);
  assert.deepEqual(d.days, {});
  assert.deepEqual(d.weights, []);
});

test('v1 data (no habits list) migrates; walkGoal becomes the walk habit target, in steps', () => {
  const v1 = {
    settings: { name: 'Sumu', walkGoal: 45, goalWeight: 55, onboarded: true, startWeight: 70, startDate: '2026-10-16', strengthDays: [1, 3, 6] },
    days: { '2026-10-17': { checks: { walk: true }, amounts: { walk: 40 } } },
    weights: [{ date: '2026-10-16', kg: 70, waist: 37 }],
  };
  const d = normalize(v1);
  assert.equal(d.settings.name, 'Sumu');
  assert.equal(d.settings.onboarded, true);
  const walk = d.habits.find((h) => h.id === 'walk');
  assert.equal(walk.unit, 'steps');
  assert.equal(walk.target, 4500); // 45 min at ~100 steps a minute
  assert.equal(d.days['2026-10-17'].amounts.walk, 4000);
  assert.deepEqual(d.weights, [{ date: '2026-10-16', kg: 70, waist: 37 }]);
  assert.equal('walkGoal' in d.settings, false);
});

test('normalize is idempotent', () => {
  const once = normalize(generateDemo('2026-10-20'));
  assert.deepEqual(normalize(once), once);
});

test('garbage input cannot break the shape', () => {
  for (const bad of [undefined, 42, 'str', [], { settings: 'x', days: 5, weights: 'no', habits: 7 }]) {
    const d = normalize(bad);
    assert.equal(d.habits.length, 9);
    assert.deepEqual(d.weights, []);
  }
});

test('invalid settings fall back to defaults field by field', () => {
  const d = normalize({ settings: { bedtime: '25:99', waistUnit: 'furlongs', weighDay: 9, strengthDays: [1, 1, 3, 'x', 8], name: 'x'.repeat(100), goalWeight: 'heavy' } });
  assert.equal(d.settings.bedtime, '22:30');
  assert.equal(d.settings.waistUnit, 'in');
  assert.equal(d.settings.weighDay, 5);
  assert.deepEqual(d.settings.strengthDays, [1, 3]);
  assert.equal(d.settings.name.length, 40);
  assert.equal(d.settings.goalWeight, null);
});

test('bad days, weights and unknown keys are dropped', () => {
  const d = normalize({
    version: SCHEMA_VERSION,
    days: {
      '2026-10-20': { checks: { walk: true, water: 'yes' }, amounts: { walk: 3000, squats: -2, plank: 'x' }, sleep: { bed: '99:00', wake: '07:00' }, evil: '<script>' },
      'not-a-date': { checks: { walk: true } },
      '2026-02-30': {},
    },
    weights: [
      { date: '2026-10-16', kg: 70 },
      { date: '2026-10-16', kg: 69 }, // duplicate date: last wins
      { date: '2026-10-17', kg: 5 }, // implausible
      { date: 'x', kg: 70 },
      { date: '2026-10-18', kg: '68.5', waist: -4 },
    ],
  });
  assert.deepEqual(Object.keys(d.days), ['2026-10-20']);
  assert.deepEqual(d.days['2026-10-20'], { checks: { walk: true }, amounts: { walk: 3000 }, sleep: { wake: '07:00' } });
  assert.deepEqual(d.weights, [{ date: '2026-10-16', kg: 69 }, { date: '2026-10-18', kg: 68.5 }]);
});

test('habits are sanitised: bad entries dropped, ids unique, units validated', () => {
  const d = normalize({
    habits: [
      { id: 'a', label: '  Stretch ', unit: 'min', target: 10, schedule: 'daily' },
      { id: 'a', label: 'Duplicate id' },
      { id: 'b', label: '' },
      { label: 'No id' },
      { id: 'c', label: 'Odd unit', unit: 'parsecs', target: 9, schedule: 'weird' },
      'junk',
    ],
  });
  assert.deepEqual(d.habits.map((h) => h.id), ['a', 'c']);
  assert.equal(d.habits[0].label, 'Stretch');
  assert.equal(d.habits[1].unit, null);
  assert.equal(d.habits[1].target, null);
  assert.equal(d.habits[1].schedule, 'daily');
});

test('cleanHabit keeps the bedtime auto flag only when valid', () => {
  assert.equal(cleanHabit({ id: 'bed', label: 'Bed', auto: 'bedtime' }).auto, 'bedtime');
  assert.equal('auto' in cleanHabit({ id: 'x', label: 'X', auto: 'rm -rf' }), false);
});

test('isBackupShape', () => {
  assert.equal(isBackupShape({ settings: {}, days: {}, weights: [] }), true);
  assert.equal(isBackupShape({ settings: {}, days: [], weights: [] }), false);
  assert.equal(isBackupShape(null), false);
  assert.equal(isBackupShape({ foo: 1 }), false);
});

test('demo data is deterministic, valid and mid-journey', () => {
  const a = generateDemo('2026-10-20');
  const b = generateDemo('2026-10-20');
  assert.deepEqual(a, b);
  assert.equal(a.settings.demo, true);
  assert.equal(a.settings.onboarded, true);
  assert.ok(a.weights.length >= 5);
  assert.ok(a.weights.at(-1).kg < a.weights[0].kg);
  assert.equal(a.days['2026-10-20'], undefined); // today left open
  assert.ok(score(a, '2026-10-19').done > 0);
});

/* ---------- walk: minutes -> steps (schema v3) ---------- */

const walkHabit = (over = {}) => ({ id: 'walk', label: 'Evening walk', unit: 'min', target: 30, hint: '', schedule: 'daily', ...over });
const walkOf = (d) => d.habits.find((h) => h.id === 'walk');

test('a v2 backup (walk in minutes) converts to steps: ~100 steps a minute, rounded to 10', () => {
  const d = normalize({
    version: 2,
    habits: [walkHabit()],
    days: {
      '2026-10-17': { checks: { walk: true }, amounts: { walk: 35 } },
      '2026-10-18': { amounts: { walk: 33 } },
      '2026-10-19': { amounts: { walk: 7 } },
    },
  });
  assert.equal(d.version, 3);
  assert.deepEqual([walkOf(d).unit, walkOf(d).target], ['steps', 3000]);
  assert.equal(d.days['2026-10-17'].amounts.walk, 3500);
  assert.equal(d.days['2026-10-18'].amounts.walk, 3300);
  assert.equal(d.days['2026-10-19'].amounts.walk, 700);
});

test('converting never runs twice: already-converted data is left alone', () => {
  const v2 = { version: 2, habits: [walkHabit()], days: { '2026-10-17': { amounts: { walk: 35 } } } };
  const once = normalize(v2);
  assert.deepEqual(normalize(once), once);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(once))), once);
  assert.equal(normalize({ ...once, version: 3 }).days['2026-10-17'].amounts.walk, 3500);
});

test('values that are already steps are never multiplied (the 300,000-steps bug)', () => {
  // no version at all, but the habit is already in steps: nothing to convert
  const d = normalize({ habits: [walkHabit({ unit: 'steps', target: 3000 })], days: { '2026-10-17': { amounts: { walk: 250 } } } });
  assert.equal(walkOf(d).target, 3000);
  assert.equal(d.days['2026-10-17'].amounts.walk, 250);
  // a missing walkGoal must not turn into a huge target
  assert.equal(walkOf(normalize({ settings: {} })).target, 3000);
  // an old-looking day with a big number is steps, not minutes
  assert.equal(normalize({ days: { '2026-10-17': { amounts: { walk: 4500 } } } }).days['2026-10-17'].amounts.walk, 4500);
});

test('only the walk is converted: a changed walk unit and other minute habits are left alone', () => {
  const d = normalize({
    version: 2,
    habits: [walkHabit({ unit: 'times', target: 1 }), { id: 'yoga', label: 'Yoga', unit: 'min', target: 20, schedule: 'daily' }],
    days: { '2026-10-17': { amounts: { walk: 2, yoga: 25 } } },
  });
  assert.deepEqual([walkOf(d).unit, walkOf(d).target], ['times', 1]);
  assert.equal(d.days['2026-10-17'].amounts.walk, 2);
  assert.equal(d.days['2026-10-17'].amounts.yoga, 25);
  assert.equal(d.habits.find((h) => h.id === 'yoga').unit, 'min');
});

test('the walk habit keeps its label, hint and place when converted', () => {
  const d = normalize({ version: 2, habits: [walkHabit({ label: 'My walk', hint: 'After maghrib' }), { id: 'water', label: 'Water', unit: 'glasses', target: 8, schedule: 'daily' }] });
  assert.deepEqual(d.habits.map((h) => h.id), ['walk', 'water']);
  assert.deepEqual([walkOf(d).label, walkOf(d).hint], ['My walk', 'After maghrib']);
});

/* ---------- calorie settings and day totals ---------- */

test('calorie settings are validated field by field', () => {
  const ok = normalize({ settings: { heightCm: 162.5, age: 29, sex: 'm', activity: 'light' } }).settings;
  assert.deepEqual([ok.heightCm, ok.age, ok.sex, ok.activity], [162.5, 29, 'm', 'light']);
  const bad = normalize({ settings: { heightCm: 50, age: 5, sex: 'x', activity: 'turbo' } }).settings;
  assert.deepEqual([bad.heightCm, bad.age, bad.sex, bad.activity], [null, null, 'f', 'desk']);
  assert.equal(normalize({ settings: { age: 25.5 } }).settings.age, null);
  assert.equal(normalize(null).settings.heightCm, null);
});

test('taught foods are cleaned: lowercase, whole kcal, no duplicates, no junk', () => {
  const { customFoods } = normalize({
    settings: {
      customFoods: [
        { name: '  Zinger  Wrap ', kcal: 519.6 },
        { name: 'zinger wrap', kcal: 480 }, // same name: the last one wins
        { name: 'free food', kcal: 0 },
        { name: 'huge', kcal: 9000 },
        { name: '', kcal: 100 },
        'junk',
        { name: 'kheer', kcal: '250' },
      ],
    },
  }).settings;
  assert.deepEqual(customFoods, [{ name: 'zinger wrap', kcal: 480 }, { name: 'kheer', kcal: 250 }]);
  assert.equal(normalize({ settings: { customFoods: Array.from({ length: 300 }, (_, i) => ({ name: `f${i}`, kcal: 10 })) } }).settings.customFoods.length, 200);
});

test('a typed daily calorie total is kept when sane and counts as data', () => {
  const day = (kcal) => normalize({ version: 3, days: { '2026-10-20': { kcal } } }).days['2026-10-20'];
  assert.deepEqual(day(1850.4), { kcal: 1850 });
  for (const bad of [-5, 99999, 'lots', NaN, null]) assert.equal('kcal' in day(bad), false, String(bad)); // not stored
});
