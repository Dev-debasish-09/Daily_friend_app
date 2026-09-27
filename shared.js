/* =========================================================
   ASCEND — shared.js
   Load in <head> on every page, BEFORE the page's own script:
     <script src="shared.js"></script>
     <script src="page.js" defer></script>
   Sections:
   1. Storage   2. Settings + theme   3. Dates (Asia/Kolkata)
   4. Money (INR)   5. Profile   6. Form errors   7. Toast
   8. Background   9. Bottom nav   10. Habits + daily logs
   11. Start-up + onboarding gate
   ========================================================= */


/* ---------- 1. Storage ----------
   ALL reads and writes go through here, so storage can be swapped
   later (e.g. IndexedDB) without touching page files.
   Pass keys WITHOUT the prefix: getData('profile') reads 'ascend:profile'. */

const APP_PREFIX = 'ascend:';

function getData(key, fallback = null) {
  try {
    const raw = localStorage.getItem(APP_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn('[ascend] Could not read', key, err);
    return fallback;
  }
}

function setData(key, value) {
  try {
    localStorage.setItem(APP_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Storage full, private mode, or blocked
    console.warn('[ascend] Could not save', key, err);
    return false;
  }
}

function removeData(key) {
  try {
    localStorage.removeItem(APP_PREFIX + key);
    return true;
  } catch (err) {
    console.warn('[ascend] Could not remove', key, err);
    return false;
  }
}

// Monthly shard key for growing data.
// shardKey('expenses', '2026-09-27') -> 'expenses:2026-09'
function shardKey(type, isoDate = todayISO()) {
  return `${type}:${isoDate.slice(0, 7)}`;
}


/* ---------- 2. Settings + theme ---------- */

const DEFAULT_SETTINGS = { theme: 'dawn' };
const THEMES = ['dawn', 'night'];
const THEME_COLORS = { dawn: '#F4F1FA', night: '#14132B' };   // browser bar color

function getSettings() {
  const saved = getData('settings', {});
  const safe = saved && typeof saved === 'object' ? saved : {};
  return { ...DEFAULT_SETTINGS, ...safe };
}

function updateSettings(changes) {
  const next = { ...getSettings(), ...changes };
  setData('settings', next);
  return next;
}

// Put the theme on <html> and <body> and tint the browser bar.
function applyTheme(theme) {
  const name = THEMES.includes(theme) ? theme : 'dawn';
  document.documentElement.dataset.theme = name;
  if (document.body) document.body.dataset.theme = name;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[name]);
  return name;
}

// Apply AND remember the theme.
function setTheme(theme) {
  const name = applyTheme(theme);
  updateSettings({ theme: name });
  return name;
}

function getTheme() {
  return document.documentElement.dataset.theme || 'dawn';
}

// Run right away (we're in <head>) so the page never flashes the wrong theme.
applyTheme(getSettings().theme);


/* ---------- 3. Dates (always Asia/Kolkata) ----------
   Dates are stored as "YYYY-MM-DD" strings in IST. */

const TIME_ZONE = 'Asia/Kolkata';

const istFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Split a moment into IST parts: { year, month, day, hour, minute }
function istParts(date = new Date()) {
  const parts = istFormatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

// Any Date -> "YYYY-MM-DD" in IST
function toISODate(date = new Date()) {
  const p = istParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function todayISO() {
  return toISODate(new Date());
}

function currentHourIST() {
  return istParts().hour;
}

// Calendar math on "YYYY-MM-DD" strings.
// We park each date at 12:00 UTC so no timezone can push it to another day.
function isoToDate(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function addDays(iso, days) {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whole days from one date to another (positive if `toIso` is later)
function daysBetween(fromIso, toIso) {
  return Math.round((isoToDate(toIso) - isoToDate(fromIso)) / 86400000);
}

function monthOf(iso) {
  return iso.slice(0, 7);   // "YYYY-MM"
}

// 0 = Sunday ... 6 = Saturday
function weekdayOf(iso) {
  return isoToDate(iso).getUTCDay();
}

function isWeekend(iso = todayISO()) {
  const day = weekdayOf(iso);
  return day === 0 || day === 6;
}

// Same day and month, n years later (29 Feb -> 1 Mar in non-leap years)
function addYears(iso, years) {
  const next = `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
  return isValidISO(next) ? next : addDays(`${next.slice(0, 8)}28`, 1);
}

// "YYYY-MM-DD" -> "Sun, 27 Sept" (pass Intl options to change the look)
function formatDate(iso, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(isoToDate(iso));
}

// 270 -> "4h 30m", 45 -> "45m", 120 -> "2h"
function formatMinutes(total) {
  const mins = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function greeting(hour = currentHourIST()) {
  if (hour < 5) return 'Late night climb';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Stable number from a date, so daily content (quote) is the same all day.
function dateSeed(iso = todayISO()) {
  let h = 0;
  for (const ch of iso) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  // Mix the bits so neighbouring days don't pick neighbouring items
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function pickDaily(list, iso = todayISO()) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[dateSeed(iso) % list.length];
}


/* ---------- 4. Money (INR, Indian grouping) ---------- */

const inrFormatters = {};

// 125000 -> "₹1,25,000"; formatINR(349.5, 2) -> "₹349.50"
function formatINR(amount, decimals = 0) {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  if (!inrFormatters[decimals]) {
    inrFormatters[decimals] = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return inrFormatters[decimals].format(safe);
}

// Short form for tight tiles: 250000 -> "₹2.5L", 12000000 -> "₹1.2Cr"
function formatINRCompact(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (v) => v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  return formatINR(n);
}

// Number with Indian grouping, no ₹: 125000 -> "1,25,000" (for input boxes)
function formatIndianNumber(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

// What the user typed -> number, or null if it isn't a valid amount.
// "2,500" -> 2500, "₹ 349.50" -> 349.5, "abc" -> null
function parseAmount(text) {
  const clean = String(text ?? '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

// Tidy an amount box to "1,25,000" when the user leaves it
function bindAmountInput(input) {
  input.addEventListener('blur', () => {
    const n = parseAmount(input.value);
    if (n !== null) input.value = formatIndianNumber(n);
  });
}


/* ---------- 5. Profile (ascend:profile) ----------
   { name, dob, issExamDate, foodDeliveryLimit, onboardedOn, createdOn, updatedOn } */

function getProfile() {
  const p = getData('profile', null);
  return p && typeof p === 'object' ? p : null;
}

function hasProfile() {
  const p = getProfile();
  return Boolean(p && p.name);
}

// Merge changes into the saved profile. Returns the new profile, or null if saving failed.
function saveProfile(changes) {
  const today = todayISO();
  const next = { createdOn: today, ...(getProfile() || {}), ...changes, updatedOn: today };
  return setData('profile', next) ? next : null;
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'friend';
}

// True for a real calendar date in "YYYY-MM-DD" form
function isValidISO(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && addDays(iso, 0) === iso;
}

// Age in whole years on a given date
function ageOn(dobIso, onIso = todayISO()) {
  let age = Number(onIso.slice(0, 4)) - Number(dobIso.slice(0, 4));
  if (onIso.slice(5) < dobIso.slice(5)) age -= 1;   // birthday not reached yet
  return age;
}

// One rule per profile field. Each returns '' when fine, or a friendly message.
const PROFILE_RULES = {
  name(value) {
    const v = String(value || '').trim();
    if (!v) return 'Tell us what to call you.';
    if (v.length > 40) return 'Keep it under 40 characters.';
    return '';
  },
  dob(value) {
    if (!isValidISO(value)) return 'Pick your date of birth.';
    const age = ageOn(value);
    if (age < 10 || age > 100) return 'That date doesn’t look right. Check the year.';
    return '';
  },
  issExamDate(value, { allowPastExam = false } = {}) {
    if (!isValidISO(value)) return 'Pick your exam date. You can change it later.';
    if (!allowPastExam && value < todayISO()) return 'Pick today or a later date.';
    return '';
  },
  foodDeliveryLimit(value) {
    const n = parseAmount(value);
    if (n === null) return 'Enter an amount in rupees, like 2,000.';
    if (n > 1000000) return 'That’s over ₹10,00,000. Try a smaller limit.';
    return '';
  },
};


/* ---------- 6. Form errors ----------
   validateFields([[input, 'name'], [input, 'dob']]) checks each input
   against PROFILE_RULES, shows messages, focuses the first problem. */

function showFieldError(input, message) {
  const field = input.closest('.field');
  const errorId = `${input.id}-error`;
  let error = document.getElementById(errorId);
  if (!error && message) {
    error = document.createElement('p');
    error.id = errorId;
    error.className = 'field-error';
    field.appendChild(error);
  }
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }

  // Link the message to the input for screen readers (keep any hint link)
  const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== errorId);
  if (message) {
    ids.push(errorId);
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
  else input.removeAttribute('aria-describedby');
}

function validateFields(pairs, options = {}) {
  let firstBad = null;
  pairs.forEach(([input, rule]) => {
    const message = PROFILE_RULES[rule](input.value, options);
    showFieldError(input, message);
    if (message && !firstBad) firstBad = input;
  });
  if (firstBad) firstBad.focus();
  return !firstBad;
}


/* ---------- 7. Toast ----------
   showToast('Expense saved', { type: 'success' })
   type: 'success' | 'info' | 'danger' */

let toastTimer = null;

// One polite live region per page, so screen readers announce toasts.
function ensureToastRegion() {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  return region;
}

function showToast(message, { type = 'info', duration = 2800 } = {}) {
  const region = ensureToastRegion();
  region.replaceChildren();          // only one toast at a time
  clearTimeout(toastTimer);

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const dot = document.createElement('span');
  dot.className = 'toast__dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = message;

  toast.append(dot, text);
  region.appendChild(toast);

  void toast.offsetWidth;            // force layout so the slide-in plays
  toast.classList.add('is-visible');

  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


/* ---------- Celebration: vibration + confetti ---------- */

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Gentle phone buzz. Android only; iPhones ignore it.
function haptic(pattern = 20) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (err) {
    /* not supported: fine */
  }
}

// Small burst of theme-coloured confetti from a point on screen.
// confetti({ x, y, count: 24 }) for a habit, count: 140 for a Day Won.
function confetti({ x = window.innerWidth / 2, y = window.innerHeight / 3, count = 24, power = 1 } = {}) {
  if (prefersReducedMotion()) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const styles = getComputedStyle(document.body);
  const colors = ['--gold', '--peach', '--lavender', '--accent', '--success']
    .map((name) => styles.getPropertyValue(name).trim());

  // Each piece: position, speed, spin, colour
  const pieces = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;   // mostly upwards
    const speed = (4 + Math.random() * 6) * power;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.3,
    };
  });

  const duration = 1400 + power * 400;
  const start = performance.now();

  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - t / duration);   // fade out

    pieces.forEach((p) => {
      p.vy += 0.22;          // gravity
      p.vx *= 0.99;          // air drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    });

    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}


/* ---------- 8. Background ambience (floating light circles) ---------- */

function addAmbientBackground() {
  if (document.querySelector('.ambient')) return;
  const el = document.createElement('div');
  el.className = 'ambient';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="ambient__orb"></span>'.repeat(3);
  document.body.prepend(el);
}


/* ---------- 9. Bottom nav ----------
   Each page sets <body data-page="today|track|money|goals|insights|wins|settings">
   to highlight its tab. Use data-nav="off" to hide the nav. */

const ICON_PATHS = {
  today: '<path d="M3 19h18"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0"/><path d="M12 5v3M5 9.5l2 2M19 9.5l-2 2"/>',
  track: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 2M10 2.5h4"/>',
  money: '<path d="M7 4h10M7 8.5h10M9 4h1a4.5 4.5 0 0 1 0 9H7l7 7"/>',
  goals: '<path d="M2.5 20 9.5 8.5l3.5 5.5 2-3 6.5 9z"/><path d="M9.5 8.5V3.5l4 1.75-4 1.75"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  insights: '<path d="M3 20h18"/><path d="M6.5 20v-6M12 20V6M17.5 20v-9"/>',
  wins: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
};

function navIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

const NAV_ITEMS = [
  { id: 'today', label: 'Today', href: 'index.html' },
  { id: 'track', label: 'Track', href: 'track.html' },
  { id: 'money', label: 'Money', href: 'money.html' },
  { id: 'goals', label: 'Goals', href: 'goals.html' },
];

const MORE_ITEMS = [
  { id: 'insights', label: 'Insights', href: 'insights.html' },
  { id: 'wins', label: 'Wins', href: 'wins.html' },
  { id: 'settings', label: 'Settings', href: 'settings.html' },
];

function renderBottomNav() {
  if (document.querySelector('.bottom-nav')) return;

  const page = document.body.dataset.page || '';
  const inMore = MORE_ITEMS.some((item) => item.id === page);
  const current = (id) => (id === page ? ' aria-current="page"' : '');

  const mainLinks = NAV_ITEMS.map((item) => `
    <li><a class="bottom-nav__item" href="${item.href}"${current(item.id)}>
      ${navIcon(item.id)}<span>${item.label}</span></a></li>`).join('');

  const moreLinks = MORE_ITEMS.map((item) => `
    <li><a class="more-menu__link" href="${item.href}"${current(item.id)}>
      ${navIcon(item.id)}<span>${item.label}</span></a></li>`).join('');

  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Main');
  nav.innerHTML = `
    <div class="bottom-nav__inner">
      <ul class="more-menu" id="more-menu" hidden>${moreLinks}</ul>
      <ul class="bottom-nav__bar">
        ${mainLinks}
        <li><button class="bottom-nav__item${inMore ? ' is-active' : ''}" type="button"
          aria-expanded="false" aria-controls="more-menu">${navIcon('more')}<span>More</span></button></li>
      </ul>
    </div>`;
  document.body.appendChild(nav);

  // "More" menu: open/close, close on outside tap or Escape
  const moreBtn = nav.querySelector('button[aria-controls="more-menu"]');
  const menu = nav.querySelector('#more-menu');

  function setMenu(open) {
    menu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
  }

  moreBtn.addEventListener('click', () => {
    const open = menu.hidden;
    setMenu(open);
    if (open) menu.querySelector('a').focus();
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !nav.contains(e.target)) setMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      moreBtn.focus();
    }
  });
}


/* ---------- 10. Habits + daily logs ----------
   Habits live in ascend:habits (seeded once from data/habits.json).
   Logs live in monthly shards, ascend:logs:YYYY-MM:
   { "2026-09-27": { "iss-study": { value: 90, updatedAt }, "home-workout": { value: 0, min: true } } }
   value = minutes (duration), a number (count), or 1 (boolean done). */

// Get habits; on first run copy the defaults from data/habits.json into storage.
async function loadHabits() {
  const saved = getData('habits', null);
  if (Array.isArray(saved) && saved.length) return saved;
  try {
    const res = await fetch('data/habits.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json.habits) ? json.habits : [];
    if (list.length) setData('habits', list);
    return list;
  } catch (err) {
    console.warn('[ascend] Could not load default habits', err);
    return [];
  }
}

// Today's target for a habit: weekend numbers on Sat/Sun. 0 = off that day.
function habitTarget(habit, iso = todayISO()) {
  const t = habit.target || {};
  return Number(isWeekend(iso) ? t.weekend : t.weekday) || 0;
}

// Fully done: the target is reached.
function isHabitDone(habit, entry, target = habitTarget(habit)) {
  if (target <= 0) return false;
  return (Number(entry && entry.value) || 0) >= target;
}

// Kept: done, OR the minimum version was done. Kept habits keep the streak alive.
function isHabitKept(habit, entry, target = habitTarget(habit)) {
  if (target <= 0) return false;
  return isHabitDone(habit, entry, target) || Boolean(habit.minimum && entry && entry.min);
}


/* ---------- Daily score ----------
   Weighted: non-negotiable 3, important 2, bonus 1.
   Partial credit: 90 of 270 min = 1/3 of the weight.
   Minimum version = at least 50% credit (and it keeps the streak).
   Day Won = every non-negotiable kept AND score >= 80%. */

const PRIORITY_WEIGHTS = { 'non-negotiable': 3, important: 2, bonus: 1 };
const DAY_WON_SCORE = 80;

// Older saved habits used "daily"; treat it (and anything unknown) as important
function habitPriority(habit) {
  return PRIORITY_WEIGHTS[habit.priority] ? habit.priority : 'important';
}

// 0..1 credit for one habit today
function habitCredit(habit, entry, target) {
  if (target <= 0) return 0;
  const progress = Math.min(1, (Number(entry && entry.value) || 0) / target);
  return habit.minimum && entry && entry.min ? Math.max(progress, 0.5) : progress;
}

// Score for one day: { score (0-100), done, kept, total, nonNegKept, won }
function dayScore(habits, dayLog, iso = todayISO()) {
  let earned = 0;
  let possible = 0;
  let done = 0;
  let kept = 0;
  let total = 0;
  let nonNegKept = true;

  habits.forEach((habit) => {
    const target = habitTarget(habit, iso);
    if (target <= 0) return;                     // off today
    const entry = dayLog[habit.id];
    const weight = PRIORITY_WEIGHTS[habitPriority(habit)];
    earned += weight * habitCredit(habit, entry, target);
    possible += weight;
    total += 1;
    if (isHabitDone(habit, entry, target)) done += 1;
    const isKept = isHabitKept(habit, entry, target);
    if (isKept) kept += 1;
    if (habitPriority(habit) === 'non-negotiable' && !isKept) nonNegKept = false;
  });

  const score = possible ? Math.round((earned / possible) * 100) : 0;
  return { score, done, kept, total, nonNegKept, won: nonNegKept && score >= DAY_WON_SCORE };
}


/* ---------- Streaks ----------
   Habit streak: days in a row the habit was kept (the minimum counts).
   Days the habit is off (target 0) are skipped, never breaking a streak.
   Today only adds once kept; an unfinished today never breaks anything.

   Win streak: days won in a row. A day with every non-negotiable kept
   but under 80% keeps the streak alive without adding to it. */

const STREAK_LOOKBACK_DAYS = 800;

// Reads days from the monthly log shards, parsing each month only once
function makeLogReader() {
  const months = {};
  return (iso) => {
    const key = shardKey('logs', iso);
    if (!(key in months)) {
      const saved = getData(key, {});
      months[key] = saved && typeof saved === 'object' ? saved : {};
    }
    return months[key][iso] || {};
  };
}

// { count, keptToday }
function habitStreak(habit, readDay = makeLogReader(), today = todayISO()) {
  const keptToday = isHabitKept(habit, readDay(today)[habit.id], habitTarget(habit, today));
  let count = keptToday ? 1 : 0;

  for (let i = 1; i <= STREAK_LOOKBACK_DAYS; i += 1) {
    const iso = addDays(today, -i);
    const target = habitTarget(habit, iso);
    if (target <= 0) continue;                                   // off day: skip
    if (isHabitKept(habit, readDay(iso)[habit.id], target)) count += 1;
    else break;
  }
  return { count, keptToday };
}

// 'won' | 'kept' (non-negotiables kept, under 80%) | 'rest' (nothing scheduled) | 'missed'
function dayStatus(habits, day, iso) {
  const result = dayScore(habits, day, iso);
  if (result.total === 0) return 'rest';
  if (result.won) return 'won';
  if (result.nonNegKept) return 'kept';
  return 'missed';
}

// { count, todayStatus }: count = days won in the unbroken chain
function winStreak(habits, readDay = makeLogReader(), today = todayISO()) {
  const todayStatus = dayStatus(habits, readDay(today), today);
  let count = todayStatus === 'won' ? 1 : 0;

  for (let i = 1; i <= STREAK_LOOKBACK_DAYS; i += 1) {
    const iso = addDays(today, -i);
    const status = dayStatus(habits, readDay(iso), iso);
    if (status === 'won') count += 1;
    else if (status === 'missed') break;                         // 'kept' and 'rest' bridge
  }
  return { count, todayStatus };
}


/* ---------- Quotes ----------
   Built-in lines: data/quotes.json. Your own: ascend:quotes [{ id, text, addedOn }]. */

async function loadQuotes() {
  try {
    const res = await fetch('data/quotes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.quotes) ? json.quotes : [];
  } catch (err) {
    console.warn('[ascend] Could not load quotes', err);
    return [];
  }
}

function getMyQuotes() {
  const saved = getData('quotes', []);
  return Array.isArray(saved) ? saved : [];
}

function saveMyQuotes(list) {
  return setData('quotes', list);
}

// Same quote all day. Your own quotes show about one day in three.
function pickQuoteForDay(builtIn, mine, iso = todayISO()) {
  const useMine = mine.length > 0 && (builtIn.length === 0 || dateSeed(`${iso}:mine`) % 3 === 0);
  if (useMine) return { text: pickDaily(mine, iso).text, mine: true };
  const quote = pickDaily(builtIn, iso);
  return quote ? { text: quote.text, mine: false } : null;
}

// All habit entries for one day: { habitId: { value, min?, updatedAt } }
function getDayLog(iso = todayISO()) {
  const month = getData(shardKey('logs', iso), {});
  return (month && month[iso]) || {};
}

// Save (or remove, when entry is null) one habit entry. Returns the updated day, or null.
function saveHabitEntry(iso, habitId, entry) {
  const key = shardKey('logs', iso);
  const saved = getData(key, {});
  const month = saved && typeof saved === 'object' ? saved : {};
  const day = { ...(month[iso] || {}) };
  if (entry) day[habitId] = { ...entry, updatedAt: new Date().toISOString() };
  else delete day[habitId];
  month[iso] = day;
  return setData(key, month) ? day : null;
}

// Make text safe to put inside HTML
function escapeHTML(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, (c) => map[c]);
}


/* ---------- 11. Start-up (runs on every page) ---------- */

// Page name from the URL: "/money.html" or "/money" -> "money", "/" -> "index"
function currentPageName() {
  const last = location.pathname.split('/').pop() || '';
  return last.replace(/\.html$/, '') || 'index';
}

// Onboarding gate: no profile yet -> onboarding; already set up -> skip onboarding.
// Runs in <head>, so the wrong page never paints.
(function onboardingGate() {
  const page = currentPageName();
  if (page === 'style-guide') return;
  const done = hasProfile();
  if (!done && page !== 'onboarding') location.replace('onboarding.html');
  else if (done && page === 'onboarding') location.replace('index.html');
})();

// Clear a field's error as soon as the user starts fixing it
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('[aria-invalid="true"]')) showFieldError(e.target, '');
});

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getSettings().theme);     // now also sets it on <body>
  addAmbientBackground();
  ensureToastRegion();
  if (document.body.dataset.nav !== 'off') renderBottomNav();
});
