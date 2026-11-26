# Steady

An offline-first, zero-telemetry habit, sleep, food and weight tracker, built as a Progressive Web App.
Designed around behavioural consistency, and around everyday South Asian home cooking
(measured cooking oil, roti counts, chai habits) where barcode-driven macro apps don't fit. Calories are a rough, optional guide, not the point.

**Your data never leaves your device.** No account, no analytics, no server. Everything lives in IndexedDB in your browser.

> Live demo: _add your GitHub Pages link here_ — the welcome screen has **Explore with sample data** so visitors can try a populated app.

## Highlights

- **Zero runtime dependencies.** Native ES modules, CSS custom properties, hand-built SVG charts. No framework, no bundler, no charting library.
- **Local-first and offline.** Service worker (network-first with cache fallback), installable, loads with no connection.
- **IndexedDB storage** with debounced write-through, so typing never serialises the whole dataset. Falls back to localStorage if IndexedDB is blocked.
- **Fully configurable habits.** Add, edit, reorder, archive and restore habits; each can be a tick or a tracked amount (minutes, reps, seconds, glasses…), daily or strength-days-only.
- **Type your food, get a rough calorie estimate.** "2 roti, daal, chai half sugar" is read by a small offline parser (no AI model, no network): digits, fractions and Roman Urdu numbers, units like katori/plate/cup, typo tolerance, sugar and oil notes. Anything it doesn't know is flagged and left out of the total instead of being guessed; teach it once in one tap. Burn is estimated from height, age, weight and logged steps; the Progress tab shows a 7-day average over fully logged days only.
- **Interactive weight chart.** Scrub with touch, mouse or arrow keys; target-pace line, checkpoint marker, range filter, and a regression-based weekly trend.
- **Defensive data handling.** Every load and import passes through a single `normalize()` that validates and upgrades data (v1 → v2 → v3); CSV export neutralises spreadsheet-formula injection; the UI is built with a DOM helper instead of HTML strings, so user text can't become markup.
- **Accessible.** Native `<dialog>` sheets, keyboard-operable controls, ARIA roles/labels, visible focus, `prefers-reduced-motion`, light/dark/auto theme.
- **Tested.** 126 unit tests on the logic that matters (cross-midnight sleep maths, DST-safe date arithmetic, streaks over gaps, pace interpolation and regression, CSV escaping, schema migration, the food parser, calorie maths, store write batching), run in three time zones in CI.

## Architecture

```
index.html            shell only
css/styles.css        design tokens + components (light/dark)
src/
  core/               pure, DOM-free, unit-tested logic
    dates.js  sleep.js  habits.js  pace.js  scale.js  csv.js  schema.js  demo.js
    foods.js (food table + text parser)  calories.js (eaten / burned / deficit)
  storage.js          IndexedDB / localStorage / in-memory adapters + legacy migration
  store.js            state, pub/sub topics, debounced persistence
  ui/                 dom.js (h/svg/fill/sheet/toast), icons.js, chart.js
  views/              today, progress, guide, settings, onboarding
  main.js             boot, hash router, lifecycle
sw.js                 offline support
tests/                node:test suites (no dependencies)
```

Data flow: views call store actions → the store updates in-memory state, emits a topic (`day`, `weights`, `settings`, `habits`) and queues a debounced write to the adapter. Views update only the DOM nodes they own, so focus and scroll position survive.

## Run it

```
npm run serve      # python3 -m http.server 8000 → http://localhost:8000
npm test           # unit tests (Node ≥ 20, no install step)
npm run test:tz    # same tests under two other time zones
npm run check      # syntax check + guard against innerHTML
```

### Opening without a server

Browsers refuse ES modules on `file://`, so double-clicking `index.html` shows a short explanation instead of the app.
Run `npm run build` to generate `dist/steady-standalone.html`: the whole app (CSS, all modules, icon) in one file that works when
double-clicked. It's generated from the same source by `scripts/build-standalone.mjs`, a ~60-line dependency-free bundler.

## Deploy (free, GitHub Pages)

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Every push to `main` runs the tests, stamps the service worker with the commit SHA, and deploys.

(If you'd rather skip Actions, **Deploy from a branch → main / root** also works; the service worker is network-first, so updates still arrive without a manual cache bump.)

## Upgrading from v1

v1 kept everything in one `localStorage` key (`steady.v1`). On first launch, v2 imports it into IndexedDB (settings, habits, day logs, weigh-ins, your walk goal) and leaves the old key untouched as a safety copy. "Erase all data" removes it too. v1 JSON backups can also be restored through **Settings → Restore from backup**.

## Upgrading to v3 (walk in steps)

The evening walk is now logged in **steps** instead of minutes. On the first launch after the update, existing walk entries are converted once (about 100 steps per minute, rounded to the nearest 10) and the walk habit becomes steps with a target of 3,000 (the same 30 minutes). Edit the target in **Settings → Your habits** if you prefer another number.

Safety: the converted data and a version marker are written in a single transaction, a copy of everything from just before the update is kept (**Settings → Your data → Download pre-update copy**), and if anything fails the original data is left untouched. Older backups (minutes) are converted the same way when restored. Only the walk is converted, and only while its unit is minutes, so it can never run twice.

## Calorie estimate: what it is and isn't

- **Eaten** comes from the food you type (or a total you type yourself). Built-in values are ballpark home portions, good to roughly ±20–30%.
- **When you can't measure it:** say it roughly ("a little rice", "thora salan", "a few pieces of pumpkin", "2-3 cubes each", "half roti"); a range counts as its middle. Vegetables use small side-portion sizes (a cut piece is about 20 g), not curry-bowl sizes. Anything typed without an amount is counted as one usual serving and drawn with a dashed outline; tap any item to pick "a little / half / the usual / more / double", exact grams or calories, or "don't count this". That rewrites just that item in the text, and only when the text still reads back as the same meal.
- **Burned** = resting energy (Mifflin-St Jeor from height, age, weight) × a daily-life factor (1.2 / 1.35 / 1.5) + steps × weight × 0.0004 + 40 kcal on a strength day.
- **Deficit** = burned − eaten; about 7,700 kcal ≈ 1 kg of fat. Weekly numbers use only days with at least three meals logged (or a typed total).
- A fully logged day under 1,400 kcal gets a gentle nudge to eat more.

## Privacy

No network requests are made for your data. Nothing is collected. Exports are files you download yourself. Browsers keep storage per origin and per install mode, so always open Steady the same way (home-screen icon, or one browser tab).

## Health note

Steady is a tracking tool, not medical advice. Calorie figures are estimates; use the weekly trend and the scale, not a single day. Aim for slow, steady change and talk to a doctor if you feel unwell or have a medical condition.
