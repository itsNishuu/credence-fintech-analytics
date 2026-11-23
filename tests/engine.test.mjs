import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,analyzeBorrower,borrowerStress,portfolioSummary,makeMemo} from '../engine.js';
const approx=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`expected ${actual} ≈ ${expected}`);

test('Credence: expected DSCR, debt leverage and score ordering',()=>{
 const a=analyzeBorrower(CASES[0]),b=analyzeBorrower(CASES[1]),c=analyzeBorrower(CASES[2]);
 approx(a.ratios.dscr,1.95,.01);approx(a.ratios.leverage,.67,.01);
 assert.ok(a.score>b.score&&b.score>c.score);assert.equal(a.components.reduce((sum,x)=>sum+x.max,0),100);
 assert.ok(makeMemo(a).includes('NOT a probability of default'));
});
test('Credence: stress reduces borrower cash-flow coverage and portfolio sums correctly',()=>{
 const s=borrowerStress(CASES[0]),p=portfolioSummary(CASES);
 assert.ok(s.stressedDscr<s.baseDscr);assert.ok(s.stressedScore<=s.baseScore);
 assert.equal(p.totalFacility,183);assert.equal(p.rows.length,3);
 assert.ok(p.weightedScore>0&&p.weightedScore<=100);
});
test('Credence: rejects invalid debt service and negative assets',()=>{
 assert.throws(()=>analyzeBorrower({...CASES[0],debtService:0}),/invalid balances/);
 assert.throws(()=>analyzeBorrower({...CASES[0],currentAssets:-20}),/invalid balances/);
 assert.throws(()=>analyzeBorrower({...CASES[0],gstMonths:10.5}),/invalid balances/);
});

