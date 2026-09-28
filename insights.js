/* =========================================================
   insights.js — the Insights page.
   A year as a night sky (one star per day, brightness by
   daily score, won days in gold), tap a star for that day.
   Weekly review, a monthly report card (A+ to D), and
   plain-English insights once there are 14 days of data.
   ========================================================= */

let today = todayISO();
let habits = [];
let startDate = today;          // when tracking began (from the profile)
let skyYear = Number(today.slice(0, 4));
let selected = today;
let weekStart = weekStartOf(today);
let reportMonth = monthOf(today);

const readDay = makeLogReader();
const readExpenses = makeExpenseReader();
const infoCache = {};

const INSIGHTS_MIN_DAYS = 14;
const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];


/* ---------- One day's numbers (cached) ----------
   status: 'future' | 'before' (before you started) | 'rest' (nothing scheduled)
           | 'won' | 'scored' */

function dayInfo(iso) {
  if (infoCache[iso]) return infoCache[iso];
  const log = readDay(iso);
  const tracked = Object.keys(log).length > 0;
  const result = dayScore(habits, log, iso);

  let status = 'scored';
  if (iso > today) status = 'future';
  else if (iso < startDate && !tracked) status = 'before';
  else if (result.total === 0) status = 'rest';
  else if (result.won) status = 'won';

  infoCache[iso] = { iso, log, tracked, status, ...result };
  return infoCache[iso];
}

// Days that count for reviews: up to today, from the day you started (or any day you logged)
function counts(info) {
  return info.status === 'won' || info.status === 'scored';
}

// Minutes per duration habit over a list of days
function minutesByHabit(isos) {
  const totals = {};
  isos.forEach((iso) => {
    Object.entries(readDay(iso)).forEach(([id, entry]) => {
      const habit = habits.find((h) => h.id === id);
      if (!habit || habit.type !== 'duration') return;
      totals[id] = (totals[id] || 0) + (Number(entry.value) || 0);
    });
  });
  return totals;
}

function isoRange(from, to) {
  const list = [];
  for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
  return list;
}

function habitLabel(h) {
  return `${h.emoji ? `${h.emoji} ` : ''}${h.name}`;
}

function unitLabel(habit, n) {
  if (!habit.unit) return '';
  return n === 1 ? habit.unit : (habit.unitPlural || `${habit.unit}s`);
}

function dayName(iso, withYear = false) {
  return formatDate(iso, withYear
    ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short' });
}

function setNavDisabled(btn, disabled) {
  btn.setAttribute('aria-disabled', String(disabled));
}


/* ---------- Night sky ---------- */

// Grid: 12 month rows x 31 day columns, inside a 360-wide viewBox
const SKY = { x0: 34, y0: 18, cellW: (360 - 34 - 4) / 31, rowH: 23 };
const SKY_H = SKY.y0 + 12 * SKY.rowH + 4;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPARKLE = 'M0 -5.5l1.5 4 4 1.5-4 1.5L0 5.5l-1.5-4-4-1.5 4-1.5z';

// Star position, with a little seeded jitter so it reads as a sky, not a table
function starXY(iso) {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8));
  const seed = dateSeed(iso);
  const jx = ((seed % 97) / 97 - 0.5) * 3;
  const jy = (((seed >>> 8) % 89) / 89 - 0.5) * 5;
  return [SKY.x0 + (d - 0.5) * SKY.cellW + jx, SKY.y0 + (m - 0.5) * SKY.rowH + jy];
}

function starSVG(iso, i) {
  const info = dayInfo(iso);
  const [x, y] = starXY(iso).map((n) => n.toFixed(1));
  // Outer group places the star; the inner one scales in (CSS transform would override the placement)
  const star = (inner) => `<g transform="translate(${x} ${y})"><g class="star-g" style="--i: ${i}">${inner}</g></g>`;

  if (info.status === 'won') {
    return star(`<circle r="8" fill="url(#star-glow)"/><path class="star--won" d="${SPARKLE}"/>`);
  }
  if (info.status === 'future') return star('<circle class="star--dust" r="0.8" opacity="0.25"/>');
  if (info.status === 'before') return star('<circle class="star--dust" r="0.9" opacity="0.35"/>');
  if (info.status === 'rest') return star('<circle class="star" r="1.2" opacity="0.35"/>');

  const s = info.score / 100;
  return star(`<circle class="star" r="${(1.3 + s * 2.7).toFixed(2)}" opacity="${(0.4 + s * 0.6).toFixed(2)}"/>`);
}

function renderSky() {
  const year = skyYear;
  document.getElementById('sky-year').textContent = String(year);
  document.getElementById('year-eyebrow').textContent = `Your ${year}`;
  setNavDisabled(document.getElementById('year-prev'), year <= Number(startDate.slice(0, 4)));
  setNavDisabled(document.getElementById('year-next'), year >= Number(today.slice(0, 4)));

  let stars = '';
  let i = 0;
  for (let m = 1; m <= 12; m += 1) {
    const dim = daysInMonth(`${year}-${pad2(m)}-01`);
    for (let d = 1; d <= dim; d += 1) {
      stars += starSVG(`${year}-${pad2(m)}-${pad2(d)}`, i);
      i += 1;
    }
  }

  const months = MONTH_SHORT.map((name, m) =>
    `<text class="sky-month" x="2" y="${(SKY.y0 + (m + 0.5) * SKY.rowH + 3.5).toFixed(1)}">${name}</text>`).join('');
  const ticks = [1, 10, 20, 31].map((d) =>
    `<text class="sky-tick" x="${(SKY.x0 + (d - 0.5) * SKY.cellW).toFixed(1)}" y="9" text-anchor="middle">${d}</text>`).join('');

  const todayRing = today.startsWith(String(year))
    ? `<circle class="sky-today" r="6" transform="translate(${starXY(today).map((n) => n.toFixed(1)).join(' ')})"/>`
    : '';

  document.getElementById('sky-art').innerHTML = `
    <svg class="sky" id="sky" viewBox="0 0 360 ${SKY_H}" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="star-glow">
          <stop offset="0" class="star-glow-in"/>
          <stop offset="1" class="star-glow-out"/>
        </radialGradient>
      </defs>
      ${ticks}${months}${stars}${todayRing}
      <circle class="sky-select" id="sky-select" r="7.5"/>
    </svg>`;

  renderSkySummary();
  moveSelectRing();
}

function renderSkySummary() {
  const year = String(skyYear);
  const days = isoRange(`${year}-01-01`, [`${year}-12-31`, today].sort()[0]).map(dayInfo).filter(counts);
  const won = days.filter((d) => d.status === 'won').length;

  // Brightest month = best average score (at least 3 days)
  let best = null;
  for (let m = 1; m <= 12; m += 1) {
    const inMonth = days.filter((d) => Number(d.iso.slice(5, 7)) === m);
    if (inMonth.length < 3) continue;
    const avg = average(inMonth.map((d) => d.score));
    if (!best || avg > best.avg) best = { m, avg };
  }

  let text = days.length
    ? `${won} ${won === 1 ? 'day' : 'days'} won out of ${days.length} in ${year}.`
    : `No days tracked in ${year} yet. Your first star lights up today.`;
  if (best) text += ` Brightest month: ${MONTH_SHORT[best.m - 1]}, averaging ${Math.round(best.avg)}%.`;
  document.getElementById('sky-summary').textContent = text;
}

function moveSelectRing() {
  const ring = document.getElementById('sky-select');
  if (!ring) return;
  const inYear = selected.startsWith(String(skyYear));
  ring.style.display = inYear ? '' : 'none';
  if (inYear) ring.setAttribute('transform', `translate(${starXY(selected).map((n) => n.toFixed(1)).join(' ')})`);
}

// Select a day: switch years if needed, move the ring, fill the panel
function selectDay(iso) {
  const minIso = `${startDate.slice(0, 4)}-01-01`;
  const maxIso = `${today.slice(0, 4)}-12-31`;
  selected = [[iso, minIso].sort()[1], maxIso].sort()[0];
  const year = Number(selected.slice(0, 4));
  if (year !== skyYear) {
    skyYear = year;
    renderSky();
  } else {
    moveSelectRing();
  }
  renderDayPanel();
}

// Tap anywhere on the sky: pick the day under your finger (no tiny targets)
function isoAtPoint(clientX, clientY) {
  const svg = document.getElementById('sky');
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  const m = clamp(Math.floor((p.y - SKY.y0) / SKY.rowH) + 1, 1, 12);
  const ym = `${skyYear}-${pad2(m)}`;
  const d = clamp(Math.floor((p.x - SKY.x0) / SKY.cellW) + 1, 1, daysInMonth(`${ym}-01`));
  return `${ym}-${pad2(d)}`;
}

const skyWrap = document.getElementById('sky-wrap');
skyWrap.addEventListener('click', (e) => {
  selectDay(isoAtPoint(e.clientX, e.clientY));
  haptic(8);
});

// Keyboard: ← → one day, ↑ ↓ one month (same day number, clamped)
skyWrap.addEventListener('keydown', (e) => {
  const moves = { ArrowLeft: -1, ArrowRight: 1 };
  if (e.key in moves) {
    e.preventDefault();
    selectDay(addDays(selected, moves[e.key]));
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const [y, m] = selected.split('-').map(Number);
    const next = clamp(m + (e.key === 'ArrowUp' ? -1 : 1), 1, 12);
    const ym = `${y}-${pad2(next)}`;
    selectDay(`${ym}-${pad2(Math.min(Number(selected.slice(8)), daysInMonth(`${ym}-01`)))}`);
  }
});

document.getElementById('year-prev').addEventListener('click', () => {
  if (skyYear > Number(startDate.slice(0, 4))) selectDay(`${skyYear - 1}-12-31`);
});
document.getElementById('year-next').addEventListener('click', () => {
  if (skyYear < Number(today.slice(0, 4))) {
    const next = `${skyYear + 1}-01-01`;
    selectDay(today.startsWith(String(skyYear + 1)) ? today : next);
  }
});


/* ---------- Selected day panel ---------- */

function dayHabitRow(habit, entry, target) {
  const value = Number(entry && entry.value) || 0;
  const done = isHabitDone(habit, entry, target);
  const kept = !done && isHabitKept(habit, entry, target);

  let text;
  if (habit.type === 'duration') text = `${formatMinutes(value)} of ${formatMinutes(target)}`;
  else if (habit.type === 'count') text = `${value} of ${target} ${unitLabel(habit, target)}`.trim();
  else text = value ? 'Done' : 'Not logged';
  if (kept) text = `Minimum kept · ${text}`;

  const cls = done ? 'is-done' : (kept ? 'is-kept' : 'is-open');
  const mark = done ? '✓' : (kept ? '½' : '–');
  const state = done ? 'done' : (kept ? 'minimum kept' : 'not done');
  return `
    <li class="${cls}">
      <span class="day-habits__mark" aria-hidden="true">${mark}</span>
      <span class="day-habits__name">${escapeHTML(habitLabel(habit))}<span class="sr-only">, ${state}</span></span>
      <span class="day-habits__value">${escapeHTML(text)}</span>
    </li>`;
}

function renderDayPanel() {
  const iso = selected;
  const info = dayInfo(iso);
  const panel = document.getElementById('day-panel');
  const title = iso === today ? `Today · ${dayName(iso)}` : dayName(iso, true);

  let body;
  if (info.status === 'future') {
    body = '<p class="muted">Still ahead. A fresh star waiting to be lit.</p>';
  } else if (info.status === 'before') {
    body = '<p class="muted">Before you started climbing with ASCEND.</p>';
  } else if (info.status === 'rest') {
    body = '<p class="muted">Nothing was scheduled. A rest day.</p>';
  } else {
    let badge = '';
    if (info.status === 'won') badge = '<span class="badge badge--gold">Day won</span>';
    else if (info.nonNegKept) badge = '<span class="badge">Non-negotiables kept</span>';

    const rows = habits
      .map((h) => ({ h, target: habitTarget(h, iso) }))
      .filter((r) => r.target > 0)
      .map((r) => dayHabitRow(r.h, info.log[r.h.id], r.target))
      .join('');

    const spent = readExpenses(iso);
    const spentTotal = spent.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const food = spent.filter((x) => x.categoryId === FOOD_DELIVERY_ID).length;
    let money = spentTotal ? `Spent ${formatAmount(spentTotal)}` : 'No spending logged';
    if (food) money += ` · ${food} food delivery ${food === 1 ? 'order' : 'orders'}`;

    const message = info.score === 0 && iso !== today
      ? 'A quiet day. Fresh climb the next morning.'
      : `${info.kept} of ${info.total} habits kept.`;

    body = `
      <p class="day-panel__score"><span class="num-big">${info.score}%</span><span class="muted">score</span>${badge}</p>
      <p>${message}</p>
      <ul class="day-habits">${rows}</ul>
      <p class="muted">${escapeHTML(money)}.</p>`;
  }

  // That night's reflection, if you wrote one
  const note = info.status !== 'future' ? getReflection(iso) : null;
  if (note) body += `<div class="day-reflection">${reflectionBodyHTML(note)}</div>`;

  const minIso = `${startDate.slice(0, 4)}-01-01`;
  const maxIso = `${today.slice(0, 4)}-12-31`;
  panel.innerHTML = `
    <div class="day-panel__head">
      <h3 class="day-panel__date">${escapeHTML(title)}</h3>
    </div>
    ${body}
    <div class="day-nav">
      <button class="btn btn--secondary" type="button" data-step="-1"${iso <= minIso ? ' disabled' : ''}>Previous day</button>
      <button class="btn btn--secondary" type="button" data-step="1"${iso >= maxIso ? ' disabled' : ''}>Next day</button>
    </div>`;
}

document.getElementById('day-panel').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-step]');
  if (btn && !btn.disabled) selectDay(addDays(selected, Number(btn.dataset.step)));
});


/* ---------- Reflections ---------- */

// Mood, energy and both answers for one entry
function reflectionBodyHTML(entry) {
  const mood = MOODS[entry.mood - 1] || MOODS[2];
  const energy = ENERGY[entry.energy - 1] || ENERGY[2];
  return `
    <p class="reflect-item__faces">${mood.emoji} Mood: ${mood.word} · ${energy.emoji} Energy: ${energy.word}</p>
    ${entry.well ? `<p class="reflect-item__label">Went well</p><p>${escapeHTML(entry.well)}</p>` : ''}
    ${entry.improve ? `<p class="reflect-item__label">Tomorrow</p><p>${escapeHTML(entry.improve)}</p>` : ''}`;
}

const REFLECT_PAGE = 10;
let reflectShown = REFLECT_PAGE;

// All reflections since you started, newest first
function allReflections() {
  return monthsBetween(monthOf(startDate), monthOf(today))
    .flatMap((ym) => Object.entries(getMonthMap('journal', ym)))
    .filter(([, entry]) => entry && typeof entry === 'object')
    .sort((a, b) => b[0].localeCompare(a[0]));
}

function renderReflections() {
  const list = allReflections();
  const el = document.getElementById('reflect-list');
  const more = document.getElementById('reflect-more');
  if (!list.length) {
    el.innerHTML = '<li class="muted">No reflections yet. From 8 PM, Today asks two gentle questions.</li>';
    more.hidden = true;
    return;
  }
  el.innerHTML = list.slice(0, reflectShown).map(([iso, entry]) => `
    <li class="tile reflect-item">
      <div class="reflect-item__head">
        <h3 class="reflect-item__date">${escapeHTML(dayName(iso, true))}</h3>
      </div>
      ${reflectionBodyHTML(entry)}
    </li>`).join('');
  more.hidden = list.length <= reflectShown;
}

document.getElementById('reflect-more').addEventListener('click', () => {
  reflectShown += REFLECT_PAGE;
  renderReflections();
});


/* ---------- Weekly review ---------- */

// Totals for a list of days: completion, days won, best + toughest day
function reviewDays(isos) {
  const days = isos.map(dayInfo).filter(counts);
  const scheduled = days.reduce((s, d) => s + d.total, 0);
  const kept = days.reduce((s, d) => s + d.kept, 0);
  const sorted = [...days].sort((a, b) => b.score - a.score || a.iso.localeCompare(b.iso));
  return {
    days,
    scheduled,
    kept,
    completion: scheduled ? Math.round((kept / scheduled) * 100) : 0,
    won: days.filter((d) => d.status === 'won').length,
    avgScore: Math.round(average(days.map((d) => d.score))),
    best: sorted[0] || null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
  };
}

function hoursListHTML(minutes) {
  const rows = habits
    .filter((h) => h.type === 'duration' && minutes[h.id])
    .map((h) => ({ h, min: minutes[h.id] }))
    .sort((a, b) => b.min - a.min);
  if (!rows.length) return '<p class="muted">No time logged this week.</p>';
  const max = rows[0].min;
  const total = rows.reduce((s, r) => s + r.min, 0);
  return `
    <ul class="hours-list">
      ${rows.map((r) => `
        <li class="hours-row">
          <div class="hours-row__head"><span>${escapeHTML(habitLabel(r.h))}</span><span class="hours-row__value">${formatMinutes(r.min)}</span></div>
          <div class="meter__track meter__track--thin" aria-hidden="true">
            <div class="meter__fill" style="--value: ${((r.min / max) * 100).toFixed(1)}%; --bar-color: ${habitColorCSS(r.h)}"></div>
          </div>
        </li>`).join('')}
    </ul>
    <p class="muted">${formatMinutes(total)} logged in total.</p>`;
}

function renderWeek() {
  const end = addDays(weekStart, 6);
  const isThisWeek = weekStart === weekStartOf(today);
  document.getElementById('week-range').textContent =
    `${dayName(weekStart)} – ${dayName(end)}${isThisWeek ? ' · so far' : ''}`;
  setNavDisabled(document.getElementById('week-prev'), weekStart <= weekStartOf(startDate));
  setNavDisabled(document.getElementById('week-next'), isThisWeek);

  const isos = isoRange(weekStart, [end, today].sort()[0]);
  const r = reviewDays(isos);
  const body = document.getElementById('week-body');

  if (!r.days.length) {
    body.innerHTML = '<p class="muted">No tracked days this week. A fresh week is a fresh climb.</p>';
    return;
  }

  const bestTile = r.best ? `
    <button class="tile tile-btn" type="button" data-day="${r.best.iso}" aria-label="Best day, ${dayName(r.best.iso)}, ${r.best.score}%. Show it in the sky.">
      <span class="tile__label">Best day</span>
      <span class="tile__value">${r.best.score}%</span>
      <span class="tile__note">${dayName(r.best.iso)}</span>
    </button>` : '';
  const worstTile = r.worst ? `
    <button class="tile tile-btn" type="button" data-day="${r.worst.iso}" aria-label="Toughest day, ${dayName(r.worst.iso)}, ${r.worst.score}%. Show it in the sky.">
      <span class="tile__label">Toughest day</span>
      <span class="tile__value">${r.worst.score}%</span>
      <span class="tile__note">${dayName(r.worst.iso)}</span>
    </button>` : '';

  body.innerHTML = `
    <div class="grid-2">
      <div class="tile">
        <span class="tile__label">Completion</span>
        <span class="tile__value">${r.completion}%</span>
        <span class="tile__note">${r.kept} of ${r.scheduled} check-ins kept</span>
      </div>
      <div class="tile">
        <span class="tile__label">Days won</span>
        <span class="tile__value">${r.won} of ${r.days.length}</span>
        <span class="tile__note">Average score ${r.avgScore}%</span>
      </div>
      ${bestTile}${worstTile}
    </div>
    <div class="stack">
      <h3 class="section-title">Hours by habit</h3>
      ${hoursListHTML(minutesByHabit(isos))}
    </div>`;
}

document.getElementById('week-prev').addEventListener('click', () => {
  if (weekStart > weekStartOf(startDate)) { weekStart = addDays(weekStart, -7); renderWeek(); }
});
document.getElementById('week-next').addEventListener('click', () => {
  if (weekStart < weekStartOf(today)) { weekStart = addDays(weekStart, 7); renderWeek(); }
});

// Best / toughest day tiles jump to that star
document.getElementById('week-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-day]');
  if (!btn) return;
  selectDay(btn.dataset.day);
  skyWrap.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  skyWrap.focus({ preventScroll: true });
});


/* ---------- Monthly report card ---------- */

const GRADES = [[90, 'A+'], [80, 'A'], [70, 'B+'], [60, 'B'], [50, 'C+'], [40, 'C'], [0, 'D']];

function gradeFor(pct) {
  return GRADES.find(([min]) => pct >= min)[1];
}

// Colour family for a grade: a, b, c or d
const gradeFamily = (g) => g[0].toLowerCase();

const GRADE_COMMENTS = {
  a: 'Outstanding. This is what climbing looks like. Keep this rhythm.',
  b: 'Solid month. A few more kept days and you’re in A territory.',
  c: 'You kept showing up. Pick one habit to protect next month.',
  d: 'A hard month, and you’re still here. Fresh climb starts now. One small step counts.',
};

function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}

function renderMonth() {
  const ym = reportMonth;
  const first = `${ym}-01`;
  const last = `${ym}-${pad2(daysInMonth(first))}`;
  const isThisMonth = ym === monthOf(today);
  document.getElementById('month-range').textContent =
    `${formatDate(first, { month: 'long', year: 'numeric' })}${isThisMonth ? ' · so far' : ''}`;
  setNavDisabled(document.getElementById('month-prev'), ym <= monthOf(startDate));
  setNavDisabled(document.getElementById('month-next'), isThisMonth);

  const isos = isoRange(first, [last, today].sort()[0]);
  const r = reviewDays(isos);
  const body = document.getElementById('month-body');
  if (!r.days.length) {
    body.innerHTML = '<p class="muted">No tracked days this month. Your report card fills in as you go.</p>';
    return;
  }

  const grade = gradeFor(r.avgScore);
  const trackedIsos = r.days.map((d) => d.iso);

  // One row per habit that was scheduled this month: kept days and a mini grade
  const habitRows = habits.map((h) => {
    let scheduled = 0;
    let kept = 0;
    trackedIsos.forEach((iso) => {
      const target = habitTarget(h, iso);
      if (target <= 0) return;
      scheduled += 1;
      if (isHabitKept(h, readDay(iso)[h.id], target)) kept += 1;
    });
    if (!scheduled) return '';
    const pct = Math.round((kept / scheduled) * 100);
    return `<tr>
      <th scope="row">${escapeHTML(habitLabel(h))}</th>
      <td>${kept} of ${scheduled} days</td>
      <td class="mini-grade">${gradeFor(pct)}</td>
    </tr>`;
  }).join('');

  const minutes = minutesByHabit(trackedIsos);
  const totalMin = Object.values(minutes).reduce((a, b) => a + b, 0);

  // Food delivery vs this month's limit
  const foodSpent = monthSpent(getMonthExpenses(ym), FOOD_DELIVERY_ID);
  const limit = Number((getProfile() || {}).foodDeliveryLimit) || 0;
  let foodNote = 'No limit set';
  if (limit) foodNote = foodSpent <= limit ? `Within your ${formatAmount(limit)} limit` : `${formatAmount(foodSpent - limit)} over the limit`;

  body.innerHTML = `
    <div class="grade-hero">
      <span class="grade grade--${gradeFamily(grade)}" aria-hidden="true">${grade}</span>
      <div class="grade-hero__text">
        <p class="sr-only">Grade ${grade}.</p>
        <p class="grade-hero__avg">Average score ${r.avgScore}%</p>
        <p class="muted">${r.won} ${r.won === 1 ? 'day' : 'days'} won of ${r.days.length} tracked</p>
      </div>
    </div>
    <p class="comment">${GRADE_COMMENTS[gradeFamily(grade)]}</p>
    <table class="report">
      <caption class="sr-only">Habits kept this month, with a grade each</caption>
      <thead><tr><th scope="col">Habit</th><th scope="col">Kept</th><th scope="col">Grade</th></tr></thead>
      <tbody>${habitRows}</tbody>
    </table>
    <div class="grid-2">
      <div class="tile">
        <span class="tile__label">Time logged</span>
        <span class="tile__value">${formatMinutes(totalMin)}</span>
        <span class="tile__note">Completion ${r.completion}%</span>
      </div>
      <div class="tile">
        <span class="tile__label">Food delivery</span>
        <span class="tile__value">${formatAmount(foodSpent)}</span>
        <span class="tile__note">${foodNote}</span>
      </div>
    </div>`;
}

document.getElementById('month-prev').addEventListener('click', () => {
  if (reportMonth > monthOf(startDate)) { reportMonth = prevMonth(reportMonth); renderMonth(); }
});
document.getElementById('month-next').addEventListener('click', () => {
  if (reportMonth < monthOf(today)) { reportMonth = nextMonth(reportMonth); renderMonth(); }
});


/* ---------- Plain-English insights (Step 15) ----------
   Built from the last 8 weeks of finished days (today is left out, it isn't over).
   Each check needs enough days on both sides before it says anything. */

const MIN_GROUP = 4;             // days needed in each group to compare
const choiceHabits = () => habits.filter((h) => !WORK_HABIT_IDS.includes(h.id));   // see shared.js

// Days with anything logged, looking back just over a year
function trackedDayCount() {
  let n = 0;
  for (let i = 0; i <= 400; i += 1) {
    if (Object.keys(readDay(addDays(today, -i))).length) n += 1;
  }
  return n;
}

// The main study habit: ISS Study if you have it, else the duration habit with most time
function studyHabit(days) {
  const iss = habits.find((h) => h.id === 'iss-study');
  if (iss) return iss;
  const minutes = minutesByHabit(days.map((d) => d.iso));
  const top = Object.entries(minutes).sort((a, b) => b[1] - a[1])[0];
  return top ? habits.find((h) => h.id === top[0]) : null;
}

function keptOn(habit, info) {
  const target = habitTarget(habit, info.iso);
  if (target <= 0) return null;               // off that day: not in either group
  return isHabitKept(habit, info.log[habit.id], target);
}

// 1. "On days you kept Home Workout, ISS Study averaged 40m more."
function studyLiftInsight(days) {
  const study = studyHabit(days);
  if (!study) return null;
  let best = null;
  choiceHabits().filter((h) => h.id !== study.id).forEach((h) => {
    const yes = [];
    const no = [];
    days.forEach((d) => {
      if (habitTarget(study, d.iso) <= 0) return;
      const k = keptOn(h, d);
      if (k === null) return;
      (k ? yes : no).push(Number(d.log[study.id] && d.log[study.id].value) || 0);
    });
    if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return;
    const diff = average(yes) - average(no);
    if (diff >= 15 && (!best || diff > best.diff)) best = { h, diff };
  });
  if (!best) return null;
  return {
    icon: '📈',
    text: `On days you kept ${best.h.name}, you put in ${formatMinutes(best.diff)} more ${study.name} on average.`,
  };
}

// 2. "Food delivery was highest on Fridays."
function foodDayInsight(from, to) {
  const byDay = Array(7).fill(0);
  let orders = 0;
  isoRange(from, to).forEach((iso) => {
    readExpenses(iso).filter((x) => x.categoryId === FOOD_DELIVERY_ID).forEach((x) => {
      byDay[weekdayOf(iso)] += Number(x.amount) || 0;
      orders += 1;
    });
  });
  if (orders < 3) return null;
  const total = byDay.reduce((a, b) => a + b, 0);
  const top = byDay.indexOf(Math.max(...byDay));
  const share = Math.round((byDay[top] / total) * 100);
  const weeks = Math.max(1, Math.round((daysBetween(from, to) + 1) / 7));
  return {
    icon: '🛵',
    text: `Food delivery was highest on ${WEEKDAYS[top]}: ${formatAmount(byDay[top])} in the last ${weeks} ${weeks === 1 ? 'week' : 'weeks'}, ${share}% of it. A ${WEEKDAYS[top].slice(0, -1)} dinner plan could keep that in your pocket.`,
  };
}

// 3. "The day after you kept Sleep by 11:30 PM, you scored 14 points higher."
function nextDayInsight(days) {
  const byIso = Object.fromEntries(days.map((d) => [d.iso, d]));
  let best = null;
  choiceHabits().forEach((h) => {
    const yes = [];
    const no = [];
    days.forEach((d) => {
      const next = byIso[addDays(d.iso, 1)];
      const k = keptOn(h, d);
      if (!next || k === null) return;
      (k ? yes : no).push(next.score);
    });
    if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return;
    const diff = average(yes) - average(no);
    if (diff >= 8 && (!best || diff > best.diff)) best = { h, diff };
  });
  if (!best) return null;
  return {
    icon: '🌙',
    text: `The day after you kept ${best.h.name}, you scored ${Math.round(best.diff)} points higher on average.`,
  };
}

// 4. "Tuesdays are your strongest days."
function weekdayInsight(days) {
  const groups = Array.from({ length: 7 }, () => []);
  days.forEach((d) => groups[weekdayOf(d.iso)].push(d.score));
  const avgs = groups.map((g, i) => ({ i, n: g.length, avg: average(g) })).filter((g) => g.n >= 2);
  if (avgs.length < 3) return null;
  avgs.sort((a, b) => b.avg - a.avg);
  const top = avgs[0];
  const low = avgs[avgs.length - 1];
  if (top.avg - low.avg < 10) return null;
  return {
    icon: '📅',
    text: `${WEEKDAYS[top.i]} are your strongest days, averaging ${Math.round(top.avg)}%. ${WEEKDAYS[low.i]} average ${Math.round(low.avg)}%, so they’re worth planning the night before.`,
  };
}

// 5. Momentum: last 7 tracked days vs the 7 before
function momentumInsight(days) {
  if (days.length < 14) return null;
  const recent = days.slice(-7).map((d) => d.score);
  const before = days.slice(-14, -7).map((d) => d.score);
  const diff = Math.round(average(recent) - average(before));
  const now = Math.round(average(recent));
  if (diff >= 5) return { icon: '🚀', text: `Your last 7 days averaged ${now}%, up ${diff} points on the week before. You’re climbing.` };
  if (diff <= -5) return { icon: '🧭', text: `Your last 7 days averaged ${now}%, ${-diff} points below the week before. One strong day turns it around.` };
  return { icon: '⚖️', text: `Steady: your last two weeks both averaged about ${now}%. Consistency is how summits happen.` };
}

// 6. Most consistent habit
function consistencyInsight(days) {
  let best = null;
  choiceHabits().forEach((h) => {
    let scheduled = 0;
    let kept = 0;
    days.forEach((d) => {
      const k = keptOn(h, d);
      if (k === null) return;
      scheduled += 1;
      if (k) kept += 1;
    });
    if (scheduled < 10) return;
    const rate = kept / scheduled;
    if (!best || rate > best.rate) best = { h, rate, kept, scheduled };
  });
  if (!best || best.kept === 0) return null;
  return {
    icon: '🏅',
    text: `Your most consistent habit is ${best.h.name}: kept on ${best.kept} of ${best.scheduled} days.`,
  };
}

function renderInsights() {
  const el = document.getElementById('insights');
  const tracked = trackedDayCount();

  if (tracked < INSIGHTS_MIN_DAYS) {
    const left = INSIGHTS_MIN_DAYS - tracked;
    el.innerHTML = `
      <div class="card stack">
        <p><strong>Insights unlock after ${INSIGHTS_MIN_DAYS} days of tracking.</strong></p>
        <div class="progress" aria-hidden="true"><div class="progress__bar" style="--value: ${(tracked / INSIGHTS_MIN_DAYS) * 100}%"></div></div>
        <p class="muted">${tracked} ${tracked === 1 ? 'day' : 'days'} so far, ${left} to go. Keep logging and your patterns will show up here.</p>
      </div>`;
    return;
  }

  // Finished days from the last 8 weeks
  const to = addDays(today, -1);
  const from = [addDays(today, -56), startDate].sort()[1];
  const days = isoRange(from, to).map(dayInfo).filter((d) => counts(d) && d.tracked);

  const found = [
    studyLiftInsight(days),
    foodDayInsight(from, to),
    nextDayInsight(days),
    weekdayInsight(days),
    momentumInsight(days),
    consistencyInsight(days),
  ].filter(Boolean).slice(0, 5);

  if (!found.length) {
    el.innerHTML = '<p class="muted">No clear patterns yet. They’ll appear as your days add up.</p>';
    return;
  }
  el.innerHTML = `
    <ul class="insight-list">
      ${found.map((f) => `
        <li class="tile insight">
          <span class="insight__icon" aria-hidden="true">${f.icon}</span>
          <p class="insight__text">${escapeHTML(f.text)}</p>
        </li>`).join('')}
    </ul>`;
}


/* ---------- Start ---------- */

async function init() {
  today = todayISO();
  const profile = getProfile() || {};
  startDate = [profile.onboardedOn, profile.createdOn].filter(isValidISO).sort()[0] || today;
  habits = await loadHabits();
  await loadCategories();

  // Early in a week or month, review the one that just finished
  if (daysBetween(weekStartOf(today), today) < 2) weekStart = addDays(weekStartOf(today), -7);
  if (Number(today.slice(8)) <= 3) reportMonth = prevMonth(monthOf(today));
  if (weekStart < weekStartOf(startDate)) weekStart = weekStartOf(today);
  if (reportMonth < monthOf(startDate)) reportMonth = monthOf(today);

  renderSky();
  renderDayPanel();
  renderInsights();
  renderWeek();
  renderMonth();
  renderReflections();
}

init();
