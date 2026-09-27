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


/* ---------- Start ---------- */
fillForm();
syncThemeButtons();
renderQuoteList();
