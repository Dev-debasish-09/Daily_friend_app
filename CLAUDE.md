I'm building "ASCEND", a mobile-first personal life tracker: daily targets, time tracking,
expenses, long-term goals, and achievements. I'm 24, a data analyst, and the app tracks my
journey to a successful life by 30. It must make me feel proud when I hit targets.
Plain HTML, CSS, vanilla JS. No frameworks, no build step. Runs on VS Code Live Server,
deploys to Vercel as a static site. It will become an offline PWA later.

About my life (use this for seed data and copy):
- Until June 2027 my top priority is the ISS exam (Indian Statistical Service).
  Weekdays: office + 4–5 hrs ISS. Weekends: ~12 hrs ISS.
- Daily: home workout, DSA (1 video + practice), GMAT English (1 video), Machine Learning.
- I overspend on online food delivery; the money section must help me notice and save.
- Currency INR with Indian formatting (₹1,25,000). Timezone Asia/Kolkata.

Design system:
- All colors, fonts, radii, shadows as CSS variables in :root. Themes switch via
  <body data-theme="dawn|night">. Text color never pure black.
- Dawn theme (default): bg top #F4F1FA, bg bottom #FBE3D6, text ink #2B2A4A,
  muted #6B6890, accent violet #5B4BDB (white text), summit gold #F2B544,
  dawn peach #F6A58C, sky lavender #C9C3F2, pine green #2F7D6D (success),
  ember #C8453F (overspend), mountain near #3D3A6B, mountain far #8C86C4.
- Night theme: bg top #14132B, bg bottom #262450, text #ECEAF7, muted #A9A6CC,
  accent #8B7CFF, same gold/pine/ember adjusted for AA contrast on dark.
- Fonts: Sora for headings and big numbers, Nunito for UI text.
  Fraunces italic ONLY for the daily quote. Self-host later.
- Radius by hierarchy: cards 28px, tiles 20px, inputs 16px, buttons pill.
- Cards: frosted glass with backdrop blur, layered soft shadows tinted with the text color,
  thin white top highlight. Subtle grain texture and slow floating light circles in background.
- Signature element: an SVG mountain range. On Today, a sun rises over the peak as my
  daily score grows (0% = below horizon, 100% = full glowing sunrise with gold rays).
- Motion only on user actions plus one load moment per page; buttons squish on press;
  everything respects prefers-reduced-motion.
- Words: short, warm, specific, proud. Buttons say exactly what they do.
  Missed days are never shamed; show "Fresh climb today" style messages.

Structure:
- One HTML + JS file per page: index.html (Today), track.html, money.html, goals.html,
  insights.html, wins.html, settings.html
- Shared styles.css and shared.js (storage wrapper, theme, toast, bottom nav,
  date helpers, INR formatter, confetti, service worker registration later)
- Content in /data/*.json (quotes, default habits, categories, badges, roadmap)
- Bottom nav: Today · Track · Money · Goals · More

Data rules:
- ALL reads/writes go through storage functions in shared.js (getData, setData),
  never localStorage directly in page files, so storage can be swapped later.
- Namespaced keys: ascend:profile, ascend:habits, ascend:settings, ascend:goals, ascend:wins,
  and monthly shards for growing data: ascend:logs:YYYY-MM, ascend:expenses:YYYY-MM,
  ascend:sessions:YYYY-MM, ascend:journal:YYYY-MM.
- Always try/catch. Dates stored as "YYYY-MM-DD" in local Asia/Kolkata time.
- Daily content (quote) picked by a seed from today's date.
- Charts and visuals are hand-drawn SVG in code using theme variables. No chart libraries.

Rules: one step at a time, only build what I ask, simple commented code,
mobile-first at 375px (check 320px and 430px), tap targets 48px+, inputs 16px+,
viewport-fit=cover with safe-area padding, 100dvh, WCAG AA contrast on both themes,
visible keyboard focus. After each step tell me what to test on my phone.

Reply "Ready" with a 3-line summary. No code yet.