/* =========================================================
   wins.js — the Wall of Wins.
   Level + XP, every badge (earned with its date, or progress
   toward it), and every win from ascend:wins as a summit flag.
   ========================================================= */

// Flag colour per kind of win
const FLAG_COLORS = {
  badge: 'var(--gold)',
  milestone: 'var(--accent)',
  savings: 'var(--success)',
  level: 'var(--peach)',
};

const LONG_DATE = { day: 'numeric', month: 'short', year: 'numeric' };


/* ---------- Level ---------- */

function renderLevel(info) {
  document.getElementById('level-num').textContent = info.level;
  document.getElementById('level-eyebrow').textContent = `Level ${info.level}`;
  document.getElementById('h-level').textContent = info.title;
  document.getElementById('level-xp').textContent = `${formatIndianNumber(info.xp)} XP earned`;
  const pct = (info.into / info.need) * 100;
  document.getElementById('level-ring').setAttribute('stroke-dasharray', `${pct.toFixed(1)} 100`);
  document.getElementById('level-bar').style.setProperty('--value', `${pct.toFixed(1)}%`);
  // What a perfect today would be worth: every scheduled habit done, plus the Day Won bonus
  const habits = getData('habits', []) || [];
  const perfectDay = habits.filter((h) => habitTarget(h) > 0)
    .reduce((s, h) => s + XP_RULES[habitPriority(h)], XP_RULES.dayWon);
  document.getElementById('level-next').textContent =
    `${formatIndianNumber(info.toNext)} XP to Level ${info.level + 1}. A perfect day today is worth ${perfectDay} XP.`;

  const r = XP_RULES;
  document.getElementById('xp-rules').innerHTML = [
    `Non-negotiable habit done: <strong>${r['non-negotiable']} XP</strong> (half for the minimum)`,
    `Important habit done: <strong>${r.important} XP</strong>`,
    `Bonus habit done: <strong>${r.bonus} XP</strong>`,
    `Day won: <strong>+${r.dayWon} XP</strong>`,
    `Nightly reflection: <strong>${r.reflection} XP</strong>`,
    `Milestone completed: <strong>${r.milestone} XP</strong>`,
    `Savings goal reached: <strong>${r.savingsGoal} XP</strong>`,
    `Badge earned: <strong>${r.badge} XP</strong>`,
  ].map((line) => `<li>${line}</li>`).join('');
}


/* ---------- Badges ---------- */

// "63 of 100 problems", "₹4,500 of ₹10,000"
function progressText(badge, value) {
  if (badge.unit === 'rupees') return `${formatAmount(Math.floor(value))} of ${formatAmount(badge.target)}`;
  return `${formatIndianNumber(Math.floor(value))} of ${formatIndianNumber(badge.target)} ${badge.unit}`;
}

function renderBadges(badges, wins) {
  const ctx = makeBadgeContext();
  const earnedCount = badges.filter((b) => wins.some((w) => w.sourceId === `badge:${b.id}`)).length;
  document.getElementById('badge-count').textContent = `${earnedCount} of ${badges.length} earned.`;

  document.getElementById('badge-grid').innerHTML = badges.map((b, i) => {
    const win = wins.find((w) => w.sourceId === `badge:${b.id}`);
    if (win) {
      return `
        <li class="tile flag-tile is-earned rise" style="--i: ${i}">
          ${summitFlagSVG(FLAG_COLORS.badge)}
          <h3 class="flag-tile__title"><span aria-hidden="true">${b.emoji}</span> ${escapeHTML(b.name)}</h3>
          <p class="flag-tile__detail">${escapeHTML(b.desc)}</p>
          <p class="flag-tile__date">Earned ${formatDate(win.date, LONG_DATE)}</p>
        </li>`;
    }
    const value = Math.min(badgeValue(b, ctx), b.target);
    return `
      <li class="tile flag-tile is-locked rise" style="--i: ${i}">
        ${summitFlagSVG('var(--line)', { locked: true })}
        <h3 class="flag-tile__title"><span aria-hidden="true">${b.emoji}</span> ${escapeHTML(b.name)}</h3>
        <p class="flag-tile__detail">${escapeHTML(b.desc)}</p>
        ${meterHTML(value, b.target, 'normal', { thin: true })}
        <p class="flag-tile__detail">${progressText(b, value)}</p>
      </li>`;
  }).join('');
}


/* ---------- The wall ---------- */

function renderWall(wins) {
  const wall = document.getElementById('wall');
  if (!wins.length) {
    wall.innerHTML = '<p class="muted">Your first flag is one milestone away. Complete a milestone on Goals, or keep a habit 7 days in a row.</p>';
    return;
  }

  // Newest first, grouped by month
  const sorted = [...wins].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const groups = [];
  sorted.forEach((w) => {
    const ym = monthOf(w.date || todayISO());
    if (!groups.length || groups[groups.length - 1].ym !== ym) groups.push({ ym, items: [] });
    groups[groups.length - 1].items.push(w);
  });

  let i = 0;
  wall.innerHTML = groups.map((g) => `
    <div class="month-group">
      <h3 class="month-group__title">${formatDate(`${g.ym}-01`, { month: 'long', year: 'numeric' })}</h3>
      <ul class="flag-grid">
        ${g.items.map((w) => `
          <li class="tile flag-tile rise" style="--i: ${Math.min(i++, 12)}">
            ${summitFlagSVG(FLAG_COLORS[w.type] || 'var(--gold)')}
            <p class="flag-tile__title">${w.emoji ? `<span aria-hidden="true">${escapeHTML(w.emoji)}</span> ` : ''}${escapeHTML(w.title)}</p>
            ${w.detail ? `<p class="flag-tile__detail">${escapeHTML(w.detail)}</p>` : ''}
            <p class="flag-tile__date">${formatDate(w.date || todayISO(), LONG_DATE)}</p>
          </li>`).join('')}
      </ul>
    </div>`).join('');
}


/* ---------- Start ---------- */

async function init() {
  // Award anything new first, so it's on the wall straight away
  const info = (await checkProgress()) || levelInfo(computeXP());
  const badges = await loadBadges();
  const wins = getWins();
  renderLevel(info);
  renderBadges(badges, wins);
  renderWall(wins);
}

init();
