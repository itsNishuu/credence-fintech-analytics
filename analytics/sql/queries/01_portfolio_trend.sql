-- Q: How has the book grown, and how has asset quality moved, month by month?
-- Skills: aggregation, conditional sums, LAG window function.
WITH monthly AS (
  SELECT
    month_end,
    COUNT(*)                                             AS live_loans,
    SUM(outstanding_lakh)                                AS exposure_lakh,
    SUM(CASE WHEN is_npa = 1 THEN outstanding_lakh ELSE 0 END)     AS npa_lakh,
    SUM(CASE WHEN is_30_plus = 1 THEN outstanding_lakh ELSE 0 END) AS dpd30_lakh
  FROM v_loan_month
  GROUP BY month_end
)
SELECT
  month_end,
  live_loans,
  ROUND(exposure_lakh, 1)                                  AS exposure_lakh,
  ROUND(100.0 * npa_lakh / exposure_lakh, 2)               AS gross_npa_pct,
  ROUND(100.0 * dpd30_lakh / exposure_lakh, 2)             AS dpd30_plus_pct,
  ROUND(exposure_lakh - LAG(exposure_lakh) OVER (ORDER BY month_end), 1) AS exposure_change_lakh
FROM monthly
ORDER BY month_end;
