import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paceSegment, expectedLoss, checkpointStatus, linearRegression, weeklyRate, checkpointWeight } from '../src/core/pace.js';
import { niceTicks, linearScale } from '../src/core/scale.js';

const settings = { startWeight: 70, startDate: '2026-10-16', checkpointKg: 4, checkpointDate: '2026-11-27' }; // 42 days

test('checkpointWeight and paceSegment', () => {
  assert.equal(checkpointWeight(settings), 66);
  assert.deepEqual(paceSegment(settings), {
    from: { date: '2026-10-16', kg: 70 },
    to: { date: '2026-11-27', kg: 66 },
  });
  assert.equal(paceSegment({ ...settings, startWeight: null }), null);
  assert.equal(paceSegment({ ...settings, checkpointDate: '2026-10-10' }), null);
  assert.equal(paceSegment({ ...settings, checkpointKg: 0 }), null);
});

test('expectedLoss interpolates linearly and clamps at both ends', () => {
  assert.equal(expectedLoss(settings, '2026-10-16'), 0);
  assert.equal(expectedLoss(settings, '2026-11-06'), 2); // day 21 of 42
  assert.equal(expectedLoss(settings, '2026-11-27'), 4);
  assert.equal(expectedLoss(settings, '2026-10-01'), 0); // before start
  assert.equal(expectedLoss(settings, '2027-01-01'), 4); // after checkpoint
});

test('checkpointStatus states', () => {
  const w = (kg) => [{ date: '2026-11-06', kg }];
  assert.equal(checkpointStatus(settings, w(68), '2026-11-06').state, 'on-pace');
  assert.equal(checkpointStatus(settings, w(67.8), '2026-11-06').state, 'on-pace'); // within 0.3 kg tolerance
  assert.equal(checkpointStatus(settings, w(69), '2026-11-06').state, 'behind');
  assert.equal(checkpointStatus(settings, w(65.5), '2026-11-06').state, 'reached');
  assert.equal(checkpointStatus(settings, w(68), '2026-12-05').state, 'passed');
  assert.equal(checkpointStatus(settings, [], '2026-11-06'), null);
  const s = checkpointStatus(settings, w(68), '2026-11-06');
  assert.equal(s.lost, 2);
  assert.equal(s.pct, 50);
  assert.equal(s.daysLeft, 21);
});

test('linearRegression recovers an exact line', () => {
  const fit = linearRegression([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
  assert.ok(Math.abs(fit.slope - 2) < 1e-12);
  assert.ok(Math.abs(fit.intercept - 1) < 1e-12);
});

test('linearRegression needs at least two distinct x values', () => {
  assert.equal(linearRegression([]), null);
  assert.equal(linearRegression([{ x: 1, y: 1 }]), null);
  assert.equal(linearRegression([{ x: 2, y: 1 }, { x: 2, y: 5 }]), null);
});

test('weeklyRate gives kg per week from a regression', () => {
  const weights = [
    { date: '2026-10-16', kg: 70 },
    { date: '2026-10-23', kg: 69.5 },
    { date: '2026-10-30', kg: 69 },
    { date: '2026-11-06', kg: 68.5 },
  ];
  assert.ok(Math.abs(weeklyRate(weights) + 0.5) < 1e-9);
});

test('weeklyRate ignores old points outside the window and short spans', () => {
  const old = [{ date: '2026-01-01', kg: 90 }, { date: '2026-10-16', kg: 70 }, { date: '2026-10-30', kg: 69 }];
  assert.ok(Math.abs(weeklyRate(old, { windowDays: 28 }) + 0.5) < 1e-9);
  assert.equal(weeklyRate([{ date: '2026-10-16', kg: 70 }]), null);
  assert.equal(weeklyRate([{ date: '2026-10-16', kg: 70 }, { date: '2026-10-18', kg: 69 }]), null); // spans < 5 days
});

test('niceTicks cover the data with round numbers', () => {
  assert.deepEqual(niceTicks(66.2, 70.4), [66, 67, 68, 69, 70, 71]);
  const t = niceTicks(0, 100);
  assert.equal(t[0], 0);
  assert.equal(t.at(-1), 100);
  const flat = niceTicks(70, 70);
  assert.ok(flat[0] < 70 && flat.at(-1) > 70);
});

test('linearScale maps domain to range (and inverts)', () => {
  const y = linearScale(60, 70, 200, 0);
  assert.equal(y(60), 200);
  assert.equal(y(70), 0);
  assert.equal(y(65), 100);
  assert.equal(linearScale(5, 5, 0, 10)(5), 0); // zero-width domain doesn't produce NaN
});
