import contextlib
import sqlite3
from typing import Optional

from monarch_pipeline import schema as pipeline_schema
from monarch_pipeline.config import DB_PATH

# ---------------------------------------------------------------------------
# Schema for dashboard-specific tables (added to existing monarch.db)
# ---------------------------------------------------------------------------
DASHBOARD_DDL = """
CREATE TABLE IF NOT EXISTS account_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    color       TEXT    NOT NULL DEFAULT '#6366f1',
    created_at  TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS account_group_members (
    group_id    INTEGER NOT NULL,
    account_id  TEXT    NOT NULL,
    PRIMARY KEY (group_id, account_id),
    FOREIGN KEY (group_id)   REFERENCES account_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   TEXT    NOT NULL,
    finished_at  TEXT,
    status       TEXT    NOT NULL DEFAULT 'running',
    entities     TEXT    NOT NULL,
    full_refresh INTEGER NOT NULL DEFAULT 0,
    results      TEXT,
    error        TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_builder_profile (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    expected_income REAL,
    num_children    INTEGER DEFAULT 0,
    children_ages   TEXT,
    location        TEXT,
    housing_type    TEXT,
    upcoming_events TEXT,
    other_info      TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_builder_regional (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    food_cost_trend  TEXT,
    childcare_cost   TEXT,
    gas_fuel_price   TEXT,
    insurance_trend  TEXT,
    electricity_cost TEXT,
    other_factors    TEXT,
    source           TEXT,
    fetched_at       TEXT,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_builder_plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL DEFAULT 'Untitled Plan',
    months_ahead    INTEGER NOT NULL DEFAULT 3,
    line_items      TEXT NOT NULL,
    summary         TEXT,
    ai_generated_at TEXT,
    user_edited_at  TEXT,
    applied_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS retirement_settings (
    id                      INTEGER PRIMARY KEY CHECK (id = 1),
    current_age             INTEGER,
    target_retirement_age   INTEGER,
    desired_annual_income   REAL,
    monthly_contribution    REAL,
    expected_return_pct     REAL,
    inflation_rate_pct      REAL    DEFAULT 2.5,
    social_security_annual  REAL    DEFAULT 0.0,
    withdrawal_rate_pct     REAL    DEFAULT 4.0,
    milestones              TEXT,
    updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_custom_groups (
  category_id  TEXT PRIMARY KEY,
  custom_group TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
"""


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextlib.contextmanager
def get_db_connection():
    """Context manager that auto-closes the DB connection on exit."""
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def init_dashboard_schema():
    """Create all tables (pipeline + dashboard) if they don't exist. Safe to run on every startup."""
    pipeline_schema.init_db(DB_PATH)  # accounts, account_history, categories, transactions, budgets, sync_log
    conn = get_db()
    conn.executescript(DASHBOARD_DDL)  # account_groups, account_group_members, sync_jobs, settings
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Settings — key/value store helpers
# ---------------------------------------------------------------------------

def get_setting(conn: sqlite3.Connection, key: str, default: Optional[str] = None) -> Optional[str]:
    """Return the stored value for key, or default if not found."""
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    """Upsert a setting value. Inserts or replaces if the key already exists."""
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)"
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
