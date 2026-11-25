-- Q: In the latest month, where in the book does delinquency sit, by sector?
-- Skills: pivot with CASE, scalar subquery, share-of-total.
WITH latest AS (
  SELECT * FROM v_loan_month WHERE month_end = (SELECT MAX(month_end) FROM fact_loan_month)
)
SELECT
  sector,
  COUNT(*)                                                                       AS live_loans,
  ROUND(SUM(outstanding_lakh), 1)                                                AS exposure_lakh,
  ROUND(SUM(CASE WHEN dpd_bucket = '0 Current' THEN outstanding_lakh ELSE 0 END), 1) AS current_lakh,
  ROUND(SUM(CASE WHEN dpd_bucket = '1 1-30'    THEN outstanding_lakh ELSE 0 END), 1) AS dpd_1_30_lakh,
  ROUND(SUM(CASE WHEN dpd_bucket = '2 31-60'   THEN outstanding_lakh ELSE 0 END), 1) AS dpd_31_60_lakh,
  ROUND(SUM(CASE WHEN dpd_bucket = '3 61-90'   THEN outstanding_lakh ELSE 0 END), 1) AS dpd_61_90_lakh,
  ROUND(SUM(CASE WHEN dpd_bucket = '4 90+ NPA' THEN outstanding_lakh ELSE 0 END), 1) AS npa_lakh,
  ROUND(100.0 * SUM(CASE WHEN is_npa = 1 THEN outstanding_lakh ELSE 0 END) / SUM(outstanding_lakh), 2) AS gross_npa_pct
FROM latest
GROUP BY sector
ORDER BY gross_npa_pct DESC;
