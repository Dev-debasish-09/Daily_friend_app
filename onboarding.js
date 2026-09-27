/* =========================================================
   onboarding.js — first-time setup in 3 short screens.
   Saves name, dob, issExamDate, foodDeliveryLimit to ascend:profile.
   Theme goes to ascend:settings (where shared.js reads it).
   Then opens index.html.
   ========================================================= */

const screens = [...document.querySelectorAll('.onb-screen')];
const backBtn = document.getElementById('back-btn');
const stepLabel = document.getElementById('step-label');
const progressBar = document.getElementById('progress-bar');

const nameInput = document.getElementById('name');
const dobInput = document.getElementById('dob');
const dobHint = document.getElementById('dob-hint');
const examInput = document.getElementById('exam');
const examHint = document.getElementById('exam-hint');
const limitInput = document.getElementById('limit');

const today = todayISO();
let step = 0;

// Date limits: birthdays in the past, exam today or later
dobInput.max = today;
examInput.min = today;
bindAmountInput(limitInput);


/* ---------- Moving between screens ---------- */

function showStep(next, direction = 'forward') {
  screens.forEach((screen, i) => {
    screen.hidden = i !== next;
    screen.classList.remove('rise-in', 'is-entering', 'from-left');
  });

  const screen = screens[next];
  screen.classList.add('is-entering');
  if (direction === 'back') screen.classList.add('from-left');

  step = next;
  backBtn.hidden = next === 0;
  stepLabel.textContent = `Step ${next + 1} of ${screens.length}`;
  progressBar.style.setProperty('--value', `${((next + 1) / screens.length) * 100}%`);

  window.scrollTo(0, 0);
  screen.querySelector('h1').focus();   // screen readers hear the new heading
}

backBtn.addEventListener('click', () => {
  if (step > 0) showStep(step - 1, 'back');
});


/* ---------- Friendly live hints ---------- */

// Same day and month, n years later (29 Feb -> 1 Mar in non-leap years)
function addYears(iso, years) {
  const next = `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
  return isValidISO(next) ? next : addDays(`${next.slice(0, 8)}28`, 1);
}

function updateDobHint() {
  const dob = dobInput.value;
  if (PROFILE_RULES.dob(dob)) {
    dobHint.textContent = 'We use this to count down to 30.';
    return;
  }
  const age = ageOn(dob);
  if (age < 30) {
    const thirty = formatDate(addYears(dob, 30), { day: 'numeric', month: 'short', year: 'numeric' });
    dobHint.textContent = `You’re ${age}. You turn 30 on ${thirty}. Let’s make every year count.`;
  } else {
    dobHint.textContent = `You’re ${age}. Every year is a fresh climb.`;
  }
}

function updateExamHint() {
  const exam = examInput.value;
  if (PROFILE_RULES.issExamDate(exam)) {
    examHint.textContent = 'Check the UPSC calendar. You can change this later.';
    return;
  }
  const days = daysBetween(today, exam);
  examHint.textContent = days === 0
    ? 'Exam day is today. You’ve got this.'
    : `${formatIndianNumber(days)} days to go. Every focused hour counts.`;
}

dobInput.addEventListener('change', updateDobHint);
examInput.addEventListener('change', updateExamHint);


/* ---------- Screen 1: name + date of birth ---------- */

document.getElementById('form-1').addEventListener('submit', (e) => {
  e.preventDefault();
  const ok = validateFields([[nameInput, 'name'], [dobInput, 'dob']]);
  if (ok) showStep(1);
});


/* ---------- Screen 2: exam date + food delivery limit ---------- */

document.getElementById('form-2').addEventListener('submit', (e) => {
  e.preventDefault();
  const ok = validateFields([[examInput, 'issExamDate'], [limitInput, 'foodDeliveryLimit']]);
  if (ok) showStep(2);
});


/* ---------- Screen 3: theme, then save ---------- */

const form3 = document.getElementById('form-3');

// Start with the current theme selected; preview a choice instantly
form3.theme.value = getTheme();
form3.addEventListener('change', (e) => {
  if (e.target.name === 'theme') applyTheme(e.target.value);
});

form3.addEventListener('submit', (e) => {
  e.preventDefault();

  const profile = saveProfile({
    name: nameInput.value.trim(),
    dob: dobInput.value,
    issExamDate: examInput.value,
    foodDeliveryLimit: Math.round(parseAmount(limitInput.value)),
    onboardedOn: today,
  });

  if (!profile) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }

  setTheme(form3.theme.value);
  location.href = 'index.html?welcome=1';   // Today shows a welcome toast
});
