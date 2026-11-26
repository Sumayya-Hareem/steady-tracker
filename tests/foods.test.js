import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMOUNT_CHOICES, FOODS, parseMeal, estimateFood, addCustomFood, removeCustomFood, itemLabel, rewriteItem, rewriteItemKcal, dropItem, readsBack, tokenize } from '../src/core/foods.js';

const kcal = (text, opts) => parseMeal(text, opts).kcal;
const names = (text, opts) => parseMeal(text, opts).items.map((i) => i.name);

test('the food table is clean: unique ids, no alias shared by two foods, sane calories', () => {
  const ids = new Set();
  const alias = new Map();
  for (const food of FOODS) {
    assert.equal(ids.has(food.id), false, `duplicate id ${food.id}`);
    ids.add(food.id);
    assert.ok(food.kcal >= 0 && food.kcal <= 1500, `${food.id} kcal`);
    for (const a of food.aliases) {
      assert.equal(a, a.toLowerCase(), `${food.id} alias ${a} must be lowercase`);
      assert.ok(!alias.has(a) || alias.get(a) === food.id, `alias "${a}" is on both ${alias.get(a)} and ${food.id}`);
      alias.set(a, food.id);
    }
  }
});

test('counts a typical meal and lists each item', () => {
  const r = parseMeal('2 roti, daal, chai half sugar');
  assert.deepEqual(r.items.map((i) => [i.name, i.qty]), [['Roti', 2], ['Daal', 1], ['Chai (milk tea)', 1]]);
  assert.equal(r.kcal, 439);
  assert.deepEqual(r.unknown, []);
});

test('numbers can be digits, fractions, English or Roman Urdu words', () => {
  assert.equal(kcal('2 roti'), 220);
  assert.equal(kcal('two roti'), 220);
  assert.equal(kcal('do roti'), 220);
  assert.equal(kcal('half roti'), 55);
  assert.equal(kcal('1/2 roti'), 55);
  assert.equal(kcal('do roti aur ek katori daal'), 360);
});

test('units and sizes change the amount', () => {
  assert.equal(kcal('1 and a half plate rice'), 585);
  assert.equal(kcal('200 rice'), 260); // a bare big number means grams
  assert.equal(kcal('200 g rice'), 260);
  assert.ok(kcal('large chicken roll') > kcal('chicken roll'));
  assert.ok(kcal('small chicken roll') < kcal('chicken roll'));
});

test('a quantity can come after the food, and can be glued to it', () => {
  assert.equal(kcal('roti 2'), 220);
  assert.equal(kcal('2roti'), 220);
  assert.equal(kcal('chai 3 cups'), 3 * kcal('chai'));
});

test('typed calories are used as given', () => {
  const r = parseMeal('restaurant biryani 650 kcal');
  assert.equal(r.kcal, 650);
  assert.deepEqual(r.unknown, []);
  assert.equal(kcal('300 kcal'), 300); // just a number is fine too
});

test('sugar and fat notes adjust the food instead of adding to it', () => {
  const normal = kcal('chai');
  const half = kcal('chai half sugar');
  const none = kcal('chai no sugar');
  assert.ok(none < half && half < normal);
  assert.equal(kcal('sugar free chai'), none);
  assert.equal(kcal('no sugar chai'), none); // said before the chai
  assert.equal(kcal('no ghee roti'), kcal('roti')); // a cooking note, not extra food
  assert.equal(kcal('roti without butter'), kcal('roti'));
});

test('small typos still find the food, once', () => {
  assert.deepEqual(names('chiken karahi'), ['Chicken karahi']); // not "chicken" + "karahi"
  assert.deepEqual(names('biriyani'), ['Biryani']);
});

test('ordinary words never turn into food', () => {
  for (const w of ['sweet', 'crispy', 'juicy', 'creamy', 'cheesy', 'bitter', 'fresh', 'tasty', 'today', 'lunch']) {
    assert.equal(parseMeal(`${w}`).items.length, 0, w);
  }
  assert.equal(kcal('I had 2 roti for lunch today'), 220);
  assert.equal(kcal('sweet chai'), kcal('chai')); // not "sweets"
});

test('something it does not know is flagged, never silently counted', () => {
  const r = parseMeal('mystery gloop');
  assert.equal(r.kcal, 0);
  assert.equal(r.unknown.length, 1);
  assert.equal(r.unknown[0].name, 'mystery gloop');
  const mixed = parseMeal('2 roti, mystery gloop');
  assert.equal(mixed.kcal, 220);
  assert.equal(mixed.unknown.length, 1);
});

test('empty and blank text give an empty result', () => {
  for (const t of ['', '   ', ',', undefined, null]) {
    const r = parseMeal(t);
    assert.deepEqual([r.items.length, r.kcal, r.unknown.length], [0, 0, 0]);
  }
});

test('"skipped" and "water" are known and cost nothing', () => {
  assert.deepEqual(parseMeal('skipped').unknown, []);
  assert.equal(kcal('skipped'), 0);
  assert.equal(kcal('water'), 0);
});

test('fillings are absorbed by the roll, pizza or burger they are in', () => {
  assert.deepEqual(names('beef roll'), ['Roll / wrap']); // not beef curry + a roll
  assert.equal(kcal('beef roll'), kcal('roll'));
  assert.equal(kcal('cheese pizza'), kcal('pizza'));
  assert.equal(kcal('zinger wrap'), kcal('wrap'));
  assert.equal(kcal('jalapeno roll'), kcal('roll')); // an unknown filling is not "unknown food"
  assert.equal(parseMeal('mystery roll').unknown.length, 0);
});

test('"2 beef roll" is two rolls, and a comma keeps items apart', () => {
  assert.equal(kcal('2 beef roll'), 2 * kcal('roll'));
  assert.equal(kcal('2 cheese pizza slices'), 2 * kcal('pizza'));
  assert.equal(kcal('pizza, chicken'), kcal('pizza') + kcal('chicken'));
});

test('a drink next to a burger is still counted', () => {
  assert.equal(kcal('pepsi pizza'), kcal('pepsi') + kcal('pizza'));
  assert.equal(kcal('chai sandwich'), kcal('chai') + kcal('sandwich'));
  assert.equal(kcal('beef roll chai'), kcal('roll') + kcal('chai'));
});

test('everyday dishes and spellings resolve to one food, not two', () => {
  for (const [text, name] of [['dahi puri', 'Chaat'], ['samosa chaat', 'Chaat'], ['gol gappay', 'Golgappa'], ['channay', 'Chana'], ['butter chicken', 'Butter chicken'], ['chicken salad', 'Chicken salad']]) {
    assert.deepEqual(names(text), [name], text);
  }
  assert.deepEqual(names('anday'), ['Egg (boiled)']);
  assert.equal(parseMeal('puri chana').items.length, 2); // genuinely two foods stays two
});

test('foods you taught win over the built-in table, and count by quantity', () => {
  const custom = [{ name: 'mystery gloop', kcal: 300 }];
  const r = parseMeal('2 mystery gloop', { custom });
  assert.equal(r.kcal, 600);
  assert.deepEqual(r.unknown, []);
  assert.equal(kcal('roti', { custom: [{ name: 'roti', kcal: 999 }] }), 999);
});

test('item labels read naturally', () => {
  const [a, b, c] = parseMeal('2 roti, 1 katori daal, biryani 650 kcal').items;
  assert.equal(itemLabel(a), '2 × Roti');
  assert.equal(itemLabel(b), '1 katori Daal');
  assert.equal(itemLabel(c), 'Biryani');
});

test('estimateFood adds up the day and reports what it could not read', () => {
  const day = estimateFood({ breakfast: '2 paratha, chai', lunch: 'daal chawal', dinner: 'mystery gloop', snacks: '  ' });
  assert.equal(day.logged, 3); // the blank snack does not count
  assert.equal(day.kcal, 2 * 260 + 95 + 430);
  assert.deepEqual(day.unknown.map((u) => [u.meal, u.name]), [['dinner', 'mystery gloop']]);
  assert.deepEqual(estimateFood(undefined), { meals: {}, kcal: 0, unknown: [], logged: 0 });
});

test('custom foods are added, replaced by name and removed', () => {
  let list = addCustomFood([], '  Zinger   Wrap ', 520);
  assert.deepEqual(list, [{ name: 'zinger wrap', kcal: 520 }]);
  list = addCustomFood(list, 'zinger wrap', 480); // same name: last one wins
  assert.deepEqual(list, [{ name: 'zinger wrap', kcal: 480 }]);
  assert.deepEqual(removeCustomFood(list, 'zinger wrap'), []);
  assert.deepEqual(removeCustomFood(undefined, 'x'), []);
});

/* ---------- rough amounts: when you can't measure it ---------- */

test('roasted vegetables are a side portion, not a bowl of curry', () => {
  assert.deepEqual(names('roasted veggies'), ['Roasted vegetables']);
  assert.ok(kcal('roasted veggies') <= 100, 'a side of roasted veg is about 80 kcal');
  assert.deepEqual(names('veggies'), ['Roasted vegetables']);
  assert.deepEqual(names('mixed vegetables'), ['Sabzi'], 'home-style vegetables are still a sabzi');
  assert.ok(kcal('boiled veggies') < kcal('roasted veggies'));
});

test('her real meal: pumpkin, carrot and zucchini, 2-3 small pieces each, comes to under 100 kcal', () => {
  const variants = [
    'pumpkin carrot zucchini 2-3 pieces each',
    'pumpkin, carrot, zucchini 2-3 pieces each',
    'pumpkin, carrot, zucchini, 2-3 pieces each',
    '2-3 pieces each of pumpkin, carrot, zucchini',
    '2-3 small cubes each pumpkin carrot zucchini',
    'roasted veggies (pumpkin, carrot, zucchini) 2-3 cubes each',
  ];
  for (const text of variants) {
    const r = parseMeal(text);
    assert.deepEqual(r.items.map((i) => i.name), ['Pumpkin', 'Carrot', 'Zucchini'], text);
    assert.ok(r.items.every((i) => i.qty === 2.5 && i.unit === 'cut'), `${text}: each is 2.5 cut pieces`);
    assert.ok(r.kcal >= 60 && r.kcal <= 100, `${text}: ${r.kcal}`);
    assert.deepEqual(r.unknown, [], text);
  }
});

test('"each" only reaches the cut vegetables it belongs to', () => {
  const r = parseMeal('2 roti, daal, pumpkin, carrot 3 pieces each, chai');
  const by = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.equal(by.Roti.qty, 2);
  assert.equal(by.Daal.qty, 1);
  assert.equal(by.Pumpkin.qty, 3);
  assert.equal(by.Carrot.qty, 3);
  assert.equal(by['Chai (milk tea)'].qty, 1);
  assert.equal(by['Chai (milk tea)'].unit, null);
});

test('a range counts as the middle, for foods and for calories', () => {
  assert.equal(parseMeal('2-3 roti').items[0].qty, 2.5);
  assert.equal(parseMeal('2 to 3 biscuits').items[0].qty, 2.5);
  assert.equal(kcal('1-2 cups chai'), parseMeal('1.5 cups chai').kcal);
  assert.equal(kcal('biryani 300-400 kcal'), 350);
  assert.deepEqual(tokenize('2-3 pieces'), ['2-3', 'pieces']);
  assert.deepEqual(tokenize('7-up'), ['7', 'up']);
});

test('cut pieces are small pieces, not whole vegetables', () => {
  const pieces = parseMeal('2 pieces carrot').items[0];
  assert.equal(pieces.unit, 'cut');
  assert.ok(pieces.kcal < 30, 'two small pieces of carrot are well under one whole carrot');
  assert.equal(parseMeal('2 carrots').items[0].kcal, 60, 'two whole carrots are still two carrots');
  assert.equal(parseMeal('3 pumpkin').items[0].unit, 'cut', '"3 pumpkin" means three pieces');
  assert.equal(parseMeal('pumpkin').items[0].unit, null, '"pumpkin" alone is one side serving');
  assert.equal(parseMeal('a few pieces of pumpkin').items[0].qty, 3);
  assert.equal(parseMeal('5 cubes zucchini').items[0].unit, 'cut');
  assert.deepEqual(names('pumpkin cubes, carrot cubes'), ['Pumpkin', 'Carrot'], 'a word after the name only describes it');
  assert.equal(itemLabel(parseMeal('3 pumpkin').items[0]), '3 pieces of Pumpkin');
  assert.ok(kcal('aloo 2 pieces') < 100, 'two pieces of potato are not two bowls of curry');
});

test('"a little", "a few", "thora sa" and "a bite" are understood', () => {
  assert.ok(kcal('a little rice') < kcal('half rice'));
  assert.ok(kcal('half rice') < kcal('rice'));
  assert.ok(kcal('a bite of cake') < kcal('a little cake'));
  assert.equal(parseMeal('few biscuits').items[0].qty, 3);
  assert.equal(parseMeal('several biscuits').items[0].qty, 4);
  const r = parseMeal('thora sa salan');
  assert.deepEqual(r.unknown, [], '"sa" is not a food');
  assert.deepEqual(r.items.map((i) => i.name), ['Sabzi']);
  assert.deepEqual(parseMeal('the long green thing').unknown.map((u) => u.name), ['long green'], '"thing" is filler');
});

test('roasted chicken is dry-cooked chicken, and a tiny amount stays tiny', () => {
  assert.deepEqual(names('roasted chicken'), ['Grilled chicken / tikka']);
  assert.deepEqual(names('roast chicken'), ['Grilled chicken / tikka']);
  assert.ok(kcal('5g roasted chicken') <= 10);
  assert.ok(kcal('a little roasted chicken') < 70);
  assert.deepEqual(names('roasted chicken breast'), ['Chicken breast']);
  assert.deepEqual(names('chicken steak'), ['Chicken steak']);
  assert.deepEqual(names('steak'), ['Steak']);
});

test('side vegetables are known foods now, not unknown words', () => {
  for (const w of ['asparagus', 'green beans', 'broccoli', 'zucchini', 'capsicum', 'mushroom', 'beetroot', 'pumpkin', 'kaddu', 'scallions', 'spring onion', 'hara pyaz']) {
    const r = parseMeal(w);
    assert.equal(r.unknown.length, 0, w);
    assert.ok(r.kcal > 0 && r.kcal <= 60, `${w}: ${r.kcal}`);
  }
});

test('a vegetable in a soup or a curry is not counted twice', () => {
  for (const text of ['pumpkin soup', 'mushroom soup', 'tomato soup', 'carrot soup']) assert.deepEqual(names(text), ['Soup'], text);
  assert.deepEqual(names('kaddu ki sabzi'), ['Lauki / gourds']);
  assert.deepEqual(names('pumpkin sabzi'), ['Lauki / gourds']);
  assert.deepEqual(names('roasted veggies, pumpkin, carrot'), ['Pumpkin', 'Carrot'], 'a heading over the vegetables you listed is not another portion');
  assert.equal(parseMeal('roasted veggies 1 katori, pumpkin').items.length, 2, 'unless you gave the heading its own amount');
});

test('items say whether the amount was guessed, and what a usual serving is', () => {
  const r = parseMeal('roasted chicken, 2 roti, a little rice, biryani 600 kcal');
  assert.deepEqual(r.items.map((i) => i.rough), [true, false, false, false]);
  assert.equal(r.items[0].usual, 170);
  assert.equal(r.items[0].per, '1 piece, about 100 g');
  assert.equal(parseMeal('chai').items[0].per, '1 cup, about 150 ml');
  assert.equal(parseMeal('mystery gloop').items[0].rough, false, 'unknown items are asked about, not "guessed"');
});

/* ---------- changing one item without retyping the meal ---------- */

test('rewriteItem changes only that item and keeps the rest exactly as typed', () => {
  const text = 'Roasted Chicken, 2 roti, daal';
  const r = parseMeal(text);
  const chicken = r.items[0];
  assert.equal(rewriteItem(text, chicken, 'a little'), 'a little Roasted Chicken, 2 roti, daal');
  const roti = r.items[1];
  assert.equal(rewriteItem(text, roti, '½'), 'Roasted Chicken, ½ roti, daal');
  assert.equal(rewriteItem(text, roti, ''), 'Roasted Chicken, roti, daal');
  assert.equal(rewriteItem(text, r.items[2], '30g'), 'Roasted Chicken, 2 roti, 30g daal');
});

test('rewriteItem works on amounts typed after the name, with ranges, and on multi-word names', () => {
  assert.equal(rewriteItem('roti 3, daal', parseMeal('roti 3, daal').items[0], '½'), '½ roti, daal');
  const t = 'something, 2-3 pieces of pumpkin';
  assert.equal(rewriteItem(t, parseMeal(t).items.find((i) => i.name === 'Pumpkin'), 'a little'), 'something, a little pumpkin');
  const beef = 'beef roll, chai';
  assert.equal(rewriteItem(beef, parseMeal(beef).items[0], '½'), '½ beef roll, chai');
  const two = '2 beef roll, chai';
  assert.equal(rewriteItem(two, parseMeal(two).items[0], ''), 'beef roll, chai');
});

test('changing one vegetable keeps "2-3 pieces each" working for the others', () => {
  const text = 'pumpkin carrot zucchini 2-3 pieces each';
  const before = parseMeal(text);
  const next = rewriteItem(text, before.items[0], 'a little');
  assert.equal(next, 'a little pumpkin carrot zucchini 2-3 pieces each');
  const after = parseMeal(next);
  assert.equal(after.items[0].name, 'Pumpkin');
  assert.ok(after.items[0].kcal < before.items[0].kcal);
  assert.equal(after.items[1].qty, 2.5);
  assert.equal(after.items[2].qty, 2.5);
});

const choose = (text, item, c, opts) => readsBack(text, c.say.map((s) => rewriteItem(text, item, s)), opts);

test('every "how much" choice gives exactly the calories the sheet promised, for every food in the table', () => {
  let checked = 0;
  for (const food of FOODS) {
    const text = food.aliases[0];
    const base = parseMeal(text);
    if (base.items.length !== 1 || base.items[0].id !== food.id) continue; // an alias shadowed by a longer one
    for (const c of AMOUNT_CHOICES) {
      const next = choose(text, base.items[0], c);
      assert.notEqual(next, null, `${text} / ${c.id}: no phrasing reads back`);
      const again = parseMeal(next);
      assert.equal(again.items.length, 1, `${next}`);
      assert.equal(again.kcal, Math.round(base.items[0].usual * c.factor), `"${next}"`);
      checked += 1;
    }
  }
  assert.ok(checked > 1000, `checked ${checked}`);
});

test('every alias of every food survives every choice (names that contain "sweet", "butter", "cup", "half"...)', () => {
  for (const food of FOODS) {
    for (const alias of food.aliases) {
      const base = parseMeal(alias);
      if (base.items.length !== 1 || base.items[0].id !== food.id) continue;
      for (const c of AMOUNT_CHOICES) {
        const next = choose(alias, base.items[0], c);
        assert.notEqual(next, null, `"${alias}" / ${c.id}`);
        assert.equal(parseMeal(next).items[0].id, food.id, `"${next}"`);
      }
    }
  }
});

test('a unit word that starts a food name is part of the name', () => {
  assert.deepEqual(parseMeal('2 cup cake').items.map((i) => [i.name, i.qty, i.unit]), [['Cupcake / muffin', 2, null]]);
  assert.deepEqual(parseMeal('2 cups chai').items.map((i) => [i.qty, i.unit]), [[2, 'cup']], 'ordinary units still work');
});

test('a phrase that would be misread is skipped for the next one', () => {
  const custom = [{ name: 'bit of rice', kcal: 50 }]; // "a bit of rice" would now mean this other food
  const next = choose('rice', parseMeal('rice', { custom }).items[0], AMOUNT_CHOICES.find((c) => c.id === 'little'), { custom });
  assert.equal(next, 'a little rice');
  assert.equal(readsBack('rice', ['bit of rice'], { custom }), null, 'and if nothing reads back, nothing is written');
});

test('rewriteItemKcal and dropItem', () => {
  const text = '2 roti, daal, chai';
  const r = parseMeal(text);
  assert.equal(rewriteItemKcal(text, r.items[1], 150), '2 roti, daal 150 kcal, chai');
  assert.equal(parseMeal(rewriteItemKcal(text, r.items[1], 150)).items[1].kcal, 150);
  assert.equal(dropItem(text, r.items[1]), '2 roti, chai');
  assert.equal(dropItem(text, r.items[0]), 'daal, chai');
  assert.equal(dropItem(text, r.items[2]), '2 roti, daal');
  assert.equal(dropItem('daal', parseMeal('daal').items[0]), '');
  assert.equal(dropItem('rice and daal', parseMeal('rice and daal').items[0]), 'and daal');
});

test('dropping vegetables one by one keeps "2-3 pieces each" until the last one using it is gone', () => {
  const drop = (text, name) => {
    const { items } = parseMeal(text);
    return dropItem(text, items.find((i) => i.name === name), items);
  };
  let text = 'pumpkin, carrot, zucchini 2-3 pieces each, chai';
  text = drop(text, 'Zucchini');
  assert.equal(text, 'pumpkin, carrot, 2-3 pieces each, chai', 'two vegetables still need the shared amount');
  assert.deepEqual(parseMeal(text).items.map((i) => [i.name, i.qty]), [['Pumpkin', 2.5], ['Carrot', 2.5], ['Chai (milk tea)', 1]]);
  text = drop(text, 'Carrot');
  assert.equal(text, 'pumpkin, 2-3 pieces each, chai');
  text = drop(text, 'Pumpkin');
  assert.equal(text, 'chai', 'the last one takes the shared phrase with it');
  const lead = '2-3 pieces each of pumpkin, carrot';
  assert.equal(drop(lead, 'Carrot'), '2-3 pieces each of pumpkin');
  assert.equal(drop('zucchini 2-3 pieces each, chai', 'Zucchini'), 'chai');
});

test('items that cannot be mapped back to the text are left alone', () => {
  const text = 'İ roti, daal'; // lower-casing changes this text's length, so positions can't be trusted
  const r = parseMeal(text);
  assert.ok(r.items.every((i) => i.span === null));
  assert.equal(rewriteItem(text, r.items.find((i) => i.name === 'Daal'), '½'), text);
  assert.equal(dropItem(text, r.items[0]), text);
  assert.equal(rewriteItem('daal', { name: 'x' }, '½'), 'daal');
});
