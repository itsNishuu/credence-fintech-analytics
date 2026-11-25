"""Reconciliation tests for the Credence SQL pack. Run: python3 -m unittest discover -s analytics/tests -v"""
import csv
import io
import sys
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import generate_data  # noqa: E402
import run_sql  # noqa: E402


def q(con, name):
    path = run_sql.SQL / 'queries' / f'{name}.sql'
    cols, rows, _ = run_sql.run(con, path)
    return [dict(zip(cols, r)) for r in rows]


class Analytics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.con = run_sql.build()
        cls.latest = cls.con.execute('SELECT MAX(month_end) FROM fact_loan_month').fetchone()[0]

    def test_committed_data_matches_the_seeded_generator(self):
        tables = generate_data.generate()
        for name, rows in tables.items():
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=list(rows[0]), lineterminator='\n')
            w.writeheader()
            w.writerows(rows)
            on_disk = (run_sql.DATA / f'{name}.csv').read_text(encoding='utf-8')
            self.assertEqual(buf.getvalue(), on_disk, f'{name}.csv is stale; rerun analytics/generate_data.py')

    def test_referential_integrity(self):
        problems = self.con.execute('PRAGMA foreign_key_check').fetchall()
        self.assertEqual(problems, [])
        orphans = self.con.execute('SELECT COUNT(*) FROM fact_loan_month f LEFT JOIN dim_loan l USING (loan_id) WHERE l.loan_id IS NULL').fetchone()[0]
        self.assertEqual(orphans, 0)

    def test_no_snapshot_before_sanction_or_after_exit(self):
        bad = self.con.execute('''
            SELECT COUNT(*) FROM fact_loan_month f JOIN dim_loan l USING (loan_id)
            WHERE f.month_end < l.sanction_date OR (l.exit_month IS NOT NULL AND f.month_end >= l.exit_month)''').fetchone()[0]
        self.assertEqual(bad, 0)

    def test_no_financials_after_a_loan_leaves_the_book(self):
        bad = self.con.execute('''
            SELECT COUNT(*) FROM fact_financials_quarter f JOIN dim_loan l USING (loan_id)
            WHERE f.quarter_end < l.sanction_date OR (l.exit_month IS NOT NULL AND f.quarter_end >= l.exit_month)''').fetchone()[0]
        self.assertEqual(bad, 0)

    def test_sector_buckets_reconcile_to_the_portfolio_total(self):
        trend = {r['month_end']: r for r in q(self.con, '01_portfolio_trend')}
        sectors = q(self.con, '02_dpd_buckets_by_sector')
        total = sum(r['exposure_lakh'] for r in sectors)
        self.assertAlmostEqual(total, trend[self.latest]['exposure_lakh'], delta=1.0)
        for r in sectors:
            parts = r['current_lakh'] + r['dpd_1_30_lakh'] + r['dpd_31_60_lakh'] + r['dpd_61_90_lakh'] + r['npa_lakh']
            self.assertAlmostEqual(parts, r['exposure_lakh'], delta=0.6, msg=r['sector'])
        npa = sum(r['npa_lakh'] for r in sectors)
        self.assertAlmostEqual(100 * npa / total, trend[self.latest]['gross_npa_pct'], delta=0.02)

    def test_npa_rate_stays_in_a_realistic_range(self):
        for r in q(self.con, '01_portfolio_trend'):
            self.assertLessEqual(r['gross_npa_pct'], 10.0, r['month_end'])
            self.assertLessEqual(r['gross_npa_pct'], r['dpd30_plus_pct'], 'NPA is a subset of 30+ DPD')

    def test_roll_rates_sum_to_100_per_bucket(self):
        by_from = {}
        for r in q(self.con, '03_roll_rates'):
            by_from[r['from_bucket']] = by_from.get(r['from_bucket'], 0) + r['pct_of_from_bucket']
        self.assertEqual(len(by_from), 5)
        for bucket, total in by_from.items():
            self.assertAlmostEqual(total, 100.0, delta=0.05, msg=bucket)

    def test_vintage_curves_never_fall(self):
        cols = ['mob_3_pct', 'mob_6_pct', 'mob_9_pct', 'mob_12_pct', 'mob_18_pct', 'mob_24_pct']
        rows = q(self.con, '04_vintage_curves')
        self.assertGreaterEqual(len(rows), 4)
        for r in rows:
            seen = [r[c] for c in cols if r[c] is not None]
            self.assertEqual(seen, sorted(seen), r['vintage'])

    def test_watchlist_only_holds_performing_covenant_breaches(self):
        rows = q(self.con, '05_covenant_watchlist')
        self.assertTrue(rows)
        for r in rows:
            self.assertLess(r['dscr'], 1.25)
            self.assertLessEqual(r['dpd'], 90)
        exposures = [r['exposure_lakh'] for r in rows]
        self.assertEqual(exposures, sorted(exposures, reverse=True))

    def test_concentration_index_matches_the_shares(self):
        rows = q(self.con, '06_sector_concentration')
        sectors, summary = rows[:-1], rows[-1]
        self.assertEqual(summary['sector'], 'ALL SECTORS')
        self.assertAlmostEqual(sum(r['share_pct'] for r in sectors), 100.0, delta=0.05)
        hhi = sum(r['share_pct'] ** 2 for r in sectors)
        self.assertAlmostEqual(summary['hhi'], hhi, delta=2)
        self.assertGreaterEqual(summary['hhi'], 10000 / len(sectors) - 1)
        top3 = sum(sorted((r['share_pct'] for r in sectors), reverse=True)[:3])
        self.assertAlmostEqual(summary['top3_share_pct'], top3, delta=0.05)

    def test_grade_migration_matrix_reconciles(self):
        rows = q(self.con, '07_grade_migration')
        for r in rows:
            row_total = r['to_A'] + r['to_B_plus'] + r['to_B'] + r['to_C_plus'] + r['to_C'] + r['to_D']
            self.assertEqual(row_total, r['borrowers'], r['from_grade'])
        both = self.con.execute('''SELECT COUNT(*) FROM fact_financials_quarter a JOIN fact_financials_quarter b
            ON a.loan_id = b.loan_id AND a.quarter_end = '2025-09-30' AND b.quarter_end = '2026-09-30' ''').fetchone()[0]
        self.assertEqual(sum(r['borrowers'] for r in rows), both)
        self.assertEqual(rows[0]['upgraded'], 0, 'nothing can be upgraded from A')
        self.assertEqual(rows[-1]['downgraded'], 0, 'nothing can be downgraded from D')

    def test_early_warning_rules_hold_for_every_flag(self):
        rows = q(self.con, '08_early_warning')
        self.assertTrue(rows)
        for r in rows:
            self.assertLess(r['dscr_now'], r['dscr_last_quarter'] + 0.005)
            self.assertLess(r['dscr_last_quarter'], r['dscr_two_quarters_ago'] + 0.005)
            self.assertTrue(r['dscr_now'] < 1.105 or 1 <= r['dpd'] <= 60)

    def test_branch_league_table_covers_every_branch(self):
        rows = q(self.con, '09_branch_league_table')
        self.assertEqual(len(rows), 10)
        slip = [r['slippage_12m_pct'] for r in rows]
        self.assertEqual(slip, sorted(slip))

    def test_every_query_runs_fast(self):
        for path in run_sql.queries():
            t0 = time.perf_counter()
            run_sql.run(self.con, path)
            self.assertLess(time.perf_counter() - t0, 2.0, path.name)


if __name__ == '__main__':
    unittest.main()
