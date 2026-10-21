// Data model, defaults, and `normalize()` — the single gate every piece of
// stored or imported data passes through. It upgrades old versions (v1 had no
// "habits" list) and strips anything that doesn't match the expected shape.

import { isISODate } from './dates.js';
import { toMinutes } from './sleep.js';

export const SCHEMA_VERSION = 2;
export const UNITS = ['min', 'reps', 'sec', 'glasses', 'times'];
export const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'];

export const DEFAULT_SETTINGS = Object.freeze({
  name: '',
  startWeight: null,
  goalWeight: null,
  startDate: null,
  checkpointKg: 4,
  checkpointDate: null,
  waistUnit: 'in',
  bedtime: '22:30',
  strengthDays: [1, 3, 6],
  weighDay: 5,
  onboarded: false,
  lastBackup: null,
  demo: false,
});

// `id`s match the v1 app so existing day logs keep lining up after migration.
export const DEFAULT_HABITS = Object.freeze([
  { id: 'walk', label: 'Evening walk', unit: 'min', target: 30, hint: 'After dinner, easy pace', schedule: 'daily' },
  { id: 'squats', label: 'Squats', unit: 'reps', target: 20, hint: '2 rounds of 10', schedule: 'strength' },
  { id: 'pushups', label: 'Wall or knee push-ups', unit: 'reps', target: 16, hint: '2 rounds of 8–10', schedule: 'strength' },
  { id: 'bridges', label: 'Glute bridges', unit: 'reps', target: 20, hint: '2 rounds of 10', schedule: 'strength' },
  { id: 'plank', label: 'Plank', unit: 'sec', target: 40, hint: '2 holds of 20 sec, total time', schedule: 'strength' },
  { id: 'water', label: 'Water before meals', unit: 'glasses', target: 3, hint: 'A glass before each meal', schedule: 'daily' },
  { id: 'nosugar', label: 'No bakery or sugary chai', unit: null, target: null, hint: '', schedule: 'daily' },
  { id: 'oil', label: 'Measured the cooking oil', unit: null, target: null, hint: 'With a spoon, not a pour', schedule: 'daily' },
  { id: 'bed', label: 'In bed on time', unit: null, target: null, hint: 'Ticks itself when your logged sleep is on time', schedule: 'daily', auto: 'bedtime' },
]);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function defaultHabits() {
  return DEFAULT_HABITS.map((h) => ({ ...h, archived: false }));
}

export function defaultSettings() {
  return { ...DEFAULT_SETTINGS, strengthDays: [...DEFAULT_SETTINGS.strengthDays] };
}

const SETTING_RULES = {
  name: (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : undefined),
  startWeight: (v) => (v === null || finite(v) ? v : undefined),
  goalWeight: (v) => (v === null || finite(v) ? v : undefined),
  startDate: (v) => (v === null || isISODate(v) ? v : undefined),
  checkpointKg: (v) => (finite(v) && v >= 0 ? v : undefined),
  checkpointDate: (v) => (v === null || isISODate(v) ? v : undefined),
  waistUnit: (v) => (v === 'in' || v === 'cm' ? v : undefined),
  bedtime: (v) => (toMinutes(v) != null ? v : undefined),
  strengthDays: (v) =>
    Array.isArray(v)
      ? [...new Set(v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
      : undefined,
  weighDay: (v) => (Number.isInteger(v) && v >= 0 && v <= 6 ? v : undefined),
  onboarded: (v) => (typeof v === 'boolean' ? v : undefined),
  lastBackup: (v) => (v === null || finite(v) ? v : undefined),
  demo: (v) => (typeof v === 'boolean' ? v : undefined),
};

function cleanSettings(raw) {
  const out = defaultSettings();
  if (!isObj(raw)) return out;
  for (const key of Object.keys(SETTING_RULES)) {
    if (!(key in raw)) continue;
    const v = SETTING_RULES[key](raw[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function cleanHabit(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const label = str(raw.label, 60).trim();
  if (!label) return null;
  const unit = UNITS.includes(raw.unit) ? raw.unit : null;
  const habit = {
    id: raw.id.slice(0, 40),
    label,
    unit,
    target: unit && finite(raw.target) && raw.target > 0 ? raw.target : null,
    hint: str(raw.hint, 80).trim(),
    schedule: raw.schedule === 'strength' ? 'strength' : 'daily',
    archived: raw.archived === true,
  };
  if (raw.auto === 'bedtime') habit.auto = 'bedtime';
  return habit;
}

function cleanHabits(raw, legacyWalkGoal) {
  if (Array.isArray(raw)) {
    const seen = new Set();
    const list = [];
    for (const item of raw) {
      const h = cleanHabit(item);
      if (h && !seen.has(h.id)) {
        seen.add(h.id);
        list.push(h);
      }
    }
    if (list.length) return list;
  }
  const habits = defaultHabits();
  if (finite(legacyWalkGoal) && legacyWalkGoal >= 1) habits[0].target = legacyWalkGoal; // v1 stored this in settings
  return habits;
}

function cleanDay(raw) {
  const day = {};
  if (isObj(raw.checks)) {
    const checks = {};
    for (const [id, v] of Object.entries(raw.checks)) if (v === true) checks[id] = true;
    if (Object.keys(checks).length) day.checks = checks;
  }
  if (isObj(raw.amounts)) {
    const amounts = {};
    for (const [id, v] of Object.entries(raw.amounts)) if (finite(v) && v >= 0) amounts[id] = v;
    if (Object.keys(amounts).length) day.amounts = amounts;
  }
  if (isObj(raw.sleep)) {
    const sleep = {};
    if (toMinutes(raw.sleep.bed) != null) sleep.bed = raw.sleep.bed;
    if (toMinutes(raw.sleep.wake) != null) sleep.wake = raw.sleep.wake;
    if (Object.keys(sleep).length) day.sleep = sleep;
  }
  if (isObj(raw.food)) {
    const food = {};
    for (const k of MEAL_KEYS) {
      const v = str(raw.food[k], 300);
      if (v) food[k] = v;
    }
    if (Object.keys(food).length) day.food = food;
  }
  const note = str(raw.note, 5000);
  if (note) day.note = note;
  if (raw.extraStrength === true) day.extraStrength = true;
  return day;
}

function cleanWeights(raw) {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map();
  for (const w of raw) {
    if (!isObj(w) || !isISODate(w.date) || !finite(Number(w.kg))) continue;
    const kg = Number(w.kg);
    if (kg < 20 || kg > 300) continue;
    const entry = { date: w.date, kg };
    const waist = Number(w.waist);
    if (w.waist != null && finite(waist) && waist > 0 && waist <= 300) entry.waist = waist;
    byDate.set(w.date, entry);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Accepts anything (null, a v1 export, a v2 export, garbage) and returns clean v2 data. */
export function normalize(raw) {
  const src = isObj(raw) ? raw : {};
  const rawSettings = isObj(src.settings) ? src.settings : {};
  const days = {};
  if (isObj(src.days)) {
    for (const [date, value] of Object.entries(src.days)) {
      if (isISODate(date) && isObj(value)) days[date] = cleanDay(value);
    }
  }
  return {
    version: SCHEMA_VERSION,
    settings: cleanSettings(rawSettings),
    habits: cleanHabits(src.habits, rawSettings.walkGoal),
    days,
    weights: cleanWeights(src.weights),
  };
}

/** Does this look like something exported by Steady (v1 or v2)? */
export function isBackupShape(obj) {
  return isObj(obj) && isObj(obj.settings) && isObj(obj.days) && Array.isArray(obj.weights);
}
