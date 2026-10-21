import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, isISODate, parseISO, toISO, relativeLabel } from '../src/core/dates.js';

test('toISO / parseISO round-trip', () => {
  assert.equal(toISO(parseISO('2026-10-20')), '2026-10-20');
  assert.equal(toISO(new Date(2026, 0, 5)), '2026-01-05');
});

test('addDays crosses month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // leap year
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-20', 0), '2026-10-20');
});

test('addDays is stable across daylight-saving changes', () => {
  assert.equal(addDays('2026-03-07', 2), '2026-03-09');
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
});

test('diffDays counts whole days, including over DST and leap years', () => {
  assert.equal(diffDays('2026-10-16', '2026-11-27'), 42);
  assert.equal(diffDays('2026-03-01', '2026-03-15'), 14);
  assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(diffDays('2026-11-27', '2026-10-16'), -42);
  assert.equal(diffDays('2026-05-05', '2026-05-05'), 0);
});

test('isISODate rejects impossible and malformed dates', () => {
  assert.equal(isISODate('2026-10-20'), true);
  assert.equal(isISODate('2024-02-29'), true);
  assert.equal(isISODate('2026-02-29'), false);
  assert.equal(isISODate('2026-13-01'), false);
  assert.equal(isISODate('2026-1-1'), false);
  assert.equal(isISODate(20261020), false);
  assert.equal(isISODate(null), false);
});

test('relativeLabel', () => {
  assert.equal(relativeLabel('2026-10-20', '2026-10-20'), 'Today');
  assert.equal(relativeLabel('2026-10-19', '2026-10-20'), 'Yesterday');
});
