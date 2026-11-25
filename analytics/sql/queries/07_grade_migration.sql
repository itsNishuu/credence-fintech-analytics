-- Q: Over the last year, how many borrowers moved up or down the grade scale?
-- Skills: self-join across two periods, pivot into a migration matrix.
WITH start_q AS (SELECT loan_id, grade, grade_rank FROM v_financials WHERE quarter_end = '2025-09-30'),
     end_q   AS (SELECT loan_id, grade, grade_rank FROM v_financials WHERE quarter_end = '2026-09-30'),
     moved AS (
       SELECT s.grade AS from_grade, s.grade_rank AS from_rank, e.grade AS to_grade, e.grade_rank AS to_rank
       FROM start_q s JOIN end_q e ON e.loan_id = s.loan_id
     )
SELECT
  from_grade,
  SUM(CASE WHEN to_grade = 'A'  THEN 1 ELSE 0 END) AS to_A,
  SUM(CASE WHEN to_grade = 'B+' THEN 1 ELSE 0 END) AS to_B_plus,
  SUM(CASE WHEN to_grade = 'B'  THEN 1 ELSE 0 END) AS to_B,
  SUM(CASE WHEN to_grade = 'C+' THEN 1 ELSE 0 END) AS to_C_plus,
  SUM(CASE WHEN to_grade = 'C'  THEN 1 ELSE 0 END) AS to_C,
  SUM(CASE WHEN to_grade = 'D'  THEN 1 ELSE 0 END) AS to_D,
  COUNT(*)                                          AS borrowers,
  SUM(CASE WHEN to_rank > from_rank THEN 1 ELSE 0 END) AS downgraded,
  SUM(CASE WHEN to_rank < from_rank THEN 1 ELSE 0 END) AS upgraded
FROM moved
GROUP BY from_grade, from_rank
ORDER BY from_rank;
