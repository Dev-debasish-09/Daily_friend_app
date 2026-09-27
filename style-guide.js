/* =========================================================
   style-guide.js — demo page for the design system.
   Uses only helpers from shared.js (no direct localStorage).
   ========================================================= */

// Colour tokens to show, with friendly names
const SWATCHES = [
  ['--bg-top', 'Background top'],
  ['--bg-bottom', 'Background bottom'],
  ['--ink', 'Ink (text)'],
  ['--muted', 'Muted text'],
  ['--accent', 'Accent violet'],
  ['--gold', 'Summit gold'],
  ['--peach', 'Dawn peach'],
  ['--lavender', 'Sky lavender'],
  ['--success', 'Pine (success)'],
  ['--danger', 'Ember (overspend)'],
  ['--mountain-near', 'Mountain near'],
  ['--mountain-far', 'Mountain far'],
];

// Draw swatches using the live value of each CSS variable
function renderSwatches() {
  const styles = getComputedStyle(document.body);
  document.getElementById('swatches').innerHTML = SWATCHES.map(([token, name]) => `
    <li class="swatch">
      <span class="swatch__chip" style="background: var(${token})"></span>
      <span class="swatch__name">${name}</span>
      <code class="swatch__value">${styles.getPropertyValue(token).trim()}</code>
    </li>`).join('');
}

// Keep the Dawn/Night buttons in sync with the current theme
function syncThemeButtons() {
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeChoice === getTheme()));
  });
}

// Show real output from the shared helpers
function renderHelpers() {
  const today = todayISO();
  const rows = [
    ['todayISO()', today],
    ['formatDate(today)', formatDate(today)],
    ['addDays(today, 7)', addDays(today, 7)],
    ['daysBetween(today, "2027-06-30")', `${daysBetween(today, '2027-06-30')} days to 30 Jun 2027`],
    ['isWeekend(today)', isWeekend(today) ? 'Yes · ~12 hr ISS day' : 'No · office + 4–5 hr ISS'],
    ['greeting()', greeting()],
    ['shardKey("expenses")', shardKey('expenses')],
    ['formatINR(125000)', formatINR(125000)],
    ['formatINR(349.5, 2)', formatINR(349.5, 2)],
    ['formatINRCompact(2500000)', formatINRCompact(2500000)],
    ['formatMinutes(270)', formatMinutes(270)],
    ['pickDaily(["Climb", "Focus", "Rest well"])', pickDaily(['Climb', 'Focus', 'Rest well'])],
  ];

  const list = document.getElementById('helpers');
  list.replaceChildren();
  rows.forEach(([call, result]) => {
    const row = document.createElement('div');
    row.className = 'kv__row';
    const dt = document.createElement('dt');
    const code = document.createElement('code');
    code.textContent = call;
    dt.appendChild(code);
    const dd = document.createElement('dd');
    dd.textContent = result;
    row.append(dt, dd);
    list.appendChild(row);
  });
}

// Theme switch
document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = setTheme(btn.dataset.themeChoice);
    syncThemeButtons();
    renderSwatches();
    showToast(name === 'night' ? 'Night theme on' : 'Dawn theme on', { type: 'info' });
  });
});

// Toast demos
const TOAST_DEMOS = {
  success: 'ISS target hit. 5h done — proud of you!',
  info: 'Fresh climb today. One small step counts.',
  danger: 'Food delivery is ₹740 over plan this month.',
};

document.querySelectorAll('[data-toast]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.toast;
    showToast(TOAST_DEMOS[type], { type });
  });
});

// Storage demo: save and read back through getData/setData
const noteInput = document.getElementById('sg-note');
const output = document.getElementById('sg-output');

document.getElementById('sg-save').addEventListener('click', () => {
  const text = noteInput.value.trim();
  if (!text) {
    showToast('Type a note first', { type: 'info' });
    noteInput.focus();
    return;
  }
  const ok = setData('styleguide:note', { text, savedOn: todayISO() });
  showToast(ok ? 'Note saved' : 'Could not save. Storage may be full or blocked.', {
    type: ok ? 'success' : 'danger',
  });
});

document.getElementById('sg-read').addEventListener('click', () => {
  const saved = getData('styleguide:note', null);
  output.textContent = saved && saved.text
    ? `“${saved.text}” · saved ${formatDate(saved.savedOn)}`
    : 'Nothing saved yet.';
});

// Default the date input to today (IST)
document.getElementById('sg-date').value = todayISO();

// First paint
syncThemeButtons();
renderSwatches();
renderHelpers();
