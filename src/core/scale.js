// Small numeric helpers for the SVG chart.

export function linearScale(d0, d1, r0, r1) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Round `range` to a "nice" number (1, 2, 5 × 10ⁿ). */
function niceNumber(range, round) {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/** Evenly spaced, human-friendly axis ticks that cover [min, max]. */
export function niceTicks(min, max, maxTicks = 5) {
  if (!(max > min)) {
    min -= 1;
    max += 1;
  }
  const step = niceNumber(niceNumber(max - min, false) / (maxTicks - 1), true);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
