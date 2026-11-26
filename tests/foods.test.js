import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, parseMeal, estimateFood, addCustomFood, removeCustomFood, itemLabel } from '../src/core/foods.js';

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
  const r = parseMeal('mystery thing');
  assert.equal(r.kcal, 0);
  assert.equal(r.unknown.length, 1);
  assert.equal(r.unknown[0].name, 'mystery thing');
  const mixed = parseMeal('2 roti, mystery thing');
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
  const custom = [{ name: 'mystery thing', kcal: 300 }];
  const r = parseMeal('2 mystery thing', { custom });
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
  const day = estimateFood({ breakfast: '2 paratha, chai', lunch: 'daal chawal', dinner: 'mystery thing', snacks: '  ' });
  assert.equal(day.logged, 3); // the blank snack does not count
  assert.equal(day.kcal, 2 * 260 + 95 + 430);
  assert.deepEqual(day.unknown.map((u) => [u.meal, u.name]), [['dinner', 'mystery thing']]);
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
