-- Q: Which live borrowers breach the 1.25x DSCR covenant in the latest quarter, biggest exposures first?
-- Skills: multiple CTEs, LAG over quarters, ROW_NUMBER within sector, joins to the latest snapshot.
WITH fin AS (
  SELECT
    loan_id, quarter_end, dscr, grade,
    LAG(dscr)  OVER (PARTITION BY loan_id ORDER BY quarter_end) AS prev_dscr,
    LAG(grade) OVER (PARTITION BY loan_id ORDER BY quarter_end) AS prev_grade
  FROM v_financials
),
latest_q AS (
  SELECT * FROM fin WHERE quarter_end = (SELECT MAX(quarter_end) FROM fact_financials_quarter)
),
latest_m AS (
  SELECT * FROM v_loan_month WHERE month_end = (SELECT MAX(month_end) FROM fact_loan_month)
),
breaches AS (
  SELECT
    m.borrower_name, m.sector, m.city, m.product,
    ROUND(m.outstanding_lakh, 1) AS exposure_lakh,
    ROUND(q.dscr, 2)             AS dscr,
    ROUND(q.prev_dscr, 2)        AS prev_quarter_dscr,
    q.prev_grade || ' -> ' || q.grade AS grade_move,
    m.dpd,
    ROW_NUMBER() OVER (PARTITION BY m.sector ORDER BY m.outstanding_lakh DESC) AS rank_in_sector
  FROM latest_q q
  JOIN latest_m m ON m.loan_id = q.loan_id
  WHERE q.dscr < 1.25 AND m.is_npa = 0
)
SELECT *
FROM breaches
ORDER BY exposure_lakh DESC
LIMIT 25;
