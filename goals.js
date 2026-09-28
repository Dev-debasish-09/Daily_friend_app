/* =========================================================
   goals.js — the Goals page.
   The trail: an SVG mountain path from age 24 to the summit
   at 30, four base camps (data/roadmap.json) and a climber
   for today. Goals with yearly / quarterly / monthly
   milestones, savings goals with "Add money", and a proud
   moment (saved to ascend:wins) when one is reached.
   ========================================================= */

let today = todayISO();
let roadmap = {};
let camps = [];                       // roadmap camps with real start/end dates
let summitDate = today;
let data = { goals: [], savings: [] };
let habits = [];

const LEVELS = { year: 'Yearly', quarter: 'Quarterly', month: 'Monthly' };
const LEVEL_ORDER = ['year', 'quarter', 'month'];

const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';


/* ---------- Small helpers ---------- */

const numberText = (n) => formatIndianNumber(Math.max(0, Math.round(n)));

// "Jun 2027"
function monthYear(iso) {
  return formatDate(iso, { month: 'short', year: 'numeric' });
}

// "31 Oct 2026"
function longDate(iso) {
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Open/close a bottom sheet (same pattern as Money)
function openSheet(dialog, focusEl) {
  document.body.style.overflow = 'hidden';
  dialog.showModal();
  focusEl.focus();
}

document.querySelectorAll('dialog.sheet').forEach((dialog) => {
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
});

// Two taps to confirm a delete button
function confirmTap(btn, label, confirmLabel) {
  if (btn.classList.contains('is-confirming')) return true;
  btn.classList.add('is-confirming');
  btn.textContent = confirmLabel;
  setTimeout(() => resetConfirm(btn, label), 4000);
  return false;
}

function resetConfirm(btn, label) {
  btn.classList.remove('is-confirming');
  btn.textContent = label;
}

function persist() {
  if (saveGoals(data)) return true;
  showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
  return false;
}


/* ---------- Climb timeline ----------
   The climb runs from your 24th birthday (or today, if that's later)
   to your 30th birthday. Each camp runs until the day before the next. */

function buildCamps() {
  const profile = getProfile() || {};
  const list = Array.isArray(roadmap.camps) ? roadmap.camps : [];
  const last = list[list.length - 1] || {};

  let start = today;
  summitDate = last.to || addYears(today, 6);
  if (isValidISO(profile.dob)) {
    start = [addYears(profile.dob, 24), today].sort()[0];
    summitDate = addYears(profile.dob, 30);
  }

  return list.map((camp, i) => {
    const from = i === 0 ? start : camp.from;
    const next = list[i + 1];
    const end = next ? addDays(next.from, -1) : summitDate;
    return { ...camp, start: from, end: end < from ? from : end };
  });
}

// Index of the camp you're in today; camps.length once you've reached the summit
function currentCampIndex(iso = today) {
  const i = camps.findIndex((c) => iso <= c.end);
  return i === -1 ? camps.length : i;
}

// 0 at the start, 1 at the summit. Each camp gets an equal stretch of trail
// (so short camps aren't squashed); within it you move with the calendar.
function climbFraction(iso = today) {
  const n = camps.length;
  if (!n || iso < camps[0].start) return 0;
  const i = currentCampIndex(iso);
  if (i >= n) return 1;
  const c = camps[i];
  const span = daysBetween(c.start, c.end) + 1;
  return (i + daysBetween(c.start, iso) / span) / n;
}


/* ---------- The trail SVG ---------- */

// Switchbacks up the near mountain, ending at the peak (240, 34)
const TRAIL_POINTS = [[34, 266], [250, 236], [120, 190], [272, 150], [174, 118], [252, 84], [240, 40]];

// Smooth curve through the points (Catmull-Rom turned into cubic Béziers)
function smoothPath(pts) {
  const r = (n) => Math.round(n * 10) / 10;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function renderTrail() {
  const art = document.getElementById('trail-art');
  const trailD = smoothPath(TRAIL_POINTS);
  const campIndex = currentCampIndex();
  const fraction = climbFraction();
  const where = campIndex >= camps.length
    ? 'You have reached the summit'
    : `You are at Camp ${camps[campIndex].number}, ${Math.round(fraction * 100)}% of the way up`;

  art.innerHTML = `
    <svg class="trail" viewBox="0 0 360 280" role="img" aria-labelledby="trail-label" focusable="false">
      <title id="trail-label">Trail from age 24 to the summit at 30. ${where}.</title>
      <defs>
        <linearGradient id="trail-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="sky-top"/>
          <stop offset="1" class="sky-bottom"/>
        </linearGradient>
        <radialGradient id="trail-glow">
          <stop offset="0" class="glow-in"/>
          <stop offset="1" class="glow-out"/>
        </radialGradient>
      </defs>

      <rect width="360" height="280" fill="url(#trail-sky)"/>
      <circle class="summit-glow" cx="240" cy="34" r="90" fill="url(#trail-glow)"/>

      <path class="range-far" d="M0 280V200l50-22 46 8 44-46 40 10 40-40 40 18 40-32 40 24 20-8v168z"/>
      <path class="range-near" d="M0 280V232l58-26 50-54 42-32 50-50 40-36 44 52 38 26 38 36v132z"/>
      <path class="snow" d="M240 34l16 19-8-3-7 6-8-7-7 2z"/>

      <!-- Summit flag -->
      <path class="flag-pole" d="M240 34V10"/>
      <path class="flag" d="M240 10l18 5-18 6z"/>

      <!-- Trail: dashed ahead, gold where you've walked -->
      <path class="trail-path" id="trail-path" d="${trailD}"/>
      <path class="trail-walked" id="trail-walked" d="${trailD}"/>

      <g id="camp-markers"></g>

      <g class="climber" id="climber">
        <rect class="climber-tag" x="-17" y="-34" width="34" height="18" rx="9"/>
        <text class="climber-tag-text" x="0" y="-21.5" text-anchor="middle">You</text>
        <circle class="climber-dot" r="10"/>
        <circle class="climber-core" r="3.5"/>
      </g>
    </svg>`;

  const path = document.getElementById('trail-path');
  const walked = document.getElementById('trail-walked');
  const climber = document.getElementById('climber');
  const total = path.getTotalLength();
  const n = camps.length || 1;

  // Camp markers: an equal stretch of trail each, numbered 1-4
  document.getElementById('camp-markers').innerHTML = camps.map((camp, i) => {
    const p = path.getPointAtLength((i / n) * total);
    const reached = i <= campIndex;
    return `<g class="camp-marker${reached ? ' is-reached' : ''}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
      <circle class="camp-dot" r="9"/>
      <text class="camp-num" y="4" text-anchor="middle">${camp.number}</text>
    </g>`;
  }).join('');

  // Put the climber (and the gold walked line) at a fraction of the trail
  function place(f) {
    const len = f * total;
    const p = path.getPointAtLength(len);
    climber.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    walked.style.strokeDasharray = `${len} ${total}`;
  }

  document.getElementById('trail-card').style.setProperty('--climb', fraction.toFixed(3));

  // The page's one load moment: you walk up to today's spot
  if (prefersReducedMotion() || fraction <= 0) {
    place(fraction);
    return;
  }
  const duration = 1400;
  const started = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - t) ** 3;
    place(fraction * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  place(0);
  requestAnimationFrame(frame);
}

function renderTrailText() {
  const campIndex = currentCampIndex();
  const fraction = climbFraction();
  const profile = getProfile() || {};

  if (isValidISO(profile.dob)) {
    document.getElementById('age-line').textContent = `Age ${ageOn(profile.dob)} · summit at 30`;
  }
  document.getElementById('climb-bar').style.setProperty('--value', `${(fraction * 100).toFixed(1)}%`);

  const title = document.getElementById('h-trail');
  const sub = document.getElementById('trail-sub');
  const nextLabel = document.getElementById('next-label');
  const nextDays = document.getElementById('next-days');
  const nextDate = document.getElementById('next-date');

  if (!camps.length) {
    title.textContent = 'Your climb';
    sub.textContent = 'Couldn’t load the roadmap. Check your connection and reload.';
    return;
  }

  if (campIndex >= camps.length) {
    title.textContent = 'You reached the summit';
    sub.textContent = 'Six years of climbing. Look how far you came.';
    nextLabel.textContent = 'Camps reached';
    nextDays.textContent = `${camps.length} of ${camps.length}`;
    nextDate.textContent = 'Every one of them';
  } else {
    const camp = camps[campIndex];
    const next = camps[campIndex + 1];
    title.textContent = `You’re at Camp ${camp.number}: ${camp.title}`;
    sub.textContent = `${Math.round(fraction * 100)}% of the way up. Every day on the trail counts.`;
    const target = next ? next.start : summitDate;
    const days = Math.max(0, daysBetween(today, target));
    nextLabel.textContent = next ? `To Camp ${next.number}` : 'Last stretch';
    nextDays.textContent = `${numberText(days)} ${days === 1 ? 'day' : 'days'}`;
    nextDate.textContent = next ? `${next.title} · ${longDate(next.start)}` : 'Then the summit';
  }

  const toSummit = Math.max(0, daysBetween(today, summitDate));
  document.getElementById('summit-days').textContent = `${numberText(toSummit)} ${toSummit === 1 ? 'day' : 'days'}`;
  document.getElementById('summit-date').textContent = isValidISO(profile.dob)
    ? longDate(summitDate)
    : 'Add your birthday in Settings';
}


/* ---------- Base camps list ---------- */

function renderCamps() {
  const campIndex = currentCampIndex();
  const list = document.getElementById('camp-list');
  list.innerHTML = camps.map((camp, i) => {
    const isCurrent = i === campIndex;
    const isPast = i < campIndex;
    const from = i === 0 ? 'Start' : monthYear(camp.start);
    const to = i === camps.length - 1 ? 'age 30' : monthYear(camp.end);
    let badge = '';
    if (isCurrent) badge = '<span class="badge badge--gold">You’re here</span>';
    else if (isPast) badge = '<span class="badge badge--pine">Reached</span>';

    return `
      <li class="tile camp${isCurrent ? ' is-current' : ''}${i <= campIndex ? ' is-reached' : ''}">
        <div class="camp__head">
          <span class="camp__num" aria-hidden="true">${camp.number}</span>
          <div class="camp__text">
            <h3 class="camp__title">Camp ${camp.number}: ${escapeHTML(camp.title)}</h3>
            <p class="camp__dates">${from} to ${to}</p>
            ${badge}
          </div>
        </div>
        <ul class="camp__focus">
          ${(camp.focus || []).map((f) => `<li>${escapeHTML(f)}</li>`).join('')}
        </ul>
      </li>`;
  }).join('');
}


/* ---------- Goals + milestones ---------- */

function findCamp(id) {
  return camps.find((c) => c.id === id) || null;
}

function findGoal(id) {
  return data.goals.find((g) => g.id === id) || null;
}

// Goal progress = average of its milestones
function goalProgress(goal) {
  const list = goal.milestones || [];
  if (!list.length) return 0;
  return Math.round(list.reduce((s, m) => s + (Number(m.progress) || 0), 0) / list.length);
}

// Small ring: progress arc, or a pine check when done
function ringSVG(progress, done) {
  if (done) {
    return `<svg class="ms-ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle class="ms-ring__done" cx="20" cy="20" r="18"/>
      <path class="ms-ring__check" d="M13 20.5l4.5 4.5L27 15.5"/>
    </svg>`;
  }
  return `<svg class="ms-ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <circle class="ms-ring__track" cx="20" cy="20" r="16"/>
    ${progress > 0 ? `<circle class="ms-ring__fill" cx="20" cy="20" r="16" pathLength="100"
      stroke-dasharray="${progress} 100" transform="rotate(-90 20 20)"/>` : ''}
  </svg>`;
}

// One line under the milestone name: date, habit, streak. Never shaming.
function milestoneMeta(ms, readDay) {
  const parts = [];
  if (ms.doneOn) parts.push(`Done ${formatDate(ms.doneOn, { day: 'numeric', month: 'short', year: 'numeric' })}`);
  else if (ms.targetDate < today) parts.push('Target date passed. Pick a fresh one?');
  else parts.push(`By ${longDate(ms.targetDate)}`);

  const habit = ms.habitId ? habits.find((h) => h.id === ms.habitId) : null;
  if (habit) {
    const { count } = habitStreak(habit, readDay, today);
    const streak = count > 0 ? ` · ${count}-day streak` : '';
    parts.push(`${habit.emoji ? `${habit.emoji} ` : ''}${habit.name}${streak}`);
  }
  return parts.join(' · ');
}

function milestoneRowHTML(goal, ms, readDay) {
  const done = Boolean(ms.doneOn);
  const progress = Number(ms.progress) || 0;
  const meta = milestoneMeta(ms, readDay);
  const label = `Edit ${ms.title}, ${LEVELS[ms.level] || ''}, ${done ? 'complete' : `${progress}%`}, ${meta}`;
  return `
    <li>
      <button class="ms-row${done ? ' is-done' : ''}" type="button" data-goal="${escapeHTML(goal.id)}" data-ms="${escapeHTML(ms.id)}" aria-label="${escapeHTML(label)}">
        ${ringSVG(progress, done)}
        <span class="ms-row__text">
          <span class="ms-row__name">${escapeHTML(ms.title)}</span>
          <span class="ms-row__meta">${escapeHTML(meta)}</span>
        </span>
        <span class="ms-row__pct">${done ? 'Done' : `${progress}%`}</span>
      </button>
    </li>`;
}

function goalCardHTML(goal, readDay) {
  const camp = findCamp(goal.campId);
  const pct = goalProgress(goal);
  const list = goal.milestones || [];
  const doneCount = list.filter((m) => m.doneOn).length;
  const headingId = `goal-${goal.id}`;

  // Yearly, then quarterly, then monthly; open ones first, then by date
  const groups = LEVEL_ORDER.map((level) => {
    const items = list
      .filter((m) => m.level === level)
      .sort((a, b) => (Boolean(a.doneOn) - Boolean(b.doneOn)) || a.targetDate.localeCompare(b.targetDate));
    if (!items.length) return '';
    return `
      <div class="stack">
        <h4 class="level-title">${LEVELS[level]}</h4>
        <ul class="ms-list">${items.map((m) => milestoneRowHTML(goal, m, readDay)).join('')}</ul>
      </div>`;
  }).join('');

  let summary = 'No milestones yet. Break this goal into steps you can finish.';
  if (list.length) {
    summary = doneCount === list.length
      ? `All ${list.length} milestones done. Goal complete.`
      : `${doneCount} of ${list.length} ${list.length === 1 ? 'milestone' : 'milestones'} done`;
  }

  return `
    <article class="card goal" aria-labelledby="${headingId}">
      <div class="goal__head">
        <div class="stack-tight">
          <p class="eyebrow">${camp ? `Camp ${camp.number} · ${escapeHTML(camp.title)}` : 'No camp'}</p>
          <h3 id="${headingId}">${escapeHTML(goal.title)}</h3>
        </div>
        <button class="icon-btn" type="button" data-edit-goal="${escapeHTML(goal.id)}" aria-label="Edit goal ${escapeHTML(goal.title)}">${PENCIL_SVG}</button>
      </div>
      <div class="goal__bar">
        <div class="progress" aria-hidden="true"><div class="progress__bar" style="--value: ${pct}%"></div></div>
        <span class="goal__pct">${pct}%</span>
      </div>
      <p class="muted">${summary}</p>
      ${groups}
      <button class="btn btn--secondary btn--block" type="button" data-add-ms="${escapeHTML(goal.id)}">Add milestone</button>
    </article>`;
}

function renderGoals() {
  const listEl = document.getElementById('goal-list');
  const campOrder = (g) => {
    const i = camps.findIndex((c) => c.id === g.campId);
    return i === -1 ? camps.length : i;
  };
  const goals = [...data.goals].sort((a, b) => campOrder(a) - campOrder(b));

  if (!goals.length) {
    listEl.innerHTML = '<p class="muted">No goals yet. Add one for the camp you’re climbing now.</p>';
  } else {
    const readDay = makeLogReader();
    listEl.innerHTML = goals.map((g) => goalCardHTML(g, readDay)).join('');
  }

  // Summary: done so far, and what's due this month
  const all = data.goals.flatMap((g) => g.milestones || []);
  const done = all.filter((m) => m.doneOn).length;
  const dueThisMonth = all.filter((m) => !m.doneOn && monthOf(m.targetDate) === monthOf(today)).length;
  let text = all.length ? `${done} of ${all.length} milestones done.` : '';
  if (dueThisMonth) text += ` ${dueThisMonth} due this month.`;
  document.getElementById('goals-summary').textContent = text.trim();
}


/* ---------- Goal sheet ---------- */

const goalSheet = document.getElementById('goal-sheet');
const gName = document.getElementById('g-name');
const gCamp = document.getElementById('g-camp');
const gDelete = document.getElementById('g-delete');
const G_DELETE_LABEL = 'Delete goal';
let editingGoal = null;

function openGoal(goal = null) {
  editingGoal = goal;
  showFieldError(gName, '');
  document.getElementById('goal-title').textContent = goal ? 'Edit goal' : 'Add goal';
  gCamp.innerHTML = camps.map((c) => `<option value="${escapeHTML(c.id)}">Camp ${c.number}: ${escapeHTML(c.title)}</option>`).join('');
  gName.value = goal ? goal.title : '';
  const current = camps[Math.min(currentCampIndex(), camps.length - 1)];
  gCamp.value = goal ? goal.campId : (current ? current.id : '');
  gDelete.hidden = !goal;
  resetConfirm(gDelete, G_DELETE_LABEL);
  openSheet(goalSheet, goal ? document.getElementById('goal-title') : gName);
}

document.getElementById('add-goal').addEventListener('click', () => openGoal());

document.getElementById('goal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = gName.value.trim().replace(/\s+/g, ' ');
  if (!title) {
    showFieldError(gName, 'Name your goal, like “Clear the ISS exam”.');
    gName.focus();
    return;
  }

  if (editingGoal) {
    editingGoal.title = title;
    editingGoal.campId = gCamp.value;
  } else {
    data.goals.push({ id: newId('g'), title, campId: gCamp.value, createdOn: today, milestones: [] });
  }
  if (!persist()) return;
  goalSheet.close();
  renderGoals();
  showToast(editingGoal ? 'Goal updated.' : `“${title}” added. Now break it into milestones.`, { type: 'success' });
});

gDelete.addEventListener('click', () => {
  if (!editingGoal) return;
  const count = (editingGoal.milestones || []).length;
  const confirmText = count ? `Tap again to delete it and ${count} ${count === 1 ? 'milestone' : 'milestones'}` : 'Tap again to delete';
  if (!confirmTap(gDelete, G_DELETE_LABEL, confirmText)) return;
  data.goals = data.goals.filter((g) => g.id !== editingGoal.id);
  if (!persist()) return;
  goalSheet.close();
  renderGoals();
  showToast(`Deleted “${editingGoal.title}”. Your Wins from it stay.`, { type: 'info' });
});


/* ---------- Milestone sheet ---------- */

const msSheet = document.getElementById('ms-sheet');
const msForm = document.getElementById('ms-form');
const msName = document.getElementById('ms-name');
const msDate = document.getElementById('ms-date');
const msProgress = document.getElementById('ms-progress');
const msProgressValue = document.getElementById('ms-progress-value');
const msHabit = document.getElementById('ms-habit');
const msComplete = document.getElementById('ms-complete');
const msDelete = document.getElementById('ms-delete');
const MS_DELETE_LABEL = 'Delete milestone';
let editingMs = null;          // { goal, ms } (ms null when adding)
let msDateTouched = false;     // stop auto-filling the date once you pick one

// Default target: end of this month / quarter / year
function defaultTargetDate(level) {
  const y = today.slice(0, 4);
  const m = Number(today.slice(5, 7));
  if (level === 'year') return `${y}-12-31`;
  const endMonth = level === 'quarter' ? Math.ceil(m / 3) * 3 : m;
  const ym = `${y}-${String(endMonth).padStart(2, '0')}`;
  return `${ym}-${daysInMonth(`${ym}-01`)}`;
}

function selectedLevel() {
  return (msForm.querySelector('input[name="ms-level"]:checked') || {}).value || 'month';
}

function showProgressValue() {
  msProgressValue.textContent = `${msProgress.value}%`;
}

function openMilestone(goal, ms = null) {
  editingMs = { goal, ms };
  msDateTouched = Boolean(ms);
  [msName, msDate].forEach((input) => showFieldError(input, ''));
  document.getElementById('ms-title').textContent = ms ? 'Edit milestone' : 'Add milestone';
  document.getElementById('ms-goal-name').textContent = `For: ${goal.title}`;

  const level = ms ? ms.level : 'month';
  msForm.querySelectorAll('input[name="ms-level"]').forEach((input) => { input.checked = input.value === level; });
  msName.value = ms ? ms.title : '';
  msDate.value = ms ? ms.targetDate : defaultTargetDate(level);
  msProgress.value = ms ? Number(ms.progress) || 0 : 0;
  showProgressValue();

  const active = habits.filter((h) => !h.archived || h.id === (ms && ms.habitId));
  msHabit.innerHTML = '<option value="">None</option>' + active
    .map((h) => `<option value="${escapeHTML(h.id)}">${escapeHTML(`${h.emoji ? `${h.emoji} ` : ''}${h.name}`)}</option>`).join('');
  msHabit.value = (ms && ms.habitId) || '';

  msComplete.hidden = Boolean(ms && ms.doneOn);
  msDelete.hidden = !ms;
  resetConfirm(msDelete, MS_DELETE_LABEL);
  openSheet(msSheet, ms ? document.getElementById('ms-title') : msName);
}

msProgress.addEventListener('input', showProgressValue);
msDate.addEventListener('change', () => { msDateTouched = true; });
msForm.addEventListener('change', (e) => {
  if (e.target.name === 'ms-level' && !msDateTouched) msDate.value = defaultTargetDate(e.target.value);
});

// Save the sheet. forceComplete = the "Mark complete" button.
function saveMilestone(forceComplete = false) {
  [msName, msDate].forEach((input) => showFieldError(input, ''));
  const title = msName.value.trim().replace(/\s+/g, ' ');
  const targetDate = msDate.value;
  let bad = null;
  if (!title) { showFieldError(msName, 'Name the milestone, like “Solve 30 DSA problems”.'); bad = bad || msName; }
  if (!isValidISO(targetDate)) { showFieldError(msDate, 'Pick a target date.'); bad = bad || msDate; }
  if (bad) {
    bad.focus();
    return;
  }

  const { goal, ms: existing } = editingMs;
  const progress = forceComplete ? 100 : Number(msProgress.value);
  const wasDone = Boolean(existing && existing.doneOn);
  const isDone = progress >= 100;

  const ms = existing || { id: newId('m'), doneOn: null };
  Object.assign(ms, {
    title,
    level: selectedLevel(),
    targetDate,
    progress,
    habitId: msHabit.value || null,
    doneOn: isDone ? (ms.doneOn || today) : null,
  });
  if (!existing) goal.milestones = [...(goal.milestones || []), ms];
  if (!persist()) return;

  msSheet.close();
  renderGoals();

  if (isDone && !wasDone) {
    addWin({ type: 'milestone', title: ms.title, detail: goal.title, sourceId: ms.id });
    celebrate({
      eyebrow: 'Milestone reached',
      title: ms.title,
      text: `${goal.title} is now ${goalProgress(goal)}% done. You said you’d do it, and you did.`,
    });
  } else if (!isDone && wasDone) {
    removeWinFor(ms.id);
    showToast(`“${ms.title}” is open again at ${progress}%.`, { type: 'info' });
  } else {
    showToast(existing ? `Saved. ${ms.title}: ${progress}%.` : `Milestone added to ${goal.title}.`, { type: 'success' });
  }
}

msForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveMilestone();
});
msComplete.addEventListener('click', () => saveMilestone(true));

msDelete.addEventListener('click', () => {
  const { goal, ms } = editingMs || {};
  if (!ms || !confirmTap(msDelete, MS_DELETE_LABEL, 'Tap again to delete')) return;
  goal.milestones = goal.milestones.filter((m) => m.id !== ms.id);
  if (!persist()) return;
  msSheet.close();
  renderGoals();
  showToast(`Deleted “${ms.title}”.`, { type: 'info' });
});

// Taps inside the goal list: edit goal, add milestone, open a milestone
document.getElementById('goal-list').addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-edit-goal]');
  if (editBtn) {
    const goal = findGoal(editBtn.dataset.editGoal);
    if (goal) openGoal(goal);
    return;
  }
  const addBtn = e.target.closest('[data-add-ms]');
  if (addBtn) {
    const goal = findGoal(addBtn.dataset.addMs);
    if (goal) openMilestone(goal);
    return;
  }
  const row = e.target.closest('[data-ms]');
  if (row) {
    const goal = findGoal(row.dataset.goal);
    const ms = goal && (goal.milestones || []).find((m) => m.id === row.dataset.ms);
    if (ms) openMilestone(goal, ms);
  }
});


/* ---------- Savings goals ---------- */

function findSavings(id) {
  return data.savings.find((s) => s.id === id) || null;
}

function savingsPct(sv) {
  return sv.target > 0 ? Math.min(100, Math.floor((sv.saved / sv.target) * 100)) : 0;
}

// Months from today until a date, counting this month (at least 1)
function monthsUntil(iso) {
  const months = (Number(iso.slice(0, 4)) - Number(today.slice(0, 4))) * 12
    + (Number(iso.slice(5, 7)) - Number(today.slice(5, 7)));
  return Math.max(1, months + 1);
}

function savingsNote(sv) {
  const left = sv.target - sv.saved;
  if (left <= 0) return 'Fully funded. This is what discipline looks like.';
  const base = `${savingsPct(sv)}% there · ${formatAmount(left)} to go.`;
  if (!sv.targetDate) return base;
  if (sv.targetDate < today) return `${base} Target date passed. Pick a fresh one when you’re ready.`;
  const perMonth = Math.ceil(left / monthsUntil(sv.targetDate));
  return `${base} ${formatAmount(perMonth)} a month gets you there by ${monthYear(sv.targetDate)}.`;
}

function renderSavings() {
  const listEl = document.getElementById('savings-list');
  if (!data.savings.length) {
    listEl.innerHTML = '<p class="muted">No savings goals yet. An emergency fund is a strong first one.</p>';
    return;
  }
  listEl.innerHTML = data.savings.map((sv) => {
    const done = sv.saved >= sv.target;
    const pct = savingsPct(sv);
    const headingId = `sv-${sv.id}`;
    return `
      <article class="card savings${done ? ' is-done' : ''}" aria-labelledby="${headingId}">
        <div class="goal__head">
          <h3 id="${headingId}"><span aria-hidden="true">${escapeHTML(sv.emoji || '🎯')}</span> ${escapeHTML(sv.name)}</h3>
          <button class="icon-btn" type="button" data-edit-sv="${escapeHTML(sv.id)}" aria-label="Edit ${escapeHTML(sv.name)}">${PENCIL_SVG}</button>
        </div>
        <p class="savings__amount">
          <span class="savings__value">${formatAmount(sv.saved)}</span>
          <span class="muted">of ${formatAmount(sv.target)}</span>
        </p>
        ${meterHTML(sv.saved, sv.target, done ? 'amber' : 'normal')}
        <p class="meter__note is-normal">${done ? LEVEL_ICONS.normal : ''}<span>${escapeHTML(savingsNote(sv))}</span></p>
        <button class="btn btn--primary btn--block" type="button" data-deposit="${escapeHTML(sv.id)}">Add money</button>
      </article>`;
  }).join('');
}

// Savings list taps: edit or add money
document.getElementById('savings-list').addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit-sv]');
  if (edit) {
    const sv = findSavings(edit.dataset.editSv);
    if (sv) openSavings(sv);
    return;
  }
  const dep = e.target.closest('[data-deposit]');
  if (dep) {
    const sv = findSavings(dep.dataset.deposit);
    if (sv) openDeposit(sv);
  }
});

function celebrateSavings(sv) {
  // One win per target, so raising the target later can be won again
  addWin({ type: 'savings', title: `${sv.name} fully funded`, detail: formatAmount(sv.target), sourceId: `${sv.id}:${sv.target}` });
  celebrate({
    eyebrow: 'Savings goal reached',
    title: `${sv.name}: ${formatAmount(sv.target)}`,
    text: 'Every rupee you set aside got you here. Future you says thank you.',
  });
}

// After money is added: celebrate the target, or cheer a quarter mark
function afterSavingsGrew(sv, before) {
  if (sv.saved >= sv.target && before < sv.target) {
    celebrateSavings(sv);
    return;
  }
  const quarter = (n) => Math.floor((n / sv.target) * 4);
  const mark = quarter(sv.saved);
  if (sv.target > 0 && mark > quarter(before) && mark > 0) {
    const words = { 1: 'A quarter of the way', 2: 'Halfway', 3: 'Three quarters of the way' }[mark];
    showToast(`${words} to your ${sv.name}. ${formatAmount(sv.target - sv.saved)} to go.`, { type: 'success', duration: 3600 });
  } else {
    showToast(`Added to ${sv.name}. ${savingsPct(sv)}% there now.`, { type: 'success' });
  }
}


/* ---------- Savings goal sheet ---------- */

const svSheet = document.getElementById('sv-sheet');
const svName = document.getElementById('sv-name');
const svTarget = document.getElementById('sv-target');
const svSaved = document.getElementById('sv-saved');
const svDate = document.getElementById('sv-date');
const svDelete = document.getElementById('sv-delete');
const SV_DELETE_LABEL = 'Delete savings goal';
let editingSv = null;

[svTarget, svSaved].forEach(bindAmountInput);

function openSavings(sv = null) {
  editingSv = sv;
  [svName, svTarget, svSaved, svDate].forEach((input) => showFieldError(input, ''));
  document.getElementById('sv-title').textContent = sv ? 'Edit savings goal' : 'Add savings goal';
  svName.value = sv ? sv.name : '';
  svTarget.value = sv ? formatIndianNumber(sv.target) : '';
  svSaved.value = formatIndianNumber(sv ? sv.saved : 0);
  svDate.value = (sv && sv.targetDate) || '';
  svDelete.hidden = !sv;
  resetConfirm(svDelete, SV_DELETE_LABEL);
  openSheet(svSheet, sv ? document.getElementById('sv-title') : svName);
}

document.getElementById('add-savings').addEventListener('click', () => openSavings());

document.getElementById('sv-form').addEventListener('submit', (e) => {
  e.preventDefault();
  [svName, svTarget, svSaved, svDate].forEach((input) => showFieldError(input, ''));
  const name = svName.value.trim().replace(/\s+/g, ' ');
  const target = parseAmount(svTarget.value);
  const saved = svSaved.value.trim() ? parseAmount(svSaved.value) : 0;
  const date = svDate.value;
  let bad = null;
  if (!name) { showFieldError(svName, 'Name it, like “Emergency fund”.'); bad = bad || svName; }
  if (target === null || target <= 0) { showFieldError(svTarget, 'Enter a target, like 3,00,000.'); bad = bad || svTarget; }
  else if (target > 1000000000) { showFieldError(svTarget, 'That looks too big. Check the zeros.'); bad = bad || svTarget; }
  if (saved === null) { showFieldError(svSaved, 'Enter an amount, or 0.'); bad = bad || svSaved; }
  if (date && !isValidISO(date)) { showFieldError(svDate, 'Pick a date, or leave it empty.'); bad = bad || svDate; }
  if (bad) {
    bad.focus();
    return;
  }

  const wasFunded = Boolean(editingSv) && editingSv.saved >= editingSv.target;
  const sv = editingSv || { id: newId('sv'), emoji: '🎯', deposits: [], createdOn: today };
  Object.assign(sv, { name, target, saved, targetDate: date || null });
  if (!editingSv) data.savings.push(sv);
  if (!persist()) return;

  svSheet.close();
  renderSavings();
  // Reaching the target by correcting the total still deserves the moment
  if (saved >= target && !wasFunded) celebrateSavings(sv);
  else showToast(editingSv ? `${name} updated.` : `${name} added. Tap Add money when you set some aside.`, { type: 'success' });
});

svDelete.addEventListener('click', () => {
  if (!editingSv || !confirmTap(svDelete, SV_DELETE_LABEL, `Tap again to delete ${editingSv.name}`)) return;
  data.savings = data.savings.filter((s) => s.id !== editingSv.id);
  if (!persist()) return;
  svSheet.close();
  renderSavings();
  showToast(`Deleted ${editingSv.name}.`, { type: 'info' });
});


/* ---------- Add money sheet ---------- */

const depSheet = document.getElementById('dep-sheet');
const depAmount = document.getElementById('dep-amount');
const depDate = document.getElementById('dep-date');
const depNote = document.getElementById('dep-note');
let depositTo = null;

bindAmountInput(depAmount);

function openDeposit(sv) {
  depositTo = sv;
  [depAmount, depDate].forEach((input) => showFieldError(input, ''));
  document.getElementById('dep-title').textContent = `Add money to ${sv.name}`;
  document.getElementById('dep-status').textContent = `${formatAmount(sv.saved)} of ${formatAmount(sv.target)} saved so far.`;
  depAmount.value = '';
  depDate.max = today;
  depDate.value = today;
  depNote.value = '';
  openSheet(depSheet, depAmount);
}

document.getElementById('dep-form').addEventListener('submit', (e) => {
  e.preventDefault();
  [depAmount, depDate].forEach((input) => showFieldError(input, ''));
  const amount = parseAmount(depAmount.value);
  const date = depDate.value;
  let bad = null;
  if (amount === null || amount <= 0) { showFieldError(depAmount, 'Enter an amount, like 10,000.'); bad = bad || depAmount; }
  else if (amount > 100000000) { showFieldError(depAmount, 'That looks too big. Check the zeros.'); bad = bad || depAmount; }
  if (!isValidISO(date) || date > today) { showFieldError(depDate, 'Pick today or an earlier date.'); bad = bad || depDate; }
  if (bad) {
    bad.focus();
    return;
  }

  const sv = depositTo;
  const before = sv.saved;
  const rounded = Math.round(amount * 100) / 100;
  sv.saved = Math.round((sv.saved + rounded) * 100) / 100;
  sv.deposits = [{ id: newId('d'), amount: rounded, date, note: depNote.value.trim().replace(/\s+/g, ' ') }, ...(sv.deposits || [])];
  if (!persist()) {
    sv.saved = before;
    sv.deposits = sv.deposits.slice(1);
    return;
  }
  depSheet.close();
  renderSavings();
  haptic(15);
  afterSavingsGrew(sv, before);
});


/* ---------- Proud moment ---------- */

// The shared gold card (shared.js), then any badge or level-up this unlocked
function celebrate({ eyebrow, title, text }) {
  proudMoment({ eyebrow, title, text, flag: eyebrow.startsWith('Savings') ? 'var(--success)' : 'var(--accent)' });
  checkProgress();
}


/* ---------- Start ---------- */

async function init() {
  today = todayISO();
  const [loadedRoadmap, loadedGoals, loadedHabits] = await Promise.all([loadRoadmap(), loadGoals(), loadHabits()]);
  roadmap = loadedRoadmap;
  data = loadedGoals;
  habits = loadedHabits;
  camps = buildCamps();

  renderTrailText();
  renderCamps();
  if (camps.length) renderTrail();
  renderGoals();
  renderSavings();
}

init();
