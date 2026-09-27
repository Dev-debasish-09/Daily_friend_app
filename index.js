/* =========================================================
   index.js — Today (placeholder until the Today step).
   Shows the greeting and profile markers from onboarding.
   ========================================================= */

const profile = getProfile() || {};
const today = todayISO();
const userName = firstName(profile.name);

document.getElementById('today-date').textContent =
  formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' });
document.getElementById('hello').textContent = `${greeting()}, ${userName}`;

// ISS countdown
if (isValidISO(profile.issExamDate)) {
  const days = daysBetween(today, profile.issExamDate);
  document.getElementById('exam-days').textContent =
    days > 0 ? `${formatIndianNumber(days)} days` : days === 0 ? 'Today' : 'Done';
  document.getElementById('exam-date').textContent =
    formatDate(profile.issExamDate, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Food delivery limit
if (Number.isFinite(profile.foodDeliveryLimit)) {
  document.getElementById('food-limit').textContent = formatINR(profile.foodDeliveryLimit);
}

// Welcome toast right after onboarding, then tidy the URL
if (new URLSearchParams(location.search).has('welcome')) {
  showToast(`Welcome, ${userName}. Your climb starts today.`, { type: 'success' });
  history.replaceState(null, '', location.pathname);
}
