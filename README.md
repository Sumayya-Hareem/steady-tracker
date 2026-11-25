# Steady

A calm, phone-first tracker for daily habits, sleep, food and weight. Built to be used every day on a phone, with nothing to sign up for and nothing to pay for.

**Your data never leaves your phone.** Everything is saved in your browser's local storage. The code in this repo contains no personal data, so the repo can be public.

## What it does

- **Daily checklist** with a separate tick for each habit (evening walk, squats, push-ups, glute bridges, plank, water before meals, no bakery or sugary chai, measured oil, bedtime) and a box to enter how much you actually did (**steps**, reps, seconds, glasses).
- **Strength days** only show the strength moves on the days you pick. Did extra on a rest day? One tap adds it.
- **Sleep log:** enter bedtime and wake time, any time the next day. It shows your total sleep and whether you hit your target bedtime.
- **Food log:** a few words for breakfast, lunch, dinner, snacks and chai, plus a one-tap "None today" for snacks.
- **Calorie estimate (rough):** add a kcal number to each meal, or tap **Pick foods** to add typical home portions (roti, daal, chai and so on). The Today tab then shows calories eaten, calories burned (estimated) and the deficit. The Progress tab shows a 7-day average and roughly how many kg of fat that pace is worth.
- **Progress:** weigh-ins with waist, a chart with a target-pace line, a checkpoint tracker, a last-7-days summary and a list of recent days you can reopen and edit.
- **Plan page:** the eating guide, how the calorie estimate works, a budget-friendly day of meals, and how to do each strength move.
- **Backups:** export JSON (full backup) or CSV, and restore from a backup file.
- Works offline once opened, and installs to the home screen like an app.

## How the calorie estimate works

- **Burned** = resting burn (Mifflin-St Jeor equation from your weight, height and age) × a daily activity factor (1.2 if you mostly sit) + about 0.4 kcal per kg per 1,000 steps for the walk + a flat 40 kcal on days you tick any strength move.
- **Eaten** = the kcal you enter for each meal.
- **Deficit** = burned − eaten. About 7,700 kcal of deficit is roughly 1 kg of fat.
- Set your height, age and activity under **Settings → Calorie estimate**. If age is blank it assumes 25.
- The weekly average only counts days with enough meals logged (2 or more; 3 for today until 9 pm).
- It is a compass, not a scoreboard. Portions are guesses and the burn can easily be off by 20% or more. If the scale and the estimate disagree over 2–3 weeks, trust the scale.

## Put it on your phone (free, about 5 minutes)

1. Create a new repository on GitHub (for example `steady`). Public is fine, since no personal data is in it.
2. Upload every file and folder from this project (`index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `README.md`, `.gitignore`). On github.com use **Add file → Upload files**.
3. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**.
4. After a minute or two GitHub shows your address, which looks like `https://YOUR-USERNAME.github.io/steady/`.
5. Open that address on your phone.
   - **Android (Chrome):** menu ⋮ → **Install app** (or **Add to Home screen**).
   - **iPhone (Safari):** Share → **Add to Home Screen**.
6. On first launch, enter your current weight and goal. That's it.

> Always open the app the same way (the home-screen icon, or one browser tab). Browsers can keep separate storage for the installed app and for the browser, so switching between them can look like your data vanished. It's still there in the other one.

## Updating an installed copy

Upload the changed files to GitHub (same names, replace the old ones) and commit. GitHub Pages republishes in 1–2 minutes. Your phone shows the old copy first and updates in the background, so close the app fully and open it again (sometimes twice). `sw.js` has a `CACHE` name that is bumped on every release so phones drop old files.

## Keep your data safe

Because data lives only in your browser, clearing browser data or uninstalling the app erases it. Open **Settings → Your data → Export backup (JSON)** every week or two (the app reminds you after 14 days). To restore, use **Restore from backup…** and pick the file. Backup files are ignored by git, so you won't upload them by accident.

## Run it on a computer instead

It is plain HTML, CSS and JavaScript with no build step. From this folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly also works, but the offline and install features need a web address.)

## Customize

- **Habits and amounts:** the `HABITS` list near the top of the script in `index.html`.
- **Foods in the picker:** the `FOODS` list (name, portion, kcal). Edit freely.
- **Calorie constants:** `KCAL_PER_STEP_PER_KG` and `STRENGTH_KCAL` near the `FOODS` list.
- **Strength days, bedtime, walk goal (steps), weigh-in day, checkpoint, height, age, activity:** all in the app under **Settings**.
- **Plan text:** the `renderPlan` function.
- **Colors:** the CSS variables at the top of the file (light and dark mode are both defined).
- After you edit files, change `CACHE = 'steady-v2'` in `sw.js` to a new name (for example `steady-v3`) so phones pick up the update.

## Changelog

**v2 (25 Nov 2026)**
- The evening walk is now logged in **steps** instead of minutes. Existing data converts automatically on first open (minutes × 100 steps a minute; the walk goal 30 min becomes 3,000 steps). An untouched copy of the old data is kept in the browser under `steady.v1.before-steps`, and old JSON backups are converted when restored.
- New calorie estimate: kcal per meal, a food picker, daily eaten / burned / deficit, a 7-day average, and a Settings card for height, age and activity.
- CSV export now has `walk_steps` and calorie columns.
- Saved-data format: same storage key (`steady.v1`), new `schema: 2` field.

**v1 (Oct 2026)** First version.

## A note on health

This is a tracking tool, not medical advice. Aim for slow, steady loss (roughly 0.5–0.75 kg a week), don't eat below about 1,400 kcal a day, and talk to a doctor if you feel unwell or have a medical condition.
