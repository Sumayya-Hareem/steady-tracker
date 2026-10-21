// "Guide" view: reference content rendered from data (no HTML strings).

import { h, rich } from '../ui/dom.js';

const GUIDE = [
  {
    title: 'Eating: keep your food, change the quantities',
    open: true,
    body: [
      { ul: [
        '**Plate:** half sabzi or salad, a quarter protein, a quarter roti or rice.',
        '**Roti and rice:** 1–2 rotis per meal. Rice a few times a week, in a small portion.',
        '**Protein every meal:** eggs, daal, chana, lobia, chicken, fish, dahi. It keeps you full.',
        '**Oil:** the sneakiest calories. Measure it with a spoon; shallow-cook instead of deep-fry.',
        '**Snacks and bakery:** occasional, not daily. Roasted chana, fruit or nuts most days.',
        '**Chai:** cut the sugar gradually, and watch the biscuits and rusks beside it.',
        '**Drinks:** water mostly. A glass before each meal. Skip sugary drinks.',
        'Serve your plate once; no seconds.',
      ] },
      { note: 'You don’t have to count calories if the plate method works for you. A gentle, steady approach beats a crash diet; eating far too little backfires with tiredness, muscle loss and rebound eating.' },
    ],
  },
  {
    title: 'A day of eating (budget-friendly)',
    body: [{ ul: [
      '**Breakfast:** 1 roti or 1 slice of bread with 1–2 eggs (little oil), chai with little or no sugar. Or daal with 1 roti.',
      '**Lunch:** 1–2 rotis with daal, chana, lobia or a simple sabzi. Less salan oil. Add dahi or a boiled egg if you can. Skip samosas, parathas, biryani and fried items.',
      '**Evening snack:** roasted chana, a seasonal fruit (guava, apple, banana), or just chai without biscuits.',
      '**Dinner:** half sabzi or salad, a quarter daal or chicken/egg, a quarter roti or small rice. 1–2 rotis.',
    ] }],
  },
  {
    title: 'Strength moves: how to do them',
    body: [
      { p: 'A **round** is each move once, in order. Do 2 rounds with about a minute of rest between rounds. Three sessions a week, about 15 minutes, an hour after your walk and never on a full stomach.' },
      { h: '1. Squats (legs and glutes)' },
      { ul: ['Feet a little wider than shoulders, toes slightly out.', 'Push your hips back and bend your knees, as if sitting on a chair behind you.', 'Chest up, back straight, knees following the direction of your toes.', 'Go down as far as is comfortable, then press through your heels to stand.', '*Beginner tip:* put a chair behind you and lightly tap it with your hips each time.'] },
      { h: '2. Wall push-ups (chest, arms, shoulders)' },
      { ul: ['Stand an arm’s length from a wall, palms on it at shoulder height, a little wider than your shoulders.', 'Body in one straight line from head to heels.', 'Bend your elbows to bring your chest toward the wall, then push back out.', 'When 10 feels easy, move to **knee push-ups** on a mat or folded blanket.'] },
      { h: '3. Glute bridges (glutes, back of thighs)' },
      { ul: ['Lie on your back, knees bent, feet flat and hip-width apart, arms by your sides.', 'Press through your heels and lift your hips until shoulders, hips and knees form a straight line.', 'Squeeze your glutes for a second, then lower slowly.', 'Keep your ribs down; the work should be in your glutes, not your lower back.'] },
      { h: '4. Plank (core)' },
      { ul: ['On your forearms and knees or toes, elbows right under your shoulders.', 'Straight line from head to knees or heels. Don’t let your hips sag or pike up.', 'Tighten your tummy as if bracing for a light poke, and keep breathing.', 'Hold 20 seconds. Easier: on your knees. Add 5 seconds each week.'] },
      { h: 'A session' },
      { ul: ['Warm up for 2 minutes: march in place, roll your shoulders, gentle hip circles.', 'Round 1, rest a minute, Round 2.', 'Cool down with a slow walk and light stretching.', 'Add 2 reps or a few seconds each week, not more.'] },
    ],
  },
  {
    title: 'The evening walk',
    body: [{ ul: ['Start 10–15 minutes after you finish eating.', 'Easy pace, where you could still chat.', 'Begin with 30 minutes and build up. Two shorter walks count too.', 'In winter, wear a shawl or jacket so the cold doesn’t cut it short.'] }],
  },
  {
    title: 'Sleep',
    body: [{ ul: ['Aim for 7–8 hours. Poor sleep makes hunger and cravings louder.', 'Move bedtime earlier by 15–20 minutes every few days instead of all at once.', 'Log your bed and wake times each day; the pattern shows up fast.'] }],
  },
  {
    title: 'Good to know',
    body: [{ ul: [
      'Mild muscle soreness a day or two later is normal for beginners. Sharp pain, especially in knees or lower back, is not: stop that move and use an easier version.',
      'The first week or two often shows a faster drop from water and less bloating. After that, about 0.5–0.75 kg a week is a realistic, sustainable pace.',
      'Plateaus happen. Stay consistent another week or two before changing anything.',
      'You can’t choose where fat comes off, but the belly usually shrinks along with everything else.',
      'A routine checkup (thyroid and blood sugar) is worth doing when you can. It is not a reason to wait; start the habits now.',
      'If you feel dizzy, weak or unwell, eat a proper meal and speak to a doctor.',
    ] }, { note: 'Steady is a tracking tool, not medical advice. If you have a medical condition, are pregnant, or are recovering from surgery, check with your doctor first.' }],
  },
];

function block(b) {
  if (b.p) return h('p', null, rich(b.p));
  if (b.h) return h('h4', null, b.h);
  if (b.ul) return h('ul', null, b.ul.map((li) => h('li', null, rich(li))));
  if (b.note) return h('p', { class: 'small muted' }, rich(b.note));
  return null;
}

export function mountGuide(ctx) {
  ctx.root.replaceChildren(h('div', { class: 'view reading' },
    h('header', { class: 'page-head' }, h('div', { class: 'eyebrow' }, 'Reference'), h('h1', null, 'Your plan'),
      h('p', null, 'The ideas behind the habits, in one place. Tap a section to open it.')),
    h('section', { class: 'card' }, GUIDE.map((s) =>
      h('details', { open: s.open }, h('summary', null, s.title), h('div', { class: 'prose' }, s.body.map(block)))))));
  return () => {};
}
