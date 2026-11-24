/*
 * Credence credit engine — pure functions, no DOM.
 * A transparent, rules-based monitoring scorecard for a fictional MSME loan book.
 * It is NOT a probability-of-default model, a rating, or a lending decision. Amounts in INR lakh.
 */

const B = (id, name, sector, facility, collateral, f, docs) => ({ id, name, sector, facility, collateral, ...f, ...docs });
// f: revenue, prevRevenue, ebit, ebitda, debt, equity, currentAssets, currentLiabilities, interest, debtService, cfads
export const CASES = [
  B('AST-001', 'Aster Components', 'Auto components', 75, 100, { revenue: 420, prevRevenue: 350, ebit: 67, ebitda: 84, debt: 140, equity: 210, currentAssets: 190, currentLiabilities: 100, interest: 14, debtService: 38, cfads: 74 }, { gstMonths: 12, bankStatements: true, audited: true }),
  B('VAR-002', 'Varuna Foods', 'Food processing', 48, 55, { revenue: 260, prevRevenue: 240, ebit: 28, ebitda: 44, debt: 165, equity: 100, currentAssets: 75, currentLiabilities: 92, interest: 18, debtService: 55, cfads: 41 }, { gstMonths: 10, bankStatements: true, audited: false }),
  B('RVT-003', 'Rivet Auto', 'Components distribution', 60, 50, { revenue: 310, prevRevenue: 400, ebit: 17, ebitda: 40, debt: 220, equity: 70, currentAssets: 80, currentLiabilities: 120, interest: 27, debtService: 68, cfads: 24 }, { gstMonths: 6, bankStatements: false, audited: false }),
  B('KSH-004', 'Kaveri Spinning Mills', 'Textiles', 90, 120, { revenue: 520, prevRevenue: 545, ebit: 44, ebitda: 70, debt: 260, equity: 150, currentAssets: 210, currentLiabilities: 175, interest: 27, debtService: 56, cfads: 66 }, { gstMonths: 12, bankStatements: true, audited: true }),
  B('MDL-005', 'Medilane Formulations', 'Pharmaceuticals', 55, 80, { revenue: 380, prevRevenue: 318, ebit: 61, ebitda: 74, debt: 95, equity: 240, currentAssets: 170, currentLiabilities: 92, interest: 9, debtService: 28, cfads: 63 }, { gstMonths: 12, bankStatements: true, audited: true }),
  B('TRV-006', 'Trivedi Freight Lines', 'Logistics', 70, 85, { revenue: 290, prevRevenue: 270, ebit: 38, ebitda: 64, debt: 180, equity: 95, currentAssets: 102, currentLiabilities: 84, interest: 18, debtService: 40, cfads: 55 }, { gstMonths: 11, bankStatements: true, audited: true }),
  B('GRN-007', 'Greenfield Agro Mills', 'Agri processing', 40, 50, { revenue: 210, prevRevenue: 196, ebit: 23, ebitda: 32, debt: 88, equity: 72, currentAssets: 96, currentLiabilities: 70, interest: 9, debtService: 18, cfads: 27 }, { gstMonths: 12, bankStatements: true, audited: false }),
  B('CDX-008', 'Codex Digital Services', 'IT services', 25, 10, { revenue: 140, prevRevenue: 112, ebit: 25, ebitda: 29, debt: 20, equity: 85, currentAssets: 74, currentLiabilities: 31, interest: 2.2, debtService: 8, cfads: 24 }, { gstMonths: 12, bankStatements: true, audited: true }),
  B('STH-009', 'Sthapati Builders', 'Construction', 110, 140, { revenue: 460, prevRevenue: 505, ebit: 46, ebitda: 62, debt: 300, equity: 110, currentAssets: 340, currentLiabilities: 310, interest: 30, debtService: 50, cfads: 54 }, { gstMonths: 9, bankStatements: true, audited: false }),
  B('PLC-010', 'Pallava Chemicals', 'Specialty chemicals', 65, 95, { revenue: 330, prevRevenue: 300, ebit: 44, ebitda: 62, debt: 150, equity: 160, currentAssets: 140, currentLiabilities: 105, interest: 15, debtService: 38, cfads: 55 }, { gstMonths: 12, bankStatements: true, audited: true }),
  B('BZR-011', 'Bazaar Street Retail', 'Retail', 30, 20, { revenue: 240, prevRevenue: 226, ebit: 16, ebitda: 24, debt: 70, equity: 40, currentAssets: 82, currentLiabilities: 79, interest: 8, debtService: 17, cfads: 21 }, { gstMonths: 12, bankStatements: false, audited: false }),
  B('HLS-012', 'Hillside Stays', 'Hospitality', 45, 110, { revenue: 120, prevRevenue: 98, ebit: 22, ebitda: 34, debt: 115, equity: 60, currentAssets: 22, currentLiabilities: 30, interest: 12, debtService: 19, cfads: 30 }, { gstMonths: 10, bankStatements: true, audited: true }),
];

/** Score → internal grade, with an illustrative 12-month PD used only for expected-loss arithmetic. */
export const GRADES = [
  { grade: 'A', min: 85, pd: 0.005 },
  { grade: 'B+', min: 75, pd: 0.01 },
  { grade: 'B', min: 65, pd: 0.02 },
  { grade: 'C+', min: 55, pd: 0.04 },
  { grade: 'C', min: 45, pd: 0.08 },
  { grade: 'D', min: 0, pd: 0.15 },
];
export const gradeFor = (score) => GRADES.find((g) => score >= g.min);

const r2 = (x) => Math.round(x * 100) / 100;

export function analyzeBorrower(b) {
  const nums = ['revenue', 'prevRevenue', 'ebit', 'ebitda', 'debt', 'equity', 'currentAssets', 'currentLiabilities', 'interest', 'debtService', 'cfads', 'gstMonths'];
  if (nums.some((k) => typeof b[k] !== 'number' || !Number.isFinite(b[k]))) throw Error('Financial inputs must be finite numbers.');
  if (b.revenue <= 0 || b.prevRevenue <= 0 || b.equity <= 0 || b.debtService <= 0 || b.interest <= 0 || b.currentLiabilities <= 0 || b.gstMonths < 0 || b.gstMonths > 12 || !Number.isInteger(b.gstMonths) || b.debt < 0 || b.currentAssets < 0 || b.cfads < 0) {
    throw Error('Inputs contain non-physical or invalid balances.');
  }
  const dscr = b.cfads / b.debtService, leverage = b.debt / b.equity, liquidity = b.currentAssets / b.currentLiabilities, growth = b.revenue / b.prevRevenue - 1, coverage = b.ebit / b.interest;
  const components = [
    { key: 'dscr', name: 'Debt service coverage', value: dscr, score: dscr >= 1.5 ? 25 : dscr >= 1.25 ? 18 : dscr >= 1 ? 8 : 0, max: 25 },
    { key: 'liquidity', name: 'Current ratio', value: liquidity, score: liquidity >= 1.5 ? 18 : liquidity >= 1.2 ? 12 : liquidity >= 1 ? 6 : 0, max: 18 },
    { key: 'leverage', name: 'Debt / equity', value: leverage, score: leverage <= 1 ? 16 : leverage <= 2 ? 10 : leverage <= 3 ? 5 : 0, max: 16 },
    { key: 'growth', name: 'Revenue growth', value: growth, score: growth >= 0.1 ? 14 : growth >= 0 ? 9 : growth >= -0.1 ? 4 : 0, max: 14 },
    { key: 'icr', name: 'Interest coverage', value: coverage, score: coverage >= 3 ? 15 : coverage >= 2 ? 9 : coverage >= 1 ? 4 : 0, max: 15 },
    { key: 'docs', name: 'Documentation', value: null, score: (b.gstMonths === 12 ? 4 : b.gstMonths >= 9 ? 2 : 0) + (b.bankStatements ? 4 : 0) + (b.audited ? 4 : 0), max: 12 },
  ];
  const score = components.reduce((a, c) => a + c.score, 0), notes = [];
  if (dscr < 1.25) notes.push('Debt-service coverage below the illustrative 1.25× monitoring threshold');
  if (liquidity < 1) notes.push('Current liabilities exceed current assets');
  if (leverage > 2) notes.push('Debt-to-equity above the illustrative 2.0× threshold');
  if (growth < 0) notes.push('Revenue contracted year on year');
  if (b.gstMonths < 12) notes.push(`GST returns on file for ${b.gstMonths} of 12 months`);
  if (!b.bankStatements) notes.push('Bank statements missing from the loan file');
  if (!b.audited) notes.push('Audited financial statements not on file');
  return {
    borrower: b, score, grade: gradeFor(score).grade,
    band: score >= 80 ? 'Lower monitoring attention' : score >= 60 ? 'Further diligence required' : 'Elevated monitoring attention',
    components, ratios: { dscr: r2(dscr), leverage: r2(leverage), liquidity: r2(liquidity), growthPct: r2(growth * 100), interestCoverage: r2(coverage) },
    exact: { dscr, leverage, liquidity, growth, coverage }, flags: notes,
  };
}

/** Status used for colour and watchlist logic. */
export function coverStatus(dscr) { return dscr < 1 ? 'breach' : dscr < 1.25 ? 'watch' : 'safe'; }

/**
 * Apply a combined shock: cash available for debt service and EBIT fall by `cashflowShock`,
 * and interest on all existing debt reprices by `rateShockBps` (floating-rate assumption).
 */
export function stressBorrower(b, { cashflowShock = 0.2, rateShockBps = 0 } = {}) {
  if (!(cashflowShock >= 0 && cashflowShock < 1) || !(rateShockBps >= 0 && rateShockBps <= 1000)) throw Error('Shocks must be 0–99% for cash flow and 0–1,000 bps for rates.');
  const extraInterest = (b.debt * rateShockBps) / 10000;
  const stressed = { ...b, cfads: b.cfads * (1 - cashflowShock), ebit: b.ebit * (1 - cashflowShock), interest: b.interest + extraInterest, debtService: b.debtService + extraInterest };
  return analyzeBorrower(stressed);
}

/** Original fixed scenario (CFADS −20%, debt service +10%), kept for continuity. */
export function borrowerStress(b) {
  const base = analyzeBorrower(b), scenario = analyzeBorrower({ ...b, cfads: b.cfads * 0.8, debtService: b.debtService * 1.1 });
  return { baseDscr: base.ratios.dscr, stressedDscr: scenario.ratios.dscr, baseScore: base.score, stressedScore: scenario.score, assumptions: 'CFADS -20%, debt service +10%' };
}

/** Expected loss = PD × LGD × EAD, where PD comes from the illustrative grade table. */
export function expectedLoss(score, ead, lgd = 0.45) { return gradeFor(score).pd * lgd * ead; }

export function portfolioSummary(cases, shocks = { cashflowShock: 0.2, rateShockBps: 0 }) {
  if (!Array.isArray(cases) || !cases.length) throw Error('Provide at least one case.');
  const rows = cases.map((b) => {
    const base = analyzeBorrower(b), stressed = stressBorrower(b, shocks), facility = b.facility || 0;
    return {
      ...base, facility, stress: borrowerStress(b), stressed,
      baseDscr: base.exact.dscr, stressedDscr: stressed.exact.dscr, status: coverStatus(stressed.exact.dscr),
      baseEl: expectedLoss(base.score, facility), stressedEl: expectedLoss(stressed.score, facility),
      ltv: b.collateral > 0 ? facility / b.collateral : null,
    };
  });
  const totalFacility = rows.reduce((n, a) => n + a.facility, 0);
  const sumWhere = (fn) => rows.filter(fn).reduce((n, a) => n + a.facility, 0);
  return {
    rows, totalFacility,
    weightedScore: totalFacility > 0 ? rows.reduce((n, a) => n + a.score * a.facility, 0) / totalFacility : rows.reduce((n, a) => n + a.score, 0) / rows.length,
    stressedWeightedScore: totalFacility > 0 ? rows.reduce((n, a) => n + a.stressed.score * a.facility, 0) / totalFacility : 0,
    flagged: rows.filter((a) => a.score < 60).length,
    belowOne: sumWhere((a) => a.stressedDscr < 1), belowCovenant: sumWhere((a) => a.stressedDscr < 1.25),
    baseBelowCovenant: sumWhere((a) => a.baseDscr < 1.25),
    baseEl: rows.reduce((n, a) => n + a.baseEl, 0), stressedEl: rows.reduce((n, a) => n + a.stressedEl, 0),
    migration: migration(rows), concentration: concentration(rows),
  };
}

/** Count of borrowers moving from each base grade to each stressed grade. */
export function migration(rows) {
  const g = GRADES.map((x) => x.grade), m = g.map(() => g.map(() => 0));
  for (const r of rows) m[g.indexOf(r.grade)][g.indexOf(r.stressed.grade)]++;
  return { grades: g, matrix: m, downgrades: rows.filter((r) => g.indexOf(r.stressed.grade) > g.indexOf(r.grade)).length };
}

/** Exposure share by sector and the Herfindahl–Hirschman index (0–10,000). */
export function concentration(rows) {
  const total = rows.reduce((n, r) => n + r.facility, 0) || 1, by = new Map();
  for (const r of rows) by.set(r.borrower.sector, (by.get(r.borrower.sector) || 0) + r.facility);
  const sectors = [...by].map(([sector, exposure]) => ({ sector, exposure, share: exposure / total })).sort((a, b) => b.exposure - a.exposure);
  const hhi = sectors.reduce((n, s) => n + (s.share * 100) ** 2, 0);
  const top = [...rows].sort((a, b) => b.facility - a.facility).slice(0, 3).reduce((n, r) => n + r.facility, 0) / total;
  return { sectors, hhi, top3Share: top };
}

/** Term-loan structuring (moved from the old advanced.js): amortisation, DSCR with the new loan, LTV and EL. */
export function creditModel({ principal, annualRate, months, collateral, haircut, cfads, existingService, pd, lgd, ccf, undrawn }) {
  if ([principal, annualRate, months, collateral, haircut, cfads, existingService, pd, lgd, ccf, undrawn].some((x) => !Number.isFinite(x)) || principal <= 0 || months < 1 || months > 360 || !Number.isInteger(months) || annualRate < 0 || annualRate > 1 || [haircut, pd, lgd, ccf].some((x) => x < 0 || x > 1) || [collateral, cfads, existingService, undrawn].some((x) => x < 0)) {
    throw Error('Check the facility terms: tenor 1–360 whole months, rates and percentages between 0% and 100%, amounts not negative.');
  }
  const r = annualRate / 12, payment = r === 0 ? principal / months : (principal * r) / (-Math.expm1(-months * Math.log1p(r)));
  let balance = principal;
  const schedule = [];
  for (let m = 1; m <= months; m++) {
    const interest = balance * r, paid = m === months ? balance + interest : payment, amort = paid - interest;
    balance = Math.max(0, balance - amort);
    schedule.push({ month: m, payment: paid, interest, principal: amort, balance });
  }
  const yearService = schedule.slice(0, 12).reduce((s, x) => s + x.payment, 0) + existingService, dscr = cfads / yearService, ead = principal + ccf * undrawn;
  return { schedule, payment, yearService, dscr, ltv: collateral === 0 ? null : principal / collateral, adjustedCoverage: (collateral * (1 - haircut)) / principal, expectedLoss: pd * lgd * ead, ead, breach: dscr < 1.25, totalInterest: schedule.reduce((s, x) => s + x.interest, 0) };
}

export function makeMemo(a, stressed) {
  const b = a.borrower, L = (x) => `INR ${Number(x).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
  return [
    'CREDENCE | CREDIT REVIEW NOTE (ILLUSTRATIVE)',
    `Borrower: ${b.name} (${b.id}), ${b.sector}. Proposed facility ${L(b.facility || 0)}.`,
    'All figures synthetic; INR lakh.',
    '',
    'FINANCIAL POSITION',
    `Revenue ${L(b.revenue)}, ${a.ratios.growthPct >= 0 ? 'up' : 'down'} ${Math.abs(a.ratios.growthPct)}% year on year.`,
    `DSCR (CFADS / annual debt service): ${a.ratios.dscr}×   Interest cover (EBIT / interest): ${a.ratios.interestCoverage}×`,
    `Current ratio: ${a.ratios.liquidity}×   Debt / equity: ${a.ratios.leverage}×`,
    `Scorecard: ${a.score}/100, internal grade ${a.grade} (${a.band}).`,
    '',
    'SCORE BUILD',
    ...a.components.map((c) => `${c.name.padEnd(24)} ${String(c.score).padStart(2)} / ${c.max}`),
    '',
    stressed ? 'STRESS' : '',
    stressed ? `Under the applied shock DSCR moves to ${stressed.ratios.dscr}× and the grade to ${stressed.grade} (score ${stressed.score}).` : '',
    '',
    'DILIGENCE ITEMS',
    ...(a.flags.length ? a.flags.map((x, i) => `${i + 1}. ${x}.`) : ['No automated flags on the sample inputs. Manual underwriting is still required.']),
    '',
    'ANALYST INTERPRETATION',
    'The score is a transparent educational monitoring indicator. It is NOT a probability of default, a validated model, a credit rating, a sanction or bank policy. Verify cash-flow quality, existing debt schedules, bank statements, collateral and promoter disclosures independently.',
  ].filter((x, i, arr) => !(x === '' && arr[i - 1] === '')).join('\n');
}
