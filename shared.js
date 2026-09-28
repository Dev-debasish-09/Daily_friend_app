/* =========================================================
   ASCEND — shared.js
   Load in <head> on every page, BEFORE the page's own script:
     <script src="shared.js"></script>
     <script src="page.js" defer></script>
   Sections:
   1. Storage   2. Settings + theme   3. Dates (Asia/Kolkata)
   4. Money (INR)   5. Profile   6. Form errors   7. Toast
   8. Background   9. Bottom nav   10. Habits + daily logs
   (then time sessions, money, roadmap + goals + wins)
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

async function fetchDefaultHabits() {
  const res = await fetch('data/habits.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.habits) ? json.habits : [];
}

// Get habits (in the user's order); on first run copy the defaults into storage.
// Older saved habits without emoji/colour get them filled in from the defaults once.
async function loadHabits() {
  const saved = getData('habits', null);
  try {
    if (Array.isArray(saved) && saved.length) {
      if (saved.every((h) => 'emoji' in h && 'color' in h)) return saved;
      const defaults = await fetchDefaultHabits();
      const upgraded = saved.map((h) => {
        const d = defaults.find((x) => x.id === h.id) || {};
        return { ...h, emoji: h.emoji ?? d.emoji ?? '', color: h.color ?? d.color ?? 'violet' };
      });
      setData('habits', upgraded);
      return upgraded;
    }
    const list = await fetchDefaultHabits();
    if (list.length) setData('habits', list);
    return list;
  } catch (err) {
    console.warn('[ascend] Could not load default habits', err);
    return Array.isArray(saved) ? saved : [];
  }
}

function saveHabits(list) {
  return setData('habits', list);
}

// Was this habit being tracked on that date?
// Not before it was created, not after it was archived, not during a paused (archived) stretch.
function isHabitActiveOn(habit, iso = todayISO()) {
  if (habit.createdOn && iso < habit.createdOn) return false;
  if (habit.archived && habit.archivedOn && iso >= habit.archivedOn) return false;
  if (Array.isArray(habit.pauses) && habit.pauses.some(([from, to]) => iso >= from && iso <= to)) return false;
  return true;
}

// Target for a habit on a date: weekend numbers on Sat/Sun. 0 = off that day.
function habitTarget(habit, iso = todayISO()) {
  if (!isHabitActiveOn(habit, iso)) return 0;
  const t = habit.target || {};
  return Number(isWeekend(iso) ? t.weekend : t.weekday) || 0;
}

// Habit colours are stored as names so they follow the theme
const HABIT_COLORS = {
  violet: { label: 'Violet', css: 'var(--accent)' },
  lavender: { label: 'Lavender', css: 'var(--lavender)' },
  gold: { label: 'Gold', css: 'var(--gold)' },
  peach: { label: 'Peach', css: 'var(--peach)' },
  pine: { label: 'Pine', css: 'var(--success)' },
  ember: { label: 'Ember', css: 'var(--danger)' },
  mountain: { label: 'Mountain', css: 'var(--mountain-far)' },
};

function habitColorCSS(habit) {
  return (HABIT_COLORS[habit.color] || HABIT_COLORS.violet).css;
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

// Add (or with a negative number, remove) minutes on a habit's log for a day.
// Keeps a "minimum kept" mark. Returns the updated day, or null.
function addHabitMinutes(iso, habitId, minutes) {
  const entry = getDayLog(iso)[habitId] || {};
  const value = Math.max(0, Math.min(1440, (Number(entry.value) || 0) + minutes));
  const next = value > 0 || entry.min ? { value, ...(entry.min ? { min: true } : {}) } : null;
  return saveHabitEntry(iso, habitId, next);
}


/* ---------- Time sessions (ascend:sessions:YYYY-MM) ----------
   { "2026-09-27": [ { id, habitId, start, end, source: "timer" | "manual" } ] }
   start/end are timestamps in milliseconds. A session belongs to the IST day it started. */

function getDaySessions(iso = todayISO()) {
  const month = getData(shardKey('sessions', iso), {});
  const list = month && month[iso];
  return Array.isArray(list) ? list : [];
}

function saveDaySessions(iso, list) {
  const key = shardKey('sessions', iso);
  const saved = getData(key, {});
  const month = saved && typeof saved === 'object' ? saved : {};
  month[iso] = list;
  return setData(key, month);
}

// Returns the session's day, or null if saving failed
function addSession(session) {
  const iso = toISODate(new Date(session.start));
  const list = [...getDaySessions(iso), session].sort((a, b) => a.start - b.start);
  return saveDaySessions(iso, list) ? iso : null;
}

function removeSession(iso, sessionId) {
  return saveDaySessions(iso, getDaySessions(iso).filter((s) => s.id !== sessionId));
}

// "2026-09-27" + "09:30" (IST) -> timestamp. India has no daylight saving, so +05:30 is fixed.
function istTimeToEpoch(iso, hhmm) {
  return Date.parse(`${iso}T${hhmm}:00+05:30`);
}

// Minutes since IST midnight for a timestamp (0–1439)
function minuteOfDayIST(ms) {
  const p = istParts(new Date(ms));
  return p.hour * 60 + p.minute;
}

const istTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
});

// Timestamp -> "9:30 AM" (IST)
function formatTimeIST(ms) {
  return istTimeFormatter.format(new Date(ms));
}

// Short unique id: newId('s') -> "slq2x9k3ab"
function newId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Make text safe to put inside HTML
function escapeHTML(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, (c) => map[c]);
}


/* ---------- Money: categories + expenses ----------
   Expenses live in monthly shards, ascend:expenses:YYYY-MM:
   { "2026-09-27": [ { id, amount, categoryId, method, note, createdAt, updatedAt } ] }
   Newest first within a day. amount is in rupees (up to 2 decimals). */

const PAYMENT_METHODS = { upi: 'UPI', card: 'Card', cash: 'Cash' };
const FOOD_DELIVERY_ID = 'food-delivery';
let categoriesCache = null;

async function loadCategories() {
  if (categoriesCache) return categoriesCache;
  try {
    const res = await fetch('data/categories.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    categoriesCache = Array.isArray(json.categories) ? json.categories : [];
  } catch (err) {
    console.warn('[ascend] Could not load categories', err);
    categoriesCache = [];
  }
  if (!categoriesCache.length) categoriesCache = [{ id: 'other', name: 'Other', emoji: '🧾', color: 'mountain' }];
  return categoriesCache;
}

function findCategory(id) {
  const list = categoriesCache || [];
  return list.find((c) => c.id === id) || { id, name: 'Other', emoji: '🧾', color: 'mountain' };
}

/* Day-grouped monthly shards, shared by expenses and income:
   ascend:<type>:YYYY-MM = { "YYYY-MM-DD": [item, ...] }, newest first */

function getMonthMap(type, ym) {
  const saved = getData(`${type}:${ym}`, {});
  return saved && typeof saved === 'object' ? saved : {};
}

function addToDay(type, iso, item) {
  const ym = monthOf(iso);
  const month = getMonthMap(type, ym);
  month[iso] = [item, ...(month[iso] || [])];
  return setData(`${type}:${ym}`, month);
}

function removeFromDay(type, iso, id) {
  const ym = monthOf(iso);
  const month = getMonthMap(type, ym);
  month[iso] = (month[iso] || []).filter((x) => x.id !== id);
  if (!month[iso].length) delete month[iso];
  return setData(`${type}:${ym}`, month);
}

// Replace an item; moves it if the date changed
function updateInDay(type, oldIso, newIso, item) {
  if (oldIso !== newIso) return removeFromDay(type, oldIso, item.id) && addToDay(type, newIso, item);
  const ym = monthOf(oldIso);
  const month = getMonthMap(type, ym);
  month[oldIso] = (month[oldIso] || []).map((x) => (x.id === item.id ? item : x));
  return setData(`${type}:${ym}`, month);
}

// Expenses
const getMonthExpenses = (ym) => getMonthMap('expenses', ym);
const addExpense = (iso, expense) => addToDay('expenses', iso, expense);
const removeExpense = (iso, id) => removeFromDay('expenses', iso, id);
const updateExpense = (oldIso, newIso, expense) => updateInDay('expenses', oldIso, newIso, expense);

// Income: { id, amount, source, note, createdAt, updatedAt }
const INCOME_SOURCES = {
  salary: { label: 'Salary', emoji: '💼' },
  freelance: { label: 'Freelance', emoji: '💻' },
  bonus: { label: 'Bonus', emoji: '🎉' },
  interest: { label: 'Interest', emoji: '🏦' },
  gift: { label: 'Gift', emoji: '🎁' },
  refund: { label: 'Refund', emoji: '↩️' },
  other: { label: 'Other', emoji: '🪙' },
};
const getMonthIncome = (ym) => getMonthMap('income', ym);
const addIncome = (iso, item) => addToDay('income', iso, item);
const removeIncome = (iso, id) => removeFromDay('income', iso, id);
const updateIncome = (oldIso, newIso, item) => updateInDay('income', oldIso, newIso, item);


/* ---------- Recurring expenses (ascend:recurring) ----------
   [{ id, name, amount, categoryId, method, day, startDate, lastAdded: "YYYY-MM" | null }]
   Each time the app opens, any due month is added once, with a fixed id
   (r-<rule>-<YYYY-MM>) so it can never double up. lastAdded means a copy
   you deleted doesn't come back. */

function getRecurring() {
  const saved = getData('recurring', []);
  return Array.isArray(saved) ? saved : [];
}

function saveRecurring(list) {
  return setData('recurring', list);
}

function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// The date a rule falls on in a month (31st -> 30th/28th in short months)
function recurringDateIn(rule, ym) {
  const day = Math.min(rule.day, daysInMonth(`${ym}-01`));
  return `${ym}-${String(day).padStart(2, '0')}`;
}

// Next date this rule will add an expense (the first month not added yet)
function nextRecurringDate(rule) {
  const ym = rule.lastAdded ? nextMonth(rule.lastAdded) : monthOf(rule.startDate);
  const iso = recurringDateIn(rule, ym);
  return iso < rule.startDate ? recurringDateIn(rule, nextMonth(ym)) : iso;
}

// Add everything due up to today. Returns [{ rule, iso }] for what was added.
function applyRecurring(today = todayISO()) {
  const rules = getRecurring();
  const added = [];
  let changed = false;

  rules.forEach((rule) => {
    let ym = rule.lastAdded ? nextMonth(rule.lastAdded) : monthOf(rule.startDate);
    for (let guard = 0; guard < 24 && ym <= monthOf(today); guard += 1, ym = nextMonth(ym)) {
      const iso = recurringDateIn(rule, ym);
      if (iso < rule.startDate) continue;
      if (iso > today) break;

      const id = `r-${rule.id}-${ym}`;
      const exists = (getMonthExpenses(ym)[iso] || []).some((x) => x.id === id);
      if (!exists) {
        const now = new Date().toISOString();
        addExpense(iso, {
          id, amount: rule.amount, categoryId: rule.categoryId, method: rule.method,
          note: rule.name, recurringId: rule.id, createdAt: now, updatedAt: now,
        });
        added.push({ rule, iso });
      }
      rule.lastAdded = ym;
      changed = true;
    }
  });

  if (changed) saveRecurring(rules);
  return added;
}

// Sum of a month's expenses, optionally for one category
function monthSpent(month, categoryId = null) {
  return Object.values(month).flat()
    .filter((x) => !categoryId || x.categoryId === categoryId)
    .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
}

// ₹450 or ₹349.50
function formatAmount(n) {
  const value = Number(n) || 0;
  return formatINR(value, Number.isInteger(value) ? 0 : 2);
}

// Monday of the week that contains `iso` (weeks run Mon–Sun)
function weekStartOf(iso) {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

function daysInMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Reads a day's expenses from the monthly shards, parsing each month once
function makeExpenseReader() {
  const months = {};
  return (iso) => {
    const ym = monthOf(iso);
    if (!(ym in months)) months[ym] = getMonthExpenses(ym);
    return months[ym][iso] || [];
  };
}


/* ---------- Budgets (ascend:budgets) ----------
   { total: 25000 | null, categories: { groceries: 4000, ... } }
   The Food Delivery budget IS profile.foodDeliveryLimit, so there's one number. */

const DEFAULT_HOME_MEAL_COST = 120;
const BUDGET_AMBER_AT = 0.7;    // amber from 70% used
const LEVEL_COLORS = { normal: 'var(--success)', amber: 'var(--gold)', ember: 'var(--danger)' };

function getBudgets() {
  const saved = getData('budgets', {}) || {};
  const categories = { ...(saved.categories && typeof saved.categories === 'object' ? saved.categories : {}) };
  const foodLimit = Number((getProfile() || {}).foodDeliveryLimit);
  if (foodLimit > 0) categories[FOOD_DELIVERY_ID] = foodLimit;
  else delete categories[FOOD_DELIVERY_ID];
  return { total: Number(saved.total) > 0 ? Number(saved.total) : null, categories };
}

function saveBudgets({ total, categories }) {
  const { [FOOD_DELIVERY_ID]: foodLimit, ...rest } = categories;
  const ok = setData('budgets', { total: total || null, categories: rest });
  return ok && Boolean(saveProfile({ foodDeliveryLimit: foodLimit }));
}

function getHomeMealCost() {
  const n = Number(getSettings().homeMealCost);
  return n > 0 ? n : DEFAULT_HOME_MEAL_COST;
}

// 'normal' under 70%, 'amber' from 70%, 'ember' from 100%. null when there's no budget.
function budgetLevel(spent, limit) {
  if (!(limit > 0)) return null;
  const ratio = spent / limit;
  if (ratio >= 1) return 'ember';
  if (ratio >= BUDGET_AMBER_AT) return 'amber';
  return 'normal';
}

const LEVEL_ICONS = {
  normal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  amber: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
  ember: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.01"/></svg>',
};

// Thin meter: fill colour follows the level
function meterHTML(spent, limit, level, { thin = false } = {}) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  return `<div class="meter__track${thin ? ' meter__track--thin' : ''}" aria-hidden="true">
    <div class="meter__fill" style="--value: ${pct}%; --meter-color: ${LEVEL_COLORS[level] || 'var(--accent)'}"></div>
  </div>`;
}


/* ---------- Food delivery card (Money + Today) ---------- */

function foodDeliveryStats(iso = todayISO()) {
  const read = makeExpenseReader();
  const isFood = (x) => x.categoryId === FOOD_DELIVERY_ID;

  const month = getMonthExpenses(monthOf(iso));
  const monthOrders = Object.values(month).flat().filter(isFood);
  const spent = monthOrders.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  // This week: Monday up to today (may reach back into last month)
  const weekOrders = [];
  for (let d = weekStartOf(iso); d <= iso; d = addDays(d, 1)) weekOrders.push(...read(d).filter(isFood));

  const mealCost = getHomeMealCost();
  const limit = Number((getProfile() || {}).foodDeliveryLimit) || 0;
  return {
    spent,
    limit,
    level: budgetLevel(spent, limit),
    pct: limit ? Math.round((spent / limit) * 100) : 0,
    daysLeft: daysInMonth(iso) - Number(iso.slice(8)) + 1,
    ordersMonth: monthOrders.length,
    ordersWeek: weekOrders.length,
    weekSpent: weekOrders.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    mealCost,
    // Each order minus what a home meal would have cost (never below zero)
    savedIfCooked: monthOrders.reduce((s, x) => s + Math.max(0, (Number(x.amount) || 0) - mealCost), 0),
  };
}

// Kind but honest: says the number, then something useful
function foodStatusText(s) {
  if (!s.limit) return `${formatAmount(s.spent)} this month. Set a limit in Money budgets to track it.`;
  if (s.level === 'ember') {
    return s.spent === s.limit
      ? 'Limit reached for this month. Home-cooked meals keep it right here.'
      : `${formatAmount(s.spent - s.limit)} over this month’s limit. It happens. Every home-cooked meal from here still counts.`;
  }
  if (s.level === 'amber') {
    return `${s.pct}% used with ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} to go. Worth slowing down.`;
  }
  return `${formatAmount(s.limit - s.spent)} left this month. Nicely on track.`;
}

// Fill a container with the card. mealCostControl: HTML for the "change ₹120" button or link.
function renderFoodCard(el, { mealCostControl = '' } = {}) {
  const s = foodDeliveryStats();
  const level = s.level || 'normal';

  const weekText = s.ordersWeek
    ? `${formatAmount(s.weekSpent)} so far`
    : 'None yet. Proud of you.';

  let savedText;
  if (!s.ordersMonth) savedText = 'No delivery this month, so every meal was a saving.';
  else if (!s.savedIfCooked) savedText = `Your ${s.ordersMonth} ${s.ordersMonth === 1 ? 'order' : 'orders'} cost about what cooking would. Nice restraint.`;
  else savedText = `If you’d cooked these ${s.ordersMonth} ${s.ordersMonth === 1 ? 'meal' : 'meals'} at home (about ${formatAmount(s.mealCost)} each), you’d have saved ${formatAmount(s.savedIfCooked)} this month.`;

  el.innerHTML = `
    <div class="food-card__head">
      <h2 class="food-card__title" id="food-title"><span aria-hidden="true">🛵</span> Food delivery</h2>
      <p class="food-card__amount">${formatAmount(s.spent)}${s.limit ? ` <span class="muted">of ${formatAmount(s.limit)}</span>` : ''}</p>
    </div>
    ${s.limit ? meterHTML(s.spent, s.limit, level) : ''}
    <p class="meter__note is-${level}">${LEVEL_ICONS[level]}<span>${escapeHTML(foodStatusText(s))}</span></p>
    <div class="grid-2">
      <div class="tile">
        <span class="tile__label">Orders this week</span>
        <span class="tile__value">${s.ordersWeek}</span>
        <span class="tile__note">${weekText}</span>
      </div>
      <div class="tile">
        <span class="tile__label">If you’d cooked</span>
        <span class="tile__value">${formatAmount(s.savedIfCooked)}</span>
        <span class="tile__note">saved this month</span>
      </div>
    </div>
    <p class="muted">${escapeHTML(savedText)}</p>
    ${mealCostControl.replace('{cost}', formatAmount(s.mealCost))}`;
}


/* ---------- No-spend days ----------
   A no-spend day has no spending outside "essential" categories (rent, bills,
   health, investments). Counts back from yesterday, never before you started. */

function isNoSpendDay(list) {
  return !list.some((x) => !findCategory(x.categoryId).essential);
}

// { count, todayClean }: count = no-spend days in a row up to yesterday
function noSpendStreak(iso = todayISO()) {
  const read = makeExpenseReader();
  const profile = getProfile() || {};
  const start = profile.onboardedOn || profile.createdOn || iso;
  let count = 0;
  for (let i = 1; i <= 800; i += 1) {
    const day = addDays(iso, -i);
    if (day < start || !isNoSpendDay(read(day))) break;
    count += 1;
  }
  return { count, todayClean: isNoSpendDay(read(iso)) };
}


/* ---------- Quick-add expense sheet (Today + Money) ----------
   openExpenseSheet({ onChange })                 -> add
   openExpenseSheet({ expense, iso, onChange })   -> edit (with Delete)
   Built once per page, the first time it opens. */

let xp = null;   // the sheet's elements + state

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
const BACKSPACE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-6 6M11 9l6 6"/></svg>';

function buildExpenseSheet(categories) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.id = 'expense-sheet';
  dialog.setAttribute('aria-labelledby', 'xp-title');

  const tiles = categories.map((c) => `
    <label class="cat-tile" style="--swatch: ${habitColorCSS(c)}">
      <input type="radio" name="xp-category" value="${escapeHTML(c.id)}" aria-label="${escapeHTML(c.name)}">
      <span class="cat-tile__emoji" aria-hidden="true">${escapeHTML(c.emoji || '')}</span>
      <span class="cat-tile__name" aria-hidden="true">${escapeHTML(c.short || c.name)}</span>
    </label>`).join('');

  const methods = Object.entries(PAYMENT_METHODS).map(([id, label]) => `
    <label class="method-option">
      <input type="radio" name="xp-method" value="${id}">
      <span>${label}</span>
    </label>`).join('');

  const keys = KEYPAD_KEYS.map((k) => (k === 'back'
    ? `<button type="button" class="key-btn" data-key="back" aria-label="Delete last digit">${BACKSPACE_SVG}</button>`
    : `<button type="button" class="key-btn" data-key="${k}"${k === '.' ? ' aria-label="Decimal point"' : ''}>${k}</button>`)).join('');

  dialog.innerHTML = `
    <form class="sheet__form" id="xp-form" novalidate>
      <div class="sheet__scroll">
        <div class="xp-head">
          <h2 id="xp-title" tabindex="-1">Add expense</h2>
          <button type="button" class="btn btn--ghost" id="xp-cancel">Cancel</button>
        </div>

        <div class="amount-box">
          <span class="sr-only" id="xp-amount-label">Amount</span>
          <output class="amount-display is-empty" id="xp-amount" aria-labelledby="xp-amount-label" aria-live="polite">₹0</output>
          <p class="field-error" id="xp-amount-error" hidden></p>
        </div>

        <fieldset class="cat-grid">
          <legend class="sr-only">Category</legend>
          ${tiles}
        </fieldset>
        <p class="field-error" id="xp-category-error" hidden></p>

        <fieldset class="method-row">
          <legend class="sr-only">Paid with</legend>
          ${methods}
        </fieldset>

        <div class="keypad" role="group" aria-label="Amount keypad">${keys}</div>

        <details class="xp-more" id="xp-more">
          <summary>Add a note or change the date</summary>
          <div class="stack">
            <div class="field">
              <label class="label" for="xp-note">Note <span class="muted">(optional)</span></label>
              <input class="input" id="xp-note" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Dinner with friends">
            </div>
            <div class="field">
              <label class="label" for="xp-date">Date</label>
              <input class="input" id="xp-date" type="date">
            </div>
          </div>
        </details>

        <button type="button" class="btn btn--ghost btn--block" id="xp-delete" hidden>Delete expense</button>
      </div>

      <div class="sheet__footer">
        <button class="btn btn--primary btn--block" type="submit" id="xp-save">Save expense</button>
      </div>
    </form>`;

  document.body.appendChild(dialog);

  const $ = (id) => dialog.querySelector(`#${id}`);
  xp = {
    dialog,
    form: $('xp-form'),
    title: $('xp-title'),
    amount: $('xp-amount'),
    amountError: $('xp-amount-error'),
    categoryError: $('xp-category-error'),
    note: $('xp-note'),
    date: $('xp-date'),
    more: $('xp-more'),
    save: $('xp-save'),
    del: $('xp-delete'),
    state: null,
  };

  // Keypad taps
  dialog.querySelector('.keypad').addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]');
    if (key) pressAmountKey(key.dataset.key);
  });

  // Hardware keyboard: digits, ".", Backspace, Enter (not while typing a note)
  dialog.addEventListener('keydown', (e) => {
    if (e.target.matches('input[type="text"], input[type="date"]')) return;
    if (/^[0-9]$/.test(e.key) || e.key === '.') {
      e.preventDefault();
      pressAmountKey(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      pressAmountKey('back');
    }
  });

  dialog.addEventListener('change', (e) => {
    if (e.target.name === 'xp-category') xp.categoryError.hidden = true;
  });

  $('xp-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();       // tap on the dimmed backdrop
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
  });

  xp.form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveExpenseFromSheet();
  });

  // Delete: two taps to confirm
  xp.del.addEventListener('click', () => {
    if (!xp.del.classList.contains('is-confirming')) {
      xp.del.classList.add('is-confirming');
      xp.del.textContent = `Tap again to delete ${formatAmount(xp.state.expense.amount)}`;
      setTimeout(resetDeleteButton, 4000);
      return;
    }
    const { expense, iso, onChange } = xp.state;
    if (!removeExpense(iso, expense.id)) {
      showToast('Couldn’t delete. Check that your browser allows storage.', { type: 'danger' });
      return;
    }
    dialog.close();
    showToast(`Deleted ${formatAmount(expense.amount)} on ${findCategory(expense.categoryId).name}.`, { type: 'info' });
    if (onChange) onChange();
  });
}

function resetDeleteButton() {
  if (!xp) return;
  xp.del.classList.remove('is-confirming');
  xp.del.textContent = 'Delete expense';
}

// Typed amount as text, e.g. "2450.5". Max 7 digits before the point, 2 after.
function pressAmountKey(key) {
  let t = xp.state.amountText;
  if (key === 'back') {
    t = t.slice(0, -1);
  } else if (key === '.') {
    if (!t.includes('.')) t = `${t || '0'}.`;
  } else {
    const [whole, decimals] = t.split('.');
    if (decimals !== undefined) {
      if (decimals.length < 2) t += key;
    } else if (whole === '0') {
      t = key;                                     // no leading zeros
    } else if (whole.length < 7) {
      t += key;
    }
  }
  xp.state.amountText = t;
  xp.amountError.hidden = true;
  updateAmountDisplay();
}

function typedAmount() {
  const n = parseFloat(xp.state.amountText);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// "₹2,450.5" while typing; the Save button names the amount
function updateAmountDisplay() {
  const t = xp.state.amountText;
  const [whole, decimals] = t.split('.');
  const shown = t ? `₹${formatIndianNumber(Number(whole || 0))}${decimals !== undefined ? `.${decimals}` : ''}` : '₹0';
  xp.amount.textContent = shown;
  xp.amount.classList.toggle('is-empty', !t);
  const amount = typedAmount();
  xp.save.textContent = xp.state.expense
    ? 'Save changes'
    : (amount > 0 ? `Save ${formatAmount(amount)}` : 'Save expense');
}

async function openExpenseSheet({ expense = null, iso = null, onChange = null } = {}) {
  const categories = await loadCategories();
  if (!xp) buildExpenseSheet(categories);

  const today = todayISO();
  xp.state = { expense, iso, onChange, amountText: expense ? String(expense.amount) : '' };

  xp.title.textContent = expense ? 'Edit expense' : 'Add expense';
  xp.amountError.hidden = true;
  xp.categoryError.hidden = true;

  xp.form.querySelectorAll('input[name="xp-category"]').forEach((input) => {
    input.checked = Boolean(expense) && input.value === expense.categoryId;
  });
  const method = (expense && expense.method) || getSettings().lastPaymentMethod || 'upi';
  xp.form.querySelectorAll('input[name="xp-method"]').forEach((input) => {
    input.checked = input.value === method;
  });

  xp.note.value = (expense && expense.note) || '';
  xp.date.max = today;
  xp.date.value = iso || today;
  xp.more.open = Boolean(expense && (expense.note || iso !== today));
  showFieldError(xp.date, '');

  xp.del.hidden = !expense;
  resetDeleteButton();
  updateAmountDisplay();

  document.body.style.overflow = 'hidden';
  xp.dialog.showModal();
  xp.title.focus();
}

function saveExpenseFromSheet() {
  const { expense: existing, iso: oldIso, onChange } = xp.state;
  const amount = typedAmount();
  const checkedCategory = xp.form.querySelector('input[name="xp-category"]:checked');
  const method = (xp.form.querySelector('input[name="xp-method"]:checked') || {}).value || 'upi';
  const date = xp.date.value;
  const today = todayISO();

  let ok = true;
  if (amount <= 0) {
    xp.amountError.textContent = 'Enter an amount with the keypad.';
    xp.amountError.hidden = false;
    ok = false;
  }
  if (!checkedCategory) {
    xp.categoryError.textContent = 'Pick a category.';
    xp.categoryError.hidden = false;
    ok = false;
  }
  if (!isValidISO(date) || date > today) {
    xp.more.open = true;
    showFieldError(xp.date, 'Pick today or an earlier date.');
    ok = false;
  }
  if (!ok) {
    haptic(30);
    return;
  }

  const now = new Date().toISOString();
  const expense = {
    id: existing ? existing.id : newId('x'),
    amount,
    categoryId: checkedCategory.value,
    method,
    note: xp.note.value.trim().replace(/\s+/g, ' '),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  const saved = existing ? updateExpense(oldIso, date, expense) : addExpense(date, expense);
  if (!saved) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }

  updateSettings({ lastPaymentMethod: method });
  xp.dialog.close();
  haptic(15);
  showToast(expenseSavedMessage(expense, date, Boolean(existing)), { type: 'success', duration: 3600 });
  if (onChange) onChange();
}

// Food delivery gets a gentle, specific nudge about this month's limit
function expenseSavedMessage(expense, iso, edited) {
  const category = findCategory(expense.categoryId);
  const base = `${formatAmount(expense.amount)} on ${category.name} ${edited ? 'updated' : 'saved'}.`;
  if (expense.categoryId !== FOOD_DELIVERY_ID || monthOf(iso) !== monthOf(todayISO())) return base;

  const s = foodDeliveryStats();
  if (!s.limit) return base;
  if (s.level === 'ember' && s.spent > s.limit) {
    return `${base} That’s ${formatAmount(s.spent - s.limit)} over this month’s limit. A fresh start is one meal away.`;
  }
  if (s.level === 'amber' || s.level === 'ember') {
    return `${base} ${s.pct}% of your limit used with ${s.daysLeft} days to go.`;
  }
  return `${base} ${formatAmount(s.spent)} of your ${formatAmount(s.limit)} limit used this month.`;
}


/* ---------- Roadmap, goals + wins ----------
   Camps and starter goals: data/roadmap.json.
   ascend:goals = { goals: [goal], savings: [savingsGoal] }
     goal:        { id, title, campId, createdOn, milestones: [milestone] }
     milestone:   { id, title, level: 'year'|'quarter'|'month', targetDate, progress (0-100), habitId|null, doneOn|null }
     savingsGoal: { id, name, emoji, target, saved, targetDate|null, deposits: [{ id, amount, date, note }], createdOn }
   ascend:wins = [{ id, type, title, detail, date, sourceId, createdAt }], newest first */

let roadmapCache = null;

async function loadRoadmap() {
  if (roadmapCache) return roadmapCache;
  try {
    const res = await fetch('data/roadmap.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    roadmapCache = await res.json();
  } catch (err) {
    console.warn('[ascend] Could not load roadmap', err);
    roadmapCache = {};
  }
  return roadmapCache;
}

// Goals + savings goals. On first run, copy the starters from roadmap.json.
async function loadGoals() {
  const saved = getData('goals', null);
  if (saved && Array.isArray(saved.goals) && Array.isArray(saved.savings)) return saved;

  const roadmap = await loadRoadmap();
  const today = todayISO();
  const starter = {
    goals: (roadmap.starterGoals || []).map((g) => ({
      ...g,
      createdOn: today,
      milestones: (g.milestones || []).map((m) => ({ progress: 0, habitId: null, doneOn: null, ...m })),
    })),
    savings: (roadmap.starterSavings || []).map((s) => ({
      saved: 0, targetDate: null, deposits: [], ...s, createdOn: today,
    })),
  };
  // Only save when the starters loaded, so a failed fetch tries again next time
  if (starter.goals.length || starter.savings.length) setData('goals', starter);
  return starter;
}

function saveGoals(data) {
  return setData('goals', data);
}

function getWins() {
  const saved = getData('wins', []);
  return Array.isArray(saved) ? saved : [];
}

// Save a win once per source: completing the same milestone twice is still one win
function addWin(win) {
  const list = getWins();
  if (win.sourceId && list.some((w) => w.sourceId === win.sourceId)) return true;
  const entry = { id: newId('w'), date: todayISO(), createdAt: new Date().toISOString(), ...win };
  return setData('wins', [entry, ...list]);
}

function removeWinFor(sourceId) {
  return setData('wins', getWins().filter((w) => w.sourceId !== sourceId));
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

// Recurring expenses due by today are added before any page draws
const recurringAddedOnLoad = hasProfile() ? applyRecurring() : [];

// Clear a field's error as soon as the user starts fixing it
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('[aria-invalid="true"]')) showFieldError(e.target, '');
});

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getSettings().theme);     // now also sets it on <body>
  addAmbientBackground();
  ensureToastRegion();
  if (document.body.dataset.nav !== 'off') renderBottomNav();

  // Let you know when recurring expenses were added in the background
  if (recurringAddedOnLoad.length) {
    const first = recurringAddedOnLoad[0];
    const more = recurringAddedOnLoad.length - 1;
    showToast(`Added ${first.rule.name} (${formatAmount(first.rule.amount)}) for ${formatDate(first.iso, { day: 'numeric', month: 'short' })}${more ? ` and ${more} more recurring` : ''}. You can edit it in Money.`,
      { type: 'info', duration: 5000 });
  }
});
