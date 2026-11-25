-- Q: Is the book concentrated in a few sectors? (Herfindahl-Hirschman index and top-3 share.)
-- Skills: share-of-total with window SUM, RANK, a summary row from the same CTE.
WITH latest AS (
  SELECT sector, SUM(outstanding_lakh) AS exposure_lakh
  FROM v_loan_month
  WHERE month_end = (SELECT MAX(month_end) FROM fact_loan_month)
  GROUP BY sector
),
shares AS (
  SELECT
    sector,
    exposure_lakh,
    100.0 * exposure_lakh / SUM(exposure_lakh) OVER () AS share_pct,
    RANK() OVER (ORDER BY exposure_lakh DESC)          AS size_rank
  FROM latest
)
SELECT * FROM (
SELECT sector, ROUND(exposure_lakh, 1) AS exposure_lakh, ROUND(share_pct, 2) AS share_pct, size_rank,
       NULL AS hhi, NULL AS top3_share_pct
FROM shares
UNION ALL
SELECT 'ALL SECTORS', ROUND(SUM(exposure_lakh), 1), 100.0, NULL,
       ROUND(SUM(share_pct * share_pct), 0),
       ROUND(SUM(CASE WHEN size_rank <= 3 THEN share_pct ELSE 0 END), 2)
FROM shares
) AS result
ORDER BY CASE WHEN size_rank IS NULL THEN 1 ELSE 0 END, size_rank;
