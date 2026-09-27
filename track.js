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


/* ---------- Start ---------- */

function renderAll() {
  renderTimerCard();
  renderModePicker();
  renderHabitRows();
  renderTimeline();
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
