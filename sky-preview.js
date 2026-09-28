/* =========================================================
   sky-preview.js — hidden test page for the living sky.
   Switch the four skies instantly and move the Today sun.
   Nothing is saved: your chosen sky in Settings stays as it is.
   ========================================================= */

const sun = mountScoreSun();
const scoreInput = document.getElementById('sun-score');
const scoreValue = document.getElementById('sun-score-value');

// Gold rays around the sun (same shape as on Today)
function drawPreviewRays() {
  let shapes = '';
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const length = i % 2 === 0 ? 80 : 64;
    const point = (angle, r) => `${(120 + Math.cos(angle) * r).toFixed(1)},${(120 + Math.sin(angle) * r).toFixed(1)}`;
    shapes += `<polygon points="${point(a - 0.09, 32)} ${point(a, length)} ${point(a + 0.09, 32)}"/>`;
  }
  document.getElementById('rays').innerHTML = shapes;
}

function showScore() {
  const score = Number(scoreInput.value);
  scoreValue.textContent = `${score}%`;
  sun.style.setProperty('--score', (score / 100).toFixed(3));
  sun.classList.toggle('is-won', score >= 100);
}

function showSkyButtons() {
  const sky = getSky();
  document.querySelectorAll('[data-preview-sky]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.previewSky === sky));
  });
  document.getElementById('sky-now').textContent =
    `Showing ${SKY_LABELS[sky].toLowerCase()}. By the clock it’s ${SKY_LABELS[skyForTime()].toLowerCase()} now.`;
}

document.querySelectorAll('[data-preview-sky]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applySky(btn.dataset.previewSky);          // shown only, not saved
    showSkyButtons();
  });
});

document.getElementById('preview-auto').addEventListener('click', () => {
  applySky(currentSky());
  showSkyButtons();
});

scoreInput.addEventListener('input', showScore);

document.getElementById('replay-intro').addEventListener('click', () => {
  const bg = ensureSkyBackground();
  bg.classList.remove('is-intro');
  void bg.offsetWidth;                          // restart the animation
  bg.classList.add('is-intro');
  setTimeout(() => bg.classList.remove('is-intro'), 1400);
});

document.getElementById('sample-btn').addEventListener('click', () => {
  showToast('Sample only. Nothing was logged.', { type: 'info' });
});

drawPreviewRays();
showScore();
showSkyButtons();
