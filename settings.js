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


/* ---------- Start ---------- */
fillForm();
syncThemeButtons();
