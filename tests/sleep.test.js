import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sleepHours, bedOnTime, toMinutes, formatDuration, formatTime12 } from '../src/core/sleep.js';

test('sleepHours handles a same-evening-to-morning night that crosses midnight', () => {
  assert.equal(sleepHours('23:30', '07:00'), 7.5);
  assert.equal(sleepHours('22:00', '06:00'), 8);
});

test('sleepHours handles bedtimes after midnight', () => {
  assert.equal(sleepHours('00:30', '07:00'), 6.5);
});

test('sleepHours handles daytime naps without crossing midnight', () => {
  assert.equal(sleepHours('13:00', '14:30'), 1.5);
});

test('sleepHours returns null for missing, invalid or identical times', () => {
  assert.equal(sleepHours('', '07:00'), null);
  assert.equal(sleepHours('23:00', undefined), null);
  assert.equal(sleepHours('25:00', '07:00'), null);
  assert.equal(sleepHours('07:00', '07:00'), null);
});

test('toMinutes validates', () => {
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(toMinutes('23:59'), 1439);
  assert.equal(toMinutes('24:00'), null);
  assert.equal(toMinutes('7:05'), 425);
  assert.equal(toMinutes('7pm'), null);
});

test('bedOnTime treats after-midnight bedtimes as later than a night target', () => {
  assert.equal(bedOnTime('22:00', '22:30'), true);
  assert.equal(bedOnTime('22:30', '22:30'), true);
  assert.equal(bedOnTime('23:15', '22:30'), false);
  assert.equal(bedOnTime('00:30', '22:30'), false);
  assert.equal(bedOnTime('23:30', '00:00'), true); // target after midnight
  assert.equal(bedOnTime('00:20', '00:00'), false);
  assert.equal(bedOnTime('', '22:30'), false);
});

test('formatting', () => {
  assert.equal(formatDuration(7.5), '7h 30m');
  assert.equal(formatDuration(6 + 5 / 60), '6h 05m');
  assert.equal(formatTime12('22:30'), '10:30 pm');
  assert.equal(formatTime12('00:05'), '12:05 am');
  assert.equal(formatTime12('12:00'), '12:00 pm');
});
