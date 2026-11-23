# Credence — MSME Credit Intelligence

**Domain:** Fintech lending, credit administration, borrower financial analysis  
**Portfolio category:** Independent educational finance project, not past bank employment  
**Dataset:** Three fictional MSME borrowers, INR-lakh balances and sample documentation cases.

## The problem

MSME loan processing depends on consistent documentation, financial analysis, and bank-credit-team query resolution. Each case has different debt service, leverage, working capital and document-readiness risks. A transparent operational review should expose those drivers and explain why a case needs more diligence.

## The demonstrator

- Editable borrower worksheet: revenue, cash flow available for debt service, annual debt service, leverage, liquidity and interest coverage.
- Financial ratio calculations with six explicit, independently inspectable monitoring score buckets.
- Flags for missing documentation and threshold breaches, without pretending to predict default.
- Scenario stress test: cash flow -20% and debt service +10%, plus a facility-weighted overview across sample cases.
- Exportable case-note text and portfolio CSV for analyst review.

## The reviewer should examine

1. Open `credence/` and review three scenarios: Aster Components, Varuna Foods, Rivet Auto.
2. Inspect DSCR differences and how financial strength affects monitoring attention.
3. Modify cash flows and debt service and recalculate. Check that scenarios and flags update.
4. Export the credit-review memo; review all assumptions and limitations.
5. Read `engine.js` and run `npm test` to reproduce the calculations.

## What it proves

Ability to translate borrower documentation and credit-review workflows into an explainable analytical decision-support artifact. It supports roles such as Credit Operations Analyst, Lending Analytics Associate and Credit Administration Officer.

**Does not prove:** independent sanction authority, validated PD scoring, real collateral underwriting, lender portfolio analytics, production deployment or actual business cases.
