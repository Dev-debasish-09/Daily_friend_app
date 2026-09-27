/* =========================================================
   track.js — timers for duration habits, day strip, past entries.

   The running timer lives in ascend:timer as timestamps, so it keeps
   counting while the app is closed:
   { habitId, mode, status: running|paused|break|ready, startedAt,
     segStart, phaseMs, carryMs, loggedMs, rounds, breakStart }

   Each finished stretch (pause, pomodoro round, stop) is saved right away:
   a session in ascend:sessions:YYYY-MM + its minutes on the habit's log.
   Leftover seconds carry over; 30s or more rounds up when you stop.
   ========================================================= */

const MODES = {
  free: { hint: 'Free runs until you stop it.' },
  '50/10': { focus: 50, rest: 10, hint: '50 minutes of focus, then a 10-minute break.' },
  '25/5': { focus: 25, rest: 5, hint: '25 minutes of focus, then a 5-minute break.' },
};

const PX_PER_HOUR = 36;              // day strip scale (25-min blocks get a label)
const MAX_MANUAL_MINUTES = 16 * 60;

let today = todayISO();
let habits = [];
let timer = loadTimer();
let lastStripMinute = -1;

const timerCard = document.getElementById('timer-card');
const timerActions = document.getElementById('timer-actions');
const discardBtn = document.getElementById('discard-btn');
const clockEl = document.getElementById('clock');
const trackList = document.getElementById('track-list');
const sessionList = document.getElementById('session-list');


/* ---------- Timer state ---------- */

function loadTimer() {
  const saved = getData('timer', null);
  return saved && typeof saved === 'object' && saved.habitId && saved.status ? saved : null;
}

function saveTimer() {
  if (timer) setData('timer', timer);
  else removeData('timer');
}

function findHabit(id) {
  return habits.find((h) => h.id === id);
}

// Duration habits still being tracked (archived ones can't be timed)
function timeableHabits() {
  return habits.filter((h) => h.type === 'duration' && isHabitActiveOn(h, today));
}

function currentMode() {
  const mode = getSettings().timerMode;
  return MODES[mode] ? mode : 'free';
}

function focusMs() {
  const m = MODES[timer.mode];
  return m && m.focus ? m.focus * 60000 : 0;
}

function restMs() {
  const m = MODES[timer.mode];
  return m && m.rest ? m.rest * 60000 : 0;
}

function runningMs(now) {
  return timer.status === 'running' ? now - timer.segStart : 0;
}

function isDoneToday(habit) {
  return Boolean(habit) && isHabitDone(habit, getDayLog(today)[habit.id], habitTarget(habit, today));
}

// 65000 -> "1:05", 3725000 -> "1:02:05"
function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}


/* ---------- Saving time ---------- */

// End the running stretch at `end`: save a session and add whole minutes to the log
function closeSegment(end) {
  const start = timer.segStart;
  const ms = Math.max(0, end - start);
  timer.segStart = null;
  timer.phaseMs += ms;
  if (ms < 1000) return;

  addSession({ id: newId('s'), habitId: timer.habitId, start, end, source: 'timer' });

  const total = ms + (timer.carryMs || 0);
  const minutes = Math.floor(total / 60000);
  timer.carryMs = total % 60000;
  timer.loggedMs += ms;
  if (minutes) addHabitMinutes(toISODate(new Date(start)), timer.habitId, minutes);
}

// Confetti from `anchor` (or the middle of the screen if it's hidden)
function celebrateDone(habit, anchor = timerCard) {
  const r = anchor.getBoundingClientRect();
  const visible = r.width > 0;
  confetti({
    x: visible ? r.left + r.width / 2 : window.innerWidth / 2,
    y: visible ? r.top + Math.min(40, r.height / 2) : window.innerHeight / 3,
    count: 30,
    power: 0.9,
  });
  haptic([20, 40, 20]);
  showToast(`${habit.name} done for today. Proud of you!`, { type: 'success' });
}


/* ---------- Timer actions ---------- */

function startTimer(habitId) {
  let savedNote = '';
  if (timer) {
    if (timer.habitId === habitId) return;
    savedNote = finishTimer({ quiet: true });   // save the current one first
  }
  const now = Date.now();
  timer = {
    habitId,
    mode: currentMode(),
    status: 'running',
    startedAt: now,
    segStart: now,
    phaseMs: 0,
    carryMs: 0,
    loggedMs: 0,
    rounds: 0,
    breakStart: null,
  };
  saveTimer();
  haptic(15);
  renderAll();
  showToast(`${savedNote}Timer started for ${findHabit(habitId).name}.`, { type: 'info' });
  focusAction('pause');
}

// Stop and save. quiet: return a short note instead of showing a toast.
function finishTimer({ quiet = false } = {}) {
  const habit = findHabit(timer.habitId);
  const wasDone = isDoneToday(habit);
  const now = Date.now();

  if (timer.status === 'running') closeSegment(now);
  if (timer.carryMs >= 30000) addHabitMinutes(today, timer.habitId, 1);   // round up the last bit

  const total = Math.round(timer.loggedMs / 60000);
  const name = habit ? habit.name : 'this habit';
  timer = null;
  saveTimer();

  if (quiet) return total > 0 ? `Saved ${formatMinutes(total)} to ${name}. ` : '';

  renderAll();
  // Keep keyboard focus nearby: this habit's Start button
  const startBtn = habit && trackList.querySelector(`[data-start="${CSS.escape(habit.id)}"]`);
  if (startBtn) startBtn.focus();

  if (habit && !wasDone && isDoneToday(habit)) celebrateDone(habit, startBtn || trackList);
  else if (total > 0) showToast(`Saved ${formatMinutes(total)} to ${name}.`, { type: 'success' });
  else showToast('Under a minute, so nothing was added. Start again anytime.', { type: 'info' });
  return '';
}

function pauseTimer() {
  const habit = findHabit(timer.habitId);
  const wasDone = isDoneToday(habit);
  closeSegment(Date.now());
  timer.status = 'paused';
  saveTimer();
  renderAll();
  if (habit && !wasDone && isDoneToday(habit)) celebrateDone(habit);
  focusAction('resume');
}

function resumeTimer() {
  timer.status = 'running';
  timer.segStart = Date.now();
  saveTimer();
  renderAll();
  focusAction('pause');
}

// After a break (or skipping it): a fresh focus round
function nextRound() {
  timer.status = 'running';
  timer.segStart = Date.now();
  timer.phaseMs = 0;
  timer.breakStart = null;
  saveTimer();
  renderAll();
  focusAction('pause');
}

// Drop the stretch that's running now. Earlier rounds stay saved.
function discardTimer() {
  const kept = Math.floor(timer.loggedMs / 60000);
  timer = null;
  saveTimer();
  renderAll();
  showToast(kept > 0
    ? `Discarded this stretch. ${formatMinutes(kept)} from earlier stays saved.`
    : 'Discarded. Nothing was added.', { type: 'info' });
}

// Pomodoro: end a round when focus time is up, end a break when rest is up.
// Works from timestamps, so it catches up correctly after the app was closed.
function tick() {
  const now = Date.now();
  if (!timer) {
    // No timer: just keep the "now" line on the strip moving
    if (Math.floor(now / 60000) !== lastStripMinute) renderTimeline();
    return;
  }
  let changed = false;
  const focus = focusMs();

  if (timer.status === 'running' && focus && timer.phaseMs + runningMs(now) >= focus) {
    const habit = findHabit(timer.habitId);
    const wasDone = isDoneToday(habit);
    const endAt = timer.segStart + (focus - timer.phaseMs);
    closeSegment(endAt);
    timer.rounds += 1;
    timer.phaseMs = 0;
    timer.status = 'break';
    timer.breakStart = endAt;
    changed = true;
    haptic([30, 50, 30]);
    if (habit && !wasDone && isDoneToday(habit)) celebrateDone(habit);
    else showToast(`Round ${timer.rounds} done. Take a ${MODES[timer.mode].rest}-minute break.`, { type: 'success' });
  }

  if (timer.status === 'break' && now - timer.breakStart >= restMs()) {
    timer.status = 'ready';
    changed = true;
    haptic(20);
    showToast('Break’s over. Start the next round when you’re ready.', { type: 'info' });
  }

  if (changed) {
    saveTimer();
    renderAll();
  } else {
    updateClock(now);
  }
}


/* ---------- Rendering: timer card ---------- */

const ACTIONS = {
  pause: { label: 'Pause', cls: 'btn--secondary' },
  resume: { label: 'Resume', cls: 'btn--primary' },
  skip: { label: 'Skip break', cls: 'btn--secondary' },
  next: { label: 'Start next round', cls: 'btn--primary' },
};

function focusAction(name) {
  const btn = timerActions.querySelector(`[data-action="${name}"]`);
  if (btn) btn.focus();
}

function renderTimerCard() {
  if (!timer) {
    timerCard.hidden = true;
    document.title = 'Track · ASCEND';
    return;
  }

  const habit = findHabit(timer.habitId);
  timerCard.hidden = false;
  timerCard.style.setProperty('--habit-color', habit ? habitColorCSS(habit) : 'var(--accent)');
  document.getElementById('timer-habit').innerHTML = habit
    ? `${habit.emoji ? `<span class="timer-card__emoji" aria-hidden="true">${escapeHTML(habit.emoji)}</span>` : ''}${escapeHTML(habit.name)}`
    : 'Archived habit';

  // Main button depends on the state; "Stop and save" is always there
  const main = { running: 'pause', paused: 'resume', break: 'skip', ready: 'next' }[timer.status];
  const stopCls = timer.status === 'paused' || timer.status === 'ready' ? 'btn--secondary' : 'btn--primary';
  timerActions.innerHTML = `
    <button class="btn ${ACTIONS[main].cls}" type="button" data-action="${main}">${ACTIONS[main].label}</button>
    <button class="btn ${stopCls}" type="button" data-action="stop">Stop and save</button>`;

  const pomodoro = Boolean(focusMs());
  const status = {
    running: pomodoro ? `Focus · round ${timer.rounds + 1}` : `Running since ${formatTimeIST(timer.startedAt)}`,
    paused: 'Paused. Your time so far is saved.',
    break: `Break · round ${timer.rounds} done`,
    ready: 'Break’s over. Ready when you are.',
  }[timer.status];
  document.getElementById('timer-status').textContent = status;

  discardBtn.hidden = !(timer.status === 'running' || timer.status === 'paused');
  resetDiscard();
  updateClock(Date.now());
}

// Runs every second: clock, phase bar, tab title
function updateClock(now) {
  if (!timer) return;
  const focus = focusMs();
  let ms;
  let pct = null;

  if (timer.status === 'break') {
    ms = restMs() - (now - timer.breakStart);
    pct = (1 - ms / restMs()) * 100;
    ms = Math.ceil(ms / 1000) * 1000;                        // count down without showing 0:00 early
  } else if (timer.status === 'ready') {
    ms = 0;
  } else if (focus) {
    const elapsed = timer.phaseMs + runningMs(now);
    ms = Math.ceil((focus - elapsed) / 1000) * 1000;
    pct = (elapsed / focus) * 100;
  } else {
    ms = timer.loggedMs + runningMs(now);                   // free mode counts up
  }

  const clock = formatClock(ms);
  clockEl.textContent = clock;
  const bar = document.getElementById('phase-progress');
  bar.hidden = pct === null;
  if (pct !== null) document.getElementById('phase-bar').style.setProperty('--value', `${Math.min(100, pct)}%`);

  const habit = findHabit(timer.habitId);
  document.title = `${clock} · ${habit ? habit.name : 'Timer'}`;

  // Keep the live block and "now" line on the strip fresh (once a minute)
  const minute = Math.floor(now / 60000);
  if (minute !== lastStripMinute) renderTimeline();
}

function resetDiscard() {
  discardBtn.classList.remove('is-confirming');
  discardBtn.textContent = 'Discard this run';
}

timerActions.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || !timer) return;
  const action = btn.dataset.action;
  if (action === 'pause') pauseTimer();
  else if (action === 'resume') resumeTimer();
  else if (action === 'skip' || action === 'next') nextRound();
  else if (action === 'stop') finishTimer();
});

// Two taps so a stray tap never throws time away
discardBtn.addEventListener('click', () => {
  if (!timer) return;
  if (!discardBtn.classList.contains('is-confirming')) {
    discardBtn.classList.add('is-confirming');
    discardBtn.textContent = 'Tap again to discard the current stretch';
    setTimeout(resetDiscard, 4000);
    return;
  }
  discardTimer();
});


/* ---------- Rendering: mode picker ---------- */

function renderModePicker() {
  const mode = timer ? timer.mode : currentMode();
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    if (timer && btn.dataset.mode !== mode) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  });
  document.getElementById('mode-hint').textContent = timer
    ? 'The mode is set when a timer starts. Stop it to switch.'
    : MODES[mode].hint;
}

document.getElementById('mode-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn) return;
  if (timer) {
    showToast('Stop the current timer to switch modes.', { type: 'info' });
    return;
  }
  updateSettings({ timerMode: btn.dataset.mode });
  renderModePicker();
});


/* ---------- Rendering: habit rows ---------- */

function renderHabitRows() {
  const list = timeableHabits();
  const day = getDayLog(today);

  trackList.innerHTML = list.length ? list.map((habit) => {
    const id = escapeHTML(habit.id);
    const name = escapeHTML(habit.name);
    const value = Number((day[habit.id] || {}).value) || 0;
    const target = habitTarget(habit, today);
    const meta = target
      ? `${formatMinutes(value)} of ${formatMinutes(target)} today`
      : `${formatMinutes(value)} today · off today`;
    const running = timer && timer.habitId === habit.id;
    const control = running
      ? '<span class="badge">Timing now</span>'
      : `<button class="btn btn--primary" type="button" data-start="${id}" aria-label="Start timer for ${name}">Start</button>`;

    return `
      <li class="track-row tile" style="--habit-color: ${habitColorCSS(habit)}">
        <span class="track-row__text">
          <span class="track-row__name">${habit.emoji ? `${escapeHTML(habit.emoji)} ` : ''}${name}</span>
          <span class="track-row__meta">${meta}</span>
        </span>
        ${control}
      </li>`;
  }).join('') : '<li class="muted">No duration habits yet. Add one in Settings.</li>';
}

trackList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-start]');
  if (btn) startTimer(btn.dataset.start);
});


/* ---------- Rendering: day strip (SVG) ---------- */

function hourLabel(h) {
  const hour = h % 24;
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function renderTimeline() {
  const now = Date.now();
  lastStripMinute = Math.floor(now / 60000);
  const sessions = getDaySessions(today);

  // The stretch running right now shows as a dashed live block
  const blocks = sessions.map((s) => ({ ...s }));
  if (timer && timer.status === 'running' && toISODate(new Date(timer.segStart)) === today) {
    blocks.push({ habitId: timer.habitId, start: timer.segStart, end: now, live: true });
  }

  const startMin = (s) => minuteOfDayIST(s.start);
  const endMin = (s) => (toISODate(new Date(s.end)) === today ? minuteOfDayIST(s.end) : 1440);
  const nowMin = minuteOfDayIST(now);

  // Show 6 AM to midnight, stretching earlier if anything happened before 6
  const earliest = Math.min(6 * 60, nowMin, ...blocks.map(startMin));
  const firstHour = Math.floor(earliest / 60);
  const top = 12;
  const height = top + (24 - firstHour) * PX_PER_HOUR + 12;
  const y = (min) => top + ((min - firstHour * 60) / 60) * PX_PER_HOUR;

  let svg = '';

  // Hour lines, labels every 2 hours
  for (let h = firstHour; h <= 24; h += 1) {
    svg += `<line class="strip__hour-line" x1="48" x2="316" y1="${y(h * 60)}" y2="${y(h * 60)}"/>`;
    if ((h - firstHour) % 2 === 0 && h < 24) {
      svg += `<text class="strip__hour-label" x="42" y="${y(h * 60) + 4}" text-anchor="end">${hourLabel(h)}</text>`;
    }
  }

  // Session blocks: soft fill + solid stripe in the habit's colour
  blocks.forEach((s) => {
    const habit = findHabit(s.habitId) || { name: 'Habit', emoji: '' };
    const color = habitColorCSS(habit);
    const y1 = y(startMin(s));
    const h = Math.max(3, y(endMin(s)) - y1);
    const minutes = Math.max(1, Math.round((s.end - s.start) / 60000));
    const name = habit.name.length > 22 ? `${habit.name.slice(0, 21)}…` : habit.name;
    svg += `
      <rect class="${s.live ? 'strip__block-live' : 'strip__block-fill'}" x="56" y="${y1}" width="260" height="${h}" rx="6"
        style="fill: ${color}; stroke: ${color}"/>
      <rect x="56" y="${y1}" width="4" height="${h}" rx="2" style="fill: ${color}"/>`;
    if (h >= 14) {
      svg += `<text class="strip__block-label" x="68" y="${y1 + Math.min(14, h / 2 + 4)}">${escapeHTML(`${habit.emoji ? `${habit.emoji} ` : ''}${name} · ${formatMinutes(minutes)}${s.live ? ' so far' : ''}`)}</text>`;
    }
  });

  // "Now" line
  const ny = y(nowMin);
  svg += `
    <line class="strip__now-line" x1="48" x2="316" y1="${ny}" y2="${ny}"/>
    <circle class="strip__now-dot" cx="50" cy="${ny}" r="4"/>
    <text class="strip__now-label" x="316" y="${ny - 5}" text-anchor="end">Now ${escapeHTML(formatTimeIST(now))}</text>`;

  const total = sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
  const label = sessions.length
    ? `Today’s timeline: ${sessions.length} session${sessions.length === 1 ? '' : 's'}, ${formatMinutes(Math.round(total / 60000))} in total. Details are listed below.`
    : 'Today’s timeline is empty so far.';

  document.getElementById('strip-wrap').innerHTML = `
    <svg class="strip" viewBox="0 0 320 ${height}" role="img" aria-label="${escapeHTML(label)}" focusable="false">${svg}</svg>`;

  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  if (!sessions.length) {
    sessionList.innerHTML = '<li class="session-item muted">Nothing timed yet today. Start a timer when you’re ready.</li>';
    return;
  }
  sessionList.innerHTML = sessions.map((s) => {
    const habit = findHabit(s.habitId) || { name: 'Habit', emoji: '' };
    const minutes = Math.max(1, Math.round((s.end - s.start) / 60000));
    const source = s.source === 'manual' ? 'Added by hand' : 'Timer';
    return `
      <li class="session-item">
        <span class="session-item__text">
          <span class="session-item__main">${habit.emoji ? `${escapeHTML(habit.emoji)} ` : ''}${escapeHTML(habit.name)} · ${formatMinutes(minutes)}</span>
          <span class="session-item__meta">${formatTimeIST(s.start)} – ${formatTimeIST(s.end)} · ${source}</span>
        </span>
        <button class="btn btn--ghost" type="button" data-delete="${escapeHTML(s.id)}"
          aria-label="Delete ${escapeHTML(habit.name)} session from ${formatTimeIST(s.start)}">Delete</button>
      </li>`;
  }).join('');
}

// Delete a session (two taps): its minutes come off that day's log too
sessionList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;
  if (!btn.classList.contains('is-confirming')) {
    btn.classList.add('is-confirming');
    btn.textContent = 'Tap to confirm';
    setTimeout(() => {
      if (btn.isConnected) {
        btn.classList.remove('is-confirming');
        btn.textContent = 'Delete';
      }
    }, 4000);
    return;
  }

  const session = getDaySessions(today).find((s) => s.id === btn.dataset.delete);
  if (!session) return;
  const minutes = Math.round((session.end - session.start) / 60000);
  removeSession(today, session.id);
  addHabitMinutes(today, session.habitId, -minutes);
  renderAll();
  const habit = findHabit(session.habitId);
  showToast(`Session removed. ${formatMinutes(minutes)} came off ${habit ? habit.name : 'that habit'}.`, { type: 'info' });
});


/* ---------- Manual past entry ---------- */

const mForm = document.getElementById('manual-form');
const mHabit = document.getElementById('m-habit');
const mDate = document.getElementById('m-date');
const mFrom = document.getElementById('m-from');
const mTo = document.getElementById('m-to');
const mSummary = document.getElementById('m-summary');

const pad = (n) => String(n).padStart(2, '0');
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function fillManualForm() {
  mHabit.innerHTML = timeableHabits()
    .map((h) => `<option value="${escapeHTML(h.id)}">${h.emoji ? `${escapeHTML(h.emoji)} ` : ''}${escapeHTML(h.name)}</option>`)
    .join('');
  mDate.max = today;
  mDate.min = addDays(today, -365);
  mDate.value = today;

  // Default: the last 30 minutes, rounded to 5
  const nowMin = Math.floor(minuteOfDayIST(Date.now()) / 5) * 5;
  mTo.value = toHHMM(nowMin);
  mFrom.value = toHHMM(Math.max(0, nowMin - 30));
  updateManualSummary();
}

function manualMinutes() {
  if (!/^\d{2}:\d{2}$/.test(mFrom.value) || !/^\d{2}:\d{2}$/.test(mTo.value)) return null;
  const [fh, fm] = mFrom.value.split(':').map(Number);
  const [th, tm] = mTo.value.split(':').map(Number);
  return th * 60 + tm - (fh * 60 + fm);
}

function updateManualSummary() {
  const minutes = manualMinutes();
  mSummary.textContent = minutes > 0 ? `That’s ${formatMinutes(minutes)}.` : '';
}

[mFrom, mTo].forEach((input) => input.addEventListener('input', updateManualSummary));

mForm.addEventListener('submit', (e) => {
  e.preventDefault();
  [mHabit, mDate, mFrom, mTo].forEach((input) => showFieldError(input, ''));

  const habit = findHabit(mHabit.value);
  const date = mDate.value;
  const minutes = manualMinutes();
  let bad = null;
  const fail = (input, message) => {
    showFieldError(input, message);
    if (!bad) bad = input;
  };

  if (!habit) fail(mHabit, 'Pick a habit.');
  if (!isValidISO(date) || date > today) fail(mDate, 'Pick today or an earlier date.');
  else if (date < mDate.min) fail(mDate, 'Pick a date within the last year.');
  if (!mFrom.value) fail(mFrom, 'Pick a start time.');
  if (!mTo.value) fail(mTo, 'Pick an end time.');
  else if (minutes !== null && minutes <= 0) fail(mTo, 'End must be after the start.');
  else if (minutes > MAX_MANUAL_MINUTES) fail(mTo, 'Keep one entry under 16 hours.');

  const start = istTimeToEpoch(date, mFrom.value);
  const end = istTimeToEpoch(date, mTo.value);
  if (!bad && end > Date.now()) fail(mTo, 'That time hasn’t happened yet.');

  if (bad) {
    bad.focus();
    return;
  }

  const wasDone = isHabitDone(habit, getDayLog(date)[habit.id], habitTarget(habit, date));
  if (!addSession({ id: newId('s'), habitId: habit.id, start, end, source: 'manual' })) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }
  addHabitMinutes(date, habit.id, minutes);
  renderAll();

  const when = date === today ? 'today' : formatDate(date);
  if (date === today && !wasDone && isDoneToday(habit)) celebrateDone(habit, mForm);
  else showToast(`Added ${formatMinutes(minutes)} to ${habit.name} for ${when}.`, { type: 'success' });
});


/* ---------- Weekly view ----------
   Weeks run Monday to Sunday. Minutes come from the habit logs (timers,
   past entries and Today's +15 buttons all count). "This week so far" is
   compared with last week over the same days, so Wednesday meets Wednesday. */

const UP_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const DOWN_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';

const weekChart = document.getElementById('week-chart');
let weekRows = [];   // kept for the tooltip

// Monday of the week that contains `iso`
function weekStartOf(iso) {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

// Minutes per duration habit over `days` days from `fromIso`
function minutesByHabit(fromIso, days, readDay) {
  const totals = {};
  for (let i = 0; i < days; i += 1) {
    const day = readDay(addDays(fromIso, i));
    Object.entries(day).forEach(([id, entry]) => {
      const habit = findHabit(id);
      if (!habit || habit.type !== 'duration') return;
      totals[id] = (totals[id] || 0) + (Number(entry.value) || 0);
    });
  }
  return totals;
}

const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// "+3h 30m" / "−45m" / "same"
function signedMinutes(diff) {
  if (diff === 0) return 'same';
  return `${diff > 0 ? '+' : '−'}${formatMinutes(Math.abs(diff))}`;
}

function renderWeekly() {
  const readDay = makeLogReader();
  const thisStart = weekStartOf(today);
  const lastStart = addDays(thisStart, -7);
  const daysSoFar = daysBetween(thisStart, today) + 1;          // Mon = 1 ... Sun = 7
  const dayName = formatDate(today, { weekday: 'long' });

  const thisWeek = minutesByHabit(thisStart, daysSoFar, readDay);
  const lastSame = minutesByHabit(lastStart, daysSoFar, readDay);
  const lastFull = minutesByHabit(lastStart, 7, readDay);
  const totalThis = sumValues(thisWeek);
  const totalLastSame = sumValues(lastSame);
  const totalLastFull = sumValues(lastFull);

  document.getElementById('week-range').textContent =
    `${formatDate(thisStart, { weekday: 'short', day: 'numeric', month: 'short' })} – ${formatDate(addDays(thisStart, 6), { weekday: 'short', day: 'numeric', month: 'short' })}`;
  document.getElementById('week-total').textContent = formatMinutes(totalThis);
  document.getElementById('legend-last').textContent =
    daysSoFar === 7 ? 'Last week' : `Last week, Mon to ${formatDate(today, { weekday: 'short' })}`;

  // Comparison line: proud when up, gentle when down
  const delta = document.getElementById('week-delta');
  const diff = totalThis - totalLastSame;
  delta.className = 'week-delta';
  if (totalThis === 0 && totalLastSame === 0) {
    delta.textContent = 'A fresh week. Your first timer starts the climb.';
  } else if (totalLastSame === 0) {
    delta.classList.add('is-up');
    delta.innerHTML = `${UP_ARROW}<span>Nothing logged last week by ${dayName}, so every minute is a gain.</span>`;
  } else if (Math.abs(diff) < 5) {
    delta.textContent = `Level with last week by ${dayName}.`;
  } else if (diff > 0) {
    delta.classList.add('is-up');
    delta.innerHTML = `${UP_ARROW}<span>${formatMinutes(diff)} more than last week by ${dayName}. Proud of you.</span>`;
  } else {
    delta.classList.add('is-down');
    const ahead = daysSoFar === 7 ? 'A fresh week starts tomorrow.' : 'Fresh days ahead.';
    delta.innerHTML = `${DOWN_ARROW}<span>${formatMinutes(-diff)} less than last week by ${dayName}. ${ahead}</span>`;
  }
  document.getElementById('week-last-total').textContent =
    totalLastFull ? `Last week in total: ${formatMinutes(totalLastFull)}.` : '';

  // Rows: active duration habits, plus archived ones that have time in either week
  weekRows = habits
    .filter((h) => h.type === 'duration'
      && (isHabitActiveOn(h, today) || thisWeek[h.id] || lastSame[h.id]))
    .map((h) => ({ habit: h, now: thisWeek[h.id] || 0, before: lastSame[h.id] || 0 }))
    .sort((a, b) => b.now - a.now || b.before - a.before);

  const wrap = document.getElementById('week-chart-wrap');
  if (!weekRows.length || (totalThis === 0 && totalLastSame === 0)) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  drawWeekChart(dayName, daysSoFar);
  drawWeekTable(dayName, daysSoFar, totalThis, totalLastSame);
}

// Bar with a 4px rounded end on the right and a square end at the baseline
function barPath(x, y, w, h, r) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x} ${y}h${w - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - 2 * rr}a${rr} ${rr} 0 0 1 -${rr} ${rr}h-${w - rr}z`;
}

function rowSummary(row, dayName, daysSoFar) {
  const lastLabel = daysSoFar === 7 ? 'last week' : `last week by ${dayName}`;
  return `${row.habit.name}: ${formatMinutes(row.now)} this week, ${formatMinutes(row.before)} ${lastLabel} (${signedMinutes(row.now - row.before)}).`;
}

function drawWeekChart(dayName, daysSoFar) {
  const W = 320;
  const plotW = 236;          // leaves room for the value label at the bar tip
  const rowH = 56;
  const barH = 16;            // thin marks (<= 24px)
  const lastH = 4;
  const max = Math.max(60, ...weekRows.map((r) => Math.max(r.now, r.before)));
  const x = (min) => (min / max) * plotW;

  let rows = '';
  weekRows.forEach((row, i) => {
    const { habit } = row;
    const y0 = i * rowH;
    const yBar = y0 + 22;
    const yLast = yBar + barH + 3;
    const wNow = x(row.now);
    const name = habit.name.length > 30 ? `${habit.name.slice(0, 29)}…` : habit.name;

    rows += `
      <g class="row" tabindex="0" role="img" data-row="${i}" aria-label="${escapeHTML(rowSummary(row, dayName, daysSoFar))}">
        <rect class="row-hit" x="-4" y="${y0}" width="${W + 8}" height="${rowH - 6}" rx="10"/>
        <circle cx="5" cy="${y0 + 9}" r="5" style="fill: ${habitColorCSS(habit)}"/>
        <text class="row-name" x="16" y="${y0 + 14}">${escapeHTML(`${habit.emoji ? `${habit.emoji} ` : ''}${name}`)}</text>
        <path class="bar-this" d="${barPath(0, yBar, wNow, barH, 4)}"/>
        <text class="row-value" x="${wNow + 6}" y="${yBar + 12}">${formatMinutes(row.now)}</text>
        <path class="bar-last" d="${barPath(0, yLast, x(row.before), lastH, 2)}"/>
      </g>`;
  });

  weekChart.innerHTML = `
    <svg class="week-svg" viewBox="0 0 ${W} ${weekRows.length * rowH - 6}" role="group"
      aria-label="Hours per habit this week, compared with last week" focusable="false">${rows}</svg>
    <div class="chart-tip" id="chart-tip" hidden></div>`;
}

function drawWeekTable(dayName, daysSoFar, totalThis, totalLastSame) {
  const lastHead = daysSoFar === 7 ? 'Last week' : `Last week to ${formatDate(today, { weekday: 'short' })}`;
  const body = weekRows.map((r) => `
    <tr>
      <td>${escapeHTML(`${r.habit.emoji ? `${r.habit.emoji} ` : ''}${r.habit.name}`)}</td>
      <td>${formatMinutes(r.now)}</td>
      <td>${formatMinutes(r.before)}</td>
      <td>${signedMinutes(r.now - r.before)}</td>
    </tr>`).join('');

  document.getElementById('week-table').innerHTML = `
    <table class="data-table">
      <caption class="sr-only">Minutes per habit this week and last week</caption>
      <thead><tr><th scope="col">Habit</th><th scope="col">This week</th><th scope="col">${lastHead}</th><th scope="col">Change</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Total</td><td>${formatMinutes(totalThis)}</td><td>${formatMinutes(totalLastSame)}</td><td>${signedMinutes(totalThis - totalLastSame)}</td></tr></tfoot>
    </table>`;
}

// Tooltip on hover, tap or keyboard focus (never the only way to read a value)
function showTip(rowEl) {
  const tip = document.getElementById('chart-tip');
  if (!tip || !rowEl) return;
  const row = weekRows[Number(rowEl.dataset.row)];
  if (!row) return;

  weekChart.querySelectorAll('.row.is-active').forEach((el) => el.classList.remove('is-active'));
  rowEl.classList.add('is-active');

  const dayName = formatDate(today, { weekday: 'long' });
  const lastLabel = daysBetween(weekStartOf(today), today) === 6 ? 'Last week' : `Last week by ${dayName}`;
  tip.innerHTML = `
    <strong>${escapeHTML(row.habit.name)}</strong>
    This week: ${formatMinutes(row.now)}<br>
    ${lastLabel}: ${formatMinutes(row.before)}<br>
    Change: ${signedMinutes(row.now - row.before)}`;
  tip.hidden = false;

  // Sit just above the row, kept inside the card
  const wrapRect = weekChart.getBoundingClientRect();
  const rowRect = rowEl.getBoundingClientRect();
  const left = Math.min(Math.max(0, rowRect.left - wrapRect.left + 24), wrapRect.width - tip.offsetWidth);
  let top = rowRect.top - wrapRect.top - tip.offsetHeight - 6;
  if (top < -40) top = rowRect.bottom - wrapRect.top + 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTip() {
  const tip = document.getElementById('chart-tip');
  if (tip) tip.hidden = true;
  weekChart.querySelectorAll('.row.is-active').forEach((el) => el.classList.remove('is-active'));
}

weekChart.addEventListener('pointerover', (e) => showTip(e.target.closest('.row')));
weekChart.addEventListener('pointerleave', hideTip);
weekChart.addEventListener('focusin', (e) => showTip(e.target.closest('.row')));
weekChart.addEventListener('focusout', hideTip);


/* ---------- Start ---------- */

function renderAll() {
  renderTimerCard();
  renderModePicker();
  renderHabitRows();
  renderTimeline();
  renderWeekly();
}

async function init() {
  document.getElementById('today-date').textContent =
    formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' });

  habits = await loadHabits();
  fillManualForm();
  tick();          // catch up on anything that happened while the app was closed
  renderAll();
  setInterval(tick, 1000);
}

// Coming back to the app: catch up, and start fresh after midnight
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (todayISO() !== today) {
    today = todayISO();
    fillManualForm();
  }
  tick();
  renderAll();
});

init();
