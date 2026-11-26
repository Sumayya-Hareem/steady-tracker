// Rough daily calories: eaten (from what you typed) vs burned (from your body and steps).
// Everything here is an ESTIMATE. Real burn varies by roughly ±15% between people and
// food portions are ballpark, so treat the numbers as a trend, not a measurement.
//
//   burned = BMR (Mifflin-St Jeor) × activity factor
//            + steps × weight × 0.0004   (extra energy of the walk itself)
//            + 40 kcal on a day you ticked a strength habit
//   deficit = burned − eaten            (7,700 kcal ≈ 1 kg of body fat)
//
// Pure functions over plain data ({ settings, habits, days, weights }), like the rest of core/.

import { addDays } from './dates.js';
import { estimateFood } from './foods.js';

export const ACTIVITY = {
  desk: { factor: 1.2, label: 'Mostly sitting' },
  light: { factor: 1.35, label: 'On my feet some' },
  active: { factor: 1.5, label: 'On my feet most' },
};
export const KCAL_PER_KG_FAT = 7700;
export const STEP_KCAL_PER_KG = 0.0004; // net kcal per step per kg of body weight
export const STRENGTH_KCAL = 40; // a short home session
export const LOW_DAY_KCAL = 1400; // below this on a fully logged day, nudge towards eating more
export const MIN_MEALS_FOR_DAY = 3; // fewer logged meals = probably a half-logged day

/** Mifflin-St Jeor resting energy, kcal/day. */
export function bmr({ sex, kg, cm, age }) {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161);
}

export const profileReady = (settings) => settings.heightCm != null && settings.age != null;

/** Weight to use for a date: latest weigh-in on or before it, else the first one, else the starting weight. */
export function weightOn(data, date) {
  let found = null;
  for (const w of data.weights) {
    if (w.date <= date) found = w.kg;
    else break;
  }
  return found ?? data.weights[0]?.kg ?? data.settings.startWeight ?? null;
}

/** Steps logged on a date: every habit tracked in steps counts. */
export function stepsOn(data, date) {
  const amounts = data.days[date]?.amounts;
  if (!amounts) return 0;
  return data.habits.filter((h) => h.unit === 'steps').reduce((sum, h) => sum + (amounts[h.id] > 0 ? amounts[h.id] : 0), 0);
}

const didStrength = (data, date) => {
  const checks = data.days[date]?.checks;
  return Boolean(checks) && data.habits.some((h) => h.schedule === 'strength' && checks[h.id]);
};

/** What the day burned, with the parts: null until height, age and a weight are known. */
export function burn(data, date) {
  const s = data.settings;
  if (!profileReady(s)) return null;
  const kg = weightOn(data, date);
  if (kg == null) return null;
  const rest = bmr({ sex: s.sex, kg, cm: s.heightCm, age: s.age });
  const base = rest * (ACTIVITY[s.activity] ?? ACTIVITY.desk).factor;
  const steps = stepsOn(data, date);
  const walk = steps * kg * STEP_KCAL_PER_KG;
  const strength = didStrength(data, date) ? STRENGTH_KCAL : 0;
  return {
    kg,
    steps,
    bmr: Math.round(rest),
    base: Math.round(base),
    walk: Math.round(walk),
    strength,
    total: Math.round(base + walk + strength),
  };
}

/**
 * What the day ate: your own typed total if you gave one, otherwise the estimate from the
 * food text. null when nothing was logged. `complete` is false for a half-logged day.
 */
export function eaten(data, date) {
  const day = data.days[date];
  if (!day) return null;
  if (Number.isFinite(day.kcal)) return { kcal: day.kcal, manual: true, complete: true, unknown: [], meals: null, logged: 0 };
  const est = estimateFood(day.food, data.settings.customFoods);
  if (!est.logged) return null;
  return { kcal: est.kcal, manual: false, complete: est.logged >= MIN_MEALS_FOR_DAY, unknown: est.unknown, meals: est.meals, logged: est.logged };
}

/** Eaten, burned and the gap between them (null where a side is unknown). */
export function dayCalories(data, date) {
  const e = eaten(data, date);
  const b = burn(data, date);
  return { eaten: e, burn: b, deficit: e && b ? b.total - e.kcal : null };
}

export const isLowDay = (e) => Boolean(e) && e.complete && e.kcal < LOW_DAY_KCAL;

/** Last `days` days ending at `todayISO`, using only fully logged days. */
export function weekCalories(data, todayISO, days = 7) {
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayISO, -i);
    const c = dayCalories(data, date);
    list.push({ date, eaten: c.eaten?.kcal ?? null, burned: c.burn?.total ?? null, deficit: c.deficit, complete: Boolean(c.eaten?.complete), unknown: c.eaten?.unknown.length ?? 0 });
  }
  const counted = list.filter((d) => d.complete && d.deficit != null);
  const avg = (key) => (counted.length ? Math.round(counted.reduce((a, d) => a + d[key], 0) / counted.length) : null);
  const total = counted.reduce((a, d) => a + d.deficit, 0);
  return {
    days: list,
    counted: counted.length,
    avgEaten: avg('eaten'),
    avgBurned: avg('burned'),
    avgDeficit: avg('deficit'),
    totalDeficit: Math.round(total),
    kgFat: Math.round((total / KCAL_PER_KG_FAT) * 100) / 100,
    missingProfile: list.some((d) => d.eaten != null) && list.every((d) => d.burned == null),
  };
}
