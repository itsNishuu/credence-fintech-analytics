"""Write the Credence Power BI project (PBIP): a TMDL semantic model and a PBIR report.

One spec below drives the tables, the DAX and every visual, so names cannot drift apart.
Run:  python3 analytics/powerbi/build_pbip.py
Open: analytics/powerbi/Credence.pbip in Power BI Desktop (Windows).
"""
from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAME = 'Credence'
MODEL = HERE / f'{NAME}.SemanticModel'
REPORT = HERE / f'{NAME}.Report'
DATA_URL = 'https://raw.githubusercontent.com/itsNishuu/credence-fintech-analytics/main/analytics/data/'


def gid(*parts: str) -> str:
    """Stable ids, so regenerating the project produces no diff."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'credence/' + '/'.join(parts)))


def hexid(*parts: str) -> str:
    return gid(*parts).replace('-', '')[:20]


# ---------------------------------------------------------------- semantic model spec
# (csv column, model column, dataType, M type, format string, summarizeBy, hidden)
T, I, D, DT = 'string', 'int64', 'double', 'dateTime'
M = {T: 'type text', I: 'Int64.Type', D: 'type number', DT: 'type date'}
LAKH = '#,0.0'

TABLES = {
    'Calendar': ('dim_date', [
        ('month_end', 'Month End', DT, 'dd mmm yyyy', 'none', False),
        ('year', 'Year', I, '0', 'none', False),
        ('month', 'Month Number', I, '0', 'none', True),
        ('month_name', 'Month', T, None, 'none', False),
        ('quarter', 'Quarter', T, None, 'none', False),
        ('fiscal_year', 'Fiscal Year', T, None, 'none', False),
    ]),
    'Branch': ('dim_branch', [
        ('branch_id', 'Branch ID', T, None, 'none', True),
        ('city', 'City', T, None, 'none', False),
        ('region', 'Region', T, None, 'none', False),
    ]),
    'Grade': ('dim_grade', [
        ('grade', 'Grade', T, None, 'none', False),
        ('min_score', 'Min Score', D, '0', 'none', False),
        ('pd_12m', 'PD 12m', D, '0.0%', 'none', False),
        ('grade_rank', 'Grade Rank', I, '0', 'none', True),
    ]),
    'Borrower': ('dim_borrower', [
        ('borrower_id', 'Borrower ID', T, None, 'none', True),
        ('borrower_name', 'Borrower', T, None, 'none', False),
        ('sector', 'Sector', T, None, 'none', False),
        ('branch_id', 'Branch ID', T, None, 'none', True),
        ('constitution', 'Constitution', T, None, 'none', False),
        ('incorporated_year', 'Incorporated Year', I, '0', 'none', False),
    ]),
    'Loan': ('dim_loan', [
        ('loan_id', 'Loan ID', T, None, 'none', True),
        ('borrower_id', 'Borrower ID', T, None, 'none', True),
        ('product', 'Product', T, None, 'none', False),
        ('sanction_date', 'Sanction Date', DT, 'dd mmm yyyy', 'none', False),
        ('sanctioned_lakh', 'Sanctioned Lakh', D, LAKH, 'sum', False),
        ('tenor_months', 'Tenor Months', I, '0', 'none', False),
        ('interest_rate_pct', 'Interest Rate Pct', D, '0.00', 'none', False),
        ('collateral_lakh', 'Collateral Lakh', D, LAKH, 'sum', False),
        ('origination_grade', 'Origination Grade', T, None, 'none', False),
        ('exit_month', 'Exit Month', DT, 'dd mmm yyyy', 'none', False),
        ('exit_reason', 'Exit Reason', T, None, 'none', False),
    ]),
    'Loan Month': ('fact_loan_month', [
        ('loan_id', 'Loan ID', T, None, 'none', True),
        ('month_end', 'Month End', DT, 'dd mmm yyyy', 'none', True),
        ('months_on_book', 'Months On Book', I, '0', 'none', False),
        ('outstanding_lakh', 'Outstanding Lakh', D, LAKH, 'sum', True),
        ('dpd', 'DPD', I, '0', 'none', False),
    ]),
    'Financials': ('fact_financials_quarter', [
        ('loan_id', 'Loan ID', T, None, 'none', True),
        ('quarter_end', 'Quarter End', DT, 'dd mmm yyyy', 'none', True),
        ('revenue_lakh', 'Revenue Lakh', D, LAKH, 'sum', False),
        ('ebitda_lakh', 'EBITDA Lakh', D, LAKH, 'sum', False),
        ('cfads_lakh', 'CFADS Lakh', D, LAKH, 'sum', False),
        ('debt_service_lakh', 'Debt Service Lakh', D, LAKH, 'sum', False),
        ('score', 'Score', D, '0.0', 'none', False),
    ]),
}
NULLABLE = {'Loan': ['exit_month', 'exit_reason']}
SORT_BY = {('Calendar', 'Month'): 'Month End', ('Grade', 'Grade'): 'Grade Rank'}

# Calculated columns: (table, name, DAX, format, sortBy)
CALC_COLUMNS = [
    ('Loan Month', 'DPD Bucket',
     'SWITCH ( TRUE (), \'Loan Month\'[DPD] = 0, "Current", \'Loan Month\'[DPD] <= 30, "1-30", '
     '\'Loan Month\'[DPD] <= 60, "31-60", \'Loan Month\'[DPD] <= 90, "61-90", "90+ NPA" )', None, 'DPD Bucket Order'),
    ('Loan Month', 'DPD Bucket Order',
     'SWITCH ( TRUE (), \'Loan Month\'[DPD] = 0, 0, \'Loan Month\'[DPD] <= 30, 1, \'Loan Month\'[DPD] <= 60, 2, '
     '\'Loan Month\'[DPD] <= 90, 3, 4 )', '0', None),
    ('Financials', 'DSCR', "DIVIDE ( Financials[CFADS Lakh], Financials[Debt Service Lakh] )", '0.00', None),
]

# Measures: (home table, name, folder, format, DAX). Exposure is a balance, so every exposure
# measure takes the closing month of the current filter context (semi-additive), never a sum over months.
MEASURES = [
    ('Loan Month', 'Exposure', 'Book', '#,0', '''
VAR LastMonth = MAX ( 'Calendar'[Month End] )
RETURN
    CALCULATE ( SUM ( 'Loan Month'[Outstanding Lakh] ), 'Calendar'[Month End] = LastMonth )'''),
    ('Loan Month', 'Live Loans', 'Book', '#,0', '''
VAR LastMonth = MAX ( 'Calendar'[Month End] )
RETURN
    CALCULATE ( DISTINCTCOUNT ( 'Loan Month'[Loan ID] ), 'Calendar'[Month End] = LastMonth )'''),
    ('Loan Month', 'Exposure Prior Month', 'Book', '#,0', '''
VAR PriorMonth = EOMONTH ( MAX ( 'Calendar'[Month End] ), -1 )
RETURN
    CALCULATE ( SUM ( 'Loan Month'[Outstanding Lakh] ), REMOVEFILTERS ( 'Calendar' ), 'Calendar'[Month End] = PriorMonth )'''),
    ('Loan Month', 'Exposure MoM %', 'Book', '+0.0%;-0.0%;0.0%', '''
DIVIDE ( [Exposure] - [Exposure Prior Month], [Exposure Prior Month] )'''),
    ('Loan Month', 'Share of Book', 'Book', '0.0%', '''
DIVIDE ( [Exposure], CALCULATE ( [Exposure], ALLSELECTED ( Borrower ) ) )'''),
    ('Loan Month', 'NPA Exposure', 'Asset quality', '#,0', '''
CALCULATE ( [Exposure], 'Loan Month'[DPD] > 90 )'''),
    ('Loan Month', 'Gross NPA %', 'Asset quality', '0.00%', '''
DIVIDE ( [NPA Exposure], [Exposure] )'''),
    ('Loan Month', '30+ DPD %', 'Asset quality', '0.00%', '''
DIVIDE ( CALCULATE ( [Exposure], 'Loan Month'[DPD] > 30 ), [Exposure] )'''),
    ('Loan Month', 'Gross NPA % 12M Ago', 'Asset quality', '0.00%', '''
VAR YearAgo = EOMONTH ( MAX ( 'Calendar'[Month End] ), -12 )
VAR Book =
    CALCULATE ( SUM ( 'Loan Month'[Outstanding Lakh] ), REMOVEFILTERS ( 'Calendar' ), 'Calendar'[Month End] = YearAgo )
VAR Npa =
    CALCULATE (
        SUM ( 'Loan Month'[Outstanding Lakh] ),
        REMOVEFILTERS ( 'Calendar' ),
        'Calendar'[Month End] = YearAgo,
        'Loan Month'[DPD] > 90
    )
RETURN
    DIVIDE ( Npa, Book )'''),
    ('Loan Month', 'NPA Change bps', 'Asset quality', '+0;-0;0', '''
( [Gross NPA %] - [Gross NPA % 12M Ago] ) * 10000'''),
    ('Loan Month', 'Expected Loss', 'Asset quality', '#,0.0', '''
-- Illustrative: exposure x origination-grade PD x 45% loss given default
SUMX ( Loan, [Exposure] * RELATED ( Grade[PD 12m] ) * 0.45 )'''),
    ('Loan Month', 'Sector HHI', 'Concentration', '#,0', '''
VAR Total = [Exposure]
RETURN
    SUMX ( VALUES ( Borrower[Sector] ), DIVIDE ( [Exposure], Total ) ^ 2 ) * 10000'''),
    ('Financials', 'Latest Quarter', 'Cover', 'dd mmm yyyy', '''
VAR LastMonth = MAX ( 'Calendar'[Month End] )
RETURN
    CALCULATE ( MAX ( Financials[Quarter End] ), REMOVEFILTERS ( 'Calendar' ), Financials[Quarter End] <= LastMonth )'''),
    ('Financials', 'Latest DSCR', 'Cover', '0.00', '''
VAR Q = [Latest Quarter]
RETURN
    CALCULATE ( AVERAGE ( Financials[DSCR] ), REMOVEFILTERS ( 'Calendar' ), Financials[Quarter End] = Q )'''),
    ('Financials', 'Median DSCR', 'Cover', '0.00', '''
VAR Q = CALCULATE ( MAX ( Financials[Quarter End] ), REMOVEFILTERS ( 'Calendar' ), Financials[Quarter End] <= MAX ( 'Calendar'[Month End] ) )
RETURN
    CALCULATE ( MEDIAN ( Financials[DSCR] ), REMOVEFILTERS ( 'Calendar' ), Financials[Quarter End] = Q )'''),
    ('Financials', 'Covenant Breach Exposure', 'Cover', '#,0.0', '''
-- Performing loans whose latest DSCR is below the 1.25x covenant
SUMX (
    VALUES ( Loan[Loan ID] ),
    VAR Cover = [Latest DSCR]
    VAR Performing = CALCULATE ( [Exposure], 'Loan Month'[DPD] <= 90 )
    RETURN
        IF ( NOT ISBLANK ( Cover ) && Cover < 1.25, Performing )
)'''),
    ('Financials', 'Covenant Breaches', 'Cover', '#,0', '''
COUNTROWS ( FILTER ( VALUES ( Loan[Loan ID] ), NOT ISBLANK ( [Covenant Breach Exposure] ) ) )'''),
    ('Financials', 'Covenant Breach %', 'Cover', '0.0%', '''
DIVIDE ( [Covenant Breach Exposure], [Exposure] )'''),
]

# (from table, from column) many side -> (to table, to column) one side
RELATIONSHIPS = [
    (('Loan Month', 'Loan ID'), ('Loan', 'Loan ID')),
    (('Loan Month', 'Month End'), ('Calendar', 'Month End')),
    (('Financials', 'Loan ID'), ('Loan', 'Loan ID')),
    (('Financials', 'Quarter End'), ('Calendar', 'Month End')),
    (('Loan', 'Borrower ID'), ('Borrower', 'Borrower ID')),
    (('Loan', 'Origination Grade'), ('Grade', 'Grade')),
    (('Borrower', 'Branch ID'), ('Branch', 'Branch ID')),
]


def q(name: str) -> str:
    """Quote a TMDL object name when it needs it."""
    return f"'{name}'" if not name.replace('_', '').isalnum() else name


def indent(text: str, tabs: int) -> str:
    return '\n'.join(('\t' * tabs + line) if line.strip() else '' for line in text.strip('\n').splitlines())


def table_tmdl(name: str) -> str:
    csv_name, cols = TABLES[name]
    out = [f'table {q(name)}', '']
    for src, col, dtype, fmt, summ, hidden in cols:
        out.append(f'\tcolumn {q(col)}')
        out.append(f'\t\tdataType: {dtype}')
        if fmt:
            out.append(f'\t\tformatString: {fmt}')
        if hidden:
            out.append('\t\tisHidden')
        out.append(f'\t\tsummarizeBy: {summ}')
        out.append(f'\t\tsourceColumn: {col}')
        if (name, col) in SORT_BY:
            out.append(f'\t\tsortByColumn: {q(SORT_BY[(name, col)])}')
        out.append('')
    for tbl, col, dax, fmt, sort in CALC_COLUMNS:
        if tbl != name:
            continue
        out.append(f'\tcolumn {q(col)} = {dax}')
        if fmt:
            out.append(f'\t\tformatString: {fmt}')
        out.append('\t\tsummarizeBy: none')
        if sort:
            out.append(f'\t\tsortByColumn: {q(sort)}')
        out.append('')
    for tbl, mname, folder, fmt, dax in MEASURES:
        if tbl != name:
            continue
        out.append(f'\tmeasure {q(mname)} =')
        out.append(indent(dax, 3))
        out.append(f'\t\tformatString: {fmt}')
        out.append(f'\t\tdisplayFolder: {folder}')
        out.append('')
    renames = ', '.join(f'{{"{src}", "{col}"}}' for src, col, *_ in cols)
    types = ', '.join(f'{{"{col}", {M[dtype]}}}' for _, col, dtype, *_ in cols)
    nulls = NULLABLE.get(name)
    steps = ['Source = LoadCsv("' + csv_name + '"),']
    prev = 'Source'
    if nulls:
        steps.append('Blanks = Table.ReplaceValue(Source, "", null, Replacer.ReplaceValue, {' + ', '.join(f'"{c}"' for c in nulls) + '}),')
        prev = 'Blanks'
    steps.append(f'Renamed = Table.RenameColumns({prev}, {{{renames}}}),')
    steps.append(f'Typed = Table.TransformColumnTypes(Renamed, {{{types}}}, "en-US")')
    m = 'let\n' + '\n'.join('    ' + s for s in steps) + '\nin\n    Typed'
    out.append(f'\tpartition {q(name)} = m')
    out.append('\t\tmode: import')
    out.append('\t\tsource =')
    out.append(indent(m, 4))
    out.append('')
    out.append('\tannotation PBI_ResultType = Table')
    return '\n'.join(out) + '\n'


def write_model():
    shutil.rmtree(MODEL, ignore_errors=True)
    (MODEL / 'definition' / 'tables').mkdir(parents=True)
    (MODEL / 'definition.pbism').write_text(json.dumps({
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
        'version': '4.2', 'settings': {}}, indent=2) + '\n')
    (MODEL / 'definition' / 'database.tmdl').write_text('database\n\tcompatibilityLevel: 1567\n')
    order = ', '.join(f'"{t}"' for t in TABLES)
    model = ['model Model', '\tculture: en-US', '\tdefaultPowerBIDataSourceVersion: powerBI_V3', '\tsourceQueryCulture: en-US',
             '\tdataAccessOptions', '\t\tlegacyRedirects', '\t\treturnErrorValuesAsNull', '',
             f'annotation PBI_QueryOrder = ["DataSource","LoadCsv",{order}]', '',
             'annotation __PBI_TimeIntelligenceEnabled = 0', '']
    model += [f'ref table {q(t)}' for t in TABLES]
    (MODEL / 'definition' / 'model.tmdl').write_text('\n'.join(model) + '\n')
    rel = []
    for (ft, fc), (tt, tc) in RELATIONSHIPS:
        rel += [f'relationship {gid("rel", ft, fc)}', f'\tfromColumn: {q(ft)}.{q(fc)}', f'\ttoColumn: {q(tt)}.{q(tc)}', '']
    (MODEL / 'definition' / 'relationships.tmdl').write_text('\n'.join(rel))
    load = '''(name as text) as table =>
let
    Raw =
        if Text.StartsWith(DataSource, "http")
        then Web.Contents(DataSource, [RelativePath = name & ".csv"])
        else File.Contents(DataSource & name & ".csv"),
    Csv = Csv.Document(Raw, [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Promoted = Table.PromoteHeaders(Csv, [PromoteAllScalars = true])
in
    Promoted'''
    expr = [
        '/// Folder or URL holding the CSV files. Use a local path ending in a backslash, e.g. C:\\credence\\analytics\\data\\',
        f'expression DataSource = "{DATA_URL}" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]',
        '', '\tannotation PBI_ResultType = Text', '',
        '/// Loads one CSV from DataSource and promotes its header row.',
        'expression LoadCsv =', indent(load, 2), '', '\tannotation PBI_ResultType = Function', '']
    (MODEL / 'definition' / 'expressions.tmdl').write_text('\n'.join(expr))
    for t in TABLES:
        (MODEL / 'definition' / 'tables' / f'{t}.tmdl').write_text(table_tmdl(t))


# ---------------------------------------------------------------- report spec
MEASURE_HOME = {m[1]: m[0] for m in MEASURES}
COLUMN_HOME = {}
for _t, (_c, _cols) in TABLES.items():
    for _src, _col, *_ in _cols:
        COLUMN_HOME.setdefault(_col, []).append(_t)
for _t, _col, *_ in CALC_COLUMNS:
    COLUMN_HOME.setdefault(_col, []).append(_t)


def field(ref: str):
    """'Table.Column' for a column, or a bare measure name."""
    if '.' in ref and ref.split('.', 1)[0] in TABLES:
        table, prop = ref.split('.', 1)
        return {'Column': {'Expression': {'SourceRef': {'Entity': table}}, 'Property': prop}}, f'{table}.{prop}', prop
    table = MEASURE_HOME[ref]
    return {'Measure': {'Expression': {'SourceRef': {'Entity': table}}, 'Property': ref}}, f'{table}.{ref}', ref


def lit(v):
    return {'expr': {'Literal': {'Value': v}}}


def visual(page: str, key: str, vtype: str, x, y, w, h, roles: dict, title: str, z: int, sort: tuple | None = None):
    query = {}
    for role, refs in roles.items():
        projections = []
        for r in refs:
            f, qref, native = field(r)
            p = {'field': f, 'queryRef': qref, 'nativeQueryRef': native}
            if role == 'Category':
                p['active'] = True
            projections.append(p)
        query[role] = {'projections': projections}
    v = {'visualType': vtype, 'query': {'queryState': query},
         'visualContainerObjects': {'title': [{'properties': {'show': lit('true'), 'text': lit(f"'{title}'")}}]},
         'drillFilterOtherVisuals': True}
    if sort:
        f, _, _ = field(sort[0])
        v['query']['sortDefinition'] = {'sort': [{'field': f, 'direction': sort[1]}]}
    return {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.4.0/schema.json',
        'name': hexid(page, key), 'position': {'x': x, 'y': y, 'z': z, 'width': w, 'height': h, 'tabOrder': z},
        'visual': v,
    }


def card(page, key, measure, x, title, z):
    return visual(page, key, 'card', x, 16, 300, 112, {'Values': [measure]}, title, z)


PAGES = [
    ('overview', 'Portfolio overview', lambda p: [
        card(p, 'k1', 'Exposure', 16, 'Exposure (Rs lakh)', 1000),
        card(p, 'k2', 'Gross NPA %', 332, 'Gross NPA %', 2000),
        card(p, 'k3', '30+ DPD %', 648, '30+ days past due %', 3000),
        card(p, 'k4', 'Covenant Breach %', 964, 'Below 1.25x covenant', 4000),
        visual(p, 'trend', 'lineChart', 16, 144, 760, 280, {'Category': ['Calendar.Month End'], 'Y': ['Gross NPA %', '30+ DPD %']},
               'Asset quality trend', 5000),
        visual(p, 'region', 'slicer', 792, 144, 472, 120, {'Values': ['Branch.Region']}, 'Region', 6000),
        visual(p, 'sector', 'clusteredBarChart', 792, 280, 472, 424, {'Category': ['Borrower.Sector'], 'Y': ['Exposure']},
               'Exposure by sector (Rs lakh)', 7000, ('Exposure', 'Descending')),
        visual(p, 'bucket', 'columnChart', 16, 440, 760, 264,
               {'Category': ['Calendar.Month End'], 'Series': ['Loan Month.DPD Bucket'], 'Y': ['Exposure']},
               'Exposure by days past due', 8000),
    ]),
    ('quality', 'Asset quality', lambda p: [
        card(p, 'k1', 'Gross NPA %', 16, 'Gross NPA %', 1000),
        card(p, 'k2', 'NPA Change bps', 332, 'NPA change vs 12 months ago (bps)', 2000),
        card(p, 'k3', 'Expected Loss', 648, 'Expected loss, illustrative (Rs lakh)', 3000),
        card(p, 'k4', 'Sector HHI', 964, 'Sector concentration (HHI)', 4000),
        visual(p, 'sectornpa', 'clusteredColumnChart', 16, 144, 624, 560, {'Category': ['Borrower.Sector'], 'Y': ['Gross NPA %']},
               'Gross NPA % by sector', 5000, ('Gross NPA %', 'Descending')),
        visual(p, 'branches', 'tableEx', 656, 144, 608, 560,
               {'Values': ['Branch.City', 'Branch.Region', 'Exposure', 'Gross NPA %', '30+ DPD %', 'Covenant Breach %']},
               'Branch league table', 6000, ('Gross NPA %', 'Ascending')),
    ]),
    ('watchlist', 'Covenant watchlist', lambda p: [
        card(p, 'k1', 'Covenant Breaches', 16, 'Performing loans below 1.25x', 1000),
        card(p, 'k2', 'Covenant Breach Exposure', 332, 'Exposure below covenant (Rs lakh)', 2000),
        card(p, 'k3', 'Median DSCR', 648, 'Median DSCR, latest quarter', 3000),
        visual(p, 'sector', 'slicer', 964, 16, 300, 112, {'Values': ['Borrower.Sector']}, 'Sector', 4000),
        visual(p, 'list', 'tableEx', 16, 144, 1248, 560,
               {'Values': ['Borrower.Borrower', 'Borrower.Sector', 'Branch.City', 'Loan.Product', 'Latest DSCR', 'Covenant Breach Exposure']},
               'Performing borrowers below the 1.25x covenant, largest first', 5000, ('Covenant Breach Exposure', 'Descending')),
    ]),
]

THEME = {
    'name': 'Credence',
    'dataColors': ['#27336F', '#C3841A', '#2D7A57', '#B13A3D', '#5B6FB8', '#8F9BB3', '#E0B25C', '#6E4C8E'],
    'background': '#FFFFFF', 'foreground': '#161B23', 'tableAccent': '#27336F',
    'good': '#2D7A57', 'neutral': '#C3841A', 'bad': '#B13A3D',
    'maximum': '#27336F', 'center': '#C3841A', 'minimum': '#E6E8F3',
}


def write_report():
    shutil.rmtree(REPORT, ignore_errors=True)
    d = REPORT / 'definition'
    (d / 'pages').mkdir(parents=True)
    res = REPORT / 'StaticResources' / 'RegisteredResources'
    res.mkdir(parents=True)
    dump = lambda path, obj: path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    dump(REPORT / 'definition.pbir', {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
        'version': '4.0', 'datasetReference': {'byPath': {'path': f'../{NAME}.SemanticModel'}}})
    dump(d / 'version.json', {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
        'version': '2.0.0'})
    dump(res / 'CredenceTheme.json', THEME)
    dump(d / 'report.json', {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.0.0/schema.json',
        'themeCollection': {'customTheme': {'name': 'CredenceTheme.json', 'reportVersionAtImport': '5.61', 'type': 'RegisteredResources'}},
        'resourcePackages': [{'name': 'RegisteredResources', 'type': 'RegisteredResources',
                              'items': [{'name': 'CredenceTheme.json', 'path': 'CredenceTheme.json', 'type': 'CustomTheme'}]}],
        'settings': {'useStylableVisualContainerHeader': True, 'exportDataMode': 'AllowSummarized',
                     'defaultDrillFilterOtherVisuals': True, 'allowChangeFilterTypes': True, 'useEnhancedTooltips': True}})
    names = []
    for key, title, build in PAGES:
        pid = hexid('page', key)
        names.append(pid)
        pdir = d / 'pages' / pid
        (pdir / 'visuals').mkdir(parents=True)
        dump(pdir / 'page.json', {
            '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json',
            'name': pid, 'displayName': title, 'displayOption': 'FitToPage', 'height': 720, 'width': 1280})
        for v in build(key):
            (pdir / 'visuals' / v['name']).mkdir()
            dump(pdir / 'visuals' / v['name'] / 'visual.json', v)
    dump(d / 'pages' / 'pages.json', {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
        'pageOrder': names, 'activePageName': names[0]})
    dump(HERE / f'{NAME}.pbip', {
        '$schema': 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
        'version': '1.0', 'artifacts': [{'report': {'path': f'{NAME}.Report'}}], 'settings': {'enableAutoRecovery': True}})


if __name__ == '__main__':
    write_model()
    write_report()
    n_vis = sum(len(b(k)) for k, _, b in PAGES)
    print(f'{len(TABLES)} tables, {len(CALC_COLUMNS)} calculated columns, {len(MEASURES)} measures, '
          f'{len(RELATIONSHIPS)} relationships, {len(PAGES)} pages, {n_vis} visuals')
