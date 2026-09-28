/* =========================================================
   settings.js — edit profile details and theme.
   Profile -> ascend:profile, theme -> ascend:settings.
   ========================================================= */

const form = document.getElementById('profile-form');
const nameInput = document.getElementById('name');
const dobInput = document.getElementById('dob');
const examInput = document.getElementById('exam');
const examHint = document.getElementById('exam-hint');
const limitInput = document.getElementById('limit');

const today = todayISO();
let profile = getProfile() || {};

dobInput.max = today;
bindAmountInput(limitInput);


/* ---------- Fill the form with saved values ---------- */

function fillForm() {
  nameInput.value = profile.name || '';
  dobInput.value = profile.dob || '';
  examInput.value = profile.issExamDate || '';
  limitInput.value = Number.isFinite(profile.foodDeliveryLimit)
    ? formatIndianNumber(profile.foodDeliveryLimit)
    : '';
  // Only block past dates if the saved exam is still ahead
  examInput.min = profile.issExamDate && profile.issExamDate < today ? '' : today;
  updateExamHint();
}

function updateExamHint() {
  const exam = examInput.value;
  if (!isValidISO(exam)) {
    examHint.textContent = 'Check the UPSC calendar for the exact date.';
    return;
  }
  const days = daysBetween(today, exam);
  if (days > 0) examHint.textContent = `${formatIndianNumber(days)} days to go.`;
  else if (days === 0) examHint.textContent = 'Exam day is today. You’ve got this.';
  else examHint.textContent = 'This date has passed. Set your next exam date.';
}

examInput.addEventListener('change', updateExamHint);


/* ---------- Save ---------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();

  // A past exam date is fine only if it's the one already saved
  const ok = validateFields(
    [[nameInput, 'name'], [dobInput, 'dob'], [examInput, 'issExamDate'], [limitInput, 'foodDeliveryLimit']],
    { allowPastExam: examInput.value === profile.issExamDate },
  );
  if (!ok) return;

  const saved = saveProfile({
    name: nameInput.value.trim(),
    dob: dobInput.value,
    issExamDate: examInput.value,
    foodDeliveryLimit: Math.round(parseAmount(limitInput.value)),
  });

  if (!saved) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }

  profile = saved;
  fillForm();
  showToast('Saved. Your details are up to date.', { type: 'success' });
});


/* ---------- Theme ---------- */

function syncThemeButtons() {
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeChoice === getTheme()));
  });
}

document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = setTheme(btn.dataset.themeChoice);
    syncThemeButtons();
    showToast(name === 'night' ? 'Night theme on' : 'Dawn theme on', { type: 'info' });
  });
});


/* ---------- Your quotes (ascend:quotes) ---------- */

const QUOTE_MAX = 200;
const quoteForm = document.getElementById('quote-form');
const quoteInput = document.getElementById('quote-input');
const quoteCount = document.getElementById('quote-count');
const quoteList = document.getElementById('quote-list');

function renderQuoteList() {
  quoteList.replaceChildren();
  getMyQuotes().forEach((quote) => {
    const li = document.createElement('li');
    li.className = 'quote-item';

    const text = document.createElement('span');
    text.className = 'quote-item__text';
    text.textContent = quote.text;

    // Two taps to delete, so a stray tap never loses a quote
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--ghost';
    del.textContent = 'Delete';
    del.dataset.id = quote.id;
    del.setAttribute('aria-label', `Delete quote: ${quote.text}`);

    li.append(text, del);
    quoteList.appendChild(li);
  });
}

quoteInput.addEventListener('input', () => {
  quoteCount.textContent = `${quoteInput.value.length} of ${QUOTE_MAX} characters`;
});

quoteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = quoteInput.value.trim().replace(/\s+/g, ' ');
  if (!text) {
    showFieldError(quoteInput, 'Write a line first.');
    quoteInput.focus();
    return;
  }

  const list = getMyQuotes();
  if (list.some((q) => q.text.toLowerCase() === text.toLowerCase())) {
    showFieldError(quoteInput, 'You already saved this one.');
    quoteInput.focus();
    return;
  }

  // Unique id: time + a few random characters
  const id = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const saved = saveMyQuotes([...list, { id, text: text.slice(0, QUOTE_MAX), addedOn: today }]);
  if (!saved) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }

  quoteInput.value = '';
  quoteCount.textContent = `0 of ${QUOTE_MAX} characters`;
  renderQuoteList();
  showToast('Quote added. It will show up on Today.', { type: 'success' });
});

quoteList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;

  // First tap: ask. Second tap within 4s: delete.
  if (!btn.classList.contains('is-confirming')) {
    const label = btn.getAttribute('aria-label');
    btn.classList.add('is-confirming');
    btn.textContent = 'Tap to confirm';
    btn.setAttribute('aria-label', label.replace('Delete quote', 'Tap again to delete quote'));
    setTimeout(() => {
      if (btn.isConnected) {
        btn.classList.remove('is-confirming');
        btn.textContent = 'Delete';
        btn.setAttribute('aria-label', label);
      }
    }, 4000);
    return;
  }

  saveMyQuotes(getMyQuotes().filter((q) => q.id !== btn.dataset.id));
  renderQuoteList();
  quoteInput.focus();   // keep keyboard focus somewhere sensible
  showToast('Quote removed.', { type: 'info' });
});


/* ---------- Habits: add, edit, reorder, archive (ascend:habits) ----------
   Array order = order on Today. Archiving keeps every log; the habit just
   stops counting from its archivedOn date. */

const TYPE_LABELS = { duration: 'Duration', count: 'Count', boolean: 'Yes / no' };
const PRIORITY_LABELS = { 'non-negotiable': 'Non-negotiable', important: 'Important', bonus: 'Bonus' };
const EMOJI_PICKS = ['📚', '💼', '💪', '🧠', '💻', '📖', '🧘', '🏃', '🥗', '😴', '✍️', '💰'];
const TARGET_MAX = { duration: 1440, count: 99 };

const UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const DOWN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';

let habitList = [];
let editingId = null;   // null = adding a new habit

const habitListEl = document.getElementById('habit-list');
const archivedWrap = document.getElementById('archived-wrap');
const archivedListEl = document.getElementById('archived-list');
const habitStatus = document.getElementById('habit-status');

const sheet = document.getElementById('habit-sheet');
const habitForm = document.getElementById('habit-form');
const hbName = document.getElementById('hb-name');
const hbEmoji = document.getElementById('hb-emoji');
const hbUnit = document.getElementById('hb-unit');
const hbWeekday = document.getElementById('hb-weekday');
const hbWeekend = document.getElementById('hb-weekend');
const hbYesWeekday = document.getElementById('hb-yes-weekday');
const hbYesWeekend = document.getElementById('hb-yes-weekend');
const hbMinimum = document.getElementById('hb-minimum');
const hbPriority = document.getElementById('hb-priority');
const archiveBtn = document.getElementById('archive-btn');

function saveHabitList() {
  if (saveHabits(habitList)) return true;
  showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
  return false;
}

function activeHabits() {
  return habitList.filter((h) => !h.archived);
}

function findHabit(id) {
  return habitList.find((h) => h.id === id);
}


/* ----- Lists ----- */

function targetLabel(habit, which) {
  const t = Number(habit.target && habit.target[which]) || 0;
  if (!t) return 'off';
  if (habit.type === 'duration') return formatMinutes(t);
  if (habit.type === 'count') return String(t);
  return 'yes';
}

// "Duration · Weekdays 4h 30m · Weekends 12h · Non-negotiable"
function habitMeta(habit) {
  return [
    TYPE_LABELS[habit.type] || habit.type,
    `Weekdays ${targetLabel(habit, 'weekday')}`,
    `Weekends ${targetLabel(habit, 'weekend')}`,
    PRIORITY_LABELS[habitPriority(habit)],
  ].join(' · ');
}

function badgeHTML(habit) {
  return `<span class="habit-item__badge" style="--swatch: ${habitColorCSS(habit)}" aria-hidden="true">${escapeHTML(habit.emoji || '')}</span>`;
}

function renderHabitLists(focusKey = null) {
  const active = activeHabits();
  const archived = habitList.filter((h) => h.archived);

  habitListEl.innerHTML = active.length
    ? active.map((habit, i) => {
      const id = escapeHTML(habit.id);
      const name = escapeHTML(habit.name);
      return `
        <li class="habit-item">
          ${badgeHTML(habit)}
          <span class="habit-item__text">
            <span class="habit-item__name">${name}</span>
            <span class="habit-item__meta">${escapeHTML(habitMeta(habit))}</span>
          </span>
          <span class="habit-item__actions">
            <button class="icon-btn" type="button" data-move="-1" data-id="${id}" data-focus-key="up:${id}"
              aria-label="Move ${name} up"${i === 0 ? ' aria-disabled="true"' : ''}>${UP_SVG}</button>
            <button class="icon-btn" type="button" data-move="1" data-id="${id}" data-focus-key="down:${id}"
              aria-label="Move ${name} down"${i === active.length - 1 ? ' aria-disabled="true"' : ''}>${DOWN_SVG}</button>
            <button class="btn btn--secondary" type="button" data-edit="${id}" data-focus-key="edit:${id}"
              aria-label="Edit ${name}">Edit</button>
          </span>
        </li>`;
    }).join('')
    : '<li class="muted">No active habits. Add one to start climbing.</li>';

  archivedWrap.hidden = archived.length === 0;
  archivedListEl.innerHTML = archived.map((habit) => {
    const id = escapeHTML(habit.id);
    const name = escapeHTML(habit.name);
    const since = habit.archivedOn ? ` · since ${formatDate(habit.archivedOn, { day: 'numeric', month: 'short' })}` : '';
    return `
      <li class="habit-item">
        ${badgeHTML(habit)}
        <span class="habit-item__text">
          <span class="habit-item__name">${name}</span>
          <span class="habit-item__meta">Archived${since}</span>
        </span>
        <span class="habit-item__actions">
          <button class="btn btn--secondary" type="button" data-restore="${id}" data-focus-key="restore:${id}"
            aria-label="Restore ${name}">Restore</button>
        </span>
      </li>`;
  }).join('');

  if (focusKey) {
    const el = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
    if (el) el.focus();
  }
}

// Swap with the neighbouring active habit (archived ones keep their place)
function moveHabit(id, step) {
  const active = activeHabits();
  const from = active.findIndex((h) => h.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= active.length) return;

  const a = habitList.indexOf(active[from]);
  const b = habitList.indexOf(active[to]);
  [habitList[a], habitList[b]] = [habitList[b], habitList[a]];
  if (!saveHabitList()) return;

  renderHabitLists(`${step < 0 ? 'up' : 'down'}:${id}`);
  habitStatus.textContent = `${active[from].name} moved to position ${to + 1} of ${active.length}.`;
}

function restoreHabit(id) {
  const habit = findHabit(id);
  if (!habit) return;
  // The archived stretch becomes a pause, so it never breaks a streak
  const yesterday = addDays(today, -1);
  if (habit.archivedOn && habit.archivedOn <= yesterday) {
    habit.pauses = [...(habit.pauses || []), [habit.archivedOn, yesterday]];
  }
  delete habit.archived;
  delete habit.archivedOn;
  if (!saveHabitList()) return;
  renderHabitLists(`edit:${id}`);
  showToast(`${habit.name} is back on Today.`, { type: 'success' });
}

habitListEl.addEventListener('click', (e) => {
  const move = e.target.closest('[data-move]');
  if (move) {
    if (move.getAttribute('aria-disabled') !== 'true') moveHabit(move.dataset.id, Number(move.dataset.move));
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) openEditor(findHabit(edit.dataset.edit));
});

archivedListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-restore]');
  if (btn) restoreHabit(btn.dataset.restore);
});

document.getElementById('add-habit').addEventListener('click', () => openEditor(null));


/* ----- Editor sheet ----- */

// Colour swatches and emoji quick picks (built once)
document.getElementById('color-picker').insertAdjacentHTML('beforeend',
  Object.entries(HABIT_COLORS).map(([key, c]) => `
    <label class="swatch-option">
      <input type="radio" name="color" value="${key}">
      <span class="swatch-option__dot" style="--swatch: ${c.css}"></span>
      <span class="sr-only">${c.label}</span>
    </label>`).join(''));

document.getElementById('emoji-picks').innerHTML = EMOJI_PICKS
  .map((em) => `<button type="button" class="chip-btn" data-emoji="${em}" aria-label="Use ${em}">${em}</button>`)
  .join('');

document.getElementById('emoji-picks').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-emoji]');
  if (btn) hbEmoji.value = btn.dataset.emoji;
});

function selectedType() {
  const checked = habitForm.querySelector('input[name="type"]:checked');
  return checked ? checked.value : 'duration';
}

function selectedColor() {
  const checked = habitForm.querySelector('input[name="color"]:checked');
  return checked ? checked.value : 'violet';
}

// Show only the fields that make sense for this type
function updateTypeFields() {
  const type = selectedType();
  document.getElementById('unit-field').hidden = type !== 'count';
  document.getElementById('number-targets').hidden = type === 'boolean';
  document.getElementById('yesno-targets').hidden = type !== 'boolean';
  document.getElementById('minimum-field').hidden = type === 'boolean';

  const noun = type === 'duration' ? 'minutes' : 'target';
  document.getElementById('hb-weekday-label').textContent = `Weekday ${noun}`;
  document.getElementById('hb-weekend-label').textContent = `Weekend ${noun}`;
  updateTargetHints();
}

// "= 4h 30m" under minute boxes; "0 = off that day" otherwise
function updateTargetHints() {
  const type = selectedType();
  [[hbWeekday, 'hb-weekday-hint'], [hbWeekend, 'hb-weekend-hint']].forEach(([input, hintId]) => {
    const text = input.value.trim();
    let hint = '0 = off that day';
    if (type === 'duration' && /^\d+$/.test(text) && Number(text) > 0) hint = `= ${formatMinutes(Number(text))}`;
    document.getElementById(hintId).textContent = hint;
  });
}

habitForm.addEventListener('change', (e) => {
  if (e.target.name === 'type') updateTypeFields();
});
hbWeekday.addEventListener('input', updateTargetHints);
hbWeekend.addEventListener('input', updateTargetHints);

function resetArchiveButton() {
  archiveBtn.classList.remove('is-confirming');
  archiveBtn.textContent = 'Archive habit';
}

function openEditor(habit) {
  editingId = habit ? habit.id : null;
  habitForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => showFieldError(input, ''));

  const h = habit || {
    name: '', emoji: '', color: 'violet', type: 'duration',
    target: { weekday: 30, weekend: 30 }, priority: 'important',
  };

  document.getElementById('sheet-title').textContent = habit ? `Edit ${habit.name}` : 'Add habit';
  hbName.value = h.name || '';
  hbEmoji.value = h.emoji || '';
  hbUnit.value = h.unit || '';
  hbMinimum.value = h.minimum || '';
  hbPriority.value = habitPriority(h);

  const colorInput = habitForm.querySelector(`input[name="color"][value="${h.color}"]`)
    || habitForm.querySelector('input[name="color"][value="violet"]');
  colorInput.checked = true;

  // Type is fixed once a habit exists
  habitForm.querySelectorAll('input[name="type"]').forEach((input) => {
    input.checked = input.value === h.type;
    input.disabled = Boolean(habit);
  });
  document.getElementById('type-locked').hidden = !habit;

  const t = h.target || {};
  hbWeekday.value = h.type === 'boolean' ? '' : String(Number(t.weekday) || 0);
  hbWeekend.value = h.type === 'boolean' ? '' : String(Number(t.weekend) || 0);
  hbYesWeekday.checked = h.type === 'boolean' ? Number(t.weekday) > 0 : true;
  hbYesWeekend.checked = h.type === 'boolean' ? Number(t.weekend) > 0 : true;

  archiveBtn.hidden = !habit;
  resetArchiveButton();
  updateTypeFields();

  document.body.style.overflow = 'hidden';   // stop the page scrolling behind the sheet
  sheet.showModal();
  document.getElementById('sheet-title').focus();
}

function closeEditor() {
  sheet.close();
}

sheet.addEventListener('close', () => {
  document.body.style.overflow = '';
});

// Tap on the dimmed backdrop closes the sheet
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeEditor();
});

document.getElementById('cancel-habit').addEventListener('click', closeEditor);

// Emoji: one emoji (a few characters when it's a combined one)
function isSingleEmoji(text) {
  if (window.Intl && Intl.Segmenter) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length === 1;
  }
  return [...text].length <= 8;
}

habitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  habitForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => showFieldError(input, ''));

  let firstBad = null;
  const fail = (input, message) => {
    showFieldError(input, message);
    if (!firstBad) firstBad = input;
  };

  const existing = editingId ? findHabit(editingId) : null;
  const type = existing ? existing.type : selectedType();
  const name = hbName.value.trim().replace(/\s+/g, ' ');
  const emoji = hbEmoji.value.trim();
  const minimum = hbMinimum.value.trim().replace(/\s+/g, ' ');

  if (!name) fail(hbName, 'Give it a short name.');
  else if (activeHabits().some((h) => h.id !== editingId && h.name.toLowerCase() === name.toLowerCase())) {
    fail(hbName, 'You already have a habit with this name.');
  }
  if (emoji && !isSingleEmoji(emoji)) fail(hbEmoji, 'Use just one emoji.');

  let target;
  if (type === 'boolean') {
    target = { weekday: hbYesWeekday.checked ? 1 : 0, weekend: hbYesWeekend.checked ? 1 : 0 };
    if (!target.weekday && !target.weekend) fail(hbYesWeekday, 'Pick weekdays, weekends or both.');
  } else {
    const max = TARGET_MAX[type];
    const read = (input) => {
      const text = input.value.trim();
      if (!/^\d+$/.test(text)) { fail(input, 'Whole numbers only, like 30.'); return 0; }
      if (Number(text) > max) { fail(input, `Up to ${formatIndianNumber(max)}.`); return 0; }
      return Number(text);
    };
    target = { weekday: read(hbWeekday), weekend: read(hbWeekend) };
    if (!firstBad && !target.weekday && !target.weekend) {
      fail(hbWeekday, 'Set a target for weekdays, weekends or both.');
    }
  }

  if (firstBad) {
    firstBad.focus();
    return;
  }

  const fields = { name, emoji, color: selectedColor(), priority: hbPriority.value, target };

  if (type === 'count') {
    const unit = hbUnit.value.trim();
    fields.unit = unit;
    // Keep a hand-written plural (e.g. "videos") if the unit didn't change
    fields.unitPlural = unit && existing && existing.unit === unit && existing.unitPlural
      ? existing.unitPlural
      : (unit ? `${unit}s` : '');
  }

  let saved;
  if (existing) {
    saved = { ...existing, ...fields };
    if (type !== 'boolean' && minimum) saved.minimum = minimum;
    else delete saved.minimum;
    habitList[habitList.indexOf(existing)] = saved;
  } else {
    saved = { id: `h-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, createdOn: today, ...fields };
    if (type !== 'boolean' && minimum) saved.minimum = minimum;
    habitList.push(saved);
  }

  if (!saveHabitList()) return;
  closeEditor();
  renderHabitLists(`edit:${saved.id}`);
  showToast(existing ? `${saved.name} updated.` : `${saved.name} added. It starts today.`, { type: 'success' });
});

// Archive: two taps. History stays; the habit stops counting from today.
archiveBtn.addEventListener('click', () => {
  const habit = findHabit(editingId);
  if (!habit) return;

  if (!archiveBtn.classList.contains('is-confirming')) {
    archiveBtn.classList.add('is-confirming');
    archiveBtn.textContent = `Tap again to archive ${habit.name}`;
    setTimeout(resetArchiveButton, 4000);
    return;
  }

  habit.archived = true;
  habit.archivedOn = today;
  if (!saveHabitList()) return;
  closeEditor();
  renderHabitLists();
  document.getElementById('add-habit').focus();
  showToast(`${habit.name} archived. Its history is kept.`, { type: 'info' });
});

async function initHabits() {
  habitList = await loadHabits();
  renderHabitLists();
}


/* ---------- Your data: backup, CSV exports, restore ----------
   Backup file: { app: "ascend", version: 1, exportedAt, data: { "profile": {...}, "logs:2026-09": {...}, ... } }
   Keys are saved without the "ascend:" prefix, exactly as getData/setData use them. */

const BACKUP_VERSION = 1;
// Keys we accept from a backup: "profile", "habits", "logs:2026-09", ...
const KEY_PATTERN = /^[a-z][a-z-]*(:\d{4}-\d{2})?$/;

// Save text as a file download
function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupObject() {
  const data = {};
  listDataKeys().forEach((key) => {
    const value = getData(key, undefined);
    if (value !== undefined) data[key] = value;
  });
  return { app: 'ascend', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

function exportBackup({ quiet = false } = {}) {
  downloadFile(`ascend-backup-${todayISO()}.json`, JSON.stringify(backupObject(), null, 2), 'application/json');
  updateSettings({ lastExportOn: todayISO() });
  renderBackupStatus();
  if (!quiet) showToast('Backup saved to your downloads. Your climb is safe.', { type: 'success' });
}

function renderBackupStatus() {
  const el = document.getElementById('backup-status');
  const last = getSettings().lastExportOn;
  if (!last) {
    el.textContent = 'No backup yet. One tap below makes your first.';
    return;
  }
  const days = daysBetween(last, todayISO());
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  el.textContent = `Last backup: ${when} (${formatDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}).`;
  el.classList.toggle('is-due', days >= BACKUP_EVERY_DAYS);
}

// One CSV cell: quoted when needed. Cells starting with = + - @ get a ' so
// Excel treats them as text, not formulas (numbers stay numbers).
function csvCell(value) {
  if (typeof value === 'number') return String(value);
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCSV(header, rows) {
  // The BOM lets Excel read ₹ and emoji correctly
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// Month shards for a type ("expenses", "logs"...), oldest first
function shardKeys(type) {
  return listDataKeys().filter((k) => k.startsWith(`${type}:`)).sort();
}

async function exportExpensesCSV() {
  await loadCategories();
  const rows = [];
  shardKeys('expenses').forEach((key) => {
    const month = getData(key, {}) || {};
    Object.keys(month).sort().forEach((iso) => {
      (month[iso] || []).forEach((x) => {
        rows.push([iso, Number(x.amount) || 0, findCategory(x.categoryId).name, PAYMENT_METHODS[x.method] || '', x.note || '', x.recurringId ? 'Yes' : 'No']);
      });
    });
  });
  if (!rows.length) {
    showToast('No expenses to export yet.', { type: 'info' });
    return;
  }
  downloadFile(`ascend-expenses-${todayISO()}.csv`, toCSV(['Date', 'Amount (INR)', 'Category', 'Paid with', 'Note', 'Recurring'], rows), 'text/csv');
  showToast(`${formatIndianNumber(rows.length)} expenses exported.`, { type: 'success' });
}

// One row per day per timed habit, from the daily logs (includes quick-add minutes, not just timers)
async function exportTimeCSV() {
  const list = await loadHabits();
  const rows = [];
  shardKeys('logs').forEach((key) => {
    const month = getData(key, {}) || {};
    Object.keys(month).sort().forEach((iso) => {
      Object.entries(month[iso] || {}).forEach(([id, entry]) => {
        const habit = list.find((h) => h.id === id);
        if (!habit || habit.type !== 'duration') return;
        const minutes = Number(entry.value) || 0;
        if (!minutes) return;
        rows.push([iso, habit.name, minutes, Math.round((minutes / 60) * 100) / 100, habitTarget(habit, iso)]);
      });
    });
  });
  if (!rows.length) {
    showToast('No time logged yet.', { type: 'info' });
    return;
  }
  downloadFile(`ascend-time-${todayISO()}.csv`, toCSV(['Date', 'Habit', 'Minutes', 'Hours', 'Target minutes'], rows), 'text/csv');
  showToast(`${formatIndianNumber(rows.length)} days of time exported.`, { type: 'success' });
}

document.getElementById('export-json').addEventListener('click', () => exportBackup());
document.getElementById('export-expenses').addEventListener('click', exportExpensesCSV);
document.getElementById('export-time').addEventListener('click', exportTimeCSV);


/* ----- Restore ----- */

const importSheet = document.getElementById('import-sheet');
const importFile = document.getElementById('import-file');
let pendingBackup = null;

importSheet.addEventListener('close', () => { document.body.style.overflow = ''; });
importSheet.addEventListener('click', (e) => { if (e.target === importSheet) importSheet.close(); });
importSheet.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => importSheet.close()));

// A plain summary of what a { key: value } data map holds
function summarize(data) {
  const sumDays = (type) => Object.entries(data)
    .filter(([k]) => k.startsWith(`${type}:`))
    .reduce((n, [, month]) => n + Object.keys(month || {}).length, 0);
  const expenses = Object.entries(data)
    .filter(([k]) => k.startsWith('expenses:'))
    .flatMap(([, month]) => Object.values(month || {}).flat());
  const goals = data.goals || {};
  return {
    name: (data.profile && data.profile.name) || '–',
    habits: Array.isArray(data.habits) ? data.habits.length : 0,
    logDays: sumDays('logs'),
    expenses: expenses.length,
    spent: expenses.reduce((s, x) => s + (Number(x && x.amount) || 0), 0),
    reflections: sumDays('journal'),
    milestones: (goals.goals || []).reduce((n, g) => n + (g.milestones || []).length, 0),
    wins: Array.isArray(data.wins) ? data.wins.length : 0,
  };
}

// Check the file is an ASCEND backup. Returns { backup } or { error }.
function readBackup(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { error: 'That file isn’t a readable backup. Pick the .json file ASCEND saved.' };
  }
  if (!json || json.app !== 'ascend' || typeof json.data !== 'object' || json.data === null) {
    return { error: 'That doesn’t look like an ASCEND backup file.' };
  }
  if (Number(json.version) > BACKUP_VERSION) {
    return { error: 'This backup is from a newer version of ASCEND. Update the app, then try again.' };
  }
  const keys = Object.keys(json.data);
  if (!keys.length || !keys.every((k) => KEY_PATTERN.test(k))) {
    return { error: 'This backup looks damaged, so nothing was changed.' };
  }
  if (!json.data.profile || !json.data.profile.name) {
    return { error: 'This backup has no profile in it, so nothing was changed.' };
  }
  return { backup: json };
}

importFile.addEventListener('change', async () => {
  const file = importFile.files && importFile.files[0];
  importFile.value = '';                       // lets you pick the same file again
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showToast('That file is too big to be an ASCEND backup.', { type: 'danger' });
    return;
  }

  const { backup, error } = readBackup(await file.text());
  if (error) {
    showToast(error, { type: 'danger', duration: 5000 });
    return;
  }
  pendingBackup = backup;

  // Preview: backup vs this phone, side by side
  const inBackup = summarize(backup.data);
  const current = {};
  listDataKeys().forEach((k) => { current[k] = getData(k, null); });
  const onPhone = summarize(current);
  const rows = [
    ['Name', inBackup.name, onPhone.name],
    ['Habits', inBackup.habits, onPhone.habits],
    ['Days of habit logs', inBackup.logDays, onPhone.logDays],
    ['Expenses', `${inBackup.expenses} (${formatAmount(inBackup.spent)})`, `${onPhone.expenses} (${formatAmount(onPhone.spent)})`],
    ['Reflections', inBackup.reflections, onPhone.reflections],
    ['Milestones', inBackup.milestones, onPhone.milestones],
    ['Wins', inBackup.wins, onPhone.wins],
  ];
  document.getElementById('import-rows').innerHTML = rows.map(([label, a, b]) =>
    `<tr><td>${label}</td><td>${escapeHTML(String(a))}</td><td>${escapeHTML(String(b))}</td></tr>`).join('');

  const saved = backup.exportedAt ? new Date(backup.exportedAt) : null;
  document.getElementById('import-meta').textContent = saved && !Number.isNaN(saved.getTime())
    ? `${file.name} · saved ${formatDate(toISODate(saved), { day: 'numeric', month: 'short', year: 'numeric' })}`
    : file.name;

  document.body.style.overflow = 'hidden';
  importSheet.showModal();
  document.getElementById('import-title').focus();
});

document.getElementById('import-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!pendingBackup) return;

  const safetyCopy = document.getElementById('import-safety').checked;
  if (safetyCopy) exportBackup({ quiet: true });

  // Replace everything. If any write fails, try to put the old data back.
  const before = {};
  listDataKeys().forEach((k) => { before[k] = getData(k, null); });
  clearAllData();
  const ok = Object.entries(pendingBackup.data).every(([key, value]) => setData(key, value));
  if (!ok) {
    clearAllData();
    Object.entries(before).forEach(([key, value]) => setData(key, value));
    importSheet.close();
    showToast('Couldn’t restore. Your data is unchanged.', { type: 'danger', duration: 5000 });
    return;
  }

  // Reload so every part of the app reads the restored data
  // (a short pause first, so the safety download isn't cut off)
  setTimeout(() => location.replace('settings.html?restored=1#data'), safetyCopy ? 800 : 0);
});


/* ---------- Start ---------- */
fillForm();
syncThemeButtons();
renderQuoteList();
initHabits();
renderBackupStatus();

if (new URLSearchParams(location.search).has('restored')) {
  showToast('Backup restored. Welcome back to your climb.', { type: 'success', duration: 4000 });
  history.replaceState(null, '', `${location.pathname}#data`);
}
