// "Settings" view: profile, routine, custom habits, data (backup/restore), theme, danger zone.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmDialog, toast, download } from '../ui/dom.js';
import { toISO } from '../core/dates.js';
import { UNITS, normalize, isBackupShape } from '../core/schema.js';
import { newHabitId } from '../core/habits.js';
import { daysCSV, weightsCSV } from '../core/csv.js';
import { discardLegacy } from '../storage.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const THEME_KEY = 'steady.theme';

export function applyTheme(pref) {
  const el = document.documentElement;
  if (pref === 'light' || pref === 'dark') el.setAttribute('data-theme', pref);
  else el.removeAttribute('data-theme');
  const color = getComputedStyle(el).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color || '#f8f5ef');
}
export const savedTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; } };

export function mountSettings(ctx) {
  const { store, root, now, adapter, refresh } = ctx;
  const data = () => store.state;
  const todayISO = toISO(now());
  const host = h('div', { class: 'view' });
  root.replaceChildren(host);

  /* ----- habit editor sheet ----- */
  function openHabitEditor(existing) {
    const label = h('input', { type: 'text', id: 'hb_label', maxlength: '60', placeholder: 'e.g. Stretch for 5 minutes', value: existing?.label ?? '' });
    const unit = h('select', { id: 'hb_unit' }, h('option', { value: '' }, 'Just a tick'), UNITS.map((u) => h('option', { value: u, selected: existing?.unit === u }, u)));
    const target = h('input', { type: 'number', id: 'hb_target', min: '1', step: 'any', inputmode: 'decimal', placeholder: 'optional', value: existing?.target != null ? String(existing.target) : '' });
    const hint = h('input', { type: 'text', id: 'hb_hint', maxlength: '80', placeholder: 'optional short reminder', value: existing?.hint ?? '' });
    const schedule = h('select', { id: 'hb_sched' },
      h('option', { value: 'daily', selected: existing?.schedule !== 'strength' }, 'Every day'),
      h('option', { value: 'strength', selected: existing?.schedule === 'strength' }, 'Strength days only'));
    const err = h('div', { class: 'err', role: 'alert' });
    const form = h('form', { novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'hb_label' }, 'Habit'), label),
      h('div', { class: 'grid2' },
        h('div', { class: 'field' }, h('label', { for: 'hb_unit' }, 'Track'), unit),
        h('div', { class: 'field' }, h('label', { for: 'hb_target' }, 'Daily target'), target)),
      h('div', { class: 'field' }, h('label', { for: 'hb_hint' }, 'Reminder'), hint),
      h('div', { class: 'field' }, h('label', { for: 'hb_sched' }, 'When'), schedule),
      err,
      h('button', { class: 'btn block', type: 'submit' }, existing ? 'Save habit' : 'Add habit'));
    const sheet = openSheet({ title: existing ? 'Edit habit' : 'New habit', body: form });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = label.value.trim();
      if (!name) { err.textContent = 'Give the habit a name.'; return; }
      const t = Number(target.value);
      if (target.value !== '' && !(t > 0)) { err.textContent = 'Target should be a positive number.'; return; }
      store.saveHabit({
        ...(existing ?? { id: newHabitId(), archived: false }),
        label: name,
        unit: unit.value || null,
        target: unit.value && target.value !== '' ? t : null,
        hint: hint.value.trim(),
        schedule: schedule.value,
      });
      sheet.close();
      toast(existing ? 'Habit updated.' : 'Habit added.');
    });
    setTimeout(() => label.focus(), 50);
  }

  /* ----- sections ----- */
  const textField = (id, labelText, value, onChange, attrs = {}) => {
    const input = h('input', { type: 'text', id, value, autocomplete: 'off', ...attrs });
    input.addEventListener('change', () => onChange(input.value));
    return h('div', { class: 'field' }, h('label', { for: id }, labelText), input);
  };
  const numberField = (id, labelText, value, onChange, attrs = {}) => {
    const input = h('input', { type: 'number', id, inputmode: 'decimal', step: '0.1', value: value != null ? String(value) : '', ...attrs });
    input.addEventListener('change', () => onChange(input.value === '' ? null : Number(input.value)));
    return h('div', { class: 'field' }, h('label', { for: id }, labelText), input);
  };

  function profileCard() {
    const s = data().settings;
    const unit = h('select', { id: 'st_wu' }, h('option', { value: 'in', selected: s.waistUnit === 'in' }, 'inches'), h('option', { value: 'cm', selected: s.waistUnit === 'cm' }, 'cm'));
    unit.addEventListener('change', () => store.updateSettings({ waistUnit: unit.value }));
    return h('section', { class: 'card' }, h('h2', null, 'About you'), h('div', { style: { marginTop: '12px' } },
      textField('st_name', 'Name', s.name, (v) => store.updateSettings({ name: v.trim().slice(0, 40) }), { maxlength: '40' }),
      numberField('st_goal', 'Goal weight (kg)', s.goalWeight, (v) => store.updateSettings({ goalWeight: v != null && v >= 20 && v <= 300 ? v : null })),
      h('div', { class: 'field' }, h('label', { for: 'st_wu' }, 'Waist unit'), unit)));
  }

  function routineCard() {
    const s = data().settings;
    const chips = DAYS.map((name, i) => {
      const btn = h('button', { class: 'day-chip', type: 'button', 'aria-pressed': String(s.strengthDays.includes(i)) }, name);
      btn.addEventListener('click', () => {
        const list = new Set(data().settings.strengthDays);
        if (list.has(i)) list.delete(i); else list.add(i);
        const next = [...list].sort((a, b) => a - b);
        store.updateSettings({ strengthDays: next });
        btn.setAttribute('aria-pressed', String(next.includes(i)));
      });
      return btn;
    });
    const bed = h('input', { type: 'time', id: 'st_bed', value: s.bedtime });
    bed.addEventListener('change', () => { if (bed.value) store.updateSettings({ bedtime: bed.value }); });
    const weigh = h('select', { id: 'st_wd' }, DAYS.map((n, i) => h('option', { value: String(i), selected: s.weighDay === i }, n)));
    weigh.addEventListener('change', () => store.updateSettings({ weighDay: Number(weigh.value) }));
    const cpDate = h('input', { type: 'date', id: 'st_cd', value: s.checkpointDate ?? '' });
    cpDate.addEventListener('change', () => store.updateSettings({ checkpointDate: cpDate.value || null }));
    return h('section', { class: 'card' }, h('h2', null, 'Routine'), h('div', { style: { marginTop: '12px' } },
      h('div', { class: 'field' }, h('label', { for: 'st_bed' }, 'Target bedtime'), bed),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Strength days'), h('div', { class: 'days', role: 'group', 'aria-label': 'Strength days' }, chips)),
      h('div', { class: 'field' }, h('label', { for: 'st_wd' }, 'Weigh-in day'), weigh),
      h('div', { class: 'grid2' },
        numberField('st_ckg', 'Checkpoint: lose (kg)', s.checkpointKg, (v) => store.updateSettings({ checkpointKg: v != null && v >= 0 ? v : 0 }), { step: '0.5', min: '0' }),
        h('div', { class: 'field' }, h('label', { for: 'st_cd' }, 'By'), cpDate))));
  }

  function habitsCard() {
    const habits = data().habits;
    const active = habits.filter((x) => !x.archived);
    const archived = habits.filter((x) => x.archived);
    const row = (x) => {
      const i = habits.indexOf(x);
      return h('div', { class: 'habit-admin' },
        h('div', { class: 'grow' }, h('div', { class: 't' }, x.label),
          h('div', { class: 'd' }, [x.unit ? `${x.target ?? '–'} ${x.unit}` : 'Tick', x.schedule === 'strength' ? 'strength days' : 'daily'].join(' · '))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${x.label} up`, disabled: i === 0, onclick: () => store.moveHabit(x.id, -1) }, icon('up', 18)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${x.label} down`, disabled: i === habits.length - 1, onclick: () => store.moveHabit(x.id, 1) }, icon('down', 18)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${x.label}`, onclick: () => openHabitEditor(x) }, icon('edit', 18)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${x.label}`, onclick: async () => {
          if (await confirmDialog({ title: 'Remove habit?', message: `“${x.label}” will stop showing up. Your past entries are kept, and you can restore it below.`, confirmLabel: 'Remove', danger: true })) store.setHabitArchived(x.id, true);
        } }, icon('trash', 18)));
    };
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Your habits'), h('button', { class: 'btn sm', type: 'button', onclick: () => openHabitEditor() }, icon('plus', 18), 'Add')),
      h('p', { class: 'sub' }, 'Make the checklist yours: add, reorder, edit or remove habits.'),
      h('div', null, active.map(row)),
      archived.length > 0 && h('div', { style: { marginTop: '14px' } }, h('div', { class: 'label' }, 'Removed'),
        archived.map((x) => h('div', { class: 'habit-admin' }, h('div', { class: 'grow' }, h('div', { class: 't' }, x.label)),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => store.setHabitArchived(x.id, false) }, 'Restore')))));
  }

  function dataCard() {
    const s = data().settings;
    const file = h('input', { type: 'file', id: 'importFile', accept: 'application/json,.json', class: 'hide' });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let obj;
        try { obj = JSON.parse(reader.result); } catch { obj = null; }
        file.value = '';
        if (!isBackupShape(obj)) { toast('That file doesn’t look like a Steady backup.'); return; }
        if (!(await confirmDialog({ title: 'Restore this backup?', message: 'This replaces everything currently in the app with the contents of the file.', confirmLabel: 'Restore' }))) return;
        const next = normalize(obj);
        next.settings.onboarded = true;
        await store.replaceAll(next);
        toast('Backup restored.');
        refresh();
      };
      reader.readAsText(f);
    });
    return h('section', { class: 'card' }, h('h2', null, icon('shield'), 'Your data'),
      h('p', { class: 'sub' }, `Everything is stored only in this browser on this device (${adapter.kind === 'indexeddb' ? 'IndexedDB' : 'local storage'}). Nothing is uploaded. Export a backup now and then, especially before clearing browser data.`),
      h('div', { class: 'btn-stack' },
        h('button', { class: 'btn', type: 'button', onclick: () => {
          download(`steady-backup-${todayISO}.json`, JSON.stringify(store.snapshot(), null, 2), 'application/json');
          store.updateSettings({ lastBackup: Date.now() });
          toast('Backup downloaded.');
          refresh();
        } }, icon('download', 18), 'Export backup (JSON)'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { download(`steady-daily-log-${todayISO}.csv`, daysCSV(data()), 'text/csv'); toast('Daily log downloaded.'); } }, 'Export daily log (CSV)'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { download(`steady-weigh-ins-${todayISO}.csv`, weightsCSV(data()), 'text/csv'); toast('Weigh-ins downloaded.'); } }, 'Export weigh-ins (CSV)'),
        h('label', { class: 'btn ghost', for: 'importFile' }, icon('upload', 18), 'Restore from backup…'),
        file),
      h('p', { class: 'small muted', style: { margin: '12px 0 0' } }, `Last backup: ${s.lastBackup ? new Date(s.lastBackup).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}`));
  }

  function appearanceCard() {
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' });
    const paint = () => {
      const cur = savedTheme();
      seg.replaceChildren(...[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, name]) =>
        h('button', { type: 'button', 'aria-pressed': String(cur === k), onclick: () => {
          try { if (k === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, k); } catch { /* ignore */ }
          applyTheme(k); paint();
        } }, name)));
    };
    paint();
    return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Appearance'), seg));
  }

  function installCard() {
    return h('section', { class: 'card' }, h('h2', null, icon('wifi'), 'Install & offline'),
      h('p', { class: 'sub', style: { marginBottom: 0 } }, 'Steady works offline once opened. Android (Chrome): menu ⋮ → Install app. iPhone (Safari): Share → Add to Home Screen. Always open it the same way so your data stays in one place.'));
  }

  function dangerCard() {
    return h('section', { class: 'card' }, h('h2', null, 'Danger zone'), h('p', { class: 'sub' }, 'Deletes everything stored in this app on this device.'),
      h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!(await confirmDialog({ title: 'Erase all data?', message: 'This permanently deletes every habit entry, weigh-in and setting on this device. Export a backup first if you might want it back.', confirmLabel: 'Erase everything', danger: true }))) return;
        await store.reset();
        await discardLegacy(adapter);
        refresh();
      } }, 'Erase all data'));
  }

  const habitsHost = h('div');
  const repaintHabits = () => habitsHost.replaceChildren(habitsCard());
  repaintHabits();
  host.append(
    h('header', { class: 'page-head' }, h('div', { class: 'eyebrow' }, 'Make it yours'), h('h1', null, 'Settings')),
    h('div', { class: 'cols' },
      h('div', null, profileCard(), routineCard(), habitsHost),
      h('div', null, appearanceCard(), dataCard(), installCard(), dangerCard())));
  const unsub = store.subscribe('habits', repaintHabits);
  return () => unsub();
}
