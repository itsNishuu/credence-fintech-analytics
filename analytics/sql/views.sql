-- Reusable views: the analyst-facing layer every query and the dashboard build on.

DROP VIEW IF EXISTS v_loan_month;
DROP VIEW IF EXISTS v_financials;
DROP VIEW IF EXISTS v_month_index;

-- Month sequence number, so "previous month" is a join on idx - 1 in any SQL dialect.
CREATE VIEW v_month_index AS
SELECT month_end, ROW_NUMBER() OVER (ORDER BY month_end) AS month_idx
FROM dim_date;

-- One row per loan per month with its delinquency bucket and descriptive attributes.
CREATE VIEW v_loan_month AS
SELECT
  f.loan_id,
  f.month_end,
  mi.month_idx,
  f.months_on_book,
  f.outstanding_lakh,
  f.dpd,
  CASE
    WHEN f.dpd = 0 THEN '0 Current'
    WHEN f.dpd <= 30 THEN '1 1-30'
    WHEN f.dpd <= 60 THEN '2 31-60'
    WHEN f.dpd <= 90 THEN '3 61-90'
    ELSE '4 90+ NPA'
  END AS dpd_bucket,
  CASE WHEN f.dpd > 90 THEN 1 ELSE 0 END AS is_npa,
  CASE WHEN f.dpd > 30 THEN 1 ELSE 0 END AS is_30_plus,
  l.product,
  l.sanction_date,
  l.origination_grade,
  b.borrower_id,
  b.borrower_name,
  b.sector,
  br.branch_id,
  br.city,
  br.region
FROM fact_loan_month f
JOIN v_month_index mi ON mi.month_end = f.month_end
JOIN dim_loan l ON l.loan_id = f.loan_id
JOIN dim_borrower b ON b.borrower_id = l.borrower_id
JOIN dim_branch br ON br.branch_id = b.branch_id;

-- Quarterly financials with DSCR and the internal grade (a range join onto the grade bands).
CREATE VIEW v_financials AS
SELECT
  q.loan_id,
  q.quarter_end,
  q.revenue_lakh,
  q.ebitda_lakh,
  q.cfads_lakh,
  q.debt_service_lakh,
  q.cfads_lakh / q.debt_service_lakh AS dscr,
  q.score,
  (SELECT g.grade FROM dim_grade g WHERE g.min_score <= q.score ORDER BY g.min_score DESC LIMIT 1) AS grade,
  (SELECT g.grade_rank FROM dim_grade g WHERE g.min_score <= q.score ORDER BY g.min_score DESC LIMIT 1) AS grade_rank
FROM fact_financials_quarter q;
