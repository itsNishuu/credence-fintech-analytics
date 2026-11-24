import { CASES, GRADES, analyzeBorrower, stressBorrower, portfolioSummary, creditModel, coverStatus, makeMemo } from './engine.js';
import { scatterChart, barChart, lineChart, mount, lineHover } from './charts.js';
import { $, $$, esc, download, router } from './dom.js';

const FIELDS = [
  ['facility', 'Proposed facility'], ['revenue', 'Revenue'], ['prevRevenue', 'Revenue, prior year'], ['ebitda', 'EBITDA'], ['ebit', 'EBIT'],
  ['cfads', 'Cash available for debt service'], ['debtService', 'Annual debt service'], ['interest', 'Interest expense'],
  ['debt', 'Total debt'], ['equity', 'Net worth'], ['currentAssets', 'Current assets'], ['currentLiabilities', 'Current liabilities'], ['collateral', 'Collateral value'],
];
const state = { edits: CASES.map((c) => ({ ...c })), shocks: { cashflowShock: 0.2, rateShockBps: 100 }, sel: 0, sort: { key: 'stressedDscr', dir: 1 }, sector: '', status: '', p: null, facFor: -1 };

const L = (v, d = 0) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })} L`;
const x2 = (v) => (Number.isFinite(v) ? `${v.toFixed(2)}×` : '—');
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const statusText = { safe: 'Healthy', watch: 'Watch', breach: 'Below 1.0×' };

function recalc() {
  state.p = portfolioSummary(state.edits, state.shocks);
  renderBook(); renderQueue(); renderFile(); renderFacility(); renderMemo();
}

/* ---------------- Stress dials ---------------- */
function syncDials() {
  $('#cf').value = Math.round(state.shocks.cashflowShock * 100);
  $('#bps').value = state.shocks.rateShockBps;
  $('#cfOut').textContent = `${$('#cf').value}%`;
  $('#bpsOut').textContent = `${$('#bps').value} bps`;
  for (const b of $$('.presets button')) b.setAttribute('aria-pressed', String(Number(b.dataset.cf) === Number($('#cf').value) && Number(b.dataset.bps) === Number($('#bps').value)));
}

/* ---------------- Loan book ---------------- */
function renderBook() {
  const p = state.p, share = p.belowOne / p.totalFacility;
  $('#headline').innerHTML = p.belowOne > 0
    ? `<span class="breach">${L(p.belowOne)}</span> of the ${L(p.totalFacility)} book (${pct(share)}) would no longer cover its debt service.`
    : `Every borrower in the ${L(p.totalFacility)} book still covers its debt service under this stress.`;
  $('#kpis').innerHTML = [
    ['Exposure below the 1.25× covenant', L(p.belowCovenant), `was ${L(p.baseBelowCovenant)}`, p.belowCovenant > p.baseBelowCovenant],
    ['Facility-weighted score', `${p.stressedWeightedScore.toFixed(0)}/100`, `was ${p.weightedScore.toFixed(0)}`, p.stressedWeightedScore < p.weightedScore - 0.5],
    ['Expected loss, illustrative', L(p.stressedEl, 1), `was ${L(p.baseEl, 1)}`, p.stressedEl > p.baseEl + 0.05],
    ['Borrowers downgraded', `${p.migration.downgrades} of ${p.rows.length}`, '', p.migration.downgrades > 0],
  ].map(([k, v, s, bad]) => `<dl class="kpi ${bad ? 'bad' : ''}"><dt>${k}</dt><dd>${v}${s ? `<small>${s}</small>` : ''}</dd></dl>`).join('');

  const maxX = Math.max(3, ...p.rows.map((r) => r.baseDscr)) + 0.2;
  mount($('#scatter'), (width) => scatterChart({
    width, height: width < 560 ? 320 : 400, xLabel: 'Debt-service cover (×)', yLabel: 'Debt to net worth (×)',
    xFormat: (v) => v.toFixed(1), yFormat: (v) => v.toFixed(1), xDomain: [0, maxX], label: 'Borrowers by stressed debt-service cover and leverage',
    refX: [{ v: 1, label: '1.0×', cls: 'one', side: 'left' }, { v: 1.25, label: 'Covenant 1.25×', cls: 'cov' }],
    segments: p.rows.map((r) => ({ x1: r.baseDscr, y1: r.exact.leverage, x2: r.stressedDscr, y2: r.exact.leverage })),
    points: [
      ...p.rows.map((r) => ({ x: r.baseDscr, y: r.exact.leverage, r: 4, cls: 'ghost' })),
      ...p.rows.map((r, i) => ({
        x: r.stressedDscr, y: r.exact.leverage, r: 4 + Math.sqrt(r.facility) * 1.15, cls: r.status, id: String(i),
        tag: r.status === 'breach' ? r.borrower.name.split(' ')[0] : '',
        label: `${r.borrower.name}: cover ${x2(r.baseDscr)} → ${x2(r.stressedDscr)}, facility ${L(r.facility)}`,
      })),
    ],
  }));

  const watch = p.rows.map((r, i) => ({ ...r, i })).filter((r) => r.status !== 'safe').sort((a, b) => a.stressedDscr - b.stressedDscr);
  $('#watchCount').textContent = `${watch.length} of ${p.rows.length} borrowers`;
  $('#watchlist').innerHTML = watch.length ? watch.map((r) => `<li class="${r.status}"><a href="#file" data-pick="${r.i}"><i></i><b>${esc(r.borrower.name)}</b><small>${esc(r.borrower.sector)}, ${L(r.facility)}, grade ${r.grade}${r.stressed.grade !== r.grade ? ` → ${r.stressed.grade}` : ''}</small><span class="dscr">${x2(r.stressedDscr)}<small>was ${x2(r.baseDscr)}</small></span></a></li>`).join('')
    : '<li class="empty">No borrower falls below the 1.25× covenant under this stress.</li>';
}

/* ---------------- Queue ---------------- */
const COLS = [
  ['name', 'Borrower', (r) => r.borrower.name], ['sector', 'Sector', (r) => r.borrower.sector], ['facility', 'Facility', (r) => r.facility],
  ['score', 'Score', (r) => r.score], ['grade', 'Grade', (r) => GRADES.findIndex((g) => g.grade === r.stressed.grade)],
  ['baseDscr', 'Cover today', (r) => r.baseDscr], ['stressedDscr', 'Cover stressed', (r) => r.stressedDscr],
  ['leverage', 'Debt / net worth', (r) => r.exact.leverage], ['liquidity', 'Current ratio', (r) => r.exact.liquidity],
  ['ltv', 'Loan to value', (r) => r.ltv ?? Infinity], ['el', 'Expected loss', (r) => r.stressedEl],
];
function renderQueue() {
  const p = state.p;
  const sectors = [...new Set(state.edits.map((c) => c.sector))].sort();
  if ($('#sector').options.length !== sectors.length + 1) $('#sector').innerHTML = '<option value="">All sectors</option>' + sectors.map((s) => `<option>${esc(s)}</option>`).join('');
  const col = COLS.find((c) => c[0] === state.sort.key);
  const rows = p.rows.map((r, i) => ({ ...r, i }))
    .filter((r) => (!state.sector || r.borrower.sector === state.sector) && (!state.status || r.status === state.status))
    .sort((a, b) => { const va = col[2](a), vb = col[2](b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * state.sort.dir; });
  $('#queueTable').innerHTML = `<thead><tr>${COLS.map(([k, label]) => `<th scope="col"${k === state.sort.key ? ` aria-sort="${state.sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${k}">${label}</button></th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `
    <tr data-pick="${r.i}"><td><a href="#file" data-pick="${r.i}">${esc(r.borrower.name)}</a><small>${esc(r.borrower.id)}</small></td><td>${esc(r.borrower.sector)}</td><td>${L(r.facility)}</td><td>${r.score}</td>
    <td class="grade">${r.grade}${r.stressed.grade !== r.grade ? ` <span class="down">→ ${r.stressed.grade}</span>` : ''}</td><td>${x2(r.baseDscr)}</td><td><span class="pill ${r.status}">${x2(r.stressedDscr)}</span></td>
    <td>${x2(r.exact.leverage)}</td><td>${x2(r.exact.liquidity)}</td><td>${r.ltv === null ? 'Unsecured' : pct(r.ltv)}</td><td>${L(r.stressedEl, 2)}</td></tr>`).join('') : `<tr><td colspan="${COLS.length}" class="empty">No borrowers match these filters. Clear a filter to see more.</td></tr>`}</tbody>`;

  const c = p.concentration;
  $('#hhi').textContent = `HHI ${Math.round(c.hhi).toLocaleString('en-IN')} (${c.hhi < 1500 ? 'unconcentrated' : c.hhi < 2500 ? 'moderately concentrated' : 'highly concentrated'}). Largest three borrowers: ${pct(c.top3Share)} of the book.`;
  mount($('#sectors'), (width) => barChart({ width, rowHeight: 26, format: (v) => `${v.toFixed(0)}%`, label: 'Exposure share by sector', items: c.sectors.map((s) => ({ label: s.sector, value: s.share * 100, cls: s.share > 0.15 ? 'hi' : '' })) }));
  const m = p.migration;
  $('#migration').innerHTML = `<thead><tr><th></th>${m.grades.map((g) => `<th scope="col">${g}</th>`).join('')}</tr></thead><tbody>${m.matrix.map((row, i) => `<tr><th scope="row">${m.grades[i]}</th>${row.map((n, j) => `<td class="${n === 0 ? 'zero' : i === j ? 'diag' : j > i ? 'down' : ''}">${n}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('#migrationNote').textContent = m.downgrades ? `${m.downgrades} borrower${m.downgrades === 1 ? '' : 's'} move down at least one grade. Shaded red cells sit right of the diagonal.` : 'No grade changes under this stress.';
}

/* ---------------- Borrower file ---------------- */
function buildFile() {
  $('#borrower').innerHTML = state.edits.map((c, i) => `<option value="${i}">${esc(c.name)} (${esc(c.id)})</option>`).join('');
  $('#fields').innerHTML = FIELDS.map(([k, label]) => `<label>${label}<input type="number" id="f-${k}" step="any" min="0"></label>`).join('');
}
function fillFile() {
  const c = state.edits[state.sel];
  $('#borrower').value = String(state.sel);
  for (const [k] of FIELDS) $(`#f-${k}`).value = c[k];
  $('#f-gstMonths').value = c.gstMonths; $('#f-bankStatements').checked = c.bankStatements; $('#f-audited').checked = c.audited;
}
function readFile() {
  const next = { ...state.edits[state.sel] };
  for (const [k, label] of FIELDS) {
    const v = Number($(`#f-${k}`).value);
    if ($(`#f-${k}`).value === '' || !Number.isFinite(v)) throw Error(`${label} needs a number.`);
    next[k] = v;
  }
  next.gstMonths = Number($('#f-gstMonths').value); next.bankStatements = $('#f-bankStatements').checked; next.audited = $('#f-audited').checked;
  analyzeBorrower(next); // validates
  state.edits[state.sel] = next;
}
function renderFile() {
  const r = state.p.rows[state.sel], b = r.borrower;
  $('#fileName').textContent = `${b.name}, ${b.sector.toLowerCase()}`;
  $('#verdict').className = `verdict ${coverStatus(r.baseDscr)}`;
  $('#verdict').innerHTML = `<div class="big">${r.score}<small>of 100, grade ${r.grade}</small></div>
    <p><b>${r.band}.</b> Cash available covers annual debt service ${x2(r.baseDscr)} today${r.flags.length ? `, with ${r.flags.length} diligence item${r.flags.length === 1 ? '' : 's'} open` : ''}.</p>
    <div class="stressbox"><span>Under the current stress</span><strong class="${r.status === 'safe' ? '' : 'down'}">${x2(r.stressedDscr)}, grade ${r.stressed.grade}</strong></div>`;
  $('#scorebars').innerHTML = r.components.map((c) => { const f = c.score / c.max; return `<div class="sb"><span>${c.name}</span><div class="track" role="img" aria-label="${c.score} of ${c.max}"><span class="${f < 0.34 ? 'low' : f < 0.67 ? 'mid' : ''}" style="width:${(f * 100).toFixed(0)}%"></span></div><b>${c.score} / ${c.max}</b></div>`; }).join('');
  const e = r.exact;
  const ratio = (name, val, fmt, rule, ok, warn) => `<dl class="ratio ${ok ? '' : warn ? 'watch' : 'breach'}"><dt>${name}</dt><dd>${fmt(val)}</dd><p class="rule">${rule}</p></dl>`;
  $('#ratios').innerHTML = [
    ratio('Debt-service cover', e.dscr, x2, 'Monitoring threshold 1.25×', e.dscr >= 1.25, e.dscr >= 1),
    ratio('Interest cover', e.coverage, x2, 'Comfortable at 2.0× or more', e.coverage >= 2, e.coverage >= 1),
    ratio('Current ratio', e.liquidity, x2, 'Below 1.0× flags a liquidity gap', e.liquidity >= 1.2, e.liquidity >= 1),
    ratio('Debt to net worth', e.leverage, x2, 'Flag above 2.0×', e.leverage <= 2, e.leverage <= 3),
    ratio('Revenue growth', e.growth, (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`, 'Contraction is flagged', e.growth >= 0, e.growth >= -0.1),
    ratio('Loan to collateral', r.ltv ?? NaN, (v) => (Number.isFinite(v) ? pct(v) : 'Unsecured'), 'Facility as a share of collateral', r.ltv !== null && r.ltv <= 0.8, r.ltv !== null && r.ltv <= 1),
  ].join('');
  $('#flags').innerHTML = r.flags.length ? r.flags.map((f) => `<li>${esc(f)}.</li>`).join('') : '<li>No automated flags. Manual underwriting is still required.</li>';
}

/* ---------------- Facility ---------------- */
function fillFacility() {
  const b = state.edits[state.sel];
  Object.entries({ principal: b.facility, rate: 11.5, months: 60, collateral: b.collateral, haircut: 30, undrawn: Math.round(b.facility * 0.1), ccf: 50, lgd: 45 }).forEach(([k, v]) => { $(`#${k}`).value = v; });
  state.facFor = state.sel;
}
function renderFacility() {
  if (state.facFor !== state.sel) fillFacility();
  const r = state.p.rows[state.sel], b = r.borrower, n = (id) => Number($(`#${id}`).value);
  $('#facName').textContent = b.name;
  const pd = GRADES.find((g) => g.grade === r.grade).pd;
  let m, ms;
  try {
    const terms = { principal: n('principal'), annualRate: n('rate') / 100, months: Math.round(n('months')), collateral: n('collateral'), haircut: n('haircut') / 100, ccf: n('ccf') / 100, lgd: n('lgd') / 100, undrawn: n('undrawn'), pd };
    m = creditModel({ ...terms, cfads: b.cfads, existingService: b.debtService });
    const s = state.shocks, extra = (b.debt * s.rateShockBps) / 10000;
    ms = creditModel({ ...terms, annualRate: terms.annualRate + s.rateShockBps / 10000, cfads: b.cfads * (1 - s.cashflowShock), existingService: b.debtService + extra });
    $('#facErr').hidden = true;
  } catch (e) { $('#facErr').hidden = false; $('#facErr').textContent = e.message; return; }
  $('#facKpis').innerHTML = [
    ['Monthly instalment', L(m.payment, 2), '', false],
    ['First-year cover with this loan', x2(m.dscr), `stressed ${x2(ms.dscr)}`, m.dscr < 1.25],
    ['Collateral cover after haircut', `${m.adjustedCoverage.toFixed(2)}×`, m.ltv === null ? 'unsecured' : `LTV ${pct(m.ltv)}`, m.adjustedCoverage < 1],
    ['Expected loss, illustrative', L(m.expectedLoss, 2), `PD ${pct(pd, 1)}, EAD ${L(m.ead, 1)}`, false],
  ].map(([k, v, s, bad]) => `<dl class="kpi ${bad ? 'bad' : ''}"><dt>${k}</dt><dd>${v}${s ? `<small>${s}</small>` : ''}</dd></dl>`).join('');
  const ok = m.dscr >= 1.25, okS = ms.dscr >= 1.25;
  $('#facVerdict').className = `verdict-line ${ok && okS ? '' : 'breach'}`;
  $('#facVerdict').textContent = ok
    ? (okS ? `Clears the 1.25× covenant today (${x2(m.dscr)}) and under the current stress (${x2(ms.dscr)}).` : `Clears the covenant today at ${x2(m.dscr)} but falls to ${x2(ms.dscr)} under the current stress. Consider a longer tenor or a smaller amount.`)
    : `Fails the 1.25× covenant at ${x2(m.dscr)} even before stress. Existing debt service of ${L(b.debtService)} leaves too little room; reduce the amount or extend the tenor.`;
  const labels = m.schedule.map((s) => `M${s.month}`);
  let cum = 0; const cumInt = m.schedule.map((s) => (cum += s.interest));
  mount($('#amort'), (width) => {
    const c = lineChart({ width, height: 240, labels, yFormat: (v) => `₹${Math.round(v)} L`, series: [{ values: m.schedule.map((s) => s.balance) }, { values: cumInt, cls: 'alt' }], label: 'Outstanding balance and cumulative interest by month' });
    return { svg: c.svg, after: (node) => lineHover(node, { ...c, count: labels.length }, (k) => `<b>Month ${k + 1}</b><br>Balance ${L(m.schedule[k].balance, 1)}<br>Interest paid so far ${L(cumInt[k], 1)}`) };
  });
}

/* ---------------- Memo ---------------- */
function renderMemo() {
  const r = state.p.rows[state.sel];
  $('#memo').textContent = makeMemo(r, stressBorrower(r.borrower, state.shocks)) + `\n\nSTRESS APPLIED: cash flow −${Math.round(state.shocks.cashflowShock * 100)}%, rates +${state.shocks.rateShockBps} bps on all existing debt.`;
}

/* ---------------- Wiring ---------------- */
function pick(i) { state.sel = Number(i); fillFile(); recalc(); }
buildFile(); fillFile(); syncDials();
let t; const soon = () => { clearTimeout(t); t = setTimeout(recalc, 60); };
$('#cf').addEventListener('input', () => { state.shocks.cashflowShock = Number($('#cf').value) / 100; syncDials(); soon(); });
$('#bps').addEventListener('input', () => { state.shocks.rateShockBps = Number($('#bps').value); syncDials(); soon(); });
$$('.presets button').forEach((b) => b.addEventListener('click', () => { state.shocks = { cashflowShock: Number(b.dataset.cf) / 100, rateShockBps: Number(b.dataset.bps) }; syncDials(); recalc(); }));
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-pick]');
  if (el) { pick(el.dataset.pick); if (el.tagName !== 'A') location.hash = 'file'; }
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) { const k = sortBtn.dataset.sort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 }; renderQueue(); }
  const chip = e.target.closest('.chips button');
  if (chip) { state.status = chip.dataset.status; $$('.chips button').forEach((c) => c.setAttribute('aria-pressed', String(c === chip))); renderQueue(); }
});
$('#scatter').addEventListener('click', (e) => { const g = e.target.closest('.pt[data-id]'); if (g) { pick(g.dataset.id); location.hash = 'file'; } });
$('#scatter').addEventListener('keydown', (e) => { const g = e.target.closest('.pt[data-id]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(g.dataset.id); location.hash = 'file'; } });
$('#sector').addEventListener('change', (e) => { state.sector = e.target.value; renderQueue(); });
$('#borrower').addEventListener('change', (e) => pick(e.target.value));
$('#fileForm').addEventListener('input', () => {
  try { readFile(); $('#fileErr').hidden = true; soon(); } catch (err) { $('#fileErr').hidden = false; $('#fileErr').textContent = err.message; }
});
$('#resetFile').addEventListener('click', () => { state.edits[state.sel] = { ...CASES[state.sel] }; fillFile(); state.facFor = -1; recalc(); });
$('#facForm').addEventListener('input', () => renderFacility());
$('#csv').addEventListener('click', () => download('credence-loan-book.csv', ['Id,Borrower,Sector,Facility INR lakh,Score,Grade,Stressed grade,DSCR,Stressed DSCR,Debt/net worth,Current ratio,LTV,Stressed EL INR lakh',
  ...state.p.rows.map((r) => [r.borrower.id, `"${r.borrower.name}"`, `"${r.borrower.sector}"`, r.facility, r.score, r.grade, r.stressed.grade, r.baseDscr.toFixed(3), r.stressedDscr.toFixed(3), r.exact.leverage.toFixed(3), r.exact.liquidity.toFixed(3), r.ltv === null ? '' : r.ltv.toFixed(3), r.stressedEl.toFixed(3)].join(','))].join('\n'), 'text/csv'));
$('#memoDl').addEventListener('click', () => download(`credence-${state.edits[state.sel].id}-credit-note.txt`, $('#memo').textContent));
router($$('[data-view]'), (id) => {
  document.title = `Credence — ${{ book: 'MSME credit surveillance', queue: 'review queue', file: 'borrower file', facility: 'facility structuring', memo: 'credit note' }[id]}`;
  if (state.p) requestAnimationFrame(recalc);
});
recalc();
