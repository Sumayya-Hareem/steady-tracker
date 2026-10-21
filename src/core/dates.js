// Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings in the user's
// local time zone, so they sort lexicographically and never drift with DST.

const pad2 = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True only for real calendar dates ("2026-02-30" is rejected). */
export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from a to b (b - a). Uses UTC so DST changes cannot skew it. */
export function diffDays(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }, locale) {
  return parseISO(iso).toLocaleDateString(locale, opts);
}

export function relativeLabel(iso, todayISO) {
  if (iso === todayISO) return 'Today';
  if (iso === addDays(todayISO, -1)) return 'Yesterday';
  return fmtDate(iso, { weekday: 'long' });
}
