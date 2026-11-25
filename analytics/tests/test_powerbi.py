"""Static checks for the Power BI project: DAX references resolve, visuals bind to real fields,
and the committed PBIP matches what build_pbip.py generates. Run: python3 -m unittest discover -s analytics/tests"""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / 'powerbi'))

import build_pbip as pb  # noqa: E402

COLUMNS = {(t, col) for t, (_, cols) in pb.TABLES.items() for _, col, *_ in cols} | {(t, c) for t, c, *_ in pb.CALC_COLUMNS}
MEASURES = {m[1] for m in pb.MEASURES}
TABLES = set(pb.TABLES)


def dax_refs(dax: str):
    """Yield ('col', table, column) for Table[Column] and ('measure', name) for bare [Name]."""
    dax = re.sub(r'--[^\n]*', '', dax)
    dax = re.sub(r'"[^"]*"', '""', dax)
    for m in re.finditer(r"(?:'([^']+)'|\b([A-Za-z_][A-Za-z0-9_]*))?\[([^\]]+)\]", dax):
        table = m.group(1) or m.group(2)
        if table:
            yield ('col', table, m.group(3))
        else:
            yield ('measure', m.group(3))


class PowerBI(unittest.TestCase):
    def all_dax(self):
        yield from ((f'measure {m[1]}', m[4]) for m in pb.MEASURES)
        yield from ((f'column {c[0]}[{c[1]}]', c[2]) for c in pb.CALC_COLUMNS)

    def test_every_dax_reference_resolves(self):
        for owner, dax in self.all_dax():
            for ref in dax_refs(dax):
                if ref[0] == 'col':
                    self.assertIn((ref[1], ref[2]), COLUMNS, f'{owner}: unknown column {ref[1]}[{ref[2]}]')
                else:
                    self.assertIn(ref[1], MEASURES, f'{owner}: unknown measure [{ref[1]}]')

    def test_dax_quotes_the_calendar_table(self):
        for owner, dax in self.all_dax():
            self.assertNotRegex(dax, r"(?<!')\bCalendar\[", f'{owner}: write \'Calendar\'[...] (CALENDAR is also a DAX function)')

    def test_brackets_balance_in_dax(self):
        for owner, dax in self.all_dax():
            self.assertEqual(dax.count('('), dax.count(')'), owner)

    def test_relationships_join_real_columns_many_to_one(self):
        for (ft, fc), (tt, tc) in pb.RELATIONSHIPS:
            self.assertIn((ft, fc), COLUMNS)
            self.assertIn((tt, tc), COLUMNS)
        one_sides = [to for _, to in pb.RELATIONSHIPS]
        keys = {('Loan', 'Loan ID'), ('Calendar', 'Month End'), ('Borrower', 'Borrower ID'), ('Grade', 'Grade'), ('Branch', 'Branch ID')}
        self.assertTrue(set(one_sides) <= keys, 'every relationship must land on a dimension key')

    def test_sort_by_columns_exist(self):
        for (t, c), by in pb.SORT_BY.items():
            self.assertIn((t, c), COLUMNS)
            self.assertIn((t, by), COLUMNS)

    def test_every_visual_binds_to_a_real_field(self):
        for key, _, build in pb.PAGES:
            for v in build(key):
                for role in v['visual']['query']['queryState'].values():
                    for p in role['projections']:
                        f = p['field']
                        if 'Column' in f:
                            ref = (f['Column']['Expression']['SourceRef']['Entity'], f['Column']['Property'])
                            self.assertIn(ref, COLUMNS, ref)
                        else:
                            self.assertIn(f['Measure']['Property'], MEASURES)
                            self.assertEqual(f['Measure']['Expression']['SourceRef']['Entity'], pb.MEASURE_HOME[f['Measure']['Property']])

    def test_visuals_fit_on_the_page_without_overlapping(self):
        for key, _, build in pb.PAGES:
            boxes = [v['position'] for v in build(key)]
            for b in boxes:
                self.assertLessEqual(b['x'] + b['width'], 1280, key)
                self.assertLessEqual(b['y'] + b['height'], 720, key)
            for i, a in enumerate(boxes):
                for b in boxes[i + 1:]:
                    overlap = a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']
                    self.assertFalse(overlap, f'{key}: visuals overlap')

    def test_committed_project_matches_the_generator(self):
        with tempfile.TemporaryDirectory() as tmp:
            saved = pb.HERE, pb.MODEL, pb.REPORT
            try:
                pb.HERE = Path(tmp)
                pb.MODEL, pb.REPORT = Path(tmp) / f'{pb.NAME}.SemanticModel', Path(tmp) / f'{pb.NAME}.Report'
                pb.write_model()
                pb.write_report()
            finally:
                pb.HERE, pb.MODEL, pb.REPORT = saved
            fresh = {p.relative_to(tmp): p.read_bytes() for p in Path(tmp).rglob('*') if p.is_file()}
            committed = {p.relative_to(pb.HERE): p.read_bytes() for p in pb.HERE.rglob('*')
                         if p.is_file() and p.suffix != '.py' and '.pbi' not in p.parts and '__pycache__' not in p.parts and p.name != 'README.md'}
            self.assertEqual(sorted(fresh), sorted(committed), 'file list differs; rerun build_pbip.py')
            for k in fresh:
                self.assertEqual(fresh[k], committed[k], f'{k} is stale; rerun build_pbip.py')

    def test_report_json_is_well_formed(self):
        for f in pb.REPORT.rglob('*.json'):
            json.loads(f.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
