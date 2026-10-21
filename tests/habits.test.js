import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/core/schema.js';
import { score, isGoodDay, streak, applicableHabits, isStrengthDay, weekStats, hasData, stepFor } from '../src/core/habits.js';
import { addDays } from '../src/core/dates.js';

// 2026-10-19 is a Monday, 2026-10-20 a Tuesday (default strength days: Mon, Wed, Sat)
const MON = '2026-10-19';
const TUE = '2026-10-20';

function dataWith(days = {}, mutate) {
  const d = normalize({ days });
  if (mutate) mutate(d);
  return d;
}
const tickAll = (data, date) => {
  const checks = {};
  for (const h of applicableHabits(data, date)) checks[h.id] = true;
  data.days[date] = { checks };
};
const tickSome = (data, date, n) => {
  const checks = {};
  applicableHabits(data, date).slice(0, n).forEach((h) => (checks[h.id] = true));
  data.days[date] = { checks };
};

test('strength habits only apply on strength days', () => {
  const d = dataWith();
  assert.equal(isStrengthDay(d, MON), true);
  assert.equal(isStrengthDay(d, TUE), false);
  assert.equal(applicableHabits(d, MON).length, 9);
  assert.equal(applicableHabits(d, TUE).length, 5);
});

test('"I did strength anyway" turns on strength habits for a rest day', () => {
  const d = dataWith({ [TUE]: { extraStrength: true } });
  assert.equal(isStrengthDay(d, TUE), true);
  assert.equal(applicableHabits(d, TUE).length, 9);
});

test('archived habits are ignored by scoring', () => {
  const d = dataWith({}, (x) => { x.habits.find((h) => h.id === 'oil').archived = true; });
  assert.equal(score(d, TUE).total, 4);
});

test('score counts done over applicable', () => {
  const d = dataWith({ [TUE]: { checks: { walk: true, water: true } } });
  assert.deepEqual({ done: score(d, TUE).done, total: score(d, TUE).total }, { done: 2, total: 5 });
});

test('good day needs at least 60% of the day', () => {
  const d = dataWith();
  tickSome(d, TUE, 2); // 2/5 = 40%
  assert.equal(isGoodDay(d, TUE), false);
  tickSome(d, TUE, 3); // 3/5 = 60%
  assert.equal(isGoodDay(d, TUE), true);
});

test('a day with no habits at all is never good', () => {
  const d = dataWith({}, (x) => x.habits.forEach((h) => (h.archived = true)));
  assert.equal(isGoodDay(d, TUE), false);
  assert.equal(streak(d, TUE), 0);
});

test('streak counts consecutive good days ending today', () => {
  const d = dataWith();
  for (const i of [0, 1, 2]) tickAll(d, addDays(TUE, -i));
  assert.equal(streak(d, TUE), 3);
});

test("an unfinished today doesn't break the streak", () => {
  const d = dataWith();
  for (const i of [1, 2, 3, 4]) tickAll(d, addDays(TUE, -i));
  assert.equal(streak(d, TUE), 4);
});

test('a missing day ends the streak', () => {
  const d = dataWith();
  tickAll(d, TUE);
  tickAll(d, addDays(TUE, -1));
  // gap on -2 (no entry at all)
  tickAll(d, addDays(TUE, -3));
  tickAll(d, addDays(TUE, -4));
  assert.equal(streak(d, TUE), 2);
});

test('streak is zero when neither today nor yesterday is good', () => {
  const d = dataWith();
  tickAll(d, addDays(TUE, -3));
  assert.equal(streak(d, TUE), 0);
});

test('weekStats averages completion and sleep over the last 7 days', () => {
  const d = dataWith();
  tickAll(d, TUE);
  d.days[TUE].sleep = { bed: '23:00', wake: '07:00' };
  d.days[MON] = { sleep: { bed: '22:00', wake: '06:00' } };
  const w = weekStats(d, TUE);
  assert.equal(w.days.length, 7);
  assert.equal(w.days.at(-1).date, TUE);
  assert.equal(w.goodDays, 1);
  assert.equal(w.avgSleep, 8);
  assert.equal(w.sleepNights, 2);
  assert.equal(w.avgPct, Math.round((1 / 7) * 100)); // one perfect day, six empty
});

test('hasData and stepFor', () => {
  assert.equal(hasData(undefined), false);
  assert.equal(hasData({}), false);
  assert.equal(hasData({ checks: { walk: true } }), true);
  assert.equal(hasData({ food: { lunch: '' } }), false);
  assert.equal(hasData({ note: 'hi' }), true);
  assert.equal(stepFor('min'), 5);
  assert.equal(stepFor('reps'), 1);
  assert.equal(stepFor(null), 1);
});
