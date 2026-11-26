// "Today" view: week strip, progress hero, habit checklist, sleep, food, note.
// The page is built once. Store changes update individual nodes in place
// (ticks, ring, text) so typing never loses focus and nothing re-renders wholesale.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { ring } from '../ui/chart.js';
import { toast, confirmDialog, openSheet } from '../ui/dom.js';
import { addDays, fmtDate, isISODate, parseISO, relativeLabel, toISO } from '../core/dates.js';
import { applicableHabits, hasData, score, stepFor, streak } from '../core/habits.js';
import { bedOnTime, formatDuration, formatTime12, sleepHours } from '../core/sleep.js';
import { MEAL_KEYS } from '../core/schema.js';
import { AMOUNT_CHOICES, addCustomFood, dropItem, estimateFood, itemLabel, readsBack, rewriteItem, rewriteItemKcal } from '../core/foods.js';
import { dayCalories, isLowDay, profileReady } from '../core/calories.js';

const MESSAGES = {
  empty: 'A fresh day. One small tick gets you moving.',
  early: 'Good start. One thing at a time.',
  late: 'Nice work. Almost there.',
  full: 'Everything done. Proud of you.',
};
const messageFor = ({ done, total }) => (!total || !done ? MESSAGES.empty : done === total ? MESSAGES.full : done / total < 0.5 ? MESSAGES.early : MESSAGES.late);

function greeting(now, name) {
  const hr = now.getHours();
  const g = hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${g}, ${name}` : g;
}

export function mountToday(ctx, arg) {
  const { store, root, now, navigate, refresh } = ctx;
  const todayISO = toISO(now());
  const date = isISODate(arg) && arg <= todayISO ? arg : todayISO;
  const isToday = date === todayISO;
  const data = () => store.state;
  const updaters = []; // functions that re-sync nodes after a day changes

  /* ----- header ----- */
  const head = h('header', { class: 'page-head' },
    h('div', { class: 'eyebrow' }, fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })),
    h('h1', null, isToday ? greeting(now(), data().settings.name) : relativeLabel(date, todayISO)),
    !isToday && h('p', null, h('button', { class: 'link-btn', type: 'button', onclick: () => navigate('/today') }, '← Back to today')));

  /* ----- week strip ----- */
  function weekStrip() {
    const end = date >= addDays(todayISO, -6) ? todayISO : (addDays(date, 3) < todayISO ? addDays(date, 3) : todayISO);
    const strip = h('nav', { class: 'week', 'aria-label': 'Choose a day' });
    const items = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(end, -i);
      const mini = ring({ size: 40, stroke: 4, label: String(Number(d.slice(8))), className: 'mini-ring' });
      const btn = h('button', { class: 'week-day', type: 'button', 'aria-current': d === date ? 'date' : null, onclick: () => navigate(d === todayISO ? '/today' : `/today/${d}`) },
        h('span', null, fmtDate(d, { weekday: 'short' }).slice(0, 3).toUpperCase()), mini.el);
      items.push({ d, mini, btn });
      strip.append(btn);
    }
    updaters.push(() => items.forEach(({ d, mini, btn }) => {
      const s = score(data(), d);
      mini.set(s.ratio);
      btn.setAttribute('aria-label', `${fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}, ${s.done} of ${s.total} done`);
    }));
    return strip;
  }

  /* ----- hero ----- */
  function hero() {
    const big = ring({ size: 96, stroke: 9, label: '' });
    const msg = h('p');
    const chips = h('div', { class: 'hero-chips' });
    const title = h('h2', null, isToday ? 'Your day' : fmtDate(date, { day: 'numeric', month: 'long' }));
    updaters.push(() => {
      const s = score(data(), date);
      big.set(s.ratio, `${s.done}/${s.total}`);
      msg.textContent = messageFor(s);
      const st = streak(data(), todayISO);
      const left = s.total - s.done;
      fill(chips,
        st > 0 && h('span', { class: 'chip warm' }, icon('flame', 14), `${st} solid day${st > 1 ? 's' : ''}`),
        left > 0 ? h('span', { class: 'chip neutral' }, `${left} left`) : h('span', { class: 'chip' }, icon('check', 14), 'All done'));
    });
    return h('section', { class: 'hero', 'aria-label': 'Progress for the day' }, big.el, h('div', { class: 'hero-text' }, title, msg, chips));
  }

  /* ----- banners ----- */
  function banners() {
    const out = [];
    const s = data().settings;
    if (s.demo) {
      out.push(h('div', { class: 'banner info' }, icon('info'),
        h('div', null, h('b', null, 'You’re exploring sample data. '), 'Nothing here is real. Clear it whenever you like and start your own.'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Clear sample data?', message: 'This removes the sample days and weigh-ins so you can start fresh.', confirmLabel: 'Start fresh' })) {
            await store.reset();
            refresh();
          }
        } }, 'Start fresh')));
    }
    if (isToday && !s.demo) {
      const dow = now().getDay();
      if (dow === s.weighDay && !data().weights.some((w) => w.date === date)) {
        out.push(h('div', { class: 'banner' }, icon('scale'),
          h('div', null, h('b', null, 'It’s weigh-in day. '), 'Same scale, same time. Measure your waist too.'),
          h('button', { class: 'btn sm', type: 'button', onclick: () => navigate('/progress/log') }, 'Log it')));
      }
      const entries = Object.keys(data().days).filter((d) => hasData(data().days[d])).length + data().weights.length;
      const stale = !s.lastBackup || Date.now() - s.lastBackup > 14 * 864e5;
      if (entries >= 10 && stale) {
        out.push(h('div', { class: 'banner info' }, icon('download'),
          h('div', null, h('b', null, 'Back up your data. '), 'It lives only on this device. A quick export keeps it safe.'),
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => navigate('/settings') }, 'Backup')));
      }
    }
    return out;
  }

  /* ----- habit rows ----- */
  function habitRow(habit) {
    const label = habit.auto === 'bedtime' ? `In bed by ${formatTime12(data().settings.bedtime)}` : habit.label;
    const main = h('button', { class: 'habit-main', type: 'button', role: 'checkbox', 'aria-checked': 'false', onclick: () => toggle(habit.id) },
      h('span', { class: 'tick' }, icon('check')),
      h('span', { class: 'habit-text' }, h('span', { class: 'habit-label' }, label), habit.hint && h('span', { class: 'habit-hint' }, habit.hint)));
    const row = h('div', { class: 'habit', dataset: { id: habit.id } }, main);
    let input = null;

    if (habit.unit) {
      const step = stepFor(habit.unit);
      input = h('input', { type: 'number', min: '0', step: 'any', placeholder: habit.target != null ? String(habit.target) : '', 'aria-label': `${habit.label}, ${habit.unit}`, inputmode: 'decimal' });
      input.addEventListener('input', () => setAmount(habit.id, input.value === '' ? null : Number(input.value)));
      const current = () => data().days[date]?.amounts?.[habit.id];
      row.append(h('div', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': `Less ${habit.label}`, onclick: () => { const c = current(); if (c != null) setAmount(habit.id, Math.max(0, c - step)); } }, icon('minus')),
        h('div', { class: 'val' }, input, h('span', { class: 'unit' }, habit.unit)),
        h('button', { type: 'button', 'aria-label': `More ${habit.label}`, onclick: () => { const c = current(); setAmount(habit.id, c == null ? (habit.target ?? step) : c + step); } }, icon('plus'))));
    }

    const sync = () => {
      const day = data().days[date];
      const checked = Boolean(day?.checks?.[habit.id]);
      main.setAttribute('aria-checked', String(checked));
      row.classList.toggle('done', checked);
      if (input && document.activeElement !== input) {
        const a = day?.amounts?.[habit.id];
        input.value = a != null ? String(a) : '';
      }
    };
    updaters.push(sync);
    return row;
  }

  function toggle(id) {
    store.updateDay(date, (d) => {
      d.checks = { ...d.checks };
      if (d.checks[id]) delete d.checks[id]; else d.checks[id] = true;
    });
  }
  function setAmount(id, value) {
    store.updateDay(date, (d) => {
      d.amounts = { ...d.amounts };
      if (value == null || value < 0 || Number.isNaN(value)) { delete d.amounts[id]; return; }
      d.amounts[id] = value;
      if (value > 0) d.checks = { ...d.checks, [id]: true }; // logging an amount counts as doing it
    });
  }

  function habitsCards() {
    const list = applicableHabits(data(), date);
    const daily = list.filter((x) => x.schedule !== 'strength');
    const strength = list.filter((x) => x.schedule === 'strength');
    const cards = [];
    if (daily.length) cards.push(h('section', { class: 'card' }, h('h2', null, 'Daily habits'), h('div', { style: { marginTop: '6px' } }, daily.map(habitRow))));
    if (strength.length) {
      const natural = data().settings.strengthDays.includes(parseISO(date).getDay());
      cards.push(h('section', { class: 'card' }, h('h2', null, 'Strength session'),
        h('p', { class: 'sub' }, 'Tick each move and enter the total you did.'),
        strength.map(habitRow),
        !natural && h('button', { class: 'link-btn', type: 'button', onclick: () => { store.updateDay(date, (d) => { d.extraStrength = false; }); refresh(); } }, 'Not a strength day after all')));
    } else if (data().habits.some((x) => !x.archived && x.schedule === 'strength')) {
      cards.push(h('section', { class: 'card' }, h('h2', null, 'Strength'),
        h('p', { class: 'sub' }, 'Rest day for strength. Your other habits are plenty today.'),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { store.updateDay(date, (d) => { d.extraStrength = true; }); refresh(); } }, 'I did strength today anyway')));
    }
    return cards;
  }

  /* ----- sleep ----- */
  function sleepCard() {
    const s = data().days[date]?.sleep ?? {};
    const result = h('div', { class: 'sleep-result', 'aria-live': 'polite' });
    const bed = h('input', { type: 'time', id: 's_bed', value: s.bed ?? '' });
    const wake = h('input', { type: 'time', id: 's_wake', value: s.wake ?? '' });
    const paint = () => {
      const sl = data().days[date]?.sleep ?? {};
      const hrs = sleepHours(sl.bed, sl.wake);
      if (hrs == null) { fill(result, h('span', { class: 'muted' }, 'Add both times to see your total.')); return; }
      const target = data().settings.bedtime;
      fill(result,
        h('b', null, formatDuration(hrs)),
        sl.bed && (bedOnTime(sl.bed, target) ? ' · in bed on time ✓' : ` · later than your ${formatTime12(target)} target`),
        hrs >= 7 ? h('div', { class: 'muted small' }, 'Well rested. Sleep keeps hunger and cravings calmer.')
          : hrs < 6 ? h('div', { class: 'muted small' }, 'Short night. Be kind to yourself; an earlier bedtime tonight will help.') : null);
    };
    const onChange = (key, input) => () => {
      store.updateDay(date, (d) => {
        d.sleep = { ...d.sleep };
        if (input.value) d.sleep[key] = input.value; else delete d.sleep[key];
      });
      if (key === 'bed' && input.value && bedOnTime(input.value, data().settings.bedtime)) {
        // logging an on-time bedtime ticks the "in bed on time" habit for the night before
        const prev = addDays(date, -1);
        const auto = data().habits.find((x) => x.auto === 'bedtime' && !x.archived);
        if (auto && !data().days[prev]?.checks?.[auto.id]) {
          store.updateDay(prev, (d) => { d.checks = { ...d.checks, [auto.id]: true }; });
          toast(`Marked ${relativeLabel(prev, todayISO).toLowerCase()}’s “in bed on time” ✓`);
        }
      }
    };
    bed.addEventListener('change', onChange('bed', bed));
    wake.addEventListener('change', onChange('wake', wake));
    updaters.push(paint);
    return h('section', { class: 'card' }, h('h2', null, icon('moon'), 'Last night’s sleep'),
      h('p', { class: 'sub' }, 'Log it any time the next day. Bedtime is the night before this date.'),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 's_bed' }, 'Went to bed'), bed),
        h('div', { class: 'field' }, h('label', { for: 's_wake' }, 'Woke up'), wake)),
      result);
  }

  /* ----- food ----- */
  const FOOD = {
    breakfast: ['Breakfast', 'e.g. 1 roti, 2 eggs, chai'],
    lunch: ['Lunch', 'e.g. 2 roti, daal'],
    dinner: ['Dinner', 'e.g. sabzi, 1 roti, dahi'],
    snacks: ['Snacks / bakery', 'e.g. roasted chana, 1 biscuit'],
    drinks: ['Chai / drinks', 'e.g. 2 chai, 1 with half sugar'],
  };
  /** Ask how many calories are in one serving of something Steady doesn't know, and remember it. */
  function teach(name) {
    const kcal = h('input', { type: 'number', id: 'tf_kcal', min: '1', max: '5000', step: '1', inputmode: 'numeric', placeholder: 'e.g. 350' });
    const err = h('div', { class: 'err', role: 'alert' });
    const form = h('form', { novalidate: true },
      h('p', { class: 'muted small' }, `I don’t know “${name}” yet. How many calories are in one serving? I’ll remember it, and “2 ${name}” will count double.`),
      h('div', { class: 'field' }, h('label', { for: 'tf_kcal' }, 'Calories in one serving'), kcal),
      err,
      h('button', { class: 'btn block', type: 'submit' }, 'Save'));
    const sheet = openSheet({ title: 'Teach Steady a food', body: form });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Math.round(Number(kcal.value));
      if (kcal.value === '' || !(v > 0 && v <= 5000)) { err.textContent = 'Enter calories between 1 and 5000.'; return; }
      store.updateSettings({ customFoods: addCustomFood(data().settings.customFoods, name, v) });
      sheet.close();
      toast('Saved. I’ll know it next time.');
    });
    setTimeout(() => kcal.focus(), 50);
  }

  /**
   * "How much was it?" for one item, without needing grams. Picking an amount rewrites just that item in what
   * you typed ("a little roasted chicken", "30g pumpkin"), so the text stays the single source of truth.
   */
  function adjust(input, it, all) {
    let sheet;
    const apply = (text, message) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      sheet.close();
      if (message) toast(message);
    };
    // write a change back only if the text still reads as the same meal; otherwise say so instead of guessing
    const change = (candidates) => {
      const next = readsBack(input.value, candidates, { custom: data().settings.customFoods });
      if (next == null) { toast('I couldn’t change that one. Try typing it in the box.'); return; }
      apply(next);
    };
    const number = (id, label, placeholder) => h('input', { type: 'number', id, min: '1', max: '5000', step: '1', inputmode: 'numeric', placeholder, 'aria-label': label });
    const exact = (id, label, unitWord, onValue) => {
      const field = number(id, label, unitWord === 'kcal' ? 'e.g. 60' : 'e.g. 40');
      const err = h('div', { class: 'err', role: 'alert' });
      const form = h('form', { class: 'exact', novalidate: true },
        h('div', { class: 'field' }, h('label', { for: id }, label), field, err),
        h('button', { class: 'btn ghost sm', type: 'submit' }, 'Use'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = Math.round(Number(field.value));
        if (field.value === '' || !(v > 0 && v <= 5000)) { err.textContent = 'Enter a number between 1 and 5000.'; return; }
        onValue(v);
      });
      return form;
    };
    const unitWord = it.per?.includes(' ml') ? 'ml' : 'g';
    const body = [
      h('p', { class: 'sheet-item' }, h('strong', null, itemLabel(it)), ` · counted as ${it.kcal} kcal`),
      h('p', { class: 'muted small' }, it.rough
        ? `You didn’t say how much, so I counted one usual amount (${it.per}). Pick what’s closest. It doesn’t need to be exact.`
        : 'Pick what’s closest. It doesn’t need to be exact.'),
      h('div', { class: 'choices' }, AMOUNT_CHOICES.map((c) => h('button', { class: 'btn ghost choice', type: 'button', onclick: () => change(c.say.map((s) => rewriteItem(input.value, it, s))) },
        h('span', null, c.label),
        it.usual != null && h('small', null, `≈ ${Math.round(it.usual * c.factor)} kcal`)))),
      it.per?.includes('about') && exact('adj_g', `Or the exact ${unitWord === 'ml' ? 'millilitres' : 'grams'}`, unitWord, (v) => change([rewriteItem(input.value, it, `${v}${unitWord}`)])),
      exact('adj_k', 'Or the exact calories', 'kcal', (v) => change([rewriteItemKcal(input.value, it, v)])),
      h('button', { class: 'btn danger block', type: 'button', onclick: () => apply(dropItem(input.value, it, all), 'Taken out of the count.') }, 'Don’t count this'),
    ];
    sheet = openSheet({ title: 'How much was it?', body });
  }

  function foodCard() {
    const food = data().days[date]?.food ?? {};
    let est = { meals: {} };
    updaters.push(() => { est = estimateFood(data().days[date]?.food, data().settings.customFoods); });
    const fields = MEAL_KEYS.map((k) => {
      const input = h('input', { type: 'text', id: `f_${k}`, placeholder: FOOD[k][1], value: food[k] ?? '', autocomplete: 'off', maxlength: '300' });
      input.addEventListener('input', () => store.updateDay(date, (d) => {
        d.food = { ...d.food };
        if (input.value) d.food[k] = input.value; else delete d.food[k];
      }));
      const none = k === 'snacks' && h('button', { class: 'btn ghost sm', type: 'button', style: { flex: 'none' }, onclick: () => {
        input.value = 'None today';
        input.dispatchEvent(new Event('input'));
        toast('Nice. Logged.');
      } }, 'None today');
      const badge = h('span', { class: 'kcal-badge' });
      const chips = h('div', { class: 'food-items' });
      updaters.push(() => {
        const r = est.meals[k];
        badge.textContent = r && r.kcal > 0 ? `≈ ${r.kcal} kcal` : '';
        fill(chips, r && r.items.map((it) => (it.unknown
          ? h('button', { class: 'chip warm', type: 'button', 'aria-label': `Add calories for ${it.name}`, onclick: () => teach(it.name) }, `${it.name} · add kcal`)
          : it.span && it.nameSpan
            ? h('button', { class: ['chip', 'neutral', it.rough && 'rough'], type: 'button', 'aria-label': `${itemLabel(it)}, about ${it.kcal} calories${it.rough ? ', amount not given' : ''}. Tap to change how much.`, onclick: () => adjust(input, it, r.items) }, `${itemLabel(it)} · ${it.rough ? '~' : ''}${it.kcal}`)
            : h('span', { class: 'chip neutral' }, `${itemLabel(it)} · ${it.kcal}`))));
      });
      return h('div', { class: 'field' },
        h('div', { class: 'label-row' }, h('label', { for: `f_${k}` }, FOOD[k][0]), badge),
        none ? h('div', { style: { display: 'flex', gap: '8px' } }, input, none) : input,
        chips);
    });
    return h('section', { class: 'card' }, h('h2', null, icon('food'), 'What I ate'),
      h('p', { class: 'sub' }, 'Type it the way you’d say it, like “2 roti, daal, chai half sugar”. Calories are estimated for you, roughly. Not sure how much? Say “a little”, “half”, “a few pieces” or “2-3 cubes”, or tap an item to change it.'), fields);
  }

  /* ----- calories: eaten vs burned ----- */
  const fmtK = (n) => Math.round(n).toLocaleString();
  function calorieCard() {
    const tile = (label) => {
      const b = h('b');
      const s = h('span', null, label);
      return { el: h('div', { class: 'stat' }, b, s), b, s };
    };
    const eatenT = tile('Eaten');
    const burnedT = tile('Burned');
    const gapT = tile('Deficit');
    const note = h('div', { class: 'small muted', style: { margin: '12px 0 0' }, 'aria-live': 'polite' });
    const how = h('div', { class: 'small muted' });
    const details = h('details', { style: { marginTop: '10px' } }, h('summary', { class: 'small' }, 'How “burned” is worked out'), how);
    const manual = h('input', { type: 'number', id: 'k_manual', min: '0', max: '20000', step: '10', inputmode: 'numeric', placeholder: 'optional' });
    manual.addEventListener('input', () => store.updateDay(date, (d) => {
      const v = manual.value === '' ? null : Number(manual.value);
      if (v == null || !(v >= 0 && v <= 20000)) delete d.kcal; else d.kcal = Math.round(v);
    }));
    updaters.push(() => {
      const c = dayCalories(data(), date);
      const e = c.eaten;
      const b = c.burn;
      eatenT.b.textContent = e ? fmtK(e.kcal) : '–';
      burnedT.b.textContent = b ? fmtK(b.total) : '–';
      gapT.b.textContent = c.deficit == null ? '–' : fmtK(Math.abs(c.deficit));
      gapT.s.textContent = c.deficit != null && c.deficit < 0 ? 'Surplus' : 'Deficit';
      if (document.activeElement !== manual) manual.value = Number.isFinite(data().days[date]?.kcal) ? String(data().days[date].kcal) : '';
      details.hidden = !b;
      if (b) {
        fill(how,
          h('div', null, `Resting energy and daily life: ${fmtK(b.base)} kcal`),
          h('div', null, `Evening walk (${fmtK(b.steps)} steps): +${fmtK(b.walk)} kcal`),
          b.strength > 0 && h('div', null, `Strength session: +${b.strength} kcal`),
          h('div', null, `Based on ${b.kg} kg. Estimates are usually off by 15–30%.`));
      }
      const s = data().settings;
      let msg = null;
      if (!profileReady(s)) {
        msg = [!e ? 'Type what you ate above. ' : '', 'Add your height and age in Settings to see what you burn and your deficit. ',
          h('button', { class: 'link-btn', type: 'button', onclick: () => navigate('/settings') }, 'Open Settings')];
      } else if (!b) msg = 'Log a weigh-in on the Progress tab so I can estimate what you burn.';
      else if (!e) msg = 'Type what you ate above and I’ll count it.';
      else if (e.unknown.length && !e.manual) {
        msg = `Not counted yet: ${e.unknown.map((u) => u.name).join(', ')}. Tap the orange chip above to add its calories, or type your own total below.`;
      } else if (!e.complete && !e.manual) msg = 'Only some meals are logged, so the deficit will shrink as you add the rest.';
      else if (isLowDay(e)) msg = 'That’s quite low for a whole day. Eating too little backfires: tiredness, cravings, rebound eating. Steady wins.';
      else if (isToday && c.deficit != null && !e.manual && now().getHours() < 20) msg = 'The day isn’t over, so this will shift as you eat.';
      fill(note, msg);
    });
    return h('section', { class: 'card' }, h('h2', null, icon('flame'), 'Calories (rough estimate)'),
      h('p', { class: 'sub' }, 'A guide, not a measurement. The weekly trend matters more than any one day.'),
      h('div', { class: 'stats tight', style: { margin: '0' } }, eatenT.el, burnedT.el, gapT.el),
      note, details,
      h('div', { class: 'field', style: { margin: '14px 0 0' } }, h('label', { for: 'k_manual' }, 'Or type your own total for the day (kcal)'), manual));
  }

  function noteCard() {
    const ta = h('textarea', { 'aria-label': 'Note for the day', placeholder: 'Mood, energy, a small win…', maxlength: '5000' }, data().days[date]?.note ?? '');
    ta.addEventListener('input', () => store.updateDay(date, (d) => { if (ta.value) d.note = ta.value; else delete d.note; }));
    return h('section', { class: 'card' }, h('h2', null, icon('note'), 'Note'), h('div', { style: { marginTop: '10px' } }, ta));
  }

  /* ----- assemble ----- */
  const view = h('div', { class: 'view' },
    head, ...banners(), weekStrip(),
    h('div', { class: 'cols' },
      h('div', null, hero(), ...habitsCards()),
      h('div', null, sleepCard(), foodCard(), calorieCard(), noteCard())));
  root.replaceChildren(view);
  const run = () => updaters.forEach((fn) => fn());
  run();
  const unsub = store.subscribe(['day', 'settings'], run);
  return () => unsub();
}
