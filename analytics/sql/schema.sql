-- Credence loan book: a star schema. Amounts in Rs lakh. Fictional data.
-- Standard SQL; tested on SQLite, portable to PostgreSQL / SQL Server with minor type changes.

DROP TABLE IF EXISTS fact_financials_quarter;
DROP TABLE IF EXISTS fact_loan_month;
DROP TABLE IF EXISTS dim_loan;
DROP TABLE IF EXISTS dim_borrower;
DROP TABLE IF EXISTS dim_branch;
DROP TABLE IF EXISTS dim_grade;
DROP TABLE IF EXISTS dim_date;

CREATE TABLE dim_branch (
  branch_id  TEXT PRIMARY KEY,
  city       TEXT NOT NULL,
  region     TEXT NOT NULL
);

CREATE TABLE dim_grade (
  grade      TEXT PRIMARY KEY,
  min_score  REAL NOT NULL,
  pd_12m     REAL NOT NULL CHECK (pd_12m > 0 AND pd_12m < 1),
  grade_rank INTEGER NOT NULL UNIQUE
);

CREATE TABLE dim_date (
  month_end   TEXT PRIMARY KEY,           -- ISO date, last day of month
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  month_name  TEXT NOT NULL,
  quarter     TEXT NOT NULL,
  fiscal_year TEXT NOT NULL               -- Indian fiscal year, April to March
);

CREATE TABLE dim_borrower (
  borrower_id       TEXT PRIMARY KEY,
  borrower_name     TEXT NOT NULL UNIQUE,
  sector            TEXT NOT NULL,
  branch_id         TEXT NOT NULL REFERENCES dim_branch (branch_id),
  constitution      TEXT NOT NULL,
  incorporated_year INTEGER NOT NULL
);

CREATE TABLE dim_loan (
  loan_id           TEXT PRIMARY KEY,
  borrower_id       TEXT NOT NULL REFERENCES dim_borrower (borrower_id),
  product           TEXT NOT NULL,
  sanction_date     TEXT NOT NULL,
  sanctioned_lakh   REAL NOT NULL CHECK (sanctioned_lakh > 0),
  tenor_months      INTEGER NOT NULL,
  interest_rate_pct REAL NOT NULL,
  collateral_lakh   REAL NOT NULL,
  origination_grade TEXT NOT NULL REFERENCES dim_grade (grade),
  exit_month        TEXT,                 -- empty while the loan is live
  exit_reason       TEXT                  -- 'Repaid' or 'Written off'
);

CREATE TABLE fact_loan_month (
  loan_id          TEXT NOT NULL REFERENCES dim_loan (loan_id),
  month_end        TEXT NOT NULL REFERENCES dim_date (month_end),
  months_on_book   INTEGER NOT NULL,
  outstanding_lakh REAL NOT NULL CHECK (outstanding_lakh >= 0),
  dpd              INTEGER NOT NULL CHECK (dpd >= 0),
  PRIMARY KEY (loan_id, month_end)
);

CREATE TABLE fact_financials_quarter (
  loan_id           TEXT NOT NULL REFERENCES dim_loan (loan_id),
  quarter_end       TEXT NOT NULL REFERENCES dim_date (month_end),
  revenue_lakh      REAL NOT NULL,
  ebitda_lakh       REAL NOT NULL,
  cfads_lakh        REAL NOT NULL,        -- cash flow available for debt service
  debt_service_lakh REAL NOT NULL CHECK (debt_service_lakh > 0),
  score             REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  PRIMARY KEY (loan_id, quarter_end)
);

CREATE INDEX ix_loan_month_month ON fact_loan_month (month_end);
CREATE INDEX ix_fin_quarter ON fact_financials_quarter (quarter_end);
