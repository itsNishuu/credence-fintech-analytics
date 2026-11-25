-- Q: Which branches originate the cleanest books? Twelve-month slippage = new NPAs / opening standard book.
-- Skills: period-over-period comparison, NOT EXISTS-style logic via LEFT JOIN, RANK.
WITH opening AS (                     -- standard (non-NPA) loans twelve months ago
  SELECT loan_id, branch_id, outstanding_lakh
  FROM v_loan_month
  WHERE month_end = '2025-10-31' AND is_npa = 0
),
slipped AS (                          -- of those, loans that became NPA at any point since
  SELECT DISTINCT o.loan_id
  FROM opening o
  JOIN v_loan_month v ON v.loan_id = o.loan_id AND v.month_end > '2025-10-31' AND v.is_npa = 1
),
latest AS (
  SELECT branch_id, SUM(outstanding_lakh) AS exposure_lakh,
         SUM(CASE WHEN is_npa = 1 THEN outstanding_lakh ELSE 0 END) AS npa_lakh
  FROM v_loan_month WHERE month_end = (SELECT MAX(month_end) FROM fact_loan_month)
  GROUP BY branch_id
),
by_branch AS (
  SELECT
    br.branch_id, br.city, br.region,
    l.exposure_lakh,
    100.0 * l.npa_lakh / l.exposure_lakh AS gross_npa_pct,
    100.0 * SUM(CASE WHEN s.loan_id IS NOT NULL THEN o.outstanding_lakh ELSE 0 END) / SUM(o.outstanding_lakh) AS slippage_12m_pct
  FROM dim_branch br
  JOIN latest l   ON l.branch_id = br.branch_id
  JOIN opening o  ON o.branch_id = br.branch_id
  LEFT JOIN slipped s ON s.loan_id = o.loan_id
  GROUP BY br.branch_id, br.city, br.region, l.exposure_lakh, l.npa_lakh
)
SELECT
  RANK() OVER (ORDER BY slippage_12m_pct) AS quality_rank,
  city, region,
  ROUND(exposure_lakh, 1)    AS exposure_lakh,
  ROUND(gross_npa_pct, 2)    AS gross_npa_pct,
  ROUND(slippage_12m_pct, 2) AS slippage_12m_pct
FROM by_branch
ORDER BY quality_rank;
