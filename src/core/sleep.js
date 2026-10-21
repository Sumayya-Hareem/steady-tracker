// Sleep maths. Times are "HH:MM" 24-hour strings.

export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/**
 * Hours slept between going to bed and waking. Handles crossing midnight
 * ("23:30" -> "07:00" = 7.5h). Returns null when either time is missing/invalid
 * or when both are identical (ambiguous: 0h or 24h).
 */
export function sleepHours(bed, wake) {
  const b = toMinutes(bed);
  const w = toMinutes(wake);
  if (b == null || w == null || b === w) return null;
  let diff = w - b;
  if (diff < 0) diff += 1440;
  return diff / 60;
}

// Shift early-morning clock times past midnight so 00:30 counts as later than 22:30.
const afterNoon = (m) => (m < 720 ? m + 1440 : m);

/** Was `bed` at or before the `target` bedtime? Understands after-midnight bedtimes. */
export function bedOnTime(bed, target) {
  const b = toMinutes(bed);
  const t = toMinutes(target);
  if (b == null || t == null) return false;
  return afterNoon(b) <= afterNoon(t);
}

export function formatDuration(hours) {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

export function formatTime12(t) {
  const m = toMinutes(t);
  if (m == null) return '';
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
