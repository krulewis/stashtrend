"""
SQLite schema definitions and initialization for monarch-pipeline.
All CREATE TABLE statements use IF NOT EXISTS for safe re-runs.
"""

import sqlite3
import stat
from pathlib import Path


DDL = """
CREATE TABLE IF NOT EXISTS accounts (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    type                    TEXT,
    subtype                 TEXT,
    current_balance         REAL,
    display_balance         REAL,
    institution             TEXT,
    is_hidden               INTEGER DEFAULT 0,
    is_asset                INTEGER DEFAULT 1,
    include_in_net_worth    INTEGER DEFAULT 1,
    last_updated            TEXT,
    synced_at               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_history (
    account_id  TEXT NOT NULL,
    date        TEXT NOT NULL,
    balance     REAL,
    PRIMARY KEY (account_id, date),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    group_id    TEXT,
    group_name  TEXT,
    group_type  TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,
    date                TEXT NOT NULL,
    amount              REAL NOT NULL,
    merchant_name       TEXT,
    category_id         TEXT,
    category_name       TEXT,
    category_group      TEXT,
    account_id          TEXT,
    account_name        TEXT,
    is_pending          INTEGER DEFAULT 0,
    is_recurring        INTEGER DEFAULT 0,
    notes               TEXT,
    hide_from_reports   INTEGER DEFAULT 0,
    created_at          TEXT,
    updated_at          TEXT,
    synced_at           TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS budgets (
    category_id     TEXT NOT NULL,
    month           TEXT NOT NULL,
    budgeted_amount REAL,
    actual_amount   REAL,
    variance        REAL,
    PRIMARY KEY (category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS sync_log (
    entity          TEXT PRIMARY KEY,
    last_synced_at  TEXT NOT NULL,
    last_sync_count INTEGER DEFAULT 0,
    total_records   INTEGER DEFAULT 0
);
"""


def init_db(db_path: Path) -> sqlite3.Connection:
    """
    Create the database, apply schema, and lock down file permissions.
    Safe to call on an existing database — schema is additive only.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(DDL)
    conn.commit()

    # chmod 600: owner read/write only — no other users can access the DB
    db_path.chmod(stat.S_IRUSR | stat.S_IWUSR)

    return conn


def get_table_names(conn: sqlite3.Connection) -> list[str]:
    """Return list of user-created table names in the database."""
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    return [row["name"] for row in rows]
