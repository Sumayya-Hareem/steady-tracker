// Deterministic sample data so a first-time visitor can explore a populated app.
// Seeded, so the same seed always produces the same six weeks.

import { addDays } from './dates.js';
import { normalize } from './schema.js';
import { parseISO } from './dates.js';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BREAKFAST = ['1 roti, 2 eggs, chai (no sugar)', 'Daal with 1 roti', 'Omelette, 1 slice of bread', 'Boiled egg, 1 roti, plain chai'];
const LUNCH = ['2 roti, chana, salad', '1 roti, daal, dahi', '2 roti, lobia', 'Small rice, daal, sabzi'];
const DINNER = ['Sabzi, 1 roti, dahi', 'Chicken curry (less oil), 1 roti, salad', 'Daal, 1 roti, cucumber', 'Egg bhurji, 1 roti'];
const SNACKS = ['Roasted chana', 'A guava', 'None today', 'Apple and a handful of nuts'];

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const two = (n) => String(n).padStart(2, '0');
const clock = (mins) => `${two(Math.floor(mins / 60) % 24)}:${two(mins % 60)}`;

export function generateDemo(todayISO, { seed = 42, weeks = 6 } = {}) {
  const rand = mulberry32(seed);
  const base = normalize(null);
  const dayCount = weeks * 7;
  const start = addDays(todayISO, -(dayCount - 1));
  const settings = {
    ...base.settings,
    name: '',
    startWeight: 72.4,
    startDate: start,
    goalWeight: 65,
    checkpointKg: 4,
    checkpointDate: addDays(start, 42),
    onboarded: true,
    demo: true,
  };

  const days = {};
  for (let i = 0; i < dayCount - 1; i++) {
    // leave today empty so the Today screen has something to do
    const date = addDays(start, i);
    const strength = settings.strengthDays.includes(parseISO(date).getDay());
    const consistency = 0.5 + 0.4 * (i / dayCount);
    const checks = {};
    const amounts = {};
    for (const h of base.habits) {
      if (h.schedule === 'strength' && !strength) continue;
      if (h.auto) continue;
      if (rand() < consistency) {
        checks[h.id] = true;
        if (h.unit && h.target) amounts[h.id] = Math.max(1, Math.round(h.target * (0.8 + rand() * 0.5)));
      }
    }
    const bedMins = 22 * 60 + 15 + Math.floor(rand() * 100) - (i > 20 ? 20 : 0);
    const wakeMins = 5 * 60 + 45 + Math.floor(rand() * 60);
    if (bedMins <= 22 * 60 + 30) checks.bed = true;
    days[date] = {
      checks,
      amounts,
      sleep: { bed: clock(bedMins), wake: clock(wakeMins) },
      food: {
        breakfast: pick(rand, BREAKFAST),
        lunch: pick(rand, LUNCH),
        dinner: pick(rand, DINNER),
        snacks: pick(rand, SNACKS),
      },
    };
    if (i % 9 === 4) days[date].note = 'Felt lighter today. The evening walk is becoming a habit.';
  }

  const weights = [];
  for (let w = 0; addDays(start, w * 7) <= todayISO; w++) {
    const date = addDays(start, w * 7);
    const kg = Math.round((72.4 - 0.55 * w + (rand() - 0.5) * 0.4) * 10) / 10;
    weights.push({ date, kg: w === 0 ? 72.4 : kg, waist: Math.round((37 - 0.3 * w) * 10) / 10 });
  }

  return normalize({ settings, habits: base.habits, days, weights });
}
