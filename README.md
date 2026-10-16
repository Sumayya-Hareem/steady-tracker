# Steady

A calm, phone-first tracker for daily habits, sleep, food and weight. Built to be used every day on a phone, with nothing to sign up for and nothing to pay for.

**Your data never leaves your phone.** Everything is saved in your browser's local storage. The code in this repo contains no personal data, so the repo can be public.

## What it does

- **Daily checklist** with a separate tick for each habit (evening walk, squats, push-ups, glute bridges, plank, water before meals, no bakery or sugary chai, measured oil, bedtime) and a box to enter how much you actually did (minutes, reps, seconds, glasses).
- **Strength days** only show the strength moves on the days you pick. Did extra on a rest day? One tap adds it.
- **Sleep log:** enter bedtime and wake time, any time the next day. It shows your total sleep and whether you hit your target bedtime.
- **Food log:** a few words for breakfast, lunch, dinner, snacks and chai, plus a one-tap "None today" for snacks.
- **Progress:** weigh-ins with waist, a chart with a target-pace line, a checkpoint tracker, a last-7-days summary and a list of recent days you can reopen and edit.
- **Plan page:** the eating guide, a budget-friendly day of meals, and how to do each strength move.
- **Backups:** export JSON (full backup) or CSV, and restore from a backup file.
- Works offline once opened, and installs to the home screen like an app.

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
- **Strength days, bedtime, walk goal, weigh-in day, checkpoint:** all in the app under **Settings**.
- **Plan text:** the `renderPlan` function.
- **Colors:** the CSS variables at the top of the file (light and dark mode are both defined).
- After you edit files, change `CACHE = 'steady-v1'` in `sw.js` to a new name (for example `steady-v2`) so phones pick up the update.

## A note on health

This is a tracking tool, not medical advice. Aim for slow, steady loss (roughly 0.5–0.75 kg a week), don't eat below about 1,400 kcal a day, and talk to a doctor if you feel unwell or have a medical condition.
