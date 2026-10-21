// Dependency-free SVG charts. All geometry comes from core/scale.js and
// core/pace.js (unit-tested); this file only turns numbers into elements.

import { h, svg, fill } from './dom.js';
import { linearScale, niceTicks } from '../core/scale.js';
import { paceSegment } from '../core/pace.js';
import { fmtDate, parseISO } from '../core/dates.js';

const DAY = 86400000;
let uid = 0;

/**
 * Interactive weight chart: line + area, target-pace line, checkpoint marker.
 * Drag/hover (or use ← →) to scrub through weigh-ins; the readout above the
 * chart follows. `range` is 'all' | '8w' | '4w'.
 */
export function weightChart({ weights, settings, range = 'all' }) {
  const W = 360, H = 230;
  const m = { l: 38, r: 14, t: 14, b: 28 };

  let pts = weights.map((w) => ({ t: parseISO(w.date).getTime(), v: w.kg, w }));
  if (range !== 'all' && pts.length) {
    const cutoff = pts[pts.length - 1].t - (range === '4w' ? 28 : 56) * DAY;
    pts = pts.filter((p) => p.t >= cutoff);
  }
  if (!pts.length) return h('p', { class: 'muted' }, 'Log your first weigh-in to see the chart.');

  const seg = range === 'all' ? paceSegment(settings) : null;
  let t0 = pts[0].t;
  let t1 = pts[pts.length - 1].t;
  if (seg) {
    t0 = Math.min(t0, parseISO(seg.from.date).getTime());
    t1 = Math.max(t1, parseISO(seg.to.date).getTime());
  }
  if (t1 <= t0) { t0 -= 3.5 * DAY; t1 += 3.5 * DAY; }

  const values = pts.map((p) => p.v);
  if (seg) values.push(seg.from.kg, seg.to.kg);
  const ticks = niceTicks(Math.min(...values) - 0.2, Math.max(...values) + 0.2, 5);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const X = linearScale(t0, t1, m.l, W - m.r);
  const Y = linearScale(yMin, yMax, H - m.b, m.t);
  const f = (n) => n.toFixed(1);

  const gradId = `wg${(uid += 1)}`;
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${f(X(p.t))} ${f(Y(p.v))}`).join(' ');
  const areaPath = `${linePath} L${f(X(pts[pts.length - 1].t))} ${H - m.b} L${f(X(pts[0].t))} ${H - m.b} Z`;

  const grid = ticks.map((v) => [
    svg('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: f(Y(v)), y2: f(Y(v)) }),
    svg('text', { x: m.l - 7, y: f(Y(v) + 3.5), 'text-anchor': 'end' }, String(v)),
  ]);
  const xLabel = (t, anchor, x) => svg('text', { x, y: H - 8, 'text-anchor': anchor }, fmtDate(toLocalISO(t)));
  const mid = (t0 + t1) / 2;

  const cross = svg('line', { class: 'cross', y1: m.t, y2: H - m.b });
  const activeDot = svg('circle', { class: 'active', r: 6 });
  const dots = pts.length <= 40 ? pts.map((p) => svg('circle', { class: 'dot', cx: f(X(p.t)), cy: f(Y(p.v)), r: 3.6 })) : [];

  const chart = svg('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'group', tabindex: '0',
    'aria-label': `Weight chart, ${pts.length} weigh-in${pts.length === 1 ? '' : 's'}. Use left and right arrow keys to move between them.`,
  },
  svg('defs', null, svg('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 },
    svg('stop', { offset: '0%', style: 'stop-color:var(--accent);stop-opacity:.28' }),
    svg('stop', { offset: '100%', style: 'stop-color:var(--accent);stop-opacity:0' }))),
  grid,
  xLabel(t0, 'start', m.l), xLabel(mid, 'middle', (m.l + W - m.r) / 2), xLabel(t1, 'end', W - m.r),
  svg('path', { d: areaPath, fill: `url(#${gradId})` }),
  seg && svg('line', { class: 'pace', x1: f(X(parseISO(seg.from.date).getTime())), y1: f(Y(seg.from.kg)), x2: f(X(parseISO(seg.to.date).getTime())), y2: f(Y(seg.to.kg)) }),
  seg && svg('circle', { class: 'cp', cx: f(X(parseISO(seg.to.date).getTime())), cy: f(Y(seg.to.kg)), r: 5 }),
  svg('path', { class: 'line', d: linePath }),
  dots, cross, activeDot);

  const readout = h('div', { class: 'chart-readout', 'aria-live': 'polite' });
  let active = pts.length - 1;
  function setActive(i) {
    active = Math.max(0, Math.min(pts.length - 1, i));
    const p = pts[active];
    cross.setAttribute('x1', f(X(p.t)));
    cross.setAttribute('x2', f(X(p.t)));
    activeDot.setAttribute('cx', f(X(p.t)));
    activeDot.setAttribute('cy', f(Y(p.v)));
    const prev = pts[active - 1];
    const diff = prev ? p.v - prev.v : null;
    fill(readout,
      h('b', null, `${round1(p.v)} kg`),
      h('span', { class: 'muted small' }, fmtDate(p.w.date, { weekday: 'short', day: 'numeric', month: 'short' }) + (p.w.waist != null ? ` · waist ${p.w.waist} ${settings.waistUnit}` : '')),
      diff != null && h('span', { class: ['chip', diff > 0 && 'warm'] }, `${diff <= 0 ? '−' : '+'}${round1(Math.abs(diff))}`));
  }
  const nearest = (clientX) => {
    const r = chart.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(X(p.t) - x) < Math.abs(X(pts[best].t) - x)) best = i; });
    return best;
  };
  chart.addEventListener('pointermove', (e) => setActive(nearest(e.clientX)));
  chart.addEventListener('pointerdown', (e) => setActive(nearest(e.clientX)));
  chart.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { setActive(active - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setActive(active + 1); e.preventDefault(); }
  });
  setActive(active);

  return h('div', { class: 'chart-wrap' }, readout, chart,
    h('div', { class: 'legend' }, h('span', null, h('i'), 'Your weight'), seg && h('span', null, h('i', { class: 'p' }), 'Target pace')));
}

const round1 = (v) => Math.round(v * 10) / 10;
function toLocalISO(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Small ring used for the hero (size 96) and the week strip (size 40). */
export function ring({ size, stroke, label, showText = true, className = 'ring' }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const arc = svg('circle', { class: 'arc', cx: c, cy: c, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': circ.toFixed(2), 'stroke-dashoffset': circ.toFixed(2), transform: `rotate(-90 ${c} ${c})` });
  const text = svg('text', { x: c, y: c + (size > 60 ? 7 : 4.2), 'text-anchor': 'middle' }, label ?? '');
  const el = svg('svg', { class: className, width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' },
    svg('circle', { class: 'trk', cx: c, cy: c, r, fill: 'none', 'stroke-width': stroke }), arc, showText && text);
  return {
    el,
    set(ratio, newLabel) {
      arc.setAttribute('stroke-dashoffset', (circ * (1 - Math.max(0, Math.min(1, ratio)))).toFixed(2));
      if (newLabel != null) text.textContent = newLabel;
    },
  };
}

/** Seven slim bars (one per day) showing habit completion. */
export function weekBars(days, { letter }) {
  const W = 320, H = 110, bw = 26, gap = (W - bw * days.length) / (days.length - 1), top = 6, base = 86;
  return svg('svg', { class: 'week-bars', viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `Habit completion for the last ${days.length} days` },
    days.map((d, i) => {
      const x = i * (bw + gap);
      const hgt = Math.max(0, (base - top) * d.ratio);
      return [
        svg('rect', { class: 'bar-bg', x, y: top, width: bw, height: base - top, rx: 9 }),
        hgt > 0 && svg('rect', { class: 'bar-fg', x, y: base - hgt, width: bw, height: hgt, rx: 9 }),
        svg('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, letter(d.date)),
      ];
    }));
}
