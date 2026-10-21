// "Progress" view: stats, interactive weight chart, checkpoint, weigh-in log, week summary.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmDialog, toast } from '../ui/dom.js';
import { weightChart, weekBars } from '../ui/chart.js';
import { fmtDate, toISO, isISODate } from '../core/dates.js';
import { checkpointStatus, defaultCheckpointDate, round1, weeklyRate } from '../core/pace.js';
import { hasData, score, weekStats } from '../core/habits.js';
import { formatDuration, sleepHours } from '../core/sleep.js';

const CHECKPOINT_NOTES = {
  reached: 'You reached your checkpoint. Brilliant.',
  passed: 'The checkpoint date has passed. Keep going; the habits are what count.',
  'on-pace': 'On pace. Keep doing what you’re doing.',
  behind: 'A little behind pace. Normal early on. Keep the habits, not the panic.',
};

export function mountProgress(ctx, arg) {
  const { store, root, now, navigate } = ctx;
  const todayISO = toISO(now());
  const data = () => store.state;
  let range = 'all';
  const host = h('div', { class: 'view' });
  root.replaceChildren(host);

  /* ----- weigh-in sheet (add or edit) ----- */
  function openWeighIn(existing) {
    const s = data().settings;
    const date = h('input', { type: 'date', id: 'w_date', max: todayISO, value: existing?.date ?? todayISO });
    const kg = h('input', { type: 'number', id: 'w_kg', inputmode: 'decimal', step: '0.1', min: '20', max: '300', placeholder: 'e.g. 69.5', value: existing ? String(existing.kg) : '' });
    const waist = h('input', { type: 'number', id: 'w_waist', inputmode: 'decimal', step: '0.1', min: '0', placeholder: 'optional', value: existing?.waist != null ? String(existing.waist) : '' });
    const err = h('div', { class: 'err', role: 'alert' });
    const form = h('form', { novalidate: true },
      h('p', { class: 'muted small' }, 'Once a week is plenty: same day, same time, same scale. Your waist often moves before the scale does.'),
      h('div', { class: 'field' }, h('label', { for: 'w_date' }, 'Date'), date),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 'w_kg' }, 'Weight (kg)'), kg),
        h('div', { class: 'field' }, h('label', { for: 'w_waist' }, `Waist (${s.waistUnit})`), waist)),
      err,
      h('button', { class: 'btn block', type: 'submit' }, existing ? 'Save changes' : 'Save weigh-in'));
    const sheet = openSheet({ title: existing ? 'Edit weigh-in' : 'Log a weigh-in', body: form });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const w = Number(kg.value);
      const wa = waist.value === '' ? null : Number(waist.value);
      if (!isISODate(date.value) || date.value > todayISO) { err.textContent = 'Pick a valid date (not in the future).'; return; }
      if (kg.value === '' || !(w >= 20 && w <= 300)) { err.textContent = 'Enter your weight in kg (20–300).'; return; }
      if (wa != null && !(wa > 0 && wa <= 300)) { err.textContent = 'Waist looks off. Leave it blank or check the number.'; return; }
      const entry = { date: date.value, kg: w };
      if (wa != null) entry.waist = wa;
      store.setWeight(entry);
      if (existing && existing.date !== entry.date) store.removeWeight(existing.date);
      const first = data().weights[0];
      const patch = {};
      if (data().settings.startWeight == null) { patch.startWeight = first.kg; patch.startDate = first.date; }
      if (!data().settings.checkpointDate) patch.checkpointDate = defaultCheckpointDate(patch.startDate ?? data().settings.startDate ?? first.date);
      if (Object.keys(patch).length) store.updateSettings(patch);
      sheet.close();
      toast('Weigh-in saved.');
    });
    setTimeout(() => kg.focus(), 50);
  }

  /* ----- sections ----- */
  function statsRow() {
    const ws = data().weights;
    const s = data().settings;
    if (!ws.length) return null;
    const latest = ws[ws.length - 1].kg;
    const start = s.startWeight ?? ws[0].kg;
    const change = latest - start;
    const rate = weeklyRate(ws);
    const tile = (value, label, unit) => h('div', { class: 'stat' }, h('b', null, value, unit && h('small', null, ` ${unit}`)), h('span', null, label));
    return h('div', { class: 'stats' },
      tile(round1(latest), 'Now', 'kg'),
      tile(Math.abs(change) < 0.05 ? '0' : `${change < 0 ? '−' : '+'}${round1(Math.abs(change))}`, 'Since you started', 'kg'),
      tile(s.goalWeight != null ? round1(Math.max(0, latest - s.goalWeight)) : '–', 'To your goal', 'kg'),
      rate != null && tile(`${rate <= 0 ? '−' : '+'}${round1(Math.abs(rate))}`, 'Recent trend', 'kg/wk'));
  }

  function goalCard() {
    const ws = data().weights;
    const s = data().settings;
    if (!ws.length) return null;
    const out = [];
    const start = s.startWeight ?? ws[0].kg;
    if (s.goalWeight != null && start > s.goalWeight) {
      const pct = Math.max(0, Math.min(100, ((start - ws[ws.length - 1].kg) / (start - s.goalWeight)) * 100));
      out.push(h('section', { class: 'card' }, h('h2', null, icon('target'), `Journey to ${round1(s.goalWeight)} kg`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)) }, h('div', { style: { width: `${pct}%` } })),
        h('p', { class: 'small muted', style: { margin: 0 } }, `${Math.round(pct)}% of the way there`)));
    }
    const cp = checkpointStatus(s, ws, todayISO);
    if (cp) {
      out.push(h('section', { class: 'card' }, h('h2', null, `Checkpoint: ${round1(s.startWeight - s.checkpointKg)} kg by ${fmtDate(s.checkpointDate)}`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(cp.pct)) }, h('div', { style: { width: `${cp.pct}%` } })),
        h('p', { class: 'small muted', style: { margin: 0 } },
          `${round1(Math.max(0, cp.lost))} of ${round1(s.checkpointKg)} kg${cp.daysLeft >= 0 ? ` · ${cp.daysLeft} day${cp.daysLeft === 1 ? '' : 's'} left` : ''}. ${CHECKPOINT_NOTES[cp.state]}`)));
    }
    return out;
  }

  function chartCard() {
    const body = h('div');
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Chart range' });
    const paint = () => {
      seg.replaceChildren(...[['all', 'All'], ['8w', '8 weeks'], ['4w', '4 weeks']].map(([k, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(range === k), onclick: () => { range = k; paint(); } }, label)));
      body.replaceChildren(weightChart({ weights: data().weights, settings: data().settings, range }));
    };
    paint();
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Weight'), data().weights.length > 1 && seg), body);
  }

  function logCard() {
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, icon('scale'), 'Weigh-ins'), h('button', { class: 'btn sm', type: 'button', onclick: () => openWeighIn() }, icon('plus', 18), 'Log')),
      data().weights.length
        ? h('div', null, data().weights.slice().reverse().map((w, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? w.kg - prev.kg : null;
          return h('div', { class: 'list-item' },
            h('button', { class: 'grow', type: 'button', style: { background: 'none', border: 0, padding: 0, textAlign: 'left' }, 'aria-label': `Edit weigh-in from ${fmtDate(w.date)}`, onclick: () => openWeighIn(w) },
              h('div', { class: 't' }, `${round1(w.kg)} kg`),
              h('div', { class: 'd' }, fmtDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' }) + (w.waist != null ? ` · waist ${w.waist} ${data().settings.waistUnit}` : ''))),
            diff != null && h('span', { class: ['chip', diff > 0 && 'warm'] }, `${diff <= 0 ? '−' : '+'}${round1(Math.abs(diff))}`),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Delete weigh-in from ${fmtDate(w.date)}`, onclick: async () => {
              if (await confirmDialog({ title: 'Delete weigh-in?', message: `Remove the ${round1(w.kg)} kg entry from ${fmtDate(w.date)}?`, confirmLabel: 'Delete', danger: true })) store.removeWeight(w.date);
            } }, icon('trash', 20)));
        }))
        : h('p', { class: 'muted' }, 'Nothing yet. Your first weigh-in becomes the starting point.'));
  }

  function weekCard() {
    const w = weekStats(data(), todayISO);
    return h('section', { class: 'card' }, h('h2', null, 'Last 7 days'),
      h('div', { class: 'stats', style: { margin: '12px 0' } },
        h('div', { class: 'stat' }, h('b', null, `${w.avgPct}%`), h('span', null, 'Habits done')),
        h('div', { class: 'stat' }, h('b', null, `${w.goodDays}/7`), h('span', null, 'Solid days')),
        h('div', { class: 'stat' }, h('b', null, w.avgSleep != null ? formatDuration(w.avgSleep) : '–'), h('span', null, 'Avg sleep'))),
      weekBars(w.days, { letter: (d) => fmtDate(d, { weekday: 'narrow' }) }));
  }

  function recentCard() {
    const dates = Object.keys(data().days).filter((d) => hasData(data().days[d])).sort().reverse().slice(0, 14);
    if (!dates.length) return null;
    return h('section', { class: 'card' }, h('h2', null, 'Recent days'), h('p', { class: 'sub' }, 'Tap a day to view or edit it.'),
      h('div', null, dates.map((d) => {
        const day = data().days[d];
        const sc = score(data(), d);
        const hrs = sleepHours(day.sleep?.bed, day.sleep?.wake);
        const bits = [];
        if (hrs != null) bits.push(`${formatDuration(hrs)} sleep`);
        if (day.food?.dinner) bits.push(`dinner: ${day.food.dinner}`);
        return h('button', { class: 'list-item', type: 'button', onclick: () => navigate(d === todayISO ? '/today' : `/today/${d}`) },
          h('div', { class: 'grow' }, h('div', { class: 't' }, fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })), h('div', { class: 'd' }, bits.join(' · ') || ' ')),
          h('span', { class: 'chip' }, `${sc.done}/${sc.total}`));
      })));
  }

  function render() {
    fill(host,
      h('header', { class: 'page-head' }, h('div', { class: 'eyebrow' }, 'Trends'), h('h1', null, 'Your progress')),
      statsRow(),
      h('div', { class: 'cols' },
        h('div', null, chartCard(), goalCard()),
        h('div', null, logCard(), weekCard(), recentCard())));
  }
  render();
  const unsub = store.subscribe(['weights', 'settings'], render);
  if (arg === 'log') setTimeout(() => openWeighIn(), 80);
  return () => unsub();
}
