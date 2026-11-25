# Steady

An offline-first, zero-telemetry habit, sleep, food and weight tracker, built as a Progressive Web App.
Designed around behavioural consistency rather than calorie counting, and around everyday South Asian home cooking
(measured cooking oil, roti counts, chai habits) where barcode-driven macro apps don't fit.

**Your data never leaves your device.** No account, no analytics, no server. Everything lives in IndexedDB in your browser.

> Live demo: _add your GitHub Pages link here_ — the welcome screen has **Explore with sample data** so visitors can try a populated app.

## Highlights

- **Zero runtime dependencies.** Native ES modules, CSS custom properties, hand-built SVG charts. No framework, no bundler, no charting library.
- **Local-first and offline.** Service worker (network-first with cache fallback), installable, loads with no connection.
- **IndexedDB storage** with debounced write-through, so typing never serialises the whole dataset. Falls back to localStorage if IndexedDB is blocked.
- **Fully configurable habits.** Add, edit, reorder, archive and restore habits; each can be a tick or a tracked amount (minutes, reps, seconds, glasses…), daily or strength-days-only.
- **Interactive weight chart.** Scrub with touch, mouse or arrow keys; target-pace line, checkpoint marker, range filter, and a regression-based weekly trend.
- **Defensive data handling.** Every load and import passes through a single `normalize()` that validates and upgrades data (v1 → v2); CSV export neutralises spreadsheet-formula injection; the UI is built with a DOM helper instead of HTML strings, so user text can't become markup.
- **Accessible.** Native `<dialog>` sheets, keyboard-operable controls, ARIA roles/labels, visible focus, `prefers-reduced-motion`, light/dark/auto theme.
- **Tested.** 61 unit tests on the logic that matters (cross-midnight sleep maths, DST-safe date arithmetic, streaks over gaps, pace interpolation and regression, CSV escaping, schema migration, store write batching), run in three time zones in CI.

## Architecture

```
index.html            shell only
css/styles.css        design tokens + components (light/dark)
src/
  core/               pure, DOM-free, unit-tested logic
    dates.js  sleep.js  habits.js  pace.js  scale.js  csv.js  schema.js  demo.js
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

## Privacy

No network requests are made for your data. Nothing is collected. Exports are files you download yourself. Browsers keep storage per origin and per install mode, so always open Steady the same way (home-screen icon, or one browser tab).

## Health note

Steady is a tracking tool, not medical advice. Aim for slow, steady change and talk to a doctor if you feel unwell or have a medical condition.
