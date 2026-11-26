import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, SCHEMA_VERSION } from '../src/core/schema.js';
import { bmr, profileReady, weightOn, stepsOn, burn, eaten, dayCalories, isLowDay, weekCalories, LOW_DAY_KCAL } from '../src/core/calories.js';

// Hand-worked numbers for a 30-year-old woman, 160 cm, 70 kg, desk life:
//   BMR   = 10×70 + 6.25×160 − 5×30 − 161 = 1389
//   burn  = 1389 × 1.2 = 1666.8 → 1667 kcal with no steps
//   walk  = 3000 steps × 70 kg × 0.0004 = 84 kcal
const PROFILE = { heightCm: 160, age: 30, sex: 'f', activity: 'desk', startWeight: 70 };
const make = (over = {}) => normalize({ version: SCHEMA_VERSION, settings: PROFILE, days: {}, weights: [], ...over });
const D = '2026-10-20';

test('resting energy follows Mifflin-St Jeor for women and men', () => {
  assert.equal(bmr({ sex: 'f', kg: 70, cm: 160, age: 30 }), 1389);
  assert.equal(bmr({ sex: 'm', kg: 70, cm: 160, age: 30 }), 1555);
});

test('the burn side needs height and age', () => {
  assert.equal(profileReady({ heightCm: 160, age: 30 }), true);
  assert.equal(profileReady({ heightCm: null, age: 30 }), false);
  assert.equal(profileReady({ heightCm: 160, age: null }), false);
  assert.equal(burn(make({ settings: { startWeight: 70 } }), D), null);
});

test('weight for a day is the latest weigh-in on or before it', () => {
  const data = make({ weights: [{ date: '2026-10-16', kg: 70 }, { date: '2026-10-23', kg: 68 }] });
  assert.equal(weightOn(data, '2026-10-20'), 70);
  assert.equal(weightOn(data, '2026-10-23'), 68);
  assert.equal(weightOn(data, '2026-10-10'), 70); // before the first weigh-in: use the first
  assert.equal(weightOn(make({ settings: { ...PROFILE, startWeight: 72 } }), D), 72); // none: starting weight
  assert.equal(weightOn(make({ settings: { heightCm: 160, age: 30 } }), D), null);
});

test('steps add up across habits tracked in steps and ignore other units', () => {
  const habits = [
    { id: 'walk', label: 'Walk', unit: 'steps', target: 3000, schedule: 'daily' },
    { id: 'hike', label: 'Hike', unit: 'steps', target: 1000, schedule: 'daily' },
    { id: 'yoga', label: 'Yoga', unit: 'min', target: 20, schedule: 'daily' },
  ];
  const data = make({ habits, days: { [D]: { amounts: { walk: 3000, hike: 1500, yoga: 45 } } } });
  assert.equal(stepsOn(data, D), 4500);
  assert.equal(stepsOn(data, '2026-10-19'), 0);
});

test('a day burns resting energy x daily life, plus the walk, plus strength days', () => {
  const rest = burn(make(), D);
  assert.deepEqual([rest.bmr, rest.base, rest.walk, rest.strength, rest.total], [1389, 1667, 0, 0, 1667]);

  const walked = burn(make({ days: { [D]: { amounts: { walk: 3000 } } } }), D);
  assert.equal(walked.walk, 84);
  assert.equal(walked.total, 1751); // 1666.8 + 84 = 1750.8

  const lifted = burn(make({ days: { [D]: { checks: { squats: true } } } }), D);
  assert.equal(lifted.strength, 40);
  assert.equal(lifted.total, 1707);

  const light = burn(make({ settings: { ...PROFILE, activity: 'light' } }), D);
  assert.equal(light.total, Math.round(1389 * 1.35));
});

test('eaten: your own total wins, otherwise the food text is estimated', () => {
  assert.equal(eaten(make(), D), null);
  assert.equal(eaten(make({ days: { [D]: { note: 'just a note' } } }), D), null);

  const manual = eaten(make({ days: { [D]: { kcal: 1800, food: { lunch: '2 roti' } } } }), D);
  assert.deepEqual([manual.kcal, manual.manual, manual.complete], [1800, true, true]);

  const two = eaten(make({ days: { [D]: { food: { breakfast: '2 roti', lunch: 'daal' } } } }), D);
  assert.deepEqual([two.kcal, two.manual, two.complete, two.logged], [360, false, false, 2]);

  const three = eaten(make({ days: { [D]: { food: { breakfast: '2 roti', lunch: 'daal', dinner: 'rice' } } } }), D);
  assert.equal(three.complete, true);
});

test('a food it cannot read is reported and left out of the total', () => {
  const e = eaten(make({ days: { [D]: { food: { breakfast: '2 roti', lunch: 'mystery thing', dinner: 'daal' } } } }), D);
  assert.equal(e.kcal, 360);
  assert.deepEqual(e.unknown.map((u) => u.name), ['mystery thing']);
});

test('deficit is burned minus eaten, and unknown while either side is missing', () => {
  const data = make({ days: { [D]: { kcal: 1500 } } });
  assert.equal(dayCalories(data, D).deficit, 1667 - 1500);
  assert.equal(dayCalories(make({ days: { [D]: { kcal: 2000 } } }), D).deficit, 1667 - 2000); // a surplus is negative
  assert.equal(dayCalories(make({ settings: {}, days: { [D]: { kcal: 1500 } } }), D).deficit, null); // no profile
  assert.equal(dayCalories(make(), D).deficit, null); // nothing eaten
});

test('the low-day nudge only fires on a complete day below 1,400', () => {
  assert.equal(LOW_DAY_KCAL, 1400);
  assert.equal(isLowDay(null), false);
  assert.equal(isLowDay({ kcal: 1200, complete: true }), true);
  assert.equal(isLowDay({ kcal: 1399, complete: true }), true);
  assert.equal(isLowDay({ kcal: 1400, complete: true }), false);
  assert.equal(isLowDay({ kcal: 900, complete: false }), false); // half-logged day: probably just not finished
});

test('weekly summary averages only fully logged days', () => {
  const full = (kcal) => ({ kcal });
  const data = make({
    days: {
      '2026-10-14': full(1500),
      '2026-10-16': full(1700),
      '2026-10-18': full(1900),
      '2026-10-19': { food: { breakfast: '2 roti', lunch: 'daal' } }, // two meals: left out
      '2026-10-13': full(500), // outside the 7-day window: left out
    },
  });
  const w = weekCalories(data, D);
  assert.equal(w.days.length, 7);
  assert.equal(w.days[0].date, '2026-10-14');
  assert.equal(w.days[6].date, D);
  assert.equal(w.counted, 3);
  assert.equal(w.avgEaten, 1700);
  assert.equal(w.avgBurned, 1667);
  assert.equal(w.avgDeficit, -33); // (167 − 33 − 233) / 3
  assert.equal(w.totalDeficit, -99);
  assert.equal(w.kgFat, -0.01); // −99 / 7,700 kcal per kg, a tiny surplus
  assert.equal(w.missingProfile, false);
});

test('a real deficit turns into kilograms at 7,700 kcal each', () => {
  const days = {};
  for (const d of ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']) days[d] = { kcal: 1167 }; // 500 below burn
  const w = weekCalories(make({ days }), D);
  assert.equal(w.counted, 4);
  assert.equal(w.avgDeficit, 500);
  assert.equal(w.totalDeficit, 2000);
  assert.equal(w.kgFat, 0.26); // 2000 / 7700
});

test('without height and age the summary says so instead of showing a deficit', () => {
  const w = weekCalories(make({ settings: {}, days: { [D]: { kcal: 1500 } } }), D);
  assert.equal(w.missingProfile, true);
  assert.equal(w.counted, 0);
  assert.equal(w.avgDeficit, null);
});
