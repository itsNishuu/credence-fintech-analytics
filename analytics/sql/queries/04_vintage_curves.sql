-- Q: Are newer origination cohorts going bad faster than older ones?
-- Cumulative share of each half-year cohort that has ever been 90+ DPD by a given month on book.
-- The denominator is the whole cohort, so loans later written off still count. A cell is shown
-- only once every loan in the cohort has been on book that long.
-- Skills: cohort analysis, first-event logic, month arithmetic, pivot.
WITH last_month AS (
  SELECT CAST(SUBSTR(MAX(month_end), 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(MAX(month_end), 6, 2) AS INTEGER) AS n
  FROM fact_loan_month
),
loans AS (
  SELECT
    l.loan_id,
    SUBSTR(l.sanction_date, 1, 4) || ' H' || CASE WHEN CAST(SUBSTR(l.sanction_date, 6, 2) AS INTEGER) <= 6 THEN '1' ELSE '2' END AS vintage,
    (SELECT n FROM last_month)
      - (CAST(SUBSTR(l.sanction_date, 1, 4) AS INTEGER) * 12 + CAST(SUBSTR(l.sanction_date, 6, 2) AS INTEGER)) AS observable_mob,
    (SELECT MIN(f.months_on_book) FROM fact_loan_month f WHERE f.loan_id = l.loan_id AND f.dpd > 90) AS first_npa_mob
  FROM dim_loan l
  WHERE l.sanction_date >= '2024-01-01'          -- observed from origination
),
cohorts AS (
  SELECT vintage, COUNT(*) AS cohort_loans, MIN(observable_mob) AS seasoned_mob
  FROM loans GROUP BY vintage
),
mobs AS (
  SELECT 3 AS mob UNION ALL SELECT 6 UNION ALL SELECT 9 UNION ALL SELECT 12 UNION ALL SELECT 18 UNION ALL SELECT 24
),
curve AS (
  SELECT c.vintage, m.mob, c.cohort_loans,
         ROUND(100.0 * SUM(CASE WHEN l.first_npa_mob <= m.mob THEN 1 ELSE 0 END) / c.cohort_loans, 2) AS ever_npa_pct
  FROM cohorts c
  CROSS JOIN mobs m
  JOIN loans l ON l.vintage = c.vintage
  WHERE m.mob <= c.seasoned_mob
  GROUP BY c.vintage, m.mob, c.cohort_loans
)
SELECT
  c.vintage,
  MAX(CASE WHEN cv.mob = 3  THEN cv.ever_npa_pct END) AS mob_3_pct,
  MAX(CASE WHEN cv.mob = 6  THEN cv.ever_npa_pct END) AS mob_6_pct,
  MAX(CASE WHEN cv.mob = 9  THEN cv.ever_npa_pct END) AS mob_9_pct,
  MAX(CASE WHEN cv.mob = 12 THEN cv.ever_npa_pct END) AS mob_12_pct,
  MAX(CASE WHEN cv.mob = 18 THEN cv.ever_npa_pct END) AS mob_18_pct,
  MAX(CASE WHEN cv.mob = 24 THEN cv.ever_npa_pct END) AS mob_24_pct,
  c.cohort_loans
FROM cohorts c
LEFT JOIN curve cv ON cv.vintage = c.vintage
GROUP BY c.vintage, c.cohort_loans
ORDER BY c.vintage;
