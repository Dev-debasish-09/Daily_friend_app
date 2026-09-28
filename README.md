# ASCEND

A mobile-first personal life tracker for the climb from 24 to 30: daily targets, time
tracking, expenses, long-term goals and achievements. It works offline and installs on
your phone's home screen like an app.

Plain HTML, CSS and vanilla JavaScript. No frameworks, no build step, no server.
All data stays on your device.

## What's inside

| Page | What it does |
|---|---|
| **Today** (`index.html`) | Summit hero where the sun rises with your daily score, habit checklist with streaks, level and XP, daily quote, food-delivery card, nightly reflection from 8 PM, ISS and turning-30 countdowns |
| **Track** (`track.html`) | Focus timers, manual time entry, a day timeline and a weekly hours review |
| **Money** (`money.html`) | Quick-add expenses, income, budgets, recurring costs, savings coins, food-delivery insights and charts |
| **Goals** (`goals.html`) | The trail from 24 to the summit at 30 with four base camps, milestones (yearly, quarterly, monthly) and savings goals |
| **Insights** (`insights.html`) | Your year as a night sky, weekly review, monthly report card (A+ to D), plain-English patterns and past reflections |
| **Wins** (`wins.html`) | Wall of Wins: level, XP, badges and every milestone you've earned |
| **Settings** (`settings.html`) | Profile, habits, your own quotes, theme, and backup / export / restore |

## Run it locally

1. Open the folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and choose **Open with Live Server**.

The app must be served over `http://` (not opened as a file), because it loads its
content from `/data/*.json`.

**Offline mode on localhost** is off by default, so your edits show straight away.
To test offline locally, open any page with `?sw=on` (for example
`http://127.0.0.1:5500/index.html?sw=on`), and `?sw=off` to switch it back off.

## Project structure

```
index.html / index.js        Today
track.html / track.js        Track
money.html / money.js        Money
goals.html / goals.js        Goals
insights.html / insights.js  Insights
wins.html / wins.js          Wall of Wins
settings.html / settings.js  Settings
onboarding.html / .js        First-run setup
styles.css                   Design system: tokens, themes, components
shared.js                    Storage, dates, INR, theme, toast, nav, XP, badges, service worker
sw.js                        Service worker (offline cache)
manifest.webmanifest         Install details (name, icons, colours)
data/                        quotes, habits, categories, roadmap, badges (JSON)
fonts/                       Self-hosted Sora, Nunito, Fraunces (woff2)
icons/                       App icon (SVG + PNG sizes)
vercel.json                  Hosting headers for Vercel
```

## Your data

- Everything is saved in the browser's `localStorage` on your device, under keys that
  start with `ascend:`. Nothing is sent anywhere.
- Growing data is split by month: `ascend:logs:YYYY-MM`, `ascend:expenses:YYYY-MM`,
  `ascend:sessions:YYYY-MM`, `ascend:journal:YYYY-MM`.
- **Back up regularly:** Settings → Your data → *Back up all data (JSON)*. The app
  reminds you if a week passes without a backup.
- Restore on a new phone with *Restore from a backup file*; you'll see a preview first.
- Expenses and time also export as CSV for Excel or Google Sheets.

Clearing your browser data or uninstalling the app deletes your data, so keep a recent
backup file somewhere safe.

## Deploy to Vercel (free)

1. Push this repository to GitHub.
2. Sign in at [vercel.com](https://vercel.com) with GitHub and choose **Add New → Project**.
3. Import this repository. Settings:
   - **Framework Preset:** Other
   - **Build Command:** leave empty
   - **Output Directory:** leave empty (the root folder is the site)
4. Click **Deploy**. Every later push to the connected branch redeploys automatically.

`vercel.json` makes sure the service worker and pages are always re-checked, while fonts
and icons are cached for a long time.

## Releasing an update

When you change any file:

1. Open `sw.js` and bump `CACHE_VERSION` (for example `'v1'` → `'v2'`).
2. If you added a new file, add it to `APP_FILES` in `sw.js`.
3. Commit and push. Vercel redeploys.

Open the app on your phone: an **Update ready** toast appears. Tap **Refresh** to switch
to the new version.

## Install on your phone

- **Android (Chrome):** open the site, tap ⋮ → **Add to Home screen** (or **Install app**).
- **iPhone (Safari):** open the site, tap Share → **Add to Home Screen**.

Open every tab once while online so everything is cached, then try it in airplane mode.

## Design notes

- Two themes, **Dawn** (default) and **Night**, switched in Settings.
- All colours, fonts, radii and shadows are CSS variables in `styles.css`.
- Mobile-first at 375px, checked at 320px and 430px; 48px tap targets, 16px inputs,
  safe-area padding, WCAG AA contrast on both themes, visible keyboard focus.
- Motion only on your actions plus one load moment per page, and it all respects
  *reduce motion*.
- Charts and illustrations are hand-drawn SVG, with no chart libraries.
