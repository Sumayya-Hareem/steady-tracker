// First-run welcome: value props, quick setup, or explore with sample data.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toISO } from '../core/dates.js';
import { defaultCheckpointDate } from '../core/pace.js';
import { generateDemo } from '../core/demo.js';

export function showOnboarding(ctx) {
  const { store, now, onDone } = ctx;
  const todayISO = toISO(now());
  const overlay = h('div', { class: 'onboard', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome to Steady' });
  const inner = h('div', { class: 'onboard-inner' });
  overlay.append(inner);
  document.body.append(overlay);
  const finish = () => { overlay.remove(); onDone(); };

  function welcome() {
    inner.replaceChildren(
      h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '', width: '68', height: '68' }),
      h('h1', null, 'Small habits.', h('br'), 'Steady progress.'),
      h('p', { class: 'lead' }, 'A calm daily tracker for habits, sleep, food and weight, built around consistency instead of calorie counting.'),
      h('ul', { class: 'values' },
        h('li', null, icon('shield'), h('div', null, h('b', null, 'Private by design'), h('span', null, 'Your data stays on this device. No account, no tracking, nothing uploaded.'))),
        h('li', null, icon('wifi'), h('div', null, h('b', null, 'Works offline'), h('span', null, 'Install it like an app and use it anywhere, even without a connection.'))),
        h('li', null, icon('heart'), h('div', null, h('b', null, 'Gentle, not obsessive'), h('span', null, 'Plate-based eating, spoon-measured oil, one weigh-in a week. Built around everyday home cooking.')))),
      h('div', { class: 'btn-stack' },
        h('button', { class: 'btn block', type: 'button', onclick: setup }, 'Get started'),
        h('button', { class: 'btn ghost block', type: 'button', onclick: async () => { await store.replaceAll(generateDemo(todayISO)); finish(); } }, 'Explore with sample data')));
  }

  function setup() {
    const name = h('input', { type: 'text', id: 'o_name', autocomplete: 'off', maxlength: '40' });
    const cur = h('input', { type: 'number', id: 'o_w', inputmode: 'decimal', step: '0.1', min: '20', max: '300' });
    const goal = h('input', { type: 'number', id: 'o_g', inputmode: 'decimal', step: '0.1', min: '20', max: '300' });
    const unit = h('select', { id: 'o_u' }, h('option', { value: 'in' }, 'inches'), h('option', { value: 'cm' }, 'cm'));
    const err = h('div', { class: 'err', role: 'alert' });
    const form = h('form', { novalidate: true },
      h('div', { class: 'steps', 'aria-hidden': 'true' }, h('i', { class: 'on' }), h('i', { class: 'on' })),
      h('h1', { style: { fontSize: '1.9rem', margin: '4px 0 6px' } }, 'Let’s set up the basics'),
      h('p', { class: 'lead', style: { marginBottom: '18px' } }, 'You can change any of this later in Settings.'),
      h('div', { class: 'field' }, h('label', { for: 'o_name' }, 'What should I call you? (optional)'), name),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 'o_w' }, 'Current weight (kg)'), cur),
        h('div', { class: 'field' }, h('label', { for: 'o_g' }, 'Goal weight (kg)'), goal)),
      h('div', { class: 'field' }, h('label', { for: 'o_u' }, 'Waist unit'), unit),
      err,
      h('button', { class: 'btn block', type: 'submit' }, 'Start tracking'),
      h('button', { class: 'link-btn', type: 'button', style: { display: 'block', margin: '10px auto 0' }, onclick: welcome }, 'Back'),
      h('button', { class: 'link-btn', type: 'button', style: { display: 'block', margin: '0 auto' }, onclick: () => { store.updateSettings({ onboarded: true }); finish(); } }, 'Skip for now'));
    inner.replaceChildren(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const kg = Number(cur.value);
      const g = Number(goal.value);
      if (cur.value === '' || !(kg >= 20 && kg <= 300)) { err.textContent = 'Enter your current weight in kg.'; return; }
      if (goal.value === '' || !(g >= 20 && g <= 300)) { err.textContent = 'Enter your goal weight in kg.'; return; }
      if (g >= kg) { err.textContent = 'Your goal weight should be lower than your current weight.'; return; }
      store.setWeight({ date: todayISO, kg });
      store.updateSettings({
        name: name.value.trim().slice(0, 40), goalWeight: g, waistUnit: unit.value, onboarded: true,
        startWeight: kg, startDate: todayISO, checkpointDate: defaultCheckpointDate(todayISO),
      });
      finish();
    });
    setTimeout(() => name.focus(), 50);
  }

  welcome();
}
