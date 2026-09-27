/* =========================================================
   ASCEND — shared.js
   Load in <head> on every page, BEFORE the page's own script:
     <script src="shared.js"></script>
     <script src="page.js" defer></script>
   Sections:
   1. Storage   2. Settings + theme   3. Dates (Asia/Kolkata)
   4. Money (INR)   5. Toast   6. Background   7. Bottom nav
   8. Start-up
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


/* ---------- 5. Toast ----------
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


/* ---------- 6. Background ambience (floating light circles) ---------- */

function addAmbientBackground() {
  if (document.querySelector('.ambient')) return;
  const el = document.createElement('div');
  el.className = 'ambient';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="ambient__orb"></span>'.repeat(3);
  document.body.prepend(el);
}


/* ---------- 7. Bottom nav ----------
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


/* ---------- 8. Start-up (runs on every page) ---------- */

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getSettings().theme);     // now also sets it on <body>
  addAmbientBackground();
  ensureToastRegion();
  if (document.body.dataset.nav !== 'off') renderBottomNav();
});
