import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASES, GRADES, gradeFor, analyzeBorrower, coverStatus, stressBorrower, borrowerStress, expectedLoss,
  portfolioSummary, migration, concentration, creditModel, makeMemo,
} from '../src/engine.js';

const approx = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test('every synthetic borrower is valid and internally plausible', () => {
  assert.equal(CASES.length, 12);
  assert.equal(new Set(CASES.map((c) => c.id)).size, 12);
  for (const c of CASES) {
    const a = analyzeBorrower(c);
    assert.ok(a.score >= 0 && a.score <= 100, c.id);
    assert.ok(c.ebitda >= c.ebit, `${c.id}: EBITDA should be at least EBIT`);
    assert.ok(c.debtService >= c.interest, `${c.id}: debt service includes interest`);
    assert.ok(c.facility > 0 && c.collateral >= 0, c.id);
  }
});

test('original three cases keep their DSCR, leverage and score ordering', () => {
  const [a, b, c] = CASES.slice(0, 3).map(analyzeBorrower);
  approx(a.ratios.dscr, 1.95, 0.01); approx(a.ratios.leverage, 0.67, 0.01);
  assert.ok(a.score > b.score && b.score > c.score);
  assert.equal(a.components.reduce((s, x) => s + x.max, 0), 100);
  assert.match(makeMemo(a), /NOT a probability of default/);
});

test('grades are monotone in score and PD rises as grade falls', () => {
  assert.equal(gradeFor(100).grade, 'A'); assert.equal(gradeFor(0).grade, 'D'); assert.equal(gradeFor(75).grade, 'B+');
  for (let i = 1; i < GRADES.length; i++) assert.ok(GRADES[i].pd > GRADES[i - 1].pd);
  approx(expectedLoss(90, 100), 0.005 * 0.45 * 100);
});

test('cash-flow and rate shocks lower coverage; zero shock changes nothing', () => {
  const b = CASES[0], base = analyzeBorrower(b);
  assert.equal(stressBorrower(b, { cashflowShock: 0, rateShockBps: 0 }).score, base.score);
  const cf = stressBorrower(b, { cashflowShock: 0.3 }), rate = stressBorrower(b, { cashflowShock: 0, rateShockBps: 200 });
  approx(cf.exact.dscr, (b.cfads * 0.7) / b.debtService);
  approx(rate.exact.dscr, b.cfads / (b.debtService + b.debt * 0.02));
  assert.ok(rate.exact.coverage < base.exact.coverage);
  assert.throws(() => stressBorrower(b, { cashflowShock: 1.2 }));
  const s = borrowerStress(b);
  assert.ok(s.stressedDscr < s.baseDscr && s.stressedScore <= s.baseScore);
});

test('cover status thresholds', () => {
  assert.equal(coverStatus(0.9), 'breach'); assert.equal(coverStatus(1.1), 'watch'); assert.equal(coverStatus(1.25), 'safe');
});

test('portfolio: exposure buckets, EL and migration reconcile', () => {
  const p = portfolioSummary(CASES, { cashflowShock: 0.2, rateShockBps: 100 });
  approx(p.totalFacility, CASES.reduce((s, c) => s + c.facility, 0));
  assert.ok(p.belowOne <= p.belowCovenant && p.belowCovenant <= p.totalFacility);
  assert.ok(p.stressedEl >= p.baseEl);
  assert.ok(p.stressedWeightedScore <= p.weightedScore);
  const cells = p.migration.matrix.flat().reduce((a, b) => a + b, 0);
  assert.equal(cells, CASES.length);
  // No shock: nobody migrates.
  assert.equal(portfolioSummary(CASES, { cashflowShock: 0, rateShockBps: 0 }).migration.downgrades, 0);
  assert.throws(() => portfolioSummary([]));
});

test('concentration: shares sum to one and HHI is bounded', () => {
  const c = concentration(portfolioSummary(CASES).rows);
  approx(c.sectors.reduce((s, x) => s + x.share, 0), 1);
  assert.ok(c.hhi > 10000 / c.sectors.length - 1e-9 && c.hhi <= 10000);
  const single = concentration([{ facility: 10, borrower: { sector: 'X' } }]);
  approx(single.hhi, 10000);
  assert.ok(migration(portfolioSummary(CASES).rows).grades.length === GRADES.length);
});

test('input validation rejects impossible balances', () => {
  assert.throws(() => analyzeBorrower({ ...CASES[0], debtService: 0 }), /invalid balances/);
  assert.throws(() => analyzeBorrower({ ...CASES[0], currentAssets: -20 }), /invalid balances/);
  assert.throws(() => analyzeBorrower({ ...CASES[0], gstMonths: 10.5 }), /invalid balances/);
});

test('facility model: amortisation reconciles and EL uses EAD', () => {
  const x = { principal: 75, annualRate: 0.12, months: 36, collateral: 100, haircut: 0.25, cfads: 74, existingService: 10, pd: 0.03, lgd: 0.45, ccf: 0.5, undrawn: 10 };
  const a = creditModel(x);
  approx(a.schedule.reduce((s, r) => s + r.principal, 0), 75, 1e-8);
  assert.equal(a.schedule.at(-1).balance, 0);
  approx(a.expectedLoss, 1.08, 1e-8);
  approx(a.totalInterest, a.schedule.reduce((s, r) => s + r.payment, 0) - 75, 1e-8);
  assert.equal(creditModel({ ...x, annualRate: 0, months: 15 }).payment, 5);
  assert.throws(() => creditModel({ ...x, months: 0 }));
});
