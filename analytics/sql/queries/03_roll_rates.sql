-- Q: Month to month, what share of loans in each bucket cure, stay, or roll forward?
-- Skills: self-join on the previous month, window SUM for row percentages.
-- Loans that left the book (repaid or written off) are excluded from the transition base.
WITH pairs AS (
  SELECT prev.dpd_bucket AS from_bucket, cur.dpd_bucket AS to_bucket
  FROM v_loan_month cur
  JOIN v_loan_month prev
    ON prev.loan_id = cur.loan_id
   AND prev.month_idx = cur.month_idx - 1
  WHERE cur.month_end > '2025-10-31'                     -- the last twelve months
),
counts AS (
  SELECT from_bucket, to_bucket, COUNT(*) AS n FROM pairs GROUP BY from_bucket, to_bucket
)
SELECT
  from_bucket,
  to_bucket,
  n AS transitions,
  ROUND(100.0 * n / SUM(n) OVER (PARTITION BY from_bucket), 2) AS pct_of_from_bucket
FROM counts
ORDER BY from_bucket, to_bucket;
