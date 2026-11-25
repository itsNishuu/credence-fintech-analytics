"""Generate Credence's synthetic MSME loan book as a star schema of CSV files.

Everything is fictional and seeded, so the same command always writes byte-identical files.
Amounts are in Rs lakh. Run:  python3 analytics/generate_data.py
"""
from __future__ import annotations

import csv
import math
import random
from datetime import date
from pathlib import Path

SEED = 2026
N_BORROWERS = 1200
FIRST_MONTH, LAST_MONTH = date(2024, 1, 31), date(2026, 10, 31)
OUT = Path(__file__).resolve().parent / 'data'

# sector -> (base health, cyclicality, stress window as (first quarter index, last), stress depth)
SECTORS = {
    'Auto components': (0.10, 0.9, (5, 8), 0.7),
    'Components distribution': (-0.15, 0.8, (5, 8), 0.6),
    'Food processing': (0.05, 0.4, None, 0.0),
    'Textiles': (-0.20, 1.0, (5, 10), 1.0),
    'Pharmaceuticals': (0.35, 0.3, None, 0.0),
    'Logistics': (0.00, 0.7, (6, 8), 0.5),
    'Agri processing': (0.00, 0.6, (2, 4), 0.6),
    'IT services': (0.40, 0.4, None, 0.0),
    'Construction': (-0.25, 1.1, (4, 10), 0.9),
    'Specialty chemicals': (0.20, 0.6, (8, 10), 0.5),
    'Retail': (-0.10, 0.8, (5, 7), 0.6),
    'Hospitality': (-0.05, 1.0, (0, 1), 0.5),
}
BRANCHES = [  # id, city, region
    ('BR01', 'Pune', 'West'), ('BR02', 'Mumbai', 'West'), ('BR03', 'Ahmedabad', 'West'), ('BR04', 'Chennai', 'South'),
    ('BR05', 'Coimbatore', 'South'), ('BR06', 'Bengaluru', 'South'), ('BR07', 'Delhi NCR', 'North'), ('BR08', 'Ludhiana', 'North'),
    ('BR09', 'Kolkata', 'East'), ('BR10', 'Indore', 'Central'),
]
PRODUCTS = [('Term loan', 0.5), ('Working capital', 0.35), ('Equipment finance', 0.15)]
CONSTITUTIONS = [('Private limited', 0.5), ('Partnership', 0.3), ('Proprietorship', 0.2)]
GRADES = [('A', 85, 0.005), ('B+', 75, 0.01), ('B', 65, 0.02), ('C+', 55, 0.04), ('C', 45, 0.08), ('D', 0, 0.15)]
PREFIX = ['Aarav', 'Bhoomi', 'Chandra', 'Deccan', 'Ekta', 'Ganga', 'Himalaya', 'Indus', 'Jyoti', 'Kaveri', 'Lakshmi', 'Meru',
          'Narmada', 'Orchid', 'Prakash', 'Sahyadri', 'Tara', 'Udaya', 'Vindhya', 'Yamuna', 'Saraswati', 'Konark', 'Nilgiri', 'Shivam']
SUFFIX = {
    'Auto components': ['Auto Parts', 'Forgings', 'Castings'], 'Components distribution': ['Auto Distributors', 'Spares Traders'],
    'Food processing': ['Foods', 'Dairy', 'Snacks'], 'Textiles': ['Spinning Mills', 'Fabrics', 'Weaves'],
    'Pharmaceuticals': ['Formulations', 'Life Sciences'], 'Logistics': ['Freight Lines', 'Logistics', 'Carriers'],
    'Agri processing': ['Agro Mills', 'Agri Foods'], 'IT services': ['Digital Services', 'Infotech', 'Systems'],
    'Construction': ['Builders', 'Infra Projects', 'Constructions'], 'Specialty chemicals': ['Chemicals', 'Polymers'],
    'Retail': ['Retail', 'Stores', 'Mart'], 'Hospitality': ['Stays', 'Hotels', 'Resorts'],
}


def month_ends(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        nxt = date(y + (m == 12), m % 12 + 1, 1)
        yield date.fromordinal(nxt.toordinal() - 1)
        y, m = nxt.year, nxt.month


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    first_next = date(d.year + y + (m == 11), (m + 1) % 12 + 1, 1)
    return date.fromordinal(first_next.toordinal() - 1)


def pick(rng: random.Random, weighted):
    r, acc = rng.random(), 0.0
    for v, w in weighted:
        acc += w
        if r < acc:
            return v
    return weighted[-1][0]


def grade_for(score: float) -> str:
    return next(g for g, lo, _ in GRADES if score >= lo)


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def generate():
    rng = random.Random(SEED)
    months = list(month_ends(FIRST_MONTH, LAST_MONTH))
    quarters = [m for m in months if m.month in (3, 6, 9, 12)]
    sectors = list(SECTORS)

    borrowers, loans, snapshots, financials = [], [], [], []
    used_names = set()
    for i in range(1, N_BORROWERS + 1):
        sector = sectors[min(int(rng.random() ** 1.15 * len(sectors)), len(sectors) - 1)] if rng.random() < 0.85 else rng.choice(sectors)
        base, cyc, window, depth = SECTORS[sector]
        while True:
            name = f"{rng.choice(PREFIX)} {rng.choice(SUFFIX[sector])}"
            name = name if name not in used_names else f"{name} {rng.choice(['Pvt', 'Industries', 'Enterprises', 'Co'])}"
            if name not in used_names:
                used_names.add(name)
                break
        branch = rng.choice(BRANCHES)
        borrowers.append({
            'borrower_id': f'B{i:05d}', 'borrower_name': name, 'sector': sector, 'branch_id': branch[0],
            'constitution': pick(rng, CONSTITUTIONS), 'incorporated_year': rng.randint(1988, 2019),
        })

        product = pick(rng, PRODUCTS)
        sanction = add_months(date(2022, 1, 31), rng.randint(0, 53))  # Jan 2022 .. Jun 2026
        amount = round(math.exp(rng.gauss(math.log(55), 0.7)), 1)
        amount = min(max(amount, 8.0), 450.0)
        tenor = {'Term loan': rng.choice([36, 48, 60, 72, 84]), 'Working capital': 12, 'Equipment finance': rng.choice([36, 48, 60])}[product]
        rate = round(rng.uniform(9.25, 13.75) + (0.5 if product == 'Working capital' else 0), 2)
        collateral = round(amount * rng.uniform(0.6, 1.8), 1)
        health = rng.gauss(base, 0.85)
        orig_score = max(20.0, min(98.0, 66 + 11 * health + rng.gauss(0, 4)))
        loan_id = f'L{i:05d}'
        loans.append({
            'loan_id': loan_id, 'borrower_id': f'B{i:05d}', 'product': product, 'sanction_date': sanction.isoformat(),
            'sanctioned_lakh': amount, 'tenor_months': tenor, 'interest_rate_pct': rate, 'collateral_lakh': collateral,
            'origination_grade': grade_for(orig_score),
        })

        # Quarterly financials: health follows an AR(1) path plus the sector's stress window.
        q_health, loan_fin = {}, []
        h = health
        for qi, q in enumerate(quarters):
            shock = -depth * cyc if window and window[0] <= qi <= window[1] else 0.0
            h = 0.8 * h + 0.2 * health + rng.gauss(0, 0.25)
            eff = h + shock
            q_health[q] = eff
            if q < sanction:
                continue
            revenue = round(amount * rng.uniform(3.2, 6.0) / 4 * (1 + 0.06 * eff), 1)
            debt_service = round(amount * (rate / 100 + 1 / max(tenor / 12, 1)) / 4 * (0.6 if product == 'Working capital' else 1), 2)
            dscr = math.exp(0.43 + 0.30 * eff + rng.gauss(0, 0.08))
            cfads = round(debt_service * dscr, 2)
            ebitda = round(cfads * rng.uniform(1.05, 1.25), 2)
            score = max(5.0, min(99.0, 64 + 12 * eff + rng.gauss(0, 3)))
            loan_fin.append({
                'loan_id': loan_id, 'quarter_end': q.isoformat(), 'revenue_lakh': revenue, 'ebitda_lakh': ebitda,
                'cfads_lakh': cfads, 'debt_service_lakh': debt_service, 'score': round(score, 1),
            })

        # Monthly performance: a delinquency state machine driven by the latest quarter's health.
        state = 0  # 0 current, 1: 1-30, 2: 31-60, 3: 61-90, 4: 90+ (NPA)
        closed, npa_months, exit_month, exit_reason = False, 0, '', ''
        for m in months:
            if m < sanction or closed:
                continue
            mob = (m.year - sanction.year) * 12 + m.month - sanction.month
            q = max((x for x in quarters if x <= m), default=quarters[0])
            eff = q_health.get(q, health)
            if mob >= tenor and state == 0 and product != 'Working capital':
                closed, exit_month, exit_reason = True, m.isoformat(), 'Repaid'
                continue
            if npa_months >= 9:  # written off after nine months as NPA
                closed, exit_month, exit_reason = True, m.isoformat(), 'Written off'
                continue
            p_slip = sigmoid(-4.6 - 1.4 * eff)
            p_cure = sigmoid(0.4 + 0.8 * eff)
            u = rng.random()
            if state == 0:
                state = 1 if u < p_slip else 0
            elif state < 4:
                state = 0 if u < p_cure * (0.9 if state == 1 else 0.5) else state + 1 if u > 1 - (0.30 - 0.10 * eff) else state
            else:
                state = 2 if u < 0.06 else 4
            npa_months = npa_months + 1 if state == 4 else 0
            dpd = 0 if state == 0 else rng.randint(30 * (state - 1) + 1, 30 * state) if state < 4 else rng.randint(91, 240)
            if product == 'Working capital':
                outstanding = amount * min(1.0, rng.uniform(0.62, 0.95) + (0.05 if state else 0))
            else:
                outstanding = amount * max(0.0, 1 - mob / tenor) * (1.0 if state == 0 else 1.02)
            snapshots.append({
                'loan_id': loan_id, 'month_end': m.isoformat(), 'months_on_book': mob,
                'outstanding_lakh': round(outstanding, 2), 'dpd': dpd,
            })
        loans[-1]['exit_month'], loans[-1]['exit_reason'] = exit_month, exit_reason
        # Borrowers stop filing financials once the loan has left the book.
        financials.extend(f for f in loan_fin if not exit_month or f['quarter_end'] < exit_month)

    dates = [{'month_end': m.isoformat(), 'year': m.year, 'month': m.month, 'month_name': m.strftime('%b %Y'),
              'quarter': f'{m.year} Q{(m.month - 1) // 3 + 1}', 'fiscal_year': f'FY{(m.year + (m.month > 3)) % 100:02d}'} for m in months]
    return {
        'dim_borrower': borrowers, 'dim_loan': loans,
        'dim_branch': [{'branch_id': b, 'city': c, 'region': r} for b, c, r in BRANCHES],
        'dim_grade': [{'grade': g, 'min_score': lo, 'pd_12m': pd, 'grade_rank': i + 1} for i, (g, lo, pd) in enumerate(GRADES)],
        'dim_date': dates, 'fact_loan_month': snapshots, 'fact_financials_quarter': financials,
    }


def write(tables, out: Path = OUT):
    out.mkdir(parents=True, exist_ok=True)
    for name, rows in tables.items():
        with open(out / f'{name}.csv', 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n')
            w.writeheader()
            w.writerows(rows)


if __name__ == '__main__':
    t = generate()
    write(t)
    print(', '.join(f'{k}: {len(v):,} rows' for k, v in t.items()))
