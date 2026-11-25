# Credence analytics: SQL and Power BI on a 1,200-loan MSME book

The web app reviews twelve borrowers in depth. This folder does what a credit-risk or portfolio-monitoring analyst does with a whole book: model it, query it in SQL, and report it in Power BI.

Everything is fictional and generated from a fixed seed, so every number below can be reproduced exactly.

| Layer | What is here | Status |
|---|---|---|
| **Data** | A star schema of 7 tables, about 42,000 rows: 1,200 borrowers across 12 sectors and 10 branches, 34 monthly performance snapshots (Jan 2024 to Oct 2026) and quarterly financials | Generated and tested |
| **SQL** | 9 analyst queries: asset-quality trend, DPD buckets, roll rates, vintage curves, covenant watchlist, sector concentration (HHI), grade migration, early-warning rules, branch league table | Run and reconciled by 14 tests |
| **Power BI** | A Power BI project (PBIP): star-schema semantic model in TMDL, 18 DAX measures, 3 report pages, 19 visuals and a Credence theme | Generated, schema-validated, 9 static tests. **Not yet opened in Power BI Desktop** (see below) |

## Run it

```bash
python3 analytics/generate_data.py      # rebuild the CSVs in analytics/data (byte-identical every time)
python3 analytics/run_sql.py            # load SQLite, run every query, write analytics/output/
python3 -m unittest discover -s analytics/tests -v
python3 analytics/powerbi/build_pbip.py # regenerate the Power BI project
```

Python 3.10+ and nothing else: the standard library only.

## The data model

```
dim_branch ─┐
            └─< dim_borrower ─< dim_loan >── dim_grade
                                  │
                 dim_date ─< fact_loan_month          (loan × month: balance, days past due)
                 dim_date ─< fact_financials_quarter  (loan × quarter: revenue, EBITDA, CFADS, debt service, score)
```

Behaviour built into the generator, so the analysis has something real to find:

- Sector stress windows. Textiles and Construction are still under stress in the latest quarter; Hospitality's stress was early in 2024.
- Delinquency follows a monthly state machine (current, 1–30, 31–60, 61–90, 90+) whose slip and cure rates depend on each borrower's health.
- Loans are repaid at maturity or written off after nine months as NPAs, and stop filing financials once they leave the book.

Gross NPA rises from 1.5% (mid-2024) to 5.49% (Oct 2026), within the range Indian MSME lenders report.

## SQL

All queries are in [`sql/queries`](sql/queries) and build on two views in [`sql/views.sql`](sql/views.sql). Results for every query, with run times, are in [`output/RESULTS.md`](output/RESULTS.md).

| Query | Business question | Techniques |
|---|---|---|
| `01_portfolio_trend` | How has the book grown, and how has asset quality moved? | Conditional aggregation, `LAG` |
| `02_dpd_buckets_by_sector` | Where does delinquency sit, by sector? | Pivot with `CASE`, share of total |
| `03_roll_rates` | What share of each bucket cures, stays or rolls forward? | Self-join on the previous month, windowed `SUM` |
| `04_vintage_curves` | Are newer cohorts going bad faster? | Cohort analysis, first-event logic, seasoning cut-off |
| `05_covenant_watchlist` | Which performing borrowers breach the 1.25× DSCR covenant? | Several CTEs, `LAG`, `ROW_NUMBER` by sector |
| `06_sector_concentration` | Is the book concentrated? | Herfindahl–Hirschman index, `RANK`, summary row |
| `07_grade_migration` | How many borrowers moved grade over a year? | Two-period self-join, migration matrix |
| `08_early_warning` | Which performing loans show early-warning signs? | Two-quarter `LAG`, rule-based reason codes |
| `09_branch_league_table` | Which branches originate the cleanest books? | 12-month slippage, `LEFT JOIN` anti-pattern, `RANK` |

The SQL is standard and tested on SQLite. To port it to SQL Server, replace `LIMIT` with `TOP`, `||` with `CONCAT` and `SUBSTR` with `SUBSTRING`.

**How the results are checked** ([`tests/test_analytics.py`](tests/test_analytics.py)):

- Sector buckets add up to the portfolio total.
- Roll-rate rows sum to 100%.
- Vintage curves never fall.
- The HHI equals the sum of squared shares.
- Every migration row reconciles to the borrower count.
- Every watchlist and early-warning row actually meets its rule.
- The committed CSVs are byte-identical to the seeded generator.
- No snapshot or financial statement falls outside a loan's life.

Writing these tests caught a real methodology bug. The first vintage query let written-off loans drop out of the denominator, so default rates appeared to *fall* with age. The fixed query keeps the whole cohort.

## Power BI

`powerbi/Credence.pbip` is a Power BI project: plain-text files that Power BI Desktop opens like a `.pbix` file, and that diff cleanly in Git.

**Semantic model** ([`Credence.SemanticModel`](powerbi/Credence.SemanticModel/definition)):

- A star schema with seven single-direction, many-to-one relationships.
- Power Query loads every table through one shared `LoadCsv` function and a `DataSource` parameter.
- **Exposure is semi-additive.** Every exposure measure takes the closing month of the filter context instead of summing balances across months. This is the most common mistake in loan-book reporting, and the model avoids it by design.

Key measures: `Gross NPA %`, `30+ DPD %`, `NPA Change bps` (versus 12 months earlier), `Expected Loss` (exposure × PD × LGD with `RELATED`), `Sector HHI`, `Latest DSCR`, and `Covenant Breach Exposure` (an iterator with context transition over loans).

**Report** ([`Credence.Report`](powerbi/Credence.Report/definition)):

| Page | Visuals |
|---|---|
| Portfolio overview | KPI cards, asset-quality trend, region slicer, exposure by sector, exposure by days-past-due bucket over time |
| Asset quality | NPA %, NPA change in bps, expected loss and HHI cards; NPA % by sector; branch league table |
| Covenant watchlist | Breach count, breach exposure and median DSCR cards; sector slicer; table of every performing borrower below 1.25× |

### Open it

1. Install [Power BI Desktop](https://powerbi.microsoft.com/desktop/). It is free, but runs on Windows only.
2. Open `analytics/powerbi/Credence.pbip`.
3. By default the data loads from this repository's `main` branch on GitHub. When Desktop asks how to sign in to `raw.githubusercontent.com`, choose **Anonymous**.
   - To work offline, change **Transform data → Edit parameters → DataSource** to the local folder, for example `C:\credence\analytics\data\`.
4. Select **Refresh**.

### Check it against the SQL

With no slicers set, the dashboard should show these values. They were computed independently in SQL from the same data:

| Measure | Expected |
|---|---|
| Exposure (Rs lakh) | 44,842 |
| Live Loans | 1,040 |
| Gross NPA % | 5.49% |
| 30+ DPD % | 10.76% |
| NPA Change bps | +253 |
| Expected Loss (Rs lakh) | 648.0 |
| Covenant Breaches | 258 |
| Covenant Breach Exposure (Rs lakh) | 11,688.9 |
| Covenant Breach % | 26.1% |
| Median DSCR | 1.47 |
| Sector HHI | 853 |

### What has and has not been verified

| Check | Result |
|---|---|
| Report files (pages, visuals, report settings) against Microsoft's published PBIR JSON schemas | All 26 files pass. The validator was confirmed to catch injected errors. |
| Every DAX reference, relationship, sort-by column and visual field resolves to a real column or measure | Checked in CI ([`tests/test_powerbi.py`](tests/test_powerbi.py)) |
| Visuals fit on the page and do not overlap | Checked in CI |
| Opening in Power BI Desktop and refreshing | **Not done yet.** Power BI Desktop does not run in the Linux environment this was built in. The first person to open it on Windows should compare the cards with the table above, then save a screenshot to `docs/powerbi-overview.png`. |

---

Fictional data. Not a credit model, a rating or a lending decision.
