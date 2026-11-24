# Credence — case study

**Domain:** MSME lending, credit monitoring, portfolio risk
**Category:** independent educational project, not bank employment
**Data:** twelve fictional borrowers, one per sector; financials in INR lakh

## The problem

A credit team does not monitor loans one at a time. It needs to know which part of the book breaks first when conditions turn, how far grades would migrate, where exposure is concentrated, and which files to open first. Each answer must be explainable to a credit committee, so a black-box score is not good enough.

## What I built

- A transparent six-part scorecard with visible thresholds and diligence flags.
- A book-wide stress with two dials, cash-flow decline and rate rise, applied to every borrower at once.
- Covenant exposure, facility-weighted score, grade migration and illustrative expected loss, each shown against the unstressed book.
- Sector concentration with the HHI and top-three share.
- A borrower file with editable financials and a score breakdown, and a facility-structuring tool that tests a proposed term loan against the 1.25× covenant today and under stress.
- A credit note generated from the live file.

## What to look at

1. Press **No stress**, then **Downturn**, then **Severe** and watch bubbles cross the 1.25× and 1.0× lines.
2. Open **Review queue**, sort by cover stressed, then read the migration matrix.
3. Open Kaveri Spinning Mills in the **Borrower file**: it covers its debt today but drops below 1.0× in a downturn.
4. In **Facility structuring** for Aster Components, extend the tenor from 60 to 84 months. Cover today improves from 1.28× to 1.38×, but under the Downturn stress it only reaches about 1.07×, so the amount has to come down as well.
5. Run `npm test`.

## What it shows

The ability to turn credit-review practice into a decision-support tool that is transparent, testable and readable by a committee. Relevant to credit analyst, credit risk, lending operations and portfolio monitoring roles.

## What it does not show

A validated PD model, real underwriting, bureau or bank data, collateral valuation, sanction authority or production deployment.
