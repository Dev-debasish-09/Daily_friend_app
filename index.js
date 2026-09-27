/* =========================================================
   index.js — Today: summit hero, daily score, checklist, markers.
   boolean  = one tap
   count    = − / + stepper
   duration = +15 / +30 / +60 quick buttons, or Custom minutes
   Score rules live in shared.js (dayScore). The sun rises with the score;
   Day Won (all non-negotiables kept + score >= 80%) bursts into gold rays.
   Saves each change to ascend:logs:YYYY-MM (via shared.js).
   ========================================================= */

const profile = getProfile() || {};
const userName = firstName(profile.name);

const listEl = document.getElementById('checklist');
const heroEl = document.getElementById('hero');

let today = todayISO();
let habits = [];
let dayLog = {};
let streaks = {};               // habit id -> { count, keptToday }, refreshed each render
const openCustom = new Set();   // habit ids whose Custom panel is open

const GROUPS = [
  { priority: 'non-negotiable', title: 'Non-negotiables' },
  { priority: 'important', title: 'Important' },
  { priority: 'bonus', title: 'Bonus' },
];

const QUICK_MINUTES = [15, 30, 60];

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const FLAME_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 2 1.3 3 2.5 3.2C11 9 11 6 12 3z"/></svg>';


/* ---------- Small helpers ---------- */

// Today's entry for a habit, always with a numeric value
function entryFor(habitId) {
  const saved = dayLog[habitId] || {};
  return { ...saved, value: Number(saved.value) || 0 };
}

// Habits with a target today (e.g. Office Work is off on weekends)
function scheduledHabits() {
  return habits.filter((h) => habitTarget(h, today) > 0);
}

function currentScore() {
  return dayScore(habits, dayLog, today);
}

function unitLabel(habit, n) {
  if (!habit.unit) return '';
  if (n === 1) return habit.unit;
  return habit.unitPlural || `${habit.unit}s`;
}

// "1h 30m of 4h 30m", "1 of 3 problems", "Done today"
function progressText(habit, entry, target) {
  const minOnly = habit.minimum && entry.min && entry.value < target;
  let text;
  if (habit.type === 'duration') text = `${formatMinutes(entry.value)} of ${formatMinutes(target)}`;
  else if (habit.type === 'count') text = `${entry.value} of ${target} ${unitLabel(habit, target)}`.trim();
  else text = entry.value ? 'Done today' : 'Tap when done';
  return minOnly ? `Minimum kept (50%) · ${text}` : text;
}


/* ---------- Checklist rows ---------- */

// "4-day streak" (only shown once there is one; a gap is never called out)
function streakHTML(habit) {
  const s = streaks[habit.id];
  if (!s || s.count < 1) return '';
  const text = s.keptToday ? `${s.count}-day streak` : `${s.count}-day streak · keep it going`;
  return `<span class="habit__streak">${FLAME_SVG}${text}</span>`;
}

function headHTML(habit, entry, target) {
  return `
    <span class="habit__head">
      <span class="habit__check" aria-hidden="true">${CHECK_SVG}</span>
      <span class="habit__text">
        <span class="habit__name">${habit.emoji ? `<span class="habit__emoji" aria-hidden="true">${escapeHTML(habit.emoji)}</span>` : ''}${escapeHTML(habit.name)}</span>
        <span class="habit__progress">${escapeHTML(progressText(habit, entry, target))}</span>
        ${streakHTML(habit)}
      </span>
    </span>`;
}

function rowHTML(habit) {
  const target = habitTarget(habit, today);
  const entry = entryFor(habit.id);
  const id = escapeHTML(habit.id);
  const name = escapeHTML(habit.name);
  const color = `--habit-color: ${habitColorCSS(habit)}`;   // coloured stripe on the row

  // Pine check when fully done, gold check when only the minimum was kept
  let stateClass = '';
  if (isHabitDone(habit, entry, target)) stateClass = ' is-done';
  else if (isHabitKept(habit, entry, target)) stateClass = ' is-kept';

  // Yes/no: the whole row is one toggle button
  if (habit.type === 'boolean') {
    return `
      <li>
        <button type="button" class="habit habit--toggle tile${stateClass}" data-habit="${id}" style="${color}"
          data-action="toggle" data-focus-key="${id}:toggle" aria-pressed="${entry.value > 0}">
          ${headHTML(habit, entry, target)}
        </button>
      </li>`;
  }

  // "Did the minimum" button for duration and count habits that have one
  const minimum = habit.minimum ? `
    <button type="button" class="chip-btn chip-btn--gold" data-action="min" data-focus-key="${id}:min"
      aria-pressed="${Boolean(entry.min)}">Did the minimum: ${escapeHTML(habit.minimum)}</button>` : '';

  let actions = '';

  if (habit.type === 'count') {
    const unit = escapeHTML(habit.unit || '');
    actions = `
      <div class="habit__actions">
        <div class="stepper" role="group" aria-label="${name}">
          <button type="button" class="stepper__btn" data-action="dec" data-focus-key="${id}:dec"
            aria-label="Remove one${unit ? ` ${unit}` : ''}"${entry.value <= 0 ? ' aria-disabled="true"' : ''}>−</button>
          <span class="stepper__value" aria-live="polite">${entry.value}</span>
          <button type="button" class="stepper__btn" data-action="inc" data-focus-key="${id}:inc"
            aria-label="Add one${unit ? ` ${unit}` : ''}">+</button>
        </div>
        ${minimum}
      </div>`;
  }

  if (habit.type === 'duration') {
    const pct = Math.min(100, (entry.value / target) * 100);
    const open = openCustom.has(habit.id);
    const quick = QUICK_MINUTES.map((m) => `
      <button type="button" class="chip-btn" data-action="add" data-minutes="${m}"
        data-focus-key="${id}:add:${m}" aria-label="Add ${m} minutes to ${name}">+${m}</button>`).join('');

    actions = `
      <div class="progress" aria-hidden="true"><div class="progress__bar" style="--value: ${pct}%"></div></div>
      <div class="habit__actions">
        ${quick}
        <button type="button" class="chip-btn" data-action="custom" data-focus-key="${id}:custom"
          aria-expanded="${open}" aria-controls="custom-${id}">Custom</button>
        ${minimum}
      </div>
      <form class="habit__custom" id="custom-${id}" data-custom-for="${id}" novalidate${open ? '' : ' hidden'}>
        <div class="field">
          <label class="label" for="custom-input-${id}">Minutes</label>
          <input class="input" id="custom-input-${id}" type="text" inputmode="numeric"
            autocomplete="off" placeholder="e.g. 45">
        </div>
        <div class="grid-2">
          <button class="btn btn--primary" type="submit" value="add">Add minutes</button>
          <button class="btn btn--secondary" type="submit" value="set">Set as total</button>
        </div>
      </form>`;
  }

  return `<li class="habit tile${stateClass}" data-habit="${id}" style="${color}">${headHTML(habit, entry, target)}${actions}</li>`;
}


/* ---------- Rendering ---------- */

// Redraw list + hero. Keeps keyboard focus on the same button, pops a row that just got done.
// riseIn: true on page load, so the sun rises from the horizon (the page's one load moment).
function render({ justDoneId = null, focusKey = null, riseIn = false } = {}) {
  const keepFocus = focusKey || (document.activeElement && document.activeElement.dataset.focusKey);
  const scheduled = scheduledHabits();

  // Streaks read past months from storage once per render
  const readDay = makeLogReader();
  streaks = {};
  scheduled.forEach((h) => { streaks[h.id] = habitStreak(h, readDay, today); });
  const wins = winStreak(habits, readDay, today);

  const groupsHTML = GROUPS.map((group) => {
    const items = scheduled.filter((h) => habitPriority(h) === group.priority);
    if (!items.length) return '';
    return `
      <section class="stack" aria-labelledby="g-${group.priority}">
        <h2 class="group-title" id="g-${group.priority}">${group.title}</h2>
        <ul class="checklist">${items.map(rowHTML).join('')}</ul>
      </section>`;
  }).join('');

  // Active habits that simply rest today (archived ones stay out of sight)
  const off = habits.filter((h) => isHabitActiveOn(h, today) && habitTarget(h, today) === 0);
  const offHTML = off.length
    ? `<p class="muted">Off today: ${off.map((h) => escapeHTML(h.name)).join(', ')}. Enjoy the space.</p>`
    : '';

  listEl.innerHTML = groupsHTML + offHTML;

  if (justDoneId) {
    const row = listEl.querySelector(`[data-habit="${CSS.escape(justDoneId)}"]`);
    if (row) row.classList.add('just-done');
  }
  if (keepFocus) {
    const el = listEl.querySelector(`[data-focus-key="${CSS.escape(keepFocus)}"]`);
    if (el) el.focus();
  }

  const result = currentScore();
  if (riseIn) {
    // Paint the sun at the horizon first, then let the transition lift it
    requestAnimationFrame(() => requestAnimationFrame(() => renderHero(result, wins)));
  } else {
    renderHero(result, wins);
  }
}

// Win streak line. count only includes today once today is won.
function winStreakText({ count, todayStatus }) {
  if (todayStatus === 'won') {
    return count === 1 ? 'First day won. A streak begins.' : `${count} days won in a row. Proud of you.`;
  }
  const days = count === 1 ? '1 day won' : `${count} days won`;
  if (count === 0) {
    return todayStatus === 'kept'
      ? 'Non-negotiables kept. Reach 80% to start a win streak.'
      : 'Win today to start a streak.';
  }
  if (todayStatus === 'kept') return `${days} in a row. Kept alive today. Reach 80% to make it ${count + 1}.`;
  return `${days} in a row. Win today to make it ${count + 1}.`;
}

// 12 gold rays around the sun (hidden until Day Won)
function drawRays() {
  const cx = 180;
  const cy = 44;
  let shapes = '';
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const length = i % 2 === 0 ? 80 : 64;          // alternate long and short rays
    const point = (angle, r) => `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
    shapes += `<polygon points="${point(a - 0.09, 32)} ${point(a, length)} ${point(a + 0.09, 32)}"/>`;
  }
  document.getElementById('rays').innerHTML = shapes;
}

function renderHero(result, wins) {
  const { score, done, kept, total, nonNegKept, won } = result;
  document.getElementById('win-streak-text').textContent = winStreakText(wins);

  heroEl.style.setProperty('--score', (score / 100).toFixed(3));
  heroEl.classList.toggle('is-won', won);
  document.getElementById('score').textContent = `${score}%`;
  document.getElementById('won-badge').hidden = !won;
  document.getElementById('day-type').textContent = isWeekend(today) ? 'Weekend targets' : 'Weekday targets';

  // Describe the picture for screen readers
  document.getElementById('summit-label').textContent = won
    ? 'Day won: a full gold sunrise over the summit'
    : score === 0
      ? 'The sun is still below the horizon'
      : `The sun is ${score}% of the way up over the summit`;

  const minOnly = kept - done;
  document.getElementById('done-summary').textContent =
    `${done} of ${total} done${minOnly > 0 ? ` · ${minOnly} minimum kept` : ''}`;

  let message;
  if (score === 0 && kept === 0) message = 'Fresh climb today. One small step counts.';
  else if (won) message = 'Day won. The summit is yours.';
  else if (nonNegKept) message = `Non-negotiables kept. ${DAY_WON_SCORE - score}% more for a Day Won.`;
  else message = `${total - kept} to go. Keep climbing.`;
  document.getElementById('summary-message').textContent = message;
}


/* ---------- Saving a change ---------- */

// Merge changes into today's entry, save, redraw, celebrate.
// Returns true if something worth celebrating happened.
function updateEntry(habit, changes, { focusKey = null } = {}) {
  const target = habitTarget(habit, today);
  const before = entryFor(habit.id);
  const wasDone = isHabitDone(habit, before, target);
  const wasKept = isHabitKept(habit, before, target);
  const wasWon = currentScore().won;

  const next = { ...before, ...changes };
  const toSave = next.value > 0 || next.min
    ? { value: next.value, ...(next.min ? { min: true } : {}) }
    : null;   // nothing logged -> remove the entry

  const day = saveHabitEntry(today, habit.id, toSave);
  if (!day) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return false;
  }
  dayLog = day;

  const improved = (isHabitDone(habit, next, target) && !wasDone)
    || (isHabitKept(habit, next, target) && !wasKept);
  const result = currentScore();
  const justWon = result.won && !wasWon;

  render({ justDoneId: improved ? habit.id : null, focusKey });

  if (justWon) dayWon(result);
  else if (improved) celebrate(habit, next, target, result);
  return improved || justWon;
}

// A habit was completed (or its minimum kept): small confetti, buzz, proud words
function celebrate(habit, entry, target, result) {
  const check = listEl.querySelector(`[data-habit="${CSS.escape(habit.id)}"] .habit__check`);
  if (check) {
    const r = check.getBoundingClientRect();
    confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 26, power: 0.8 });
  }

  const minOnly = entry.min && entry.value < target;
  haptic(minOnly ? 15 : [20, 40, 20]);

  let message;
  if (habitPriority(habit) === 'non-negotiable' && result.nonNegKept) {
    message = `All non-negotiables kept. ${DAY_WON_SCORE - result.score}% more for a Day Won.`;
  } else if (minOnly) {
    message = `Minimum kept for ${habit.name}. The chain holds.`;
  } else if (habit.type === 'duration') {
    message = `${habit.name} done: ${formatMinutes(entry.value)}. Proud of you!`;
  } else {
    message = `${habit.name} done. Nice work!`;
  }
  showToast(message, { type: 'success' });
}

// The big one: bring the summit into view, burst the rays, big confetti, long buzz
function dayWon(result) {
  const reduced = prefersReducedMotion();
  heroEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

  setTimeout(() => {
    heroEl.classList.remove('is-bursting');
    void heroEl.offsetWidth;                      // restart the burst animation
    heroEl.classList.add('is-bursting');

    const sun = heroEl.querySelector('.sun-core').getBoundingClientRect();
    confetti({ x: sun.left + sun.width / 2, y: sun.top + sun.height / 2, count: 140, power: 1.4 });
    haptic([40, 60, 40, 60, 160]);
  }, reduced ? 0 : 450);

  const { count } = winStreak(habits, makeLogReader(), today);
  const streakLine = count > 1 ? ` ${count} days won in a row.` : ' This is how 30 gets built.';
  showToast(`Day won! ${result.score}% and every non-negotiable kept.${streakLine}`,
    { type: 'success', duration: 4500 });
}


/* ---------- Taps ---------- */

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const habit = habits.find((h) => h.id === btn.closest('[data-habit]').dataset.habit);
  if (!habit) return;
  const entry = entryFor(habit.id);

  switch (btn.dataset.action) {
    case 'toggle':
      updateEntry(habit, { value: entry.value > 0 ? 0 : 1 });
      break;
    case 'inc':
      updateEntry(habit, { value: Math.min(99, entry.value + 1) });
      break;
    case 'dec':
      if (entry.value > 0) updateEntry(habit, { value: entry.value - 1 });
      break;
    case 'add':
      updateEntry(habit, { value: Math.min(1440, entry.value + Number(btn.dataset.minutes)) });
      break;
    case 'min':
      updateEntry(habit, { min: !entry.min });
      break;
    case 'custom': {
      const opening = !openCustom.has(habit.id);
      if (opening) openCustom.add(habit.id);
      else openCustom.delete(habit.id);
      render();
      if (opening) document.getElementById(`custom-input-${habit.id}`).focus();
      break;
    }
    default:
      break;
  }
});

// Custom minutes: "Add minutes" adds, "Set as total" replaces (fixes mistakes, 0 clears)
listEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const habit = habits.find((h) => h.id === form.dataset.customFor);
  if (!habit) return;

  const input = form.querySelector('input');
  const mode = e.submitter && e.submitter.value === 'set' ? 'set' : 'add';
  const text = input.value.trim();
  const minutes = Number(text);

  let error = '';
  if (!/^\d+$/.test(text)) error = 'Enter whole minutes, like 45.';
  else if (mode === 'add' && minutes === 0) error = 'Enter at least 1 minute.';
  else if (minutes > 1440) error = 'That’s more than a day. Try 1,440 or less.';
  if (error) {
    showFieldError(input, error);
    input.focus();
    return;
  }

  const value = mode === 'set' ? minutes : Math.min(1440, entryFor(habit.id).value + minutes);
  openCustom.delete(habit.id);
  const celebrated = updateEntry(habit, { value }, { focusKey: `${habit.id}:custom` });
  if (!celebrated) {
    showToast(mode === 'set'
      ? `${habit.name} set to ${formatMinutes(value)}.`
      : `Added ${formatMinutes(minutes)} to ${habit.name}.`, { type: 'info' });
  }
});


/* ---------- Header, countdowns, quote ---------- */

const LONG_DATE = { day: 'numeric', month: 'short', year: 'numeric' };

// Fill one countdown tile: "265 days" / "Today" / a gentle line once it has passed
function setCountdown(valueId, noteId, targetIso, { todayText, pastValue, pastNote }) {
  const days = daysBetween(today, targetIso);
  const value = document.getElementById(valueId);
  const note = document.getElementById(noteId);
  if (days > 0) {
    value.textContent = `${formatIndianNumber(days)} ${days === 1 ? 'day' : 'days'}`;
    note.textContent = formatDate(targetIso, LONG_DATE);
  } else if (days === 0) {
    value.textContent = 'Today';
    note.textContent = todayText;
  } else {
    value.textContent = pastValue;
    note.textContent = pastNote;
  }
}

function renderHeader() {
  document.getElementById('today-date').textContent =
    formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('hello').textContent = `${greeting()}, ${userName}`;

  if (isValidISO(profile.issExamDate)) {
    setCountdown('exam-days', 'exam-date', profile.issExamDate, {
      todayText: 'You’ve got this.',
      pastValue: 'Done',
      pastNote: 'Set your next exam date in Settings.',
    });
  }

  if (isValidISO(profile.dob)) {
    setCountdown('thirty-days', 'thirty-date', addYears(profile.dob, 30), {
      todayText: 'Happy 30th. Look how far you climbed.',
      pastValue: '30+',
      pastNote: 'Every year is a fresh climb.',
    });
  }
}

// Daily quote: same line all day, your own quotes about one day in three
async function renderQuote() {
  const quote = pickQuoteForDay(await loadQuotes(), getMyQuotes(), today);
  if (!quote) return;
  document.getElementById('quote-text').textContent = quote.text;
  document.getElementById('quote-label').textContent = quote.mine ? 'Your words, today' : 'Today’s line';
  document.getElementById('quote-card').hidden = false;
}


/* ---------- Start ---------- */

async function init() {
  renderHeader();
  drawRays();
  renderQuote();
  renderFood();

  habits = await loadHabits();
  if (!habits.length) {
    listEl.innerHTML = '<p class="muted">Couldn’t load your habits. Open the app through Live Server, then reload.</p>';
    return;
  }

  dayLog = getDayLog(today);
  render({ riseIn: true });

  // Welcome toast right after onboarding, then tidy the URL
  if (new URLSearchParams(location.search).has('welcome')) {
    showToast(`Welcome, ${userName}. Your climb starts today.`, { type: 'success' });
    history.replaceState(null, '', location.pathname);
  }
}

// Food delivery card (same as on Money); the meal cost is edited on Money
function renderFood() {
  renderFoodCard(document.getElementById('food-card'), {
    mealCostControl: '<a class="btn btn--ghost" href="money.html?edit=meal">Change home meal cost ({cost})</a>',
  });
}

// Quick-add an expense without leaving Today; the food card updates after
document.getElementById('fab-expense').addEventListener('click', () => openExpenseSheet({ onChange: renderFood }));

// If the app stays open past midnight, start the new day fresh
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayISO() !== today) {
    today = todayISO();
    dayLog = getDayLog(today);
    openCustom.clear();
    renderHeader();
    renderQuote();
    renderFood();
    render();
  }
});

init();
