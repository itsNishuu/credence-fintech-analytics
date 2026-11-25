-- Q: Which performing loans show early-warning signs before they become NPAs?
-- Rule: DSCR fell in each of the last two quarters AND (now below 1.10x OR 1-60 days past due).
-- Skills: LAG twice, boolean rules in SQL, reason codes.
WITH fin AS (
  SELECT
    loan_id, quarter_end, dscr,
    LAG(dscr, 1) OVER (PARTITION BY loan_id ORDER BY quarter_end) AS dscr_q1,
    LAG(dscr, 2) OVER (PARTITION BY loan_id ORDER BY quarter_end) AS dscr_q2
  FROM v_financials
),
latest_q AS (SELECT * FROM fin WHERE quarter_end = (SELECT MAX(quarter_end) FROM fact_financials_quarter)),
latest_m AS (SELECT * FROM v_loan_month WHERE month_end = (SELECT MAX(month_end) FROM fact_loan_month))
SELECT
  m.borrower_name, m.sector, m.region,
  ROUND(m.outstanding_lakh, 1) AS exposure_lakh,
  ROUND(q.dscr_q2, 2) AS dscr_two_quarters_ago,
  ROUND(q.dscr_q1, 2) AS dscr_last_quarter,
  ROUND(q.dscr, 2)    AS dscr_now,
  m.dpd,
  CASE
    WHEN q.dscr < 1.10 AND m.dpd BETWEEN 1 AND 60 THEN 'Falling cover, thin cover and overdue'
    WHEN q.dscr < 1.10 THEN 'Falling cover, now below 1.10x'
    ELSE 'Falling cover and overdue'
  END AS reason
FROM latest_q q
JOIN latest_m m ON m.loan_id = q.loan_id
WHERE q.dscr < q.dscr_q1
  AND q.dscr_q1 < q.dscr_q2
  AND m.is_npa = 0
  AND (q.dscr < 1.10 OR m.dpd BETWEEN 1 AND 60)
ORDER BY m.outstanding_lakh DESC;
