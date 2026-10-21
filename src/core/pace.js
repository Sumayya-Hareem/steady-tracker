// Weight maths: target pace line, checkpoint status, and trend (linear regression).

import { addDays, diffDays } from './dates.js';

export const round1 = (v) => Math.round(v * 10) / 10;

/** Weight the checkpoint asks for, or null when it can't be computed. */
export function checkpointWeight(settings) {
  const { startWeight, checkpointKg } = settings;
  return startWeight != null && checkpointKg > 0 ? round1(startWeight - checkpointKg) : null;
}

/** Straight line from the start weight to the checkpoint weight, for the chart. */
export function paceSegment(settings) {
  const { startWeight, startDate, checkpointDate, checkpointKg } = settings;
  if (startWeight == null || !startDate || !checkpointDate || !(checkpointKg > 0)) return null;
  if (diffDays(startDate, checkpointDate) <= 0) return null;
  return {
    from: { date: startDate, kg: startWeight },
    to: { date: checkpointDate, kg: checkpointWeight(settings) },
  };
}

/** Kg the pace line expects you to have lost by `dateISO` (clamped to the plan's span). */
export function expectedLoss(settings, dateISO) {
  const seg = paceSegment(settings);
  if (!seg) return 0;
  const total = diffDays(seg.from.date, seg.to.date);
  const elapsed = Math.min(total, Math.max(0, diffDays(seg.from.date, dateISO)));
  return (settings.checkpointKg * elapsed) / total;
}

/**
 * Where the user stands against the checkpoint. State is one of
 * 'reached' | 'passed' | 'on-pace' | 'behind'. Null if there's nothing to compare.
 */
export function checkpointStatus(settings, weights, todayISO) {
  if (!weights.length || !paceSegment(settings)) return null;
  const latest = weights[weights.length - 1].kg;
  const lost = settings.startWeight - latest;
  const expected = expectedLoss(settings, todayISO);
  const daysLeft = diffDays(todayISO, settings.checkpointDate);
  const pct = Math.max(0, Math.min(100, (lost / settings.checkpointKg) * 100));
  let state = 'behind';
  if (lost >= settings.checkpointKg) state = 'reached';
  else if (daysLeft < 0) state = 'passed';
  else if (lost >= expected - 0.3) state = 'on-pace';
  return { lost, expected, daysLeft, pct, state };
}

/** Ordinary least squares fit of y on x. Null with fewer than two distinct x values. */
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

/**
 * Average change in kg per week over the most recent `windowDays`, using a
 * regression so one noisy weigh-in doesn't dominate. Negative means losing.
 * Needs at least two weigh-ins spanning five or more days.
 */
export function weeklyRate(weights, { windowDays = 28 } = {}) {
  if (weights.length < 2) return null;
  const latest = weights[weights.length - 1].date;
  const recent = weights.filter((w) => diffDays(w.date, latest) <= windowDays);
  if (recent.length < 2) return null;
  const first = recent[0].date;
  if (diffDays(first, latest) < 5) return null;
  const fit = linearRegression(recent.map((w) => ({ x: diffDays(first, w.date), y: w.kg })));
  return fit ? fit.slope * 7 : null;
}

/** Default checkpoint date: six weeks after the start. */
export const defaultCheckpointDate = (startDate) => addDays(startDate, 42);
