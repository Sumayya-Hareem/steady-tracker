// Habit logic: which habits apply on a date, scoring, streaks, weekly stats.
// Every function takes plain data ({ settings, habits, days }) so it is easy to test.

import { addDays, parseISO } from './dates.js';
import { sleepHours } from './sleep.js';

export const GOOD_DAY_THRESHOLD = 0.6;

export const activeHabits = (habits) => habits.filter((h) => !h.archived);

export function isStrengthDay(data, date) {
  return data.settings.strengthDays.includes(parseISO(date).getDay()) || Boolean(data.days[date]?.extraStrength);
}

export function applicableHabits(data, date) {
  const strength = isStrengthDay(data, date);
  return activeHabits(data.habits).filter((h) => h.schedule !== 'strength' || strength);
}

export function score(data, date) {
  const checks = data.days[date]?.checks ?? {};
  const list = applicableHabits(data, date);
  const done = list.filter((h) => checks[h.id]).length;
  return { done, total: list.length, ratio: list.length ? done / list.length : 0 };
}

export function isGoodDay(data, date, threshold = GOOD_DAY_THRESHOLD) {
  const s = score(data, date);
  return s.total > 0 && s.ratio >= threshold;
}

/**
 * Consecutive "good" days ending today. If today isn't good *yet*, the streak
 * is counted from yesterday so an unfinished day doesn't wipe it out.
 * A day with no entry is not good, so gaps end the streak.
 */
export function streak(data, todayISO) {
  let d = isGoodDay(data, todayISO) ? todayISO : addDays(todayISO, -1);
  let n = 0;
  while (n < 3650 && isGoodDay(data, d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/** Did the user record anything at all on this day? */
export function hasData(day) {
  if (!day) return false;
  if (day.checks && Object.keys(day.checks).length) return true;
  if (day.amounts && Object.keys(day.amounts).length) return true;
  if (day.sleep && (day.sleep.bed || day.sleep.wake)) return true;
  if (day.food && Object.values(day.food).some(Boolean)) return true;
  return Boolean(day.note);
}

const STEPS = { min: 5, reps: 1, sec: 5, glasses: 1, times: 1 };
export const stepFor = (unit) => STEPS[unit] ?? 1;

export function newHabitId() {
  const rand = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `h_${rand}`;
}

/** Last `days` days ending at `todayISO`, oldest first, with completion and sleep. */
export function weekStats(data, todayISO, days = 7) {
  const list = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayISO, -i);
    const s = score(data, date);
    const sl = data.days[date]?.sleep;
    list.push({ date, ...s, sleep: sleepHours(sl?.bed, sl?.wake) });
  }
  const counted = list.filter((d) => d.total > 0);
  const avgRatio = counted.length ? counted.reduce((a, d) => a + d.ratio, 0) / counted.length : 0;
  const sleeps = list.map((d) => d.sleep).filter((v) => v != null);
  return {
    days: list,
    avgPct: Math.round(avgRatio * 100),
    goodDays: list.filter((d) => d.total > 0 && d.ratio >= GOOD_DAY_THRESHOLD).length,
    avgSleep: sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null,
    sleepNights: sleeps.length,
  };
}
