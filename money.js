/* =========================================================
   money.js — the Money page.
   Coin hero (savings + rate), no-spend streak, Food Delivery card,
   this month vs last, category donut + daily line, budgets,
   recurring expenses, income, and the expense list by day.
   Expenses use the shared quick-add sheet (shared.js).
   ========================================================= */

let today = todayISO();
let categories = [];
let chartFilter = 'day';        // 'day' = day-to-day (no essentials), 'all' = everything
let firstCoinRender = true;     // coins stack up once on load, not on every change

const daysEl = document.getElementById('expense-days');

const CHEVRON_SVG = '<svg class="xp-row__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';


/* ---------- Small helpers ---------- */

const sumAmounts = (list) => list.reduce((s, x) => s + (Number(x.amount) || 0), 0);

function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Everything in a month map up to (and including) day number `upTo`
function itemsUpTo(monthMap, upTo = 31) {
  return Object.entries(monthMap)
    .filter(([iso]) => Number(iso.slice(8)) <= upTo)
    .flatMap(([, list]) => list);
}

// 1 -> "1st", 22 -> "22nd"
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// "−₹3,000" for negatives
function signedAmount(n) {
  return n < 0 ? `−${formatAmount(-n)}` : formatAmount(n);
}

// Bar with a 4px rounded end on the right, square at the baseline
function barPath(x, y, w, h, r) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x} ${y}h${w - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - 2 * rr}a${rr} ${rr} 0 0 1 -${rr} ${rr}h-${w - rr}z`;
}

// Tooltip inside a .chart-box, placed above a point and kept inside the box
function showTipAt(box, html, x, y) {
  let tip = box.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    box.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const left = Math.min(Math.max(0, x - tip.offsetWidth / 2), box.clientWidth - tip.offsetWidth);
  const top = y - tip.offsetHeight - 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${top < -30 ? y + 14 : top}px`;
}

function hideTip(box) {
  const tip = box.querySelector('.chart-tip');
  if (tip) tip.hidden = true;
}

// Open/close a bottom sheet
function openSheet(dialog, focusEl) {
  document.body.style.overflow = 'hidden';
  dialog.showModal();
  focusEl.focus();
}

document.querySelectorAll('dialog.sheet').forEach((dialog) => {
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
});

// Two taps to confirm a delete button
function confirmTap(btn, label, confirmLabel) {
  if (btn.classList.contains('is-confirming')) return true;
  btn.classList.add('is-confirming');
  btn.textContent = confirmLabel;
  setTimeout(() => {
    btn.classList.remove('is-confirming');
    btn.textContent = label;
  }, 4000);
  return false;
}

function resetConfirm(btn, label) {
  btn.classList.remove('is-confirming');
  btn.textContent = label;
}


/* ---------- Coin hero: savings this month ---------- */

// Each coin is worth about 1/30 of this month's income, rounded to a friendly number
function coinValueFor(income) {
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  const target = income / 30;
  return steps.find((s) => s >= target) || steps[steps.length - 1];
}

function coinsSVG(count, animate) {
  const ground = 138;
  const thick = 8;
  const stacks = [160, 94, 226];           // centre stack fills first, then left, then right
  let coins = '';
  let i = 0;
  stacks.forEach((cx, s) => {
    const inStack = Math.max(0, Math.min(10, count - s * 10));
    for (let k = 0; k < inStack; k += 1) {
      const y = ground - (k + 1) * thick;
      coins += `
        <g class="${animate ? 'coin' : ''}" style="--i: ${i}">
          <ellipse class="coin-edge" cx="${cx}" cy="${y + thick}" rx="30" ry="9"/>
          <rect class="coin-edge" x="${cx - 30}" y="${y}" width="60" height="${thick}"/>
          <ellipse class="coin-face" cx="${cx}" cy="${y}" rx="30" ry="9"/>
          <ellipse class="coin-rim" cx="${cx}" cy="${y}" rx="20" ry="5.5"/>
        </g>`;
      i += 1;
    }
  });

  // No coins yet: one dashed outline, waiting for the first
  const ghost = count ? '' : `<ellipse class="coin-ghost" cx="160" cy="${ground - 4}" rx="30" ry="9"/>`;
  return `<ellipse class="coin-shadow" cx="160" cy="${ground + 12}" rx="118" ry="8"/>${ghost}${coins}`;
}

function renderHero(expenses, incomeMap) {
  const spent = monthSpent(expenses);
  const income = sumAmounts(Object.values(incomeMap).flat());
  const saved = income - spent;
  const rate = income > 0 ? Math.round((saved / income) * 100) : null;

  const coinValue = coinValueFor(income);
  const count = income > 0 && saved > 0 ? Math.min(30, Math.max(1, Math.round(saved / coinValue))) : 0;

  const label = count
    ? `${count} gold ${count === 1 ? 'coin' : 'coins'}, each about ${formatAmount(coinValue)}: ${formatAmount(saved)} saved this month.`
    : 'No coins yet this month.';
  document.getElementById('coin-art').innerHTML = `
    <svg class="coins" viewBox="0 0 320 156" role="img" aria-label="${escapeHTML(label)}" focusable="false">${coinsSVG(count, firstCoinRender)}</svg>`;
  firstCoinRender = false;

  const valueEl = document.getElementById('saved-value');
  const labelEl = document.getElementById('h-saved');
  const rateEl = document.getElementById('savings-rate');
  const note = document.getElementById('saved-note');

  if (!income) {
    valueEl.textContent = formatAmount(0);
    labelEl.textContent = 'saved this month';
    rateEl.hidden = true;
    note.textContent = `Add this month’s income to see your savings grow into coins. ${formatAmount(spent)} spent so far.`;
    return;
  }

  rateEl.hidden = false;
  if (saved >= 0) {
    valueEl.textContent = formatAmount(saved);
    labelEl.textContent = 'saved this month';
    rateEl.textContent = `${rate}% savings rate`;
    note.textContent = `${formatAmount(income)} in · ${formatAmount(spent)} out · each coin ≈ ${formatAmount(coinValue)}`;
  } else {
    valueEl.textContent = formatAmount(-saved);
    labelEl.textContent = 'more out than in';
    rateEl.textContent = `${rate}% savings rate`;
    note.textContent = `${formatAmount(income)} in · ${formatAmount(spent)} out. Spending is ahead this month; a calm week turns it around.`;
  }
}


/* ---------- No-spend streak ---------- */

function renderStreak() {
  const { count, todayClean } = noSpendStreak(today);
  const days = count === 1 ? 'day' : 'days';
  document.getElementById('nospend-count').textContent = todayClean ? count : 0;
  document.getElementById('nospend-title').textContent = todayClean
    ? `No-spend streak: ${count} ${days}`
    : 'No-spend streak paused';

  let note;
  if (!todayClean) note = 'You spent today. A new streak can start tomorrow.';
  else if (count === 0) note = 'Nothing spent yet today. Keep it that way to start a streak.';
  else note = `Clean so far today. Make it ${count + 1}. (Rent, bills, health and investments don’t count.)`;
  document.getElementById('nospend-note').textContent = note;
}


/* ---------- Food delivery card ---------- */

function renderFood() {
  renderFoodCard(document.getElementById('food-card'), {
    mealCostControl: '<button class="btn btn--ghost" type="button" id="meal-cost-btn">Change home meal cost ({cost})</button>',
  });
}

document.getElementById('food-card').addEventListener('click', (e) => {
  if (e.target.closest('#meal-cost-btn')) openBudgetSheet({ focus: 'b-meal' });
});


/* ---------- This month vs last (same days) ---------- */

function renderCompare(expenses, incomeMap) {
  const ym = monthOf(today);
  const lastYm = prevMonth(ym);
  const dayNum = Number(today.slice(8));
  const lastDays = Math.min(dayNum, daysInMonth(`${lastYm}-01`));
  const fullMonth = dayNum === daysInMonth(today);

  const lastExpenses = getMonthExpenses(lastYm);
  const lastIncome = getMonthIncome(lastYm);

  const spentNow = sumAmounts(itemsUpTo(expenses, dayNum));
  const spentBefore = sumAmounts(itemsUpTo(lastExpenses, lastDays));
  const incomeNow = sumAmounts(itemsUpTo(incomeMap, dayNum));
  const incomeBefore = sumAmounts(itemsUpTo(lastIncome, lastDays));

  const rows = [
    { label: 'Spent', now: spentNow, before: spentBefore },
    { label: 'Income', now: incomeNow, before: incomeBefore },
    { label: 'Saved', now: incomeNow - spentNow, before: incomeBefore - spentBefore },
  ];

  const lastName = formatDate(`${lastYm}-01`, { month: 'long' });
  document.getElementById('compare-range').textContent = fullMonth
    ? `Whole month compared with ${lastName}.`
    : `1st to ${ordinal(dayNum)} of each month, so it’s a fair race.`;
  document.getElementById('compare-legend-last').textContent = fullMonth ? lastName : `${lastName}, same days`;

  // Honest one-liner about spending
  const delta = document.getElementById('compare-delta');
  const hasLast = Object.keys(lastExpenses).length || Object.keys(lastIncome).length;
  const diff = spentNow - spentBefore;
  if (!hasLast) delta.textContent = `Nothing logged for ${lastName}, so next month is when this comparison comes alive.`;
  else if (Math.abs(diff) < 1) delta.textContent = `Spending is level with ${lastName} so far.`;
  else if (diff < 0) delta.textContent = `${formatAmount(-diff)} less spent than ${lastName} by the ${ordinal(dayNum)}. That’s real progress.`;
  else delta.textContent = `${formatAmount(diff)} more spent than ${lastName} by the ${ordinal(dayNum)}. The categories below show where.`;

  // Bars: shared ₹ scale; negative savings draw no bar but keep their label
  const W = 320;
  const plotW = 220;
  const rowH = 58;
  const max = Math.max(1, ...rows.flatMap((r) => [r.now, r.before]));
  const x = (v) => (Math.max(0, v) / max) * plotW;

  const svg = rows.map((r, i) => {
    const y0 = i * rowH;
    const yBar = y0 + 22;
    const yLast = yBar + 19;
    const label = `${r.label}: ${signedAmount(r.now)} this month, ${signedAmount(r.before)} in ${lastName}.`;
    return `
      <g role="img" aria-label="${escapeHTML(label)}">
        <text class="row-name" x="0" y="${y0 + 14}">${r.label}</text>
        <path class="bar-this" d="${barPath(0, yBar, x(r.now), 16, 4)}"/>
        <text class="row-value" x="${x(r.now) + 6}" y="${yBar + 12}">${signedAmount(r.now)}</text>
        <path class="bar-last" d="${barPath(0, yLast, x(r.before), 4, 2)}"/>
      </g>`;
  }).join('');

  document.getElementById('compare-chart').innerHTML = `
    <svg class="cmp-svg" viewBox="0 0 ${W} ${rows.length * rowH - 10}" role="group" aria-label="This month compared with ${escapeHTML(lastName)}" focusable="false">${svg}</svg>`;

  document.getElementById('compare-table').innerHTML = `
    <table class="data-table">
      <caption class="sr-only">This month compared with ${escapeHTML(lastName)}</caption>
      <thead><tr><th scope="col"></th><th scope="col">This month</th><th scope="col">${escapeHTML(lastName)}</th><th scope="col">Change</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.label}</td><td>${signedAmount(r.now)}</td><td>${signedAmount(r.before)}</td><td>${r.now - r.before >= 0 ? '+' : ''}${signedAmount(r.now - r.before)}</td></tr>`).join('')}</tbody>
    </table>`;
}


/* ---------- Charts: category donut + daily line ---------- */

// Day-to-day leaves out essential categories (rent, bills, health, investments)
function chartExpenses(expenses) {
  return Object.entries(expenses).flatMap(([iso, list]) => list.map((x) => ({ ...x, iso })))
    .filter((x) => chartFilter === 'all' || !findCategory(x.categoryId).essential);
}

// Segments with STABLE colours: slots 1–4 = top day-to-day categories,
// slot 5 = other day-to-day, slot 6 = essentials (only in "All spending").
// Switching the filter never repaints a category.
function donutSegments(expenses) {
  const all = Object.values(expenses).flat();
  const byCat = {};
  all.forEach((x) => { byCat[x.categoryId] = (byCat[x.categoryId] || 0) + (Number(x.amount) || 0); });

  const dayCats = Object.entries(byCat)
    .filter(([id]) => !findCategory(id).essential)
    .sort((a, b) => b[1] - a[1]);

  const segments = dayCats.slice(0, 4).map(([id, amount], i) => {
    const c = findCategory(id);
    return { name: c.name, emoji: c.emoji, amount, slot: i + 1 };
  });
  const rest = dayCats.slice(4);
  if (rest.length) {
    segments.push({ name: `Other day-to-day (${rest.length})`, emoji: '🧾', amount: rest.reduce((s, [, a]) => s + a, 0), slot: 5 });
  }
  if (chartFilter === 'all') {
    const essentials = Object.entries(byCat).filter(([id]) => findCategory(id).essential);
    const amount = essentials.reduce((s, [, a]) => s + a, 0);
    if (amount > 0) {
      segments.push({ name: 'Essentials (rent, bills, health, investing)', emoji: '🏠', amount, slot: 6 });
    }
  }
  return segments;
}

function renderDonut(expenses) {
  const box = document.getElementById('donut');
  const segments = donutSegments(expenses);
  const total = segments.reduce((s, x) => s + x.amount, 0);

  if (!total) {
    box.innerHTML = `<p class="muted">${chartFilter === 'day' ? 'No day-to-day spending yet this month.' : 'No spending yet this month.'} Fresh month, fresh page.</p>`;
    document.getElementById('donut-table').innerHTML = '';
    return;
  }

  // Ring drawn with stroke dashes; a 2px gap between segments (0.45% of the ring)
  const r = 70;
  const gap = segments.length > 1 ? 0.45 : 0;
  let offset = 0;
  const rings = segments.map((s, i) => {
    const pct = (s.amount / total) * 100;
    const len = Math.max(0.1, pct - gap);
    const circle = `<circle class="seg" data-i="${i}" cx="100" cy="100" r="${r}" pathLength="100"
      stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${-offset}"
      style="stroke: var(--series-${s.slot})" tabindex="0" role="img"
      aria-label="${escapeHTML(`${s.name}: ${formatAmount(s.amount)}, ${Math.round(pct)}%`)}"/>`;
    offset += pct;
    return circle;
  }).join('');

  const legend = segments.map((s) => `
    <li>
      <span class="chart-legend__key" style="background: var(--series-${s.slot})" aria-hidden="true"></span>
      <span class="chart-legend__name">${escapeHTML(`${s.emoji} ${s.name}`)}</span>
      <span class="chart-legend__value">${formatAmount(s.amount)}</span>
      <span class="chart-legend__pct">${Math.round((s.amount / total) * 100)}%</span>
    </li>`).join('');

  box.innerHTML = `
    <svg class="donut" viewBox="0 0 200 200" role="group" aria-label="Spending by category" focusable="false">
      <g transform="rotate(-90 100 100)">${rings}</g>
      <text class="donut__total" x="100" y="102" text-anchor="middle">${formatAmount(total)}</text>
      <text class="donut__label" x="100" y="122" text-anchor="middle">${chartFilter === 'day' ? 'day-to-day' : 'all spending'}</text>
    </svg>
    <ul class="chart-legend" aria-label="Legend">${legend}</ul>`;

  // Tooltip on hover, tap or keyboard focus
  const show = (seg) => {
    const s = segments[Number(seg.dataset.i)];
    box.querySelectorAll('.seg.is-active').forEach((el) => el.classList.remove('is-active'));
    seg.classList.add('is-active');
    const svgRect = box.querySelector('svg').getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    showTipAt(box,
      `<strong>${formatAmount(s.amount)}</strong>${escapeHTML(s.name)} · ${Math.round((s.amount / total) * 100)}%`,
      svgRect.left - boxRect.left + svgRect.width / 2, svgRect.top - boxRect.top + 8);
  };
  const clear = () => {
    hideTip(box);
    box.querySelectorAll('.seg.is-active').forEach((el) => el.classList.remove('is-active'));
  };
  box.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('pointerenter', () => show(seg));
    seg.addEventListener('focus', () => show(seg));
    seg.addEventListener('blur', clear);
  });
  box.querySelector('svg').addEventListener('pointerleave', clear);

  document.getElementById('donut-table').innerHTML = `
    <table class="data-table">
      <caption class="sr-only">Spending by category</caption>
      <thead><tr><th scope="col">Category</th><th scope="col">Spent</th><th scope="col">Share</th></tr></thead>
      <tbody>${segments.map((s) => `<tr><td>${escapeHTML(s.name)}</td><td>${formatAmount(s.amount)}</td><td>${Math.round((s.amount / total) * 100)}%</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td>${formatAmount(total)}</td><td>100%</td></tr></tfoot>
    </table>`;
}

// A friendly axis step: 1, 2, 2.5 or 5 × a power of ten
function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

// ₹1.5k style for axis ticks
function axisAmount(n) {
  if (n >= 1000) return `₹${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return `₹${n}`;
}

function renderDaily(expenses) {
  const box = document.getElementById('daily-chart');
  const dim = daysInMonth(today);
  const dayNum = Number(today.slice(8));
  const ym = monthOf(today);

  const perDay = Array.from({ length: dayNum }, (_, i) => {
    const iso = `${ym}-${String(i + 1).padStart(2, '0')}`;
    return { iso, day: i + 1, amount: 0 };
  });
  chartExpenses(expenses).forEach((x) => {
    const d = perDay[Number(x.iso.slice(8)) - 1];
    if (d) d.amount += Number(x.amount) || 0;
  });

  const total = perDay.reduce((s, d) => s + d.amount, 0);
  const busiest = perDay.reduce((a, b) => (b.amount > a.amount ? b : a), perDay[0]);
  document.getElementById('daily-note').textContent = total
    ? `Average ${formatAmount(Math.round(total / dayNum))} a day. Biggest day: ${formatDate(busiest.iso, { day: 'numeric', month: 'short' })} (${formatAmount(busiest.amount)}).`
    : 'No spending logged yet this month.';

  // Layout
  const W = 320;
  const H = 190;
  const padL = 40;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const step = niceStep(Math.max(100, busiest.amount) / 3);
  const top = step * Math.ceil(Math.max(100, busiest.amount) / step);
  const x = (day) => padL + ((day - 1) / (dim - 1)) * plotW;
  const y = (v) => padT + plotH - (v / top) * plotH;

  // Hairline gridlines + clean ticks
  let grid = '';
  for (let v = 0; v <= top + 0.001; v += step) {
    grid += `<line class="lc-grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="lc-axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${axisAmount(v)}</text>`;
  }
  const monthShort = formatDate(today, { month: 'short' });
  [1, 8, 15, 22, 29].filter((d) => d <= dim).forEach((d) => {
    grid += `<text class="lc-axis" x="${x(d)}" y="${H - 6}" text-anchor="middle">${d === 1 ? `1 ${monthShort}` : d}</text>`;
  });

  const points = perDay.map((d) => `${x(d.day).toFixed(1)},${y(d.amount).toFixed(1)}`);
  const line = `M${points.join('L')}`;
  const area = `${line}L${x(dayNum).toFixed(1)},${y(0)}L${x(1)},${y(0)}Z`;
  const last = perDay[dayNum - 1];
  const endLabelX = Math.min(x(dayNum) + 8, W - padR - 60);

  box.innerHTML = `
    <svg class="line-chart" viewBox="0 0 ${W} ${H}" tabindex="0" role="img" focusable="false"
      aria-label="${escapeHTML(`Daily spending this month. ${document.getElementById('daily-note').textContent} Use left and right arrow keys to read each day.`)}">
      ${grid}
      ${dayNum > 1 ? `<path class="lc-area" d="${area}"/><path class="lc-line" d="${line}"/>` : ''}
      <circle class="lc-dot" cx="${x(dayNum)}" cy="${y(last.amount)}" r="4.5"/>
      <text class="lc-end-label" x="${endLabelX}" y="${Math.max(padT + 10, y(last.amount) - 10)}">Today ${formatAmount(last.amount)}</text>
      <g class="lc-hover" hidden>
        <line class="lc-cross" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}"/>
        <circle class="lc-dot" r="5"/>
      </g>
    </svg>`;

  // Crosshair: snaps to the nearest day; keyboard arrows move it
  const svg = box.querySelector('svg');
  const hover = svg.querySelector('.lc-hover');
  let active = dayNum;

  const showDay = (day) => {
    active = Math.min(dayNum, Math.max(1, day));
    const d = perDay[active - 1];
    hover.removeAttribute('hidden');   // SVG elements have no .hidden property
    hover.querySelector('line').setAttribute('x1', x(d.day));
    hover.querySelector('line').setAttribute('x2', x(d.day));
    hover.querySelector('circle').setAttribute('cx', x(d.day));
    hover.querySelector('circle').setAttribute('cy', y(d.amount));
    const scale = svg.getBoundingClientRect().width / W;
    showTipAt(box, `<strong>${formatAmount(d.amount)}</strong>${formatDate(d.iso, { weekday: 'short', day: 'numeric', month: 'short' })}`,
      x(d.day) * scale, y(d.amount) * scale);
  };
  const clear = () => {
    hover.setAttribute('hidden', '');
    hideTip(box);
  };

  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    showDay(Math.round(((vx - padL) / plotW) * (dim - 1)) + 1);
  });
  svg.addEventListener('pointerleave', clear);
  svg.addEventListener('focus', () => showDay(active));
  svg.addEventListener('blur', clear);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      showDay(active + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

  const spendDays = perDay.filter((d) => d.amount > 0);
  document.getElementById('daily-table').innerHTML = spendDays.length ? `
    <table class="data-table">
      <caption class="sr-only">Daily spending this month</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">Spent</th></tr></thead>
      <tbody>${spendDays.map((d) => `<tr><td>${formatDate(d.iso, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${formatAmount(d.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td>${formatAmount(total)}</td></tr></tfoot>
    </table>` : '<p class="muted">No days with spending yet.</p>';
}

function renderCharts(expenses) {
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === chartFilter));
  });
  document.getElementById('chart-filter-hint').textContent = chartFilter === 'day'
    ? 'Leaves out rent, bills, health and investments.'
    : 'Everything, including rent, bills, health and investments.';
  renderDonut(expenses);
  renderDaily(expenses);
}

document.getElementById('chart-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn || btn.dataset.filter === chartFilter) return;
  chartFilter = btn.dataset.filter;
  renderCharts(getMonthExpenses(monthOf(today)));
});


/* ---------- Budgets ---------- */

function budgetNote(spent, limit, level) {
  if (level === 'ember') return spent === limit ? 'Limit reached' : `${formatAmount(spent - limit)} over`;
  if (level === 'amber') return `${Math.round((spent / limit) * 100)}% used · ${formatAmount(limit - spent)} left`;
  return `${formatAmount(limit - spent)} left`;
}

function renderBudgets(month) {
  const budgets = getBudgets();
  const total = monthSpent(month);
  const totalEl = document.getElementById('budget-total');

  if (budgets.total) {
    const level = budgetLevel(total, budgets.total);
    totalEl.innerHTML = `
      <div class="budget-total__head">
        <span class="label">Total</span>
        <span class="budget-total__value">${formatAmount(total)} <span class="muted">of ${formatAmount(budgets.total)}</span></span>
      </div>
      ${meterHTML(total, budgets.total, level)}
      <p class="meter__note is-${level}">${LEVEL_ICONS[level]}<span>${budgetNote(total, budgets.total, level)} this month</span></p>`;
  } else {
    totalEl.innerHTML = '<p class="muted">No total budget yet. Set one to see the whole month at a glance.</p>';
  }

  const rows = categories
    .map((c) => ({ c, spent: monthSpent(month, c.id), limit: budgets.categories[c.id] || 0 }))
    .filter((r) => r.limit > 0 || r.spent > 0);

  const list = document.getElementById('budget-list');
  if (!rows.length) {
    list.innerHTML = '<li class="muted">No category budgets yet. Tap Edit budgets to add some.</li>';
    return;
  }

  list.innerHTML = rows.map(({ c, spent, limit }) => {
    const level = budgetLevel(spent, limit);
    const amount = limit
      ? `${formatAmount(spent)} <span class="muted">of ${formatAmount(limit)}</span>`
      : `${formatAmount(spent)} <span class="muted">· no budget</span>`;
    const detail = limit
      ? `${meterHTML(spent, limit, level, { thin: true })}
         <p class="meter__note is-${level}">${LEVEL_ICONS[level]}<span>${budgetNote(spent, limit, level)}</span></p>`
      : '';
    return `
      <li class="budget-row">
        <div class="budget-row__head">
          <span>${escapeHTML(`${c.emoji || ''} ${c.name}`)}</span>
          <span class="budget-row__amount">${amount}</span>
        </div>
        ${detail}
      </li>`;
  }).join('');
}

const budgetSheet = document.getElementById('budget-sheet');
const budgetForm = document.getElementById('budget-form');
const bTotal = document.getElementById('b-total');
const bMeal = document.getElementById('b-meal');

function buildBudgetFields() {
  document.getElementById('b-categories').insertAdjacentHTML('beforeend', categories.map((c) => `
    <div class="field budget-field">
      <label class="label" for="b-cat-${c.id}">${escapeHTML(`${c.emoji || ''} ${c.name}`)}</label>
      <div class="input-group">
        <span class="input-group__prefix" aria-hidden="true">₹</span>
        <input class="input" id="b-cat-${c.id}" data-category="${c.id}" type="text" inputmode="numeric"
          autocomplete="off" placeholder="${c.id === FOOD_DELIVERY_ID ? '2,000' : 'None'}">
      </div>
    </div>`).join(''));
  budgetForm.querySelectorAll('input[inputmode="numeric"]').forEach(bindAmountInput);
}

function openBudgetSheet({ focus = null } = {}) {
  const budgets = getBudgets();
  budgetForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => showFieldError(input, ''));
  bTotal.value = budgets.total ? formatIndianNumber(budgets.total) : '';
  budgetForm.querySelectorAll('[data-category]').forEach((input) => {
    const limit = budgets.categories[input.dataset.category];
    input.value = limit ? formatIndianNumber(limit) : '';
  });
  bMeal.value = formatIndianNumber(getHomeMealCost());

  const target = focus ? document.getElementById(focus) : document.getElementById('budget-title');
  openSheet(budgetSheet, target);
  if (focus) target.scrollIntoView({ block: 'center' });
}

document.getElementById('edit-budgets').addEventListener('click', () => openBudgetSheet());

// Blank = no budget. Food delivery needs a limit (it powers its card).
budgetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  let firstBad = null;
  const fail = (input, message) => {
    showFieldError(input, message);
    if (!firstBad) firstBad = input;
  };
  const readAmount = (input, { required = false, max = 10000000 } = {}) => {
    showFieldError(input, '');
    if (!input.value.trim()) {
      if (required) fail(input, 'This one needs an amount.');
      return 0;
    }
    const n = parseAmount(input.value);
    if (n === null) { fail(input, 'Numbers only, like 4,000.'); return 0; }
    if (n > max) { fail(input, `Up to ${formatAmount(max)}.`); return 0; }
    return Math.round(n);
  };

  const total = readAmount(bTotal);
  const cats = {};
  budgetForm.querySelectorAll('[data-category]').forEach((input) => {
    const id = input.dataset.category;
    const n = readAmount(input, { required: id === FOOD_DELIVERY_ID });
    if (n > 0) cats[id] = n;
  });
  const meal = readAmount(bMeal, { required: true, max: 10000 });

  if (firstBad) {
    firstBad.focus();
    return;
  }
  if (!saveBudgets({ total, categories: cats })) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }
  updateSettings({ homeMealCost: meal });
  budgetSheet.close();
  render();

  const sum = Object.values(cats).reduce((a, b) => a + b, 0);
  showToast(total && sum > total
    ? `Budgets saved. Your categories add up to ${formatAmount(sum)}, more than the ${formatAmount(total)} total.`
    : 'Budgets saved.', { type: total && sum > total ? 'info' : 'success', duration: 4200 });
});


/* ---------- Recurring expenses ---------- */

const recSheet = document.getElementById('recurring-sheet');
const recForm = document.getElementById('recurring-form');
const recName = document.getElementById('rec-name');
const recAmount = document.getElementById('rec-amount');
const recCategory = document.getElementById('rec-category');
const recMethod = document.getElementById('rec-method');
const recDay = document.getElementById('rec-day');
const recDelete = document.getElementById('rec-delete');
const REC_DELETE_LABEL = 'Stop this recurring expense';
let editingRuleId = null;

function renderRecurring() {
  const rules = getRecurring();
  const list = document.getElementById('recurring-list');
  if (!rules.length) {
    list.innerHTML = '<li class="muted">None yet. Add rent or a subscription once and it logs itself every month.</li>';
    return;
  }
  list.innerHTML = rules.map((rule) => {
    const c = findCategory(rule.categoryId);
    const next = formatDate(nextRecurringDate(rule), { day: 'numeric', month: 'short' });
    const meta = `Every month on the ${ordinal(rule.day)} · next ${next} · ${PAYMENT_METHODS[rule.method] || 'UPI'}`;
    return `
      <li>
        <button class="xp-row" type="button" data-rule="${escapeHTML(rule.id)}" aria-label="${escapeHTML(`Edit ${rule.name}, ${formatAmount(rule.amount)}, ${meta}`)}">
          <span class="xp-row__badge" style="--swatch: ${habitColorCSS(c)}" aria-hidden="true">${escapeHTML(c.emoji || '')}</span>
          <span class="xp-row__text">
            <span class="xp-row__name">${escapeHTML(rule.name)}</span>
            <span class="xp-row__meta">${escapeHTML(meta)}</span>
          </span>
          <span class="xp-row__amount">${formatAmount(rule.amount)}</span>
          ${CHEVRON_SVG}
        </button>
      </li>`;
  }).join('');
}

function openRecurring(rule = null) {
  editingRuleId = rule ? rule.id : null;
  recForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => showFieldError(input, ''));

  document.getElementById('rec-title').textContent = rule ? `Edit ${rule.name}` : 'Add recurring';
  recName.value = rule ? rule.name : '';
  recAmount.value = rule ? formatIndianNumber(rule.amount) : '';
  recCategory.value = rule ? rule.categoryId : 'rent';
  recMethod.value = rule ? rule.method : (getSettings().lastPaymentMethod || 'upi');
  recDay.value = rule ? String(rule.day) : String(Number(today.slice(8)));

  // Start choice only when adding; editing shows the next date instead
  document.getElementById('rec-start-field').hidden = Boolean(rule);
  recForm.querySelector('input[name="rec-start"][value="this"]').checked = true;
  const nextHint = document.getElementById('rec-next');
  nextHint.hidden = !rule;
  if (rule) nextHint.textContent = `Next: ${formatDate(nextRecurringDate(rule), { weekday: 'short', day: 'numeric', month: 'short' })}. Changes apply from then; past entries stay as they were.`;

  recDelete.hidden = !rule;
  resetConfirm(recDelete, REC_DELETE_LABEL);
  openSheet(recSheet, document.getElementById('rec-title'));
}

document.getElementById('add-recurring').addEventListener('click', () => openRecurring());
document.getElementById('recurring-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-rule]');
  if (row) openRecurring(getRecurring().find((r) => r.id === row.dataset.rule));
});

recForm.addEventListener('submit', (e) => {
  e.preventDefault();
  [recName, recAmount, recDay].forEach((input) => showFieldError(input, ''));
  let firstBad = null;
  const fail = (input, message) => {
    showFieldError(input, message);
    if (!firstBad) firstBad = input;
  };

  const name = recName.value.trim().replace(/\s+/g, ' ');
  const amount = parseAmount(recAmount.value);
  const day = Number(recDay.value.trim());
  if (!name) fail(recName, 'Give it a name, like Rent.');
  if (amount === null || amount <= 0) fail(recAmount, 'Enter the monthly amount.');
  else if (amount > 10000000) fail(recAmount, 'Up to ₹1,00,00,000.');
  if (!Number.isInteger(day) || day < 1 || day > 31) fail(recDay, 'A day from 1 to 31.');
  if (firstBad) {
    firstBad.focus();
    return;
  }

  const rules = getRecurring();
  const fields = { name, amount: Math.round(amount * 100) / 100, categoryId: recCategory.value, method: recMethod.value, day };
  let rule;
  if (editingRuleId) {
    rule = rules.find((r) => r.id === editingRuleId);
    Object.assign(rule, fields);
  } else {
    const ym = monthOf(today);
    const startThis = recForm.querySelector('input[name="rec-start"]:checked').value === 'this';
    rule = { id: newId('rec'), ...fields, lastAdded: null };
    rule.startDate = recurringDateIn(rule, startThis ? ym : nextMonth(ym));
    rules.push(rule);
  }

  if (!saveRecurring(rules)) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }
  const added = applyRecurring(today);       // adds this month's right away if it's due
  recSheet.close();
  render();

  const when = `on the ${ordinal(rule.day)} every month`;
  const addedNow = added.find((a) => a.rule.id === rule.id);
  showToast(editingRuleId
    ? `${rule.name} updated. Next one: ${formatDate(nextRecurringDate(getRecurring().find((r) => r.id === rule.id)), { day: 'numeric', month: 'short' })}.`
    : addedNow
      ? `${rule.name} added for ${formatDate(addedNow.iso, { day: 'numeric', month: 'short' })}, and it will repeat ${when}.`
      : `${rule.name} will be added ${when}, starting ${formatDate(rule.startDate, { day: 'numeric', month: 'short' })}.`,
  { type: 'success', duration: 4500 });
});

recDelete.addEventListener('click', () => {
  const rule = getRecurring().find((r) => r.id === editingRuleId);
  if (!rule || !confirmTap(recDelete, REC_DELETE_LABEL, `Tap again to stop ${rule.name}`)) return;
  saveRecurring(getRecurring().filter((r) => r.id !== rule.id));
  recSheet.close();
  render();
  showToast(`${rule.name} stopped. Past entries stay in your history.`, { type: 'info' });
});


/* ---------- Income ---------- */

const inSheet = document.getElementById('income-sheet');
const inForm = document.getElementById('income-form');
const inAmount = document.getElementById('in-amount');
const inSource = document.getElementById('in-source');
const inDate = document.getElementById('in-date');
const inNote = document.getElementById('in-note');
const inDelete = document.getElementById('in-delete');
const IN_DELETE_LABEL = 'Delete income';
let editingIncome = null;       // { item, iso } while editing

function renderIncome(incomeMap) {
  const days = Object.keys(incomeMap).filter((iso) => incomeMap[iso].length).sort().reverse();
  document.getElementById('income-total').textContent = formatAmount(sumAmounts(Object.values(incomeMap).flat()));
  const list = document.getElementById('income-list');
  if (!days.length) {
    list.innerHTML = '<li class="muted">No income logged this month. Add your salary to see your savings rate and coins.</li>';
    return;
  }
  list.innerHTML = days.flatMap((iso) => incomeMap[iso].map((item) => {
    const src = INCOME_SOURCES[item.source] || INCOME_SOURCES.other;
    const meta = [formatDate(iso, { day: 'numeric', month: 'short' }), item.note].filter(Boolean).join(' · ');
    return `
      <li>
        <button class="xp-row" type="button" data-income="${escapeHTML(item.id)}" data-iso="${iso}"
          aria-label="${escapeHTML(`Edit ${formatAmount(item.amount)} ${src.label}, ${meta}`)}">
          <span class="xp-row__badge" style="--swatch: var(--success)" aria-hidden="true">${src.emoji}</span>
          <span class="xp-row__text">
            <span class="xp-row__name">${src.label}</span>
            <span class="xp-row__meta">${escapeHTML(meta)}</span>
          </span>
          <span class="xp-row__amount is-income">+${formatAmount(item.amount)}</span>
          ${CHEVRON_SVG}
        </button>
      </li>`;
  })).join('');
}

function openIncome(item = null, iso = null) {
  editingIncome = item ? { item, iso } : null;
  [inAmount, inDate].forEach((input) => showFieldError(input, ''));
  document.getElementById('income-title').textContent = item ? 'Edit income' : 'Add income';
  inAmount.value = item ? formatIndianNumber(item.amount) : '';
  inSource.value = item ? item.source : 'salary';
  inDate.max = today;
  inDate.value = iso || today;
  inNote.value = item ? item.note || '' : '';
  inDelete.hidden = !item;
  resetConfirm(inDelete, IN_DELETE_LABEL);
  openSheet(inSheet, item ? document.getElementById('income-title') : inAmount);
}

document.getElementById('add-income').addEventListener('click', () => openIncome());
document.getElementById('income-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-income]');
  if (!row) return;
  const item = (getMonthIncome(monthOf(row.dataset.iso))[row.dataset.iso] || []).find((x) => x.id === row.dataset.income);
  if (item) openIncome(item, row.dataset.iso);
});

inForm.addEventListener('submit', (e) => {
  e.preventDefault();
  [inAmount, inDate].forEach((input) => showFieldError(input, ''));
  const amount = parseAmount(inAmount.value);
  const date = inDate.value;
  let bad = null;
  if (amount === null || amount <= 0) { showFieldError(inAmount, 'Enter an amount, like 65,000.'); bad = bad || inAmount; }
  else if (amount > 100000000) { showFieldError(inAmount, 'That looks too big. Check the zeros.'); bad = bad || inAmount; }
  if (!isValidISO(date) || date > today) { showFieldError(inDate, 'Pick today or an earlier date.'); bad = bad || inDate; }
  if (bad) {
    bad.focus();
    return;
  }

  const now = new Date().toISOString();
  const item = {
    id: editingIncome ? editingIncome.item.id : newId('i'),
    amount: Math.round(amount * 100) / 100,
    source: inSource.value,
    note: inNote.value.trim().replace(/\s+/g, ' '),
    createdAt: editingIncome ? editingIncome.item.createdAt : now,
    updatedAt: now,
  };
  const ok = editingIncome ? updateIncome(editingIncome.iso, date, item) : addIncome(date, item);
  if (!ok) {
    showToast('Couldn’t save. Check that your browser allows storage.', { type: 'danger' });
    return;
  }
  inSheet.close();
  render();

  // Proud and specific: the new savings rate
  const ym = monthOf(today);
  const income = sumAmounts(Object.values(getMonthIncome(ym)).flat());
  const spent = monthSpent(getMonthExpenses(ym));
  const rate = income > 0 ? Math.round(((income - spent) / income) * 100) : 0;
  const label = (INCOME_SOURCES[item.source] || INCOME_SOURCES.other).label.toLowerCase();
  showToast(`${formatAmount(item.amount)} ${label} ${editingIncome ? 'updated' : 'added'}. Savings rate this month: ${rate}%.`, { type: 'success' });
});

inDelete.addEventListener('click', () => {
  if (!editingIncome || !confirmTap(inDelete, IN_DELETE_LABEL, `Tap again to delete ${formatAmount(editingIncome.item.amount)}`)) return;
  removeIncome(editingIncome.iso, editingIncome.item.id);
  inSheet.close();
  render();
  showToast(`Deleted ${formatAmount(editingIncome.item.amount)} of income.`, { type: 'info' });
});


/* ---------- Expense list, grouped by day ---------- */

function dayLabel(iso) {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });
}

function rowHTML(expense, iso) {
  const category = findCategory(expense.categoryId);
  const method = PAYMENT_METHODS[expense.method] || 'UPI';
  const meta = [method, expense.note, expense.recurringId ? 'Recurring' : ''].filter(Boolean).join(' · ');
  const amount = formatAmount(expense.amount);
  const label = `Edit ${amount}, ${category.name}, ${meta}`;

  return `
    <li>
      <button class="xp-row" type="button" data-iso="${iso}" data-id="${escapeHTML(expense.id)}" aria-label="${escapeHTML(label)}">
        <span class="xp-row__badge" style="--swatch: ${habitColorCSS(category)}" aria-hidden="true">${escapeHTML(category.emoji || '')}</span>
        <span class="xp-row__text">
          <span class="xp-row__name">${escapeHTML(category.name)}</span>
          <span class="xp-row__meta">${escapeHTML(meta)}</span>
        </span>
        <span class="xp-row__amount">${amount}</span>
        ${CHEVRON_SVG}
      </button>
    </li>`;
}

function renderList(month) {
  const days = Object.keys(month).filter((iso) => (month[iso] || []).length).sort().reverse();
  if (!days.length) {
    daysEl.innerHTML = '<p class="muted">No expenses yet this month. Tap Add expense to log your first one. It takes five seconds.</p>';
    return;
  }
  daysEl.innerHTML = days.map((iso) => {
    const list = month[iso];
    return `
      <section class="day-group" aria-labelledby="day-${iso}">
        <h3 class="day-group__head" id="day-${iso}">
          <span>${dayLabel(iso)}</span>
          <span>${formatAmount(sumAmounts(list))}</span>
        </h3>
        <ul class="xp-list">${list.map((x) => rowHTML(x, iso)).join('')}</ul>
      </section>`;
  }).join('');
}


/* ---------- Render everything ---------- */

function render() {
  const ym = monthOf(today);
  const expenses = getMonthExpenses(ym);
  const incomeMap = getMonthIncome(ym);
  document.getElementById('month-label').textContent = formatDate(today, { month: 'long', year: 'numeric' });

  renderHero(expenses, incomeMap);
  renderStreak();
  renderFood();
  renderCompare(expenses, incomeMap);
  renderCharts(expenses);
  renderBudgets(expenses);
  renderRecurring();
  renderIncome(incomeMap);
  renderList(expenses);
}


/* ---------- Add + edit expenses ---------- */

function openAdd() {
  openExpenseSheet({ onChange: render });
}

document.getElementById('add-expense').addEventListener('click', openAdd);
document.getElementById('fab-add').addEventListener('click', openAdd);

daysEl.addEventListener('click', (e) => {
  const row = e.target.closest('.xp-row');
  if (!row) return;
  const expense = (getMonthExpenses(monthOf(row.dataset.iso))[row.dataset.iso] || [])
    .find((x) => x.id === row.dataset.id);
  if (expense) openExpenseSheet({ expense, iso: row.dataset.iso, onChange: render });
});


/* ---------- Start ---------- */

async function init() {
  categories = await loadCategories();   // names, emoji and "essential" flags
  buildBudgetFields();
  recCategory.innerHTML = categories.map((c) => `<option value="${escapeHTML(c.id)}">${escapeHTML(`${c.emoji} ${c.name}`)}</option>`).join('');
  inSource.innerHTML = Object.entries(INCOME_SOURCES).map(([id, s]) => `<option value="${id}">${s.emoji} ${s.label}</option>`).join('');
  [recAmount, inAmount].forEach(bindAmountInput);
  render();

  // Arriving from Today's "Change home meal cost" link
  if (new URLSearchParams(location.search).get('edit') === 'meal') {
    history.replaceState(null, '', location.pathname);
    openBudgetSheet({ focus: 'b-meal' });
  }
}

// Back in the app after midnight (or a new month): add anything due, refresh
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayISO() !== today) {
    today = todayISO();
    applyRecurring(today);
    render();
  }
});

init();
