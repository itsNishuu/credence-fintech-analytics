// Transparent illustrative scorecard: not a regulated credit model or approval recommendation.
export const CASES=[
 {id:'AST-001',name:'Aster Components',sector:'Auto components',facility:75,revenue:420,prevRevenue:350,ebit:67,ebitda:84,debt:140,equity:210,currentAssets:190,currentLiabilities:100,interest:14,debtService:38,cfads:74,gstMonths:12,bankStatements:true,audited:true},
 {id:'VAR-002',name:'Varuna Foods',sector:'Food processing',facility:48,revenue:260,prevRevenue:240,ebit:28,ebitda:44,debt:165,equity:100,currentAssets:75,currentLiabilities:92,interest:18,debtService:55,cfads:41,gstMonths:10,bankStatements:true,audited:false},
 {id:'RVT-003',name:'Rivet Auto',sector:'Components distribution',facility:60,revenue:310,prevRevenue:400,ebit:17,ebitda:40,debt:220,equity:70,currentAssets:80,currentLiabilities:120,interest:27,debtService:68,cfads:24,gstMonths:6,bankStatements:false,audited:false},
];
const r=(x)=>Math.round(x*100)/100;
export function analyzeBorrower(b){
 const nums=['revenue','prevRevenue','ebit','ebitda','debt','equity','currentAssets','currentLiabilities','interest','debtService','cfads','gstMonths'];
 if(nums.some(k=>typeof b[k]!=='number'||!Number.isFinite(b[k])))throw Error('Financial inputs must be finite numbers.');
 if(b.revenue<=0||b.prevRevenue<=0||b.equity<=0||b.debtService<=0||b.interest<=0||b.currentLiabilities<=0||b.gstMonths<0||b.gstMonths>12||!Number.isInteger(b.gstMonths)||b.debt<0||b.currentAssets<0||b.cfads<0)throw Error('Inputs contain non-physical or invalid balances.');
 const dscr=b.cfads/b.debtService,leverage=b.debt/b.equity,liquidity=b.currentAssets/b.currentLiabilities,growth=b.revenue/b.prevRevenue-1,coverage=b.ebit/b.interest;
 const components=[
 {name:'Debt service coverage',score:dscr>=1.5?25:dscr>=1.25?18:dscr>=1?8:0,max:25},
 {name:'Current ratio',score:liquidity>=1.5?18:liquidity>=1.2?12:liquidity>=1?6:0,max:18},
 {name:'Debt/equity',score:leverage<=1?16:leverage<=2?10:leverage<=3?5:0,max:16},
 {name:'Revenue growth',score:growth>=.1?14:growth>=0?9:growth>=-.1?4:0,max:14},
 {name:'Interest coverage',score:coverage>=3?15:coverage>=2?9:coverage>=1?4:0,max:15},
 {name:'Documentation',score:(b.gstMonths===12?4:b.gstMonths>=9?2:0)+(b.bankStatements?4:0)+(b.audited?4:0),max:12},
 ];
 const score=components.reduce((a,c)=>a+c.score,0),notes=[];
 if(dscr<1.25)notes.push('Debt-service coverage below illustrative 1.25x monitoring threshold');
 if(liquidity<1)notes.push('Current liabilities exceed current assets');
 if(leverage>2)notes.push('Debt-to-equity above illustrative 2.0x threshold');
 if(growth<0)notes.push('Revenue contraction year-on-year');
 if(b.gstMonths<12)notes.push('GST filing history incomplete in fictional example');
 if(!b.bankStatements)notes.push('Bank statements missing from fictional loan file');
 if(!b.audited)notes.push('Audited financial statements not included');
 return {borrower:b,score,band:score>=80?'Lower monitoring attention':score>=60?'Further diligence required':'Elevated monitoring attention',components,ratios:{dscr:r(dscr),leverage:r(leverage),liquidity:r(liquidity),growthPct:r(growth*100),interestCoverage:r(coverage)},flags:notes};
}
export function makeMemo(a){const b=a.borrower;return `CREDENCE | ILLUSTRATIVE CREDIT REVIEW\nCase: ${b.id} | ${b.name} (${b.sector})\nAll figures synthetic; financial amounts in INR lakh.\n\nREVIEW METRICS\nRevenue: INR ${b.revenue}L; YoY growth: ${a.ratios.growthPct}%\nDSCR (CFADS / annual debt service): ${a.ratios.dscr}x\nCurrent ratio: ${a.ratios.liquidity}x\nDebt / equity: ${a.ratios.leverage}x\nInterest coverage (EBIT / interest): ${a.ratios.interestCoverage}x\nIllustrative scorecard: ${a.score}/100 (${a.band})\n\nDILIGENCE ITEMS\n${a.flags.length?a.flags.map((x,i)=>`${i+1}. ${x}`).join('\n'):'No automated flags on the provided sample input. Manual underwriting still required.'}\n\nANALYST INTERPRETATION\nThe above score is a transparent educational monitoring indicator; it is NOT a probability of default, validated model, credit rating, loan sanction, or bank policy. Review cash flow quality, debt schedules, bank statements, collateral and promoter/borrower disclosures independently.\n\nAUTHORITY & LIMITATIONS\nNo real borrower data, approvals, bureau data, lender sanctions or professional credit decisions are represented here.`}

// Assumption-based stress: cash flow available for debt service decreases 20%; annual debt service rises 10%.
export function borrowerStress(b){
 const base=analyzeBorrower(b), stressed={...b,cfads:b.cfads*0.8,debtService:b.debtService*1.1};
 const scenario=analyzeBorrower(stressed);
 return {baseDscr:base.ratios.dscr,stressedDscr:scenario.ratios.dscr,baseScore:base.score,stressedScore:scenario.score,assumptions:'CFADS -20%, debt service +10%'};
}
export function portfolioSummary(cases){
 if(!Array.isArray(cases)||!cases.length)throw Error('Provide at least one case.');
 const rows=cases.map(b=>({...analyzeBorrower(b),stress:borrowerStress(b),facility:b.facility||0}));
 const totalFacility=rows.reduce((n,a)=>n+a.facility,0);
 return {rows,totalFacility,weightedScore:totalFacility>0?rows.reduce((n,a)=>n+a.score*a.facility,0)/totalFacility:rows.reduce((n,a)=>n+a.score,0)/rows.length,flagged:rows.filter(a=>a.score<60).length};
}
