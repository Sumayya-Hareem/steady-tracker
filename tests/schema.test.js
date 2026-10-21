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

test('v1 data (no habits list) migrates; walkGoal becomes the walk habit target', () => {
  const v1 = {
    settings: { name: 'Sumu', walkGoal: 45, goalWeight: 55, onboarded: true, startWeight: 70, startDate: '2026-10-16', strengthDays: [1, 3, 6] },
    days: { '2026-10-17': { checks: { walk: true }, amounts: { walk: 40 } } },
    weights: [{ date: '2026-10-16', kg: 70, waist: 37 }],
  };
  const d = normalize(v1);
  assert.equal(d.settings.name, 'Sumu');
  assert.equal(d.settings.onboarded, true);
  assert.equal(d.habits.find((h) => h.id === 'walk').target, 45);
  assert.equal(d.days['2026-10-17'].amounts.walk, 40);
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
    days: {
      '2026-10-20': { checks: { walk: true, water: 'yes' }, amounts: { walk: 30, squats: -2, plank: 'x' }, sleep: { bed: '99:00', wake: '07:00' }, evil: '<script>' },
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
  assert.deepEqual(d.days['2026-10-20'], { checks: { walk: true }, amounts: { walk: 30 }, sleep: { wake: '07:00' } });
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
