// Data model, defaults, and `normalize()` — the single gate every piece of
// stored or imported data passes through. It upgrades old versions (v1 had no
// "habits" list; before v3 the evening walk was logged in minutes) and strips
// anything that doesn't match the expected shape.
//
// Upgrades run once, gated on the data's version. The version comes from the
// caller (the storage layer's persisted marker) or from the data itself; data
// that is already v3 is never touched, so normalize() stays idempotent.

import { isISODate } from './dates.js';
import { toMinutes } from './sleep.js';

export const SCHEMA_VERSION = 3;
export const UNITS = ['min', 'steps', 'reps', 'sec', 'glasses', 'times'];
export const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'];
export const ACTIVITY_LEVELS = ['desk', 'light', 'active'];
export const CUSTOM_FOOD_LIMIT = 200;

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
  // for the rough calorie estimate (all optional; nothing is estimated until height and age are set)
  heightCm: null,
  age: null,
  sex: 'f',
  activity: 'desk',
  customFoods: [], // foods you taught the app: [{ name, kcal per serving }]
});

// `id`s match the v1 app so existing day logs keep lining up after migration.
export const DEFAULT_HABITS = Object.freeze([
  { id: 'walk', label: 'Evening walk', unit: 'steps', target: 3000, hint: 'After dinner, easy pace', schedule: 'daily' },
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
  return { ...DEFAULT_SETTINGS, strengthDays: [...DEFAULT_SETTINGS.strengthDays], customFoods: [] };
}

/** Foods the user taught the app. Names are lowercase, one entry per name, kcal per serving. */
export function cleanCustomFoods(raw) {
  if (!Array.isArray(raw)) return [];
  const byName = new Map();
  for (const item of raw) {
    if (!isObj(item) || typeof item.name !== 'string') continue;
    const name = item.name.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
    const kcal = Math.round(Number(item.kcal));
    if (!name || !(kcal > 0 && kcal <= 5000)) continue;
    byName.set(name, { name, kcal }); // last one wins
  }
  return [...byName.values()].slice(0, CUSTOM_FOOD_LIMIT);
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
  heightCm: (v) => (v === null || (finite(v) && v >= 100 && v <= 230) ? v : undefined),
  age: (v) => (v === null || (Number.isInteger(v) && v >= 12 && v <= 100) ? v : undefined),
  sex: (v) => (v === 'f' || v === 'm' ? v : undefined),
  activity: (v) => (ACTIVITY_LEVELS.includes(v) ? v : undefined),
  customFoods: (v) => (Array.isArray(v) ? cleanCustomFoods(v) : undefined),
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

/** The valid habits in `raw`, or null when nothing usable was supplied. */
function cleanHabitList(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const h = cleanHabit(item);
    if (h && !seen.has(h.id)) {
      seen.add(h.id);
      list.push(h);
    }
  }
  return list.length ? list : null;
}

/* ---- v3: the evening walk is logged in steps instead of minutes ---- */

const STEPS_PER_MINUTE = 100; // an easy walk is roughly 100 steps a minute
const looksLikeMinutes = (v) => finite(v) && v > 0 && v <= 300; // anything bigger is already steps: never convert it twice
const minutesToSteps = (min) => Math.round((min * STEPS_PER_MINUTE) / 10) * 10;

/**
 * Converts old minute values to steps. Only converts what is really in minutes:
 *  - a habit list we were given says which unit the walk used (only 'min' converts);
 *  - no habit list at all means v1-style data, where the walk was always minutes.
 */
function walkMinutesToSteps(habits, days, legacyWalkGoal, habitsGiven) {
  const walk = habits.find((h) => h.id === 'walk');
  const wasMinutes = habitsGiven ? walk?.unit === 'min' : true;
  if (!wasMinutes) return;
  for (const day of Object.values(days)) {
    const m = day.amounts?.walk;
    if (looksLikeMinutes(m)) day.amounts.walk = minutesToSteps(m);
  }
  if (!walk) return;
  if (habitsGiven) {
    walk.unit = 'steps';
    if (looksLikeMinutes(walk.target)) walk.target = minutesToSteps(walk.target);
  } else if (looksLikeMinutes(legacyWalkGoal)) {
    walk.target = minutesToSteps(legacyWalkGoal); // v1 kept the goal in settings
  }
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
  if (finite(raw.kcal) && raw.kcal >= 0 && raw.kcal <= 20000) day.kcal = Math.round(raw.kcal); // own daily total
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

/**
 * Accepts anything (null, a v1/v2 export, garbage) and returns clean current data.
 * `fromVersion` (the storage layer's persisted marker) wins over `raw.version`;
 * with neither, the data is treated as v1.
 */
export function normalize(raw, { fromVersion } = {}) {
  const src = isObj(raw) ? raw : {};
  const from = finite(fromVersion) ? fromVersion : finite(src.version) ? src.version : 1;
  const rawSettings = isObj(src.settings) ? src.settings : {};
  const days = {};
  if (isObj(src.days)) {
    for (const [date, value] of Object.entries(src.days)) {
      if (isISODate(date) && isObj(value)) days[date] = cleanDay(value);
    }
  }
  const given = cleanHabitList(src.habits);
  const habits = given ?? defaultHabits();
  if (from < 3) walkMinutesToSteps(habits, days, rawSettings.walkGoal, given !== null);
  return {
    version: SCHEMA_VERSION,
    settings: cleanSettings(rawSettings),
    habits,
    days,
    weights: cleanWeights(src.weights),
  };
}

/** Does this look like something exported by Steady (v1 or v2)? */
export function isBackupShape(obj) {
  return isObj(obj) && isObj(obj.settings) && isObj(obj.days) && Array.isArray(obj.weights);
}
