// CSV export. Cells that start with = + - @ (or tab/CR) are prefixed with an
// apostrophe so Excel/Sheets can't run user-typed text as a formula
// ("CSV injection"). Numbers are written as-is.

import { score, hasData } from './habits.js';
import { sleepHours } from './sleep.js';
import { MEAL_KEYS } from './schema.js';

export function csvCell(value) {
  if (value == null) return '';
  let s = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const toCSV = (rows) => `${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`;

export function daysCSV(data) {
  const habits = data.habits;
  const head = ['date', 'habits_done', 'habits_total'];
  for (const h of habits) {
    head.push(h.label);
    if (h.unit) head.push(`${h.label} (${h.unit})`);
  }
  head.push('bedtime', 'wake_time', 'sleep_hours', ...MEAL_KEYS, 'note');

  const rows = [head];
  for (const date of Object.keys(data.days).sort()) {
    const day = data.days[date];
    if (!hasData(day)) continue;
    const { done, total } = score(data, date);
    const row = [date, done, total];
    for (const h of habits) {
      row.push(day.checks?.[h.id] ? 1 : 0);
      if (h.unit) row.push(day.amounts?.[h.id]);
    }
    const hrs = sleepHours(day.sleep?.bed, day.sleep?.wake);
    row.push(day.sleep?.bed, day.sleep?.wake, hrs != null ? hrs.toFixed(2) : '');
    for (const k of MEAL_KEYS) row.push(day.food?.[k]);
    row.push(day.note);
    rows.push(row);
  }
  return toCSV(rows);
}

export function weightsCSV(data) {
  return toCSV([
    ['date', 'weight_kg', `waist_${data.settings.waistUnit}`],
    ...data.weights.map((w) => [w.date, w.kg, w.waist]),
  ]);
}
