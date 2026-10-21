import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, daysCSV, weightsCSV, toCSV } from '../src/core/csv.js';
import { normalize } from '../src/core/schema.js';

test('csvCell neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+44 123'), "'+44 123");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\t=x'), "'\t=x");
});

test('csvCell leaves real numbers alone, including negatives', () => {
  assert.equal(csvCell(5), '5');
  assert.equal(csvCell(-3.5), '-3.5');
  assert.equal(csvCell(0), '0');
});

test('csvCell quotes commas, quotes and newlines', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('=A,B'), '"\'=A,B"'); // both rules together
});

test('csvCell handles null/undefined', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('toCSV joins rows', () => {
  assert.equal(toCSV([['a', 'b'], [1, 'x,y']]), 'a,b\n1,"x,y"\n');
});

test('daysCSV has a column per habit and sanitises free text', () => {
  const data = normalize({
    days: {
      '2026-10-20': {
        checks: { walk: true },
        amounts: { walk: 35 },
        sleep: { bed: '23:00', wake: '07:00' },
        food: { dinner: '=HYPERLINK("x")' },
        note: 'good, tired',
      },
      '2026-10-19': {}, // no data: skipped
    },
  });
  const lines = daysCSV(data).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('Evening walk (min)'));
  assert.ok(lines[0].includes('Squats (reps)'));
  assert.ok(lines[1].startsWith('2026-10-20,1,5,1,35,'));
  assert.ok(lines[1].includes('8.00'));
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(lines[1].endsWith('"good, tired"'));
});

test('weightsCSV uses the waist unit in the header', () => {
  const data = normalize({ settings: { waistUnit: 'cm' }, weights: [{ date: '2026-10-16', kg: 70, waist: 94 }, { date: '2026-10-23', kg: 69.5 }] });
  assert.equal(weightsCSV(data), 'date,weight_kg,waist_cm\n2026-10-16,70,94\n2026-10-23,69.5,\n');
});
