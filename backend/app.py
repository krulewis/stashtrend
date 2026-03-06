"""
Monarch Dashboard — Flask API Backend
Reads from the monarch_pipeline database and serves JSON to the React frontend.

The database path defaults to ~/.monarch_pipeline/monarch.db and can be
overridden via the MONARCH_DATA_DIR environment variable (used by Docker).
"""

import asyncio
import contextlib
import json
import os
import re
import sqlite3
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import keyring.errors

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover
    class BackgroundScheduler:  # type: ignore[no-redef]
        """No-op stub used when APScheduler is not installed (e.g., test sandbox)."""
        running = False
        def __init__(self, **kwargs): pass
        def start(self): self.running = True
        def get_job(self, job_id): return None
        def add_job(self, *args, **kwargs): pass
        def remove_job(self, job_id): pass

from flask import Flask, jsonify, request
from flask_cors import CORS

from monarch_pipeline import auth, fetchers, schema as pipeline_schema, storage
from monarch_pipeline.config import DB_PATH, TOKEN_PATH, SESSION_PATH, ensure_data_dir

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost",
    "http://localhost:80",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:80",
    "http://127.0.0.1:5173",
    "http://[::1]",
    "http://[::1]:80",
    "http://[::1]:5173",
])

scheduler = BackgroundScheduler(daemon=True)
SYNC_JOB_ID = "auto_sync"


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    from werkzeug.exceptions import HTTPException
    if isinstance(exc, HTTPException):
        return exc
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Token management — setup helpers
# ---------------------------------------------------------------------------

def bootstrap_token_from_env():
    """
    If MONARCH_TOKEN env var is set, write it to the token file and clear it
    from the environment. Called once at startup so Docker users can supply
    their token via a .env file without it persisting in process memory.
    """
    token = os.environ.pop("MONARCH_TOKEN", None)
    if token and token.strip():
        auth.save_token(token.strip(), TOKEN_PATH)
        print("[startup] Token written from MONARCH_TOKEN env var.")


def has_token() -> bool:
    """Returns True if a Monarch Money token is currently stored."""
    return auth.load_token(TOKEN_PATH) is not None


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


# ---------------------------------------------------------------------------
# Scheduler — auto sync
# ---------------------------------------------------------------------------

def run_scheduled_sync() -> None:
    """
    Called by APScheduler on the configured interval.
    Starts a full sync in a background thread unless one is already running.
    """
    conn = get_db()
    if get_running_job(conn):
        conn.close()
        return
    job_id = create_sync_job(conn, list(ENTITY_RUN_ORDER), False)
    conn.close()
    thread = threading.Thread(
        target=_run_sync_worker,
        args=(job_id, list(ENTITY_RUN_ORDER), False),
        daemon=True,
    )
    thread.start()


def _reschedule(interval_hours: int) -> None:
    """
    Update the APScheduler auto-sync job.
    interval_hours == 0 means disabled (job is removed if present).
    interval_hours > 0 schedules a recurring interval job.
    """
    if scheduler.get_job(SYNC_JOB_ID):
        scheduler.remove_job(SYNC_JOB_ID)
    if interval_hours > 0:
        scheduler.add_job(
            run_scheduled_sync,
            "interval",
            hours=interval_hours,
            id=SYNC_JOB_ID,
        )


# ---------------------------------------------------------------------------
# Sync — helper functions (also used/tested in tests/test_sync.py)
# ---------------------------------------------------------------------------

ENTITY_TABLE_MAP = {
    "accounts":        "accounts",
    "account_history": "account_history",
    "holdings":        "holdings",
    "categories":      "categories",
    "transactions":    "transactions",
    "budgets":         "budgets",
}

ENTITY_RUN_ORDER = [
    "accounts",
    "account_history",
    "holdings",
    "categories",
    "transactions",
    "budgets",
]

ENTITY_LABELS = {
    "accounts":        "Accounts",
    "account_history": "Account History",
    "holdings":        "Holdings",
    "categories":      "Categories",
    "transactions":    "Transactions",
    "budgets":         "Budgets",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_sync_job(conn: sqlite3.Connection, entities: list, full_refresh: bool) -> int:
    cur = conn.execute(
        "INSERT INTO sync_jobs (started_at, status, entities, full_refresh) VALUES (?, 'running', ?, ?)",
        (_now(), json.dumps(entities), int(full_refresh)),
    )
    conn.commit()
    return cur.lastrowid


def update_sync_job(conn, job_id, status, results=None, error=None):
    conn.execute(
        "UPDATE sync_jobs SET status=?, finished_at=?, results=?, error=? WHERE id=?",
        (status, _now(), json.dumps(results) if results is not None else None, error, job_id),
    )
    conn.commit()


def get_sync_job(conn, job_id) -> Optional[dict]:
    row = conn.execute("SELECT * FROM sync_jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    d = dict(row)
    if d.get("entities"):
        d["entities"] = json.loads(d["entities"])
    if d.get("results"):
        d["results"] = json.loads(d["results"])
    return d


def get_sync_history(conn, limit=10) -> list:
    rows = conn.execute(
        "SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT ?", (limit,)
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        if d.get("entities"):
            d["entities"] = json.loads(d["entities"])
        if d.get("results"):
            d["results"] = json.loads(d["results"])
        result.append(d)
    return result


def get_running_job(conn) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM sync_jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    d = dict(row)
    if d.get("entities"):
        d["entities"] = json.loads(d["entities"])
    return d


def count_entity_rows(conn, entity: str) -> int:
    table = ENTITY_TABLE_MAP.get(entity)
    if table is None:
        raise ValueError(f"Unknown entity: {entity}")
    return conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]


def snapshot_counts(conn, entities: list) -> dict:
    return {e: count_entity_rows(conn, e) for e in entities}


def compute_deltas(before: dict, after: dict) -> dict:
    return {entity: after.get(entity, 0) - before.get(entity, 0) for entity in after}


def ordered_entities(selected: list) -> list:
    order_index = {e: i for i, e in enumerate(ENTITY_RUN_ORDER)}
    return sorted(selected, key=lambda e: order_index.get(e, 99))


def build_results(entity, count, delta, status, error=None) -> dict:
    return {"count": count, "new": delta, "status": status, "error": error}


# ---------------------------------------------------------------------------
# Sync — background worker
# ---------------------------------------------------------------------------

def _run_sync_worker(job_id: int, entities: list, full_refresh: bool):
    """
    Runs in a background thread. Connects to the DB, authenticates with
    Monarch Money, and syncs each requested entity in dependency order.
    Updates sync_jobs table with per-entity results as it goes.
    """
    # Each thread needs its own DB connection and event loop
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys = ON")

    results = {}
    top_level_error = None
    any_failed = False

    async def _sync():
        nonlocal any_failed, top_level_error
        try:
            mm = await auth.get_client(SESSION_PATH, TOKEN_PATH)
            pipeline_conn = pipeline_schema.init_db(DB_PATH)

            for entity in ordered_entities(entities):
                before = snapshot_counts(conn, [entity])
                entity_count = 0
                entity_error = None
                entity_status = "success"

                try:
                    if entity == "accounts":
                        data = await fetchers.fetch_accounts(mm)
                        entity_count = storage.upsert_accounts(pipeline_conn, data)
                        storage.update_sync_log(pipeline_conn, "accounts", entity_count)
                        # stash accounts for history step
                        _run_sync_worker.last_accounts = data

                    elif entity == "account_history":
                        accounts = getattr(_run_sync_worker, "last_accounts", None)
                        if accounts is None:
                            # accounts weren't synced this run — fetch list from DB for IDs
                            acct_rows = pipeline_conn.execute(
                                "SELECT id FROM accounts"
                            ).fetchall()
                            account_ids = [r["id"] for r in acct_rows]
                        else:
                            account_ids = [a["id"] for a in accounts]

                        total = 0
                        for acct_id in account_ids:
                            last_date = (
                                None if full_refresh
                                else storage.get_latest_history_date(pipeline_conn, acct_id)
                            )
                            history = await fetchers.fetch_account_history(
                                mm, acct_id, start_date=last_date
                            )
                            if history:
                                total += storage.upsert_account_history(
                                    pipeline_conn, acct_id, history
                                )
                        storage.update_sync_log(pipeline_conn, "account_history", total)
                        entity_count = total

                    elif entity == "categories":
                        data = await fetchers.fetch_categories(mm)
                        entity_count = storage.upsert_categories(pipeline_conn, data)
                        storage.update_sync_log(pipeline_conn, "categories", entity_count)

                    elif entity == "transactions":
                        from datetime import date, timedelta
                        if full_refresh:
                            tx_start = None
                        else:
                            last_sync = storage.get_last_sync_date(pipeline_conn, "transactions")
                            if last_sync:
                                last_dt = datetime.fromisoformat(last_sync).date()
                                tx_start = (last_dt - timedelta(days=3)).isoformat()
                            else:
                                tx_start = None
                        data = await fetchers.fetch_transactions(mm, start_date=tx_start)
                        entity_count = storage.upsert_transactions(pipeline_conn, data)
                        storage.update_sync_log(pipeline_conn, "transactions", entity_count)

                    elif entity == "budgets":
                        from datetime import date as _date
                        today = _date.today()
                        b_start = _date(today.year - 1, today.month, 1).isoformat()
                        b_end   = _date(today.year, today.month, 1).isoformat()
                        data = await fetchers.fetch_budgets(mm, b_start, b_end)
                        entity_count = storage.upsert_budgets(pipeline_conn, data)
                        storage.update_sync_log(pipeline_conn, "budgets", entity_count)

                    elif entity == "holdings":
                        inv_accounts = getattr(_run_sync_worker, "last_accounts", None)
                        if inv_accounts is not None:
                            investment_ids = [
                                a["id"] for a in inv_accounts
                                if a.get("type", {}).get("name") == "investment"
                            ]
                        else:
                            acct_rows = pipeline_conn.execute(
                                "SELECT id FROM accounts WHERE type = 'investment'"
                            ).fetchall()
                            investment_ids = [r["id"] for r in acct_rows]

                        total = 0
                        for acct_id in investment_ids:
                            h_data = await fetchers.fetch_holdings(mm, acct_id)
                            total += storage.upsert_holdings(pipeline_conn, acct_id, h_data)
                        storage.update_sync_log(pipeline_conn, "holdings", total)
                        entity_count = total

                except Exception as exc:
                    entity_status = "failed"
                    app.logger.exception("Sync error for %s", entity)
                    entity_error  = "Sync error. Check server logs."
                    any_failed    = True

                after = snapshot_counts(conn, [entity])
                delta = compute_deltas(before, after)[entity]
                results[entity] = build_results(entity, entity_count, delta, entity_status, entity_error)

                # Persist incremental progress so the frontend can poll live
                final_status = "running" if entity != ordered_entities(entities)[-1] else None
                if final_status == "running":
                    conn.execute(
                        "UPDATE sync_jobs SET results = ? WHERE id = ?",
                        (json.dumps(results), job_id),
                    )
                    conn.commit()

            pipeline_conn.close()

        except Exception as exc:
            app.logger.exception("Top-level sync error")
            top_level_error = "Sync error. Check server logs."
            any_failed = True

    asyncio.run(_sync())

    if top_level_error:
        overall_status = "failed"
    elif any_failed:
        overall_status = "partial"
    else:
        overall_status = "success"

    update_sync_job(conn, job_id, status=overall_status, results=results, error=top_level_error)
    conn.close()


# ===========================================================================
# NET WORTH  endpoints (unchanged from v1)
# ===========================================================================

@app.route("/api/networth/history")
def networth_history():
    conn = get_db()
    rows = conn.execute("""
        SELECT
            ah.date,
            SUM(CASE WHEN a.is_asset = 1 THEN ah.balance ELSE 0 END)          AS assets,
            SUM(CASE WHEN a.is_asset = 0 THEN ABS(ah.balance) ELSE 0 END)     AS liabilities,
            SUM(CASE WHEN a.is_asset = 1 THEN ah.balance ELSE -ABS(ah.balance) END) AS net_worth
        FROM account_history ah
        JOIN accounts a ON ah.account_id = a.id
        WHERE a.include_in_net_worth = 1
        GROUP BY ah.date
        ORDER BY ah.date ASC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/networth/stats")
def networth_stats():
    conn = get_db()

    def net_worth_on_date(target_date_expr):
        row = conn.execute(f"""
            SELECT
                ah.date,
                SUM(CASE WHEN a.is_asset = 1 THEN ah.balance ELSE -ABS(ah.balance) END) AS net_worth
            FROM account_history ah
            JOIN accounts a ON ah.account_id = a.id
            WHERE a.include_in_net_worth = 1
              AND ah.date <= {target_date_expr}
            GROUP BY ah.date
            ORDER BY ah.date DESC
            LIMIT 1
        """).fetchone()
        return (row["net_worth"], row["date"]) if row else (None, None)

    current_nw, current_date = net_worth_on_date("date('now')")
    mom_nw, mom_date         = net_worth_on_date("date('now', '-1 month')")
    yoy_nw, yoy_date         = net_worth_on_date("date('now', '-1 year')")

    def pct_change(current, prior):
        if prior is None or prior == 0:
            return None
        return round((current - prior) / abs(prior) * 100, 2)

    conn.close()
    return jsonify({
        "current": {"net_worth": current_nw, "date": current_date},
        "mom": {
            "net_worth": mom_nw,
            "date": mom_date,
            "change":     round(current_nw - mom_nw, 2) if mom_nw is not None else None,
            "pct_change": pct_change(current_nw, mom_nw),
        },
        "yoy": {
            "net_worth": yoy_nw,
            "date": yoy_date,
            "change":     round(current_nw - yoy_nw, 2) if yoy_nw is not None else None,
            "pct_change": pct_change(current_nw, yoy_nw),
        },
    })


@app.route("/api/accounts/summary")
def accounts_summary():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT
                id,
                type,
                subtype,
                is_asset,
                institution,
                name,
                current_balance,
                display_balance
            FROM accounts
            WHERE include_in_net_worth = 1
              AND is_hidden = 0
            ORDER BY is_asset DESC, type, current_balance DESC
        """).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["bucket"] = _get_bucket(d.get("type"), d.get("subtype"))
            result.append(d)
        return jsonify(result)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Net Worth by Account Type — bucket mapping
# ---------------------------------------------------------------------------

# Maps Monarch account `type` values to a display bucket.
# Keep include_in_net_worth = 1 filter consistent with networth_history endpoint.
# NOTE: is_hidden is intentionally NOT filtered here — networth_history only uses
# include_in_net_worth=1, so totals across bucket series match the main NW chart.
BUCKET_MAP = {
    # Retirement
    "401k":               "Retirement",
    "403b":               "Retirement",
    "ira":                "Retirement",
    "roth_ira":           "Retirement",
    "roth_401k":          "Retirement",
    "sep_ira":            "Retirement",
    "simple_ira":         "Retirement",
    "pension":            "Retirement",
    "401a":               "Retirement",
    # Brokerage / taxable investments
    "brokerage":          "Brokerage",
    "investment":         "Brokerage",
    "crypto":             "Brokerage",
    "hsa":                "Brokerage",
    "529":                "Brokerage",
    "education":          "Brokerage",
    "stock":              "Brokerage",
    # Cash / liquid
    "checking":           "Cash",
    "savings":            "Cash",
    "depository":         "Cash",
    "money_market":       "Cash",
    "cash":               "Cash",
    "prepaid":            "Cash",
    "cash_management":    "Cash",
    # Real estate
    "real_estate":        "Real Estate",
    "property":           "Real Estate",
    # Other assets
    "vehicle":            "Other",
    "other_asset":        "Other",
    "collectible":        "Other",
    "valuable":           "Other",
    # Debt / liabilities
    "mortgage":           "Debt",
    "student_loan":       "Debt",
    "auto_loan":          "Debt",
    "personal_loan":      "Debt",
    "credit":             "Debt",
    "credit_card":        "Debt",
    "line_of_credit":     "Debt",
    "home_equity":        "Debt",
    "medical":            "Debt",
    "other_liability":    "Debt",
    "loan":               "Debt",
}

# Subtypes that override the parent type bucket (checked first if subtype is set).
# Includes both standard Plaid subtypes and Monarch-specific prefixed subtypes
# (e.g., st_401k, st_529). Check backend logs for "Unknown account type" warnings
# to catch new subtypes as Monarch adds them.
TYPE_MAP = {
    # Retirement subtypes — standard
    "traditional_ira":    "Retirement",
    "roth_ira":           "Retirement",
    "rollover_ira":       "Retirement",
    "sep_ira":            "Retirement",
    "simple_ira":         "Retirement",
    "inherited_ira":      "Retirement",
    # Retirement subtypes — Monarch-specific
    "ira":                "Retirement",
    "roth":               "Retirement",
    "st_401k":            "Retirement",
    "st_403b":            "Retirement",
    "thrift_savings_plan":"Retirement",
    # Brokerage subtypes
    "individual":         "Brokerage",
    "joint":              "Brokerage",
    "trust":              "Brokerage",
    "ugma_utma":          "Brokerage",
    "brokerage":          "Brokerage",
    "st_529":             "Brokerage",
    "health_savings_account": "Brokerage",
    # Cash subtypes
    "high_yield_savings": "Cash",
    "cash_management":    "Cash",
    "checking":           "Cash",
    "savings":            "Cash",
    "cd":                 "Cash",
}

BUCKET_ORDER = ["Retirement", "Brokerage", "Cash", "Real Estate", "Debt", "Other"]

BUCKET_COLORS = {
    "Retirement":   "#4D9FFF",
    "Brokerage":    "#2ECC8A",
    "Cash":         "#7DBFFF",
    "Real Estate":  "#F5A623",
    "Debt":         "#FF5A7A",
    "Other":        "#8BA8CC",
}


def _get_bucket(account_type, account_subtype):
    """
    Map an account's type + subtype to a display bucket.
    Subtype is checked first (TYPE_MAP), then type (BUCKET_MAP).
    Logs a WARNING for unknown types so new Monarch types are caught early.
    """
    if account_subtype and account_subtype in TYPE_MAP:
        return TYPE_MAP[account_subtype]
    if account_type and account_type in BUCKET_MAP:
        return BUCKET_MAP[account_type]
    if account_type:
        app.logger.warning("Unknown account type for bucket mapping: %r (subtype=%r)", account_type, account_subtype)
    return "Other"


def _compute_bucket_cagr(bal_by_date):
    """
    Compute 1Y/3Y/5Y CAGR for a bucket using aggregate balance CAGR.

    Edge cases:
    - <30 days of non-zero history → return null for all periods.
    - First non-zero balance is the start point (not a return event).
    - Zero-balance days are skipped.

    Returns: {"1y": float|None, "3y": float|None, "5y": float|None}
    """
    if not bal_by_date:
        return {"1y": None, "3y": None, "5y": None}

    sorted_dates = sorted(bal_by_date.keys())
    # Strip leading zero-balance entries — first non-zero is the start
    nonzero_dates = [d for d in sorted_dates if bal_by_date[d] > 0]

    if len(nonzero_dates) < 30:
        return {"1y": None, "3y": None, "5y": None}

    pairs = [(d, bal_by_date[d]) for d in nonzero_dates]
    today_str = nonzero_dates[-1]

    def _cagr_for_years(years):
        cutoff_dt = datetime.strptime(today_str, "%Y-%m-%d")
        target_year = cutoff_dt.year - years
        # Handle leap day: Feb 29 doesn't exist in non-leap years
        try:
            cutoff_dt = cutoff_dt.replace(year=target_year)
        except ValueError:
            cutoff_dt = cutoff_dt.replace(year=target_year, day=28)
        cutoff = cutoff_dt.strftime("%Y-%m-%d")
        start_pairs = [(d, b) for d, b in pairs if d >= cutoff]
        if len(start_pairs) < 2:
            return None
        start_date, start_bal = start_pairs[0]
        end_date, end_bal = pairs[-1]
        if start_bal <= 0 or end_bal <= 0:
            return None
        dt_start = datetime.strptime(start_date, "%Y-%m-%d")
        dt_end = datetime.strptime(end_date, "%Y-%m-%d")
        elapsed_years = (dt_end - dt_start).days / 365.25
        if elapsed_years < 0.1:
            return None
        # Simple CAGR: (end/start)^(1/years) - 1
        # At bucket level we use aggregate balance CAGR as an approximation.
        cagr_val = (end_bal / start_bal) ** (1.0 / elapsed_years) - 1
        return round(cagr_val * 100, 2)

    return {
        "1y": _cagr_for_years(1),
        "3y": _cagr_for_years(3),
        "5y": _cagr_for_years(5),
    }


@app.route("/api/networth/by-type")
def networth_by_type():
    """
    Returns per-bucket NW history (stacked area) and CAGR estimates.

    Filter: include_in_net_worth = 1 only — matches networth_history so bucket
    series totals add up to the main NW chart total. is_hidden is NOT filtered.

    CAGR approximation: aggregate balance CAGR.
    Tooltip in the UI reads: "Estimated CAGR — actual returns may differ."
    """
    conn = get_db()
    try:
        # Step 1: Fetch all accounts in scope
        acct_rows = conn.execute("""
            SELECT id, type, subtype, is_asset
            FROM accounts
            WHERE include_in_net_worth = 1
        """).fetchall()

        acct_bucket = {}
        for row in acct_rows:
            bucket = _get_bucket(row["type"], row["subtype"])
            acct_bucket[row["id"]] = (bucket, bool(row["is_asset"]))

        if not acct_bucket:
            return jsonify({"series": [], "cagr": {}, "bucket_colors": BUCKET_COLORS,
                            "bucket_order": BUCKET_ORDER})

        # Step 2: Fetch full account_history for all in-scope accounts
        placeholders = ",".join("?" * len(acct_bucket))
        history_rows = conn.execute(f"""
            SELECT account_id, date, balance
            FROM account_history
            WHERE account_id IN ({placeholders})
            ORDER BY date ASC
        """, list(acct_bucket.keys())).fetchall()

        # Step 3: Build date-keyed series grouped by bucket
        date_bucket_totals = defaultdict(lambda: defaultdict(float))
        acct_history = defaultdict(list)

        for row in history_rows:
            acct_id = row["account_id"]
            bucket, is_asset = acct_bucket[acct_id]
            balance = row["balance"] or 0
            nw_contribution = balance if is_asset else -abs(balance)
            date_bucket_totals[row["date"]][bucket] += nw_contribution
            acct_history[acct_id].append((row["date"], balance))

        all_dates = sorted(date_bucket_totals.keys())
        series = []
        for date in all_dates:
            point = {"date": date}
            for bucket in BUCKET_ORDER:
                point[bucket] = round(date_bucket_totals[date].get(bucket, 0), 2)
            series.append(point)

        # Step 4: Compute per-bucket CAGR
        bucket_balances = defaultdict(lambda: defaultdict(float))
        for acct_id, history in acct_history.items():
            bucket, is_asset = acct_bucket[acct_id]
            for date, balance in history:
                val = (balance or 0) if is_asset else abs(balance or 0)
                bucket_balances[bucket][date] += val

        cagr = {}
        for bucket in BUCKET_ORDER:
            bal_by_date = bucket_balances.get(bucket, {})
            cagr[bucket] = _compute_bucket_cagr(bal_by_date)

        return jsonify({
            "series": series,
            "cagr": cagr,
            "bucket_colors": BUCKET_COLORS,
            "bucket_order": BUCKET_ORDER,
        })
    finally:
        conn.close()


# ===========================================================================
# ACCOUNT GROUPS  — CRUD
# ===========================================================================

@app.route("/api/groups", methods=["GET"])
def list_groups():
    """Return all groups with their member account IDs."""
    conn = get_db()
    groups = conn.execute(
        "SELECT id, name, color, created_at FROM account_groups ORDER BY name"
    ).fetchall()

    result = []
    for g in groups:
        members = conn.execute(
            "SELECT account_id FROM account_group_members WHERE group_id = ?",
            (g["id"],)
        ).fetchall()
        result.append({
            **dict(g),
            "account_ids": [m["account_id"] for m in members],
        })

    conn.close()
    return jsonify(result)


@app.route("/api/groups", methods=["POST"])
def create_group():
    """Create a new group. Body: {name, color, account_ids: [...]}"""
    data = request.get_json()
    name        = (data.get("name") or "").strip()
    color       = data.get("color", "#6366f1")
    account_ids = data.get("account_ids", [])

    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO account_groups (name, color) VALUES (?, ?)", (name, color)
        )
        group_id = cur.lastrowid
        conn.executemany(
            "INSERT OR IGNORE INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            [(group_id, aid) for aid in account_ids],
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": f"A group named '{name}' already exists"}), 409

    group = conn.execute(
        "SELECT id, name, color, created_at FROM account_groups WHERE id = ?", (group_id,)
    ).fetchone()
    conn.close()
    return jsonify({**dict(group), "account_ids": account_ids}), 201


@app.route("/api/groups/<int:group_id>", methods=["PUT"])
def update_group(group_id):
    """Replace a group's name, color, and member set. Body: {name, color, account_ids}"""
    data = request.get_json()
    name        = (data.get("name") or "").strip()
    color       = data.get("color", "#6366f1")
    account_ids = data.get("account_ids", [])

    if not name:
        return jsonify({"error": "name is required"}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM account_groups WHERE id = ?", (group_id,)
    ).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    try:
        conn.execute(
            "UPDATE account_groups SET name = ?, color = ? WHERE id = ?",
            (name, color, group_id)
        )
        conn.execute(
            "DELETE FROM account_group_members WHERE group_id = ?", (group_id,)
        )
        conn.executemany(
            "INSERT OR IGNORE INTO account_group_members (group_id, account_id) VALUES (?, ?)",
            [(group_id, aid) for aid in account_ids],
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": f"A group named '{name}' already exists"}), 409

    conn.close()
    return jsonify({"id": group_id, "name": name, "color": color, "account_ids": account_ids})


@app.route("/api/groups/<int:group_id>", methods=["DELETE"])
def delete_group(group_id):
    """Delete a group (members cascade-deleted via FK).
    Also removes the deleted group_id from any saved group configs."""
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM account_groups WHERE id = ?", (group_id,)
    ).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    conn.execute("DELETE FROM account_groups WHERE id = ?", (group_id,))
    conn.commit()

    # Remove stale group_id from saved configs
    raw = get_setting(conn, "group_configs", "[]")
    try:
        configs = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        configs = []
    for c in configs:
        c["group_ids"] = [gid for gid in c.get("group_ids", []) if gid != group_id]
    set_setting(conn, "group_configs", json.dumps(configs))
    # Clear active pointer if that config is now empty
    active_raw = get_setting(conn, "group_active_config_id", "")
    try:
        active_id = int(active_raw) if active_raw else None
    except (ValueError, TypeError):
        active_id = None
    active_cfg = next((c for c in configs if c.get("id") == active_id), None)
    if active_cfg is not None and not active_cfg["group_ids"]:
        set_setting(conn, "group_active_config_id", "")

    conn.close()
    return jsonify({"deleted": group_id})


# ===========================================================================
# ACCOUNT GROUPS  — Group configs (saved selections)
# ===========================================================================

@app.route("/api/groups/configs", methods=["GET"])
def get_group_configs():
    """Return saved group configs and the last-active config id."""
    conn = get_db()
    raw    = get_setting(conn, "group_configs", "[]")
    active = get_setting(conn, "group_active_config_id", "")
    conn.close()
    try:
        configs = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        configs = []
    try:
        active_id = int(active) if active else None
    except (ValueError, TypeError):
        active_id = None
    return jsonify({"configs": configs, "active_config_id": active_id})


@app.route("/api/groups/configs", methods=["POST"])
def save_group_configs():
    """Atomically replace the full config list and persist the active config id."""
    data      = request.get_json() or {}
    configs   = data.get("configs", [])
    active_id = data.get("active_config_id")

    # Validate and sanitise each config entry
    clean = []
    for c in configs:
        name      = str(c.get("name", "")).strip()[:100]
        group_ids = [gid for gid in c.get("group_ids", []) if isinstance(gid, int)]
        if not name:
            continue
        clean.append({"id": c.get("id"), "name": name, "group_ids": group_ids})

    # Assign sequential IDs to entries that lack one
    existing_ids = {c["id"] for c in clean if c.get("id")}
    next_id = max(existing_ids, default=0) + 1
    for c in clean:
        if not c.get("id"):
            c["id"] = next_id
            next_id += 1

    conn = get_db()
    set_setting(conn, "group_configs", json.dumps(clean))
    set_setting(conn, "group_active_config_id",
                str(active_id) if active_id is not None else "")
    conn.close()
    return jsonify({"configs": clean, "active_config_id": active_id})


# ===========================================================================
# ACCOUNT GROUPS  — Visualization data
# ===========================================================================

@app.route("/api/groups/history")
def groups_history():
    conn = get_db()
    rows = conn.execute("""
        SELECT
            ah.date,
            ag.id    AS group_id,
            ag.name  AS group_name,
            ag.color AS color,
            SUM(ah.balance) AS total
        FROM account_history ah
        JOIN account_group_members agm ON ah.account_id = agm.account_id
        JOIN account_groups ag         ON agm.group_id  = ag.id
        GROUP BY ah.date, ag.id
        ORDER BY ah.date ASC, ag.name ASC
    """).fetchall()

    pivot      = defaultdict(dict)
    groups_meta = {}
    for row in rows:
        pivot[row["date"]][row["group_name"]] = round(row["total"] or 0, 2)
        groups_meta[row["group_name"]] = {
            "id":    row["group_id"],
            "color": row["color"],
        }

    series = [{"date": d, **vals} for d, vals in sorted(pivot.items())]
    conn.close()
    return jsonify({"series": series, "groups_meta": groups_meta})


@app.route("/api/groups/snapshot")
def groups_snapshot():
    conn = get_db()
    rows = conn.execute("""
        SELECT
            ag.id,
            ag.name,
            ag.color,
            SUM(a.current_balance) AS total,
            COUNT(a.id)            AS account_count
        FROM account_groups ag
        JOIN account_group_members agm ON ag.id   = agm.group_id
        JOIN accounts a                ON agm.account_id = a.id
        GROUP BY ag.id
        ORDER BY total DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ===========================================================================
# BUDGETS  — History endpoint
# ===========================================================================

@app.route("/api/budgets/history")
def budget_history():
    """Return budget vs actual per category per month for the last N months.

    Query param: months (int, default 12) — how many completed prior months to return.
    Excludes the current (incomplete) month.
    Categories sorted by worst average variance first (most over-budget at top).
    """
    months_param = request.args.get("months", 12, type=int)
    conn = get_db()

    rows = conn.execute(
        """
        SELECT
            b.category_id,
            b.month,
            b.budgeted_amount,
            b.actual_amount,
            b.variance,
            c.name      AS category_name,
            c.group_name,
            c.group_type
        FROM budgets b
        LEFT JOIN categories c ON c.id = b.category_id
        WHERE b.budgeted_amount IS NOT NULL
          AND (c.group_type IS NULL OR c.group_type <> 'transfer')
          AND b.month <  date('now', 'start of month')
          AND b.month >= date('now', 'start of month', '-' || ? || ' months')
        ORDER BY b.month ASC
        """,
        (months_param,),
    ).fetchall()

    months_set = sorted({r["month"] for r in rows})

    # Expense-only totals — used by the bar chart
    totals_by_month: dict = {}
    for m in months_set:
        expense_rows = [r for r in rows if r["month"] == m and r["group_type"] != "income"]
        totals_by_month[m] = {
            "budgeted": sum(r["budgeted_amount"] or 0 for r in expense_rows),
            "actual":   sum(r["actual_amount"]   or 0 for r in expense_rows),
        }

    # Build per-category dict with running variance totals for sorting
    cats_map: dict = {}
    for row in rows:
        cid = row["category_id"]
        if cid not in cats_map:
            cats_map[cid] = {
                "category_id":   cid,
                "category_name": row["category_name"],
                "group_name":    row["group_name"],
                "group_type":    row["group_type"],
                "months":        {},
                "_var_sum":      0.0,
                "_var_count":    0,
            }
        cats_map[cid]["months"][row["month"]] = {
            "budgeted": row["budgeted_amount"],
            "actual":   row["actual_amount"],
            "variance": row["variance"],
        }
        if row["variance"] is not None:
            cats_map[cid]["_var_sum"]   += row["variance"]
            cats_map[cid]["_var_count"] += 1

    # Sort: most negative avg variance first (worst over-spender)
    categories = sorted(
        cats_map.values(),
        key=lambda c: (c["_var_sum"] / c["_var_count"]) if c["_var_count"] else 0,
    )
    # Strip internal sort fields before returning
    for cat in categories:
        del cat["_var_sum"]
        del cat["_var_count"]

    return jsonify({
        "months":          months_set,
        "totals_by_month": totals_by_month,
        "categories":      categories,
    })


# ===========================================================================
# BUDGETS  — Custom group assignments
# ===========================================================================

@app.route("/api/budgets/custom-groups")
def get_budget_custom_groups():
    """Return custom group assignments for budget categories.

    Response shape:
      {"groups": {"Group Name": [{"category_id": "...", "sort_order": N}, ...], ...}}

    Transfer categories are excluded from the response (defensive filter so
    orphaned transfer entries saved before this filter existed do not surface
    in the UI).
    """
    try:
        with get_db_connection() as conn:
            rows = conn.execute(
                """
                SELECT bcg.category_id, bcg.custom_group, bcg.sort_order
                FROM budget_custom_groups bcg
                LEFT JOIN categories c ON c.id = bcg.category_id
                WHERE c.group_type IS NULL OR c.group_type != 'transfer'
                ORDER BY bcg.custom_group, bcg.sort_order
                """
            ).fetchall()

        groups: dict = {}
        for row in rows:
            group_name = row["custom_group"]
            if group_name not in groups:
                groups[group_name] = []
            groups[group_name].append({
                "category_id": row["category_id"],
                "sort_order":  row["sort_order"],
            })

        return jsonify({"groups": groups})
    except Exception:
        app.logger.exception("Failed to fetch budget custom groups")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/budgets/custom-groups", methods=["POST"])
def set_budget_custom_groups():
    """Replace all custom group assignments with the posted state.

    Expected body:
      {"groups": {"Group Name": [{"category_id": "...", "sort_order": N}, ...], ...}}

    Validation (400 on failure):
      - Body must be a dict with a "groups" key.
      - Each group name must be a non-empty string (after stripping whitespace).
      - Each category_id must be a non-empty string.
      - Each sort_order must be a non-negative integer.
      - Total row count must not exceed 500.

    Returns:
      {"status": "ok", "count": N}  where N is total rows inserted.
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "groups" not in body:
        return jsonify({"error": "Request body must be a JSON object with a 'groups' key"}), 400

    groups_input = body["groups"]
    if not isinstance(groups_input, dict):
        return jsonify({"error": "The 'groups' value must be an object"}), 400

    # Collect and validate all rows before touching the DB
    rows_to_insert = []
    for group_name, items in groups_input.items():
        if not isinstance(group_name, str) or not group_name.strip():
            return jsonify({"error": "Each group name must be a non-empty string"}), 400
        clean_group_name = group_name.strip()

        if not isinstance(items, list):
            return jsonify({"error": "Each group's value must be a list of category entries"}), 400

        for item in items:
            if not isinstance(item, dict):
                return jsonify({"error": "Each category entry must be an object"}), 400

            category_id = item.get("category_id")
            if not isinstance(category_id, str) or not category_id:
                return jsonify({"error": "Each category_id must be a non-empty string"}), 400

            sort_order = item.get("sort_order")
            if not isinstance(sort_order, int) or isinstance(sort_order, bool) or sort_order < 0:
                return jsonify({"error": "Each sort_order must be a non-negative integer"}), 400

            rows_to_insert.append((category_id, clean_group_name, sort_order))

    if len(rows_to_insert) > 500:
        return jsonify({"error": "Too many entries; maximum is 500"}), 400

    seen_ids = set()
    for cat_id, _, _ in rows_to_insert:
        if cat_id in seen_ids:
            return jsonify({"error": "Duplicate category_id found: a category can only belong to one group"}), 400
        seen_ids.add(cat_id)

    try:
        with get_db_connection() as conn:
            conn.execute("DELETE FROM budget_custom_groups")
            conn.executemany(
                "INSERT INTO budget_custom_groups (category_id, custom_group, sort_order) VALUES (?, ?, ?)",
                rows_to_insert,
            )
            conn.commit()

        return jsonify({"status": "ok", "count": len(rows_to_insert)})
    except Exception:
        app.logger.exception("Failed to save budget custom groups")
        return jsonify({"error": "Internal server error"}), 500


# ===========================================================================
# SYNC  — Trigger and status endpoints
# ===========================================================================

@app.route("/api/sync/start", methods=["POST"])
def sync_start():
    """
    Start a background sync job.
    Body: {"entities": ["accounts", "transactions", ...], "full": false}
    Returns: {"job_id": N}
    """
    data     = request.get_json() or {}
    entities = data.get("entities", list(ENTITY_RUN_ORDER))
    full     = bool(data.get("full", False))

    # Validate entity names
    invalid = [e for e in entities if e not in ENTITY_TABLE_MAP]
    if invalid:
        return jsonify({"error": f"Unknown entities: {invalid}"}), 400

    if not entities:
        return jsonify({"error": "At least one entity must be selected"}), 400

    conn = get_db()

    # Guard: reject if a job is already running
    if get_running_job(conn):
        conn.close()
        return jsonify({"error": "A sync is already in progress"}), 409

    job_id = create_sync_job(conn, ordered_entities(entities), full)
    conn.close()

    thread = threading.Thread(
        target=_run_sync_worker,
        args=(job_id, entities, full),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id}), 202


@app.route("/api/sync/status/<int:job_id>")
def sync_status(job_id):
    """Poll status for a specific sync job."""
    conn = get_db()
    job  = get_sync_job(conn, job_id)
    conn.close()
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/sync/history")
def sync_history():
    """Return the last 10 sync jobs, newest first."""
    conn    = get_db()
    history = get_sync_history(conn, limit=10)
    conn.close()
    return jsonify(history)


@app.route("/api/sync/last-status")
def sync_last_status():
    """
    Return the pipeline's sync_log table — last sync time and record counts
    per entity. Used by the control panel to show when each entity was last synced.
    """
    conn  = get_db()
    rows  = conn.execute(
        "SELECT entity, last_synced_at, last_sync_count, total_records FROM sync_log ORDER BY entity"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ===========================================================================
# Setup endpoints
# ===========================================================================

@app.route("/api/setup/status")
def setup_status():
    """Returns whether a Monarch Money token is configured. Used by the
    frontend to decide whether to show the setup wizard or the dashboard."""
    return jsonify({"configured": has_token()})


@app.route("/api/setup/token", methods=["POST"])
def setup_token():
    """
    Accepts a Monarch Money bearer token, validates it against the live API,
    and saves it if valid. The frontend setup wizard calls this endpoint.

    Returns 200 {"ok": true} on success.
    Returns 400 {"error": "..."} if the token is missing, blank, or invalid.
    """
    token = (request.json or {}).get("token", "").strip()
    if not token:
        return jsonify({"error": "Token is required"}), 400
    try:
        asyncio.run(auth.login_with_token(token, TOKEN_PATH))
        return jsonify({"ok": True})
    except Exception as e:
        app.logger.exception("Token validation failed")
        return jsonify({"error": "Token validation failed. Check that your token is current."}), 400


# ===========================================================================
# Settings endpoints — auto-sync scheduling
# ===========================================================================

@app.route("/api/settings", methods=["GET"])
def get_settings():
    """
    Return the current dashboard settings.
    Response: {"sync_interval_hours": int}  — 0 means auto-sync disabled.
    """
    conn = get_db()
    interval = int(get_setting(conn, "sync_interval_hours", "0"))
    conn.close()
    return jsonify({"sync_interval_hours": interval})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    """
    Persist settings and apply them immediately.
    Body: {"sync_interval_hours": int}  — 0 to disable.
    Returns 400 if the value is not a non-negative integer.
    """
    data = request.get_json() or {}

    raw = data.get("sync_interval_hours")
    if raw is None:
        return jsonify({"error": "sync_interval_hours is required"}), 400

    # Reject floats explicitly (1.5 is not a whole number of hours)
    if isinstance(raw, float):
        return jsonify({"error": "sync_interval_hours must be a whole number"}), 400

    try:
        interval = int(raw)
        if str(interval) != str(raw):
            raise ValueError("not an integer")
    except (ValueError, TypeError):
        return jsonify({"error": "sync_interval_hours must be an integer"}), 400

    if interval < 0:
        return jsonify({"error": "sync_interval_hours must be >= 0"}), 400

    conn = get_db()
    set_setting(conn, "sync_interval_hours", str(interval))
    conn.close()

    _reschedule(interval)
    return jsonify({"sync_interval_hours": interval})



# ===========================================================================
# AI Config
# ===========================================================================

_ai_cooldowns = {}  # type: dict[str, float]
_AI_COOLDOWN_SECONDS = 2.0


_ai_cooldowns_lock = threading.Lock()


def _check_ai_rate_limit(endpoint: str):
    now = time.monotonic()
    with _ai_cooldowns_lock:
        last = _ai_cooldowns.get(endpoint, 0.0)
        if last > 0 and (now - last) < _AI_COOLDOWN_SECONDS:
            return jsonify({"error": "Please wait before retrying."}), 429
        _ai_cooldowns[endpoint] = now
    return None


def _sanitize_prompt_field(value, max_length=500):
    """Strip control chars (keep \\n, \\t) and truncate."""
    if not isinstance(value, str):
        return str(value)[:max_length]
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return cleaned[:max_length]


def _get_ai_key(conn) -> Optional[str]:
    """Load AI API key: keychain first, then settings table fallback."""
    key = auth.load_ai_key()
    if key:
        return key
    return get_setting(conn, "ai_api_key")


@app.route("/api/ai/config", methods=["GET"])
def get_ai_config():
    """Return AI configuration status. Never returns the raw API key."""
    conn = get_db()
    api_key  = _get_ai_key(conn)
    model    = get_setting(conn, "ai_model")
    provider = get_setting(conn, "ai_provider")
    base_url = get_setting(conn, "ai_base_url", "")
    return jsonify({
        "configured": bool(api_key and model and provider),
        "model":      model,
        "provider":   provider,
        "base_url":   base_url,
    })


@app.route("/api/ai/config", methods=["POST"])
def save_ai_config():
    """Persist AI provider credentials and model choice."""
    data = request.get_json() or {}
    required = ["api_key", "model", "provider"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    provider = data["provider"]
    if provider not in ("anthropic", "openai_compatible"):
        return jsonify({"error": "provider must be 'anthropic' or 'openai_compatible'"}), 400

    conn = get_db()
    try:
        auth.save_ai_key(data["api_key"])
    except keyring.errors.KeyringError:
        set_setting(conn, "ai_api_key", data["api_key"])
    set_setting(conn, "ai_model",    data["model"])
    set_setting(conn, "ai_provider", provider)
    set_setting(conn, "ai_base_url", data.get("base_url", ""))
    return jsonify({"ok": True})


@app.route("/api/ai/analyze", methods=["POST"])
def ai_analyze():
    """Fetch budget history, build prompt, call AI, return analysis text."""
    blocked = _check_ai_rate_limit("ai_analyze")
    if blocked:
        return blocked
    conn = get_db()

    rows = conn.execute(
        """
        SELECT b.category_id, b.month, b.variance, c.name AS category_name
        FROM budgets b
        LEFT JOIN categories c ON c.id = b.category_id
        WHERE b.budgeted_amount IS NOT NULL
          AND (c.group_type IS NULL OR c.group_type <> 'transfer')
          AND b.month < date('now', 'start of month')
          AND b.month >= date('now', 'start of month', '-12 months')
        ORDER BY b.category_id, b.month ASC
        """
    ).fetchall()

    if not rows:
        conn.close()
        return jsonify({"error": "No budget data found. Sync budget data first."}), 400

    # Build tabular prompt data
    all_months = sorted({r["month"] for r in rows})
    cat_rows: dict = defaultdict(list)
    cat_names: dict = {}
    for row in rows:
        cat_rows[row["category_id"]].append(row)
        cat_names[row["category_id"]] = row["category_name"]

    def fmt_month(m: str) -> str:
        from datetime import datetime
        return datetime.strptime(m, "%Y-%m-%d").strftime("%b '%y")

    month_header = " | ".join(fmt_month(m) for m in all_months)
    lines = [
        f"Category           | {month_header} | Avg Variance",
        "-" * (20 + 12 * len(all_months)),
    ]
    for cid, crows in sorted(cat_rows.items(), key=lambda x: cat_names[x[0]]):
        month_map = {r["month"]: r["variance"] for r in crows}
        variances = [v for v in month_map.values() if v is not None]
        avg_var = sum(variances) / len(variances) if variances else 0
        cells = []
        for m in all_months:
            v = month_map.get(m)
            if v is None:
                cells.append("  n/a ")
            elif v >= 0:
                cells.append(f"+${v:5.0f}")
            else:
                cells.append(f"-${abs(v):5.0f}")
        avg_str = f"+${avg_var:.0f}/mo" if avg_var >= 0 else f"-${abs(avg_var):.0f}/mo"
        lines.append(f"{cat_names[cid]:<18} | {' | '.join(cells)} | {avg_str}")

    n_months = len(all_months)
    table_text = "\n".join(lines)

    prompt = f"""You are a personal finance analyst reviewing {n_months} months of budget vs. actual spending data.

Here is the data (negative variance = over budget):

{table_text}

Please analyze this data and:
1. Identify the categories that most consistently cause actual spending to exceed budget
2. Quantify the magnitude — how much over, how often
3. Note any seasonal patterns or trends
4. Give 2-3 concise, practical suggestions for addressing the worst offenders. If the user is always over or never hits a category budget, suggest modifying total budget by moving allocated funds from another category budget or reducing savings

Be specific to the numbers. Keep the response under 400 words."""

    try:
        analysis, _stop, provider = _call_ai(prompt, conn, max_tokens=1024)
        if analysis is None:
            return jsonify({"error": "AI not configured. Save config via /api/ai/config first."}), 400
        model = get_setting(conn, "ai_model")
    except Exception:
        app.logger.exception("AI analysis call failed")
        return jsonify({"error": "AI analysis failed. Check server logs."}), 500
    finally:
        conn.close()

    return jsonify({"analysis": analysis, "model": model, "provider": provider})


# ===========================================================================
# Budget Builder
# ===========================================================================


def _extract_json(text: str, valid_category_ids: set = None) -> dict:
    """Parse JSON from AI response, stripping markdown fences if present.
    Optionally validates category_ids in recommendations."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` fences
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)
    result = json.loads(cleaned)

    if valid_category_ids and "recommendations" in result:
        original_count = len(result["recommendations"])
        result["recommendations"] = [
            r for r in result["recommendations"]
            if r.get("category_id") in valid_category_ids
        ]
        discarded = original_count - len(result["recommendations"])
        if discarded:
            print(f"[budget-builder] Discarded {discarded} recommendations with invalid category IDs")

    return result


def _call_ai(prompt: str, conn, max_tokens: int = 1024):
    """Call the configured AI provider. Returns (text, stop_reason, provider) or raises."""
    api_key = _get_ai_key(conn)
    model = get_setting(conn, "ai_model")
    provider = get_setting(conn, "ai_provider")
    base_url = get_setting(conn, "ai_base_url", "")

    if not api_key or not model or not provider:
        return None, None, None

    if provider == "anthropic":
        import anthropic as anthropic_sdk
        client = anthropic_sdk.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text, response.stop_reason, provider

    elif provider == "openai_compatible":
        from openai import OpenAI
        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = OpenAI(**kwargs)
        response = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content, response.choices[0].finish_reason, provider

    else:
        raise ValueError(f"Unknown provider: {provider}")


# ── Profile ─────────────────────────────────────────────────────────────────

@app.route("/api/budget-builder/profile")
def get_builder_profile():
    conn = get_db()
    row = conn.execute("SELECT * FROM budget_builder_profile WHERE id = 1").fetchone()
    if not row:
        return jsonify({"exists": False})
    data = dict(row)
    data["exists"] = True
    data["children_ages"] = json.loads(data["children_ages"]) if data["children_ages"] else []
    data["upcoming_events"] = json.loads(data["upcoming_events"]) if data["upcoming_events"] else []
    return jsonify(data)


@app.route("/api/budget-builder/profile", methods=["POST"])
def save_builder_profile():
    body = request.get_json() or {}
    # Validate field lengths
    if body.get("location") and len(body["location"]) > 200:
        return jsonify({"error": "location must be 200 characters or fewer"}), 400
    if body.get("other_info") and len(body["other_info"]) > 1000:
        return jsonify({"error": "other_info must be 1000 characters or fewer"}), 400
    # Validate housing_type
    ht = body.get("housing_type")
    if ht and ht not in ("own", "rent"):
        return jsonify({"error": "housing_type must be 'own' or 'rent'"}), 400
    # Validate JSON array fields
    children_ages = body.get("children_ages")
    if children_ages is not None:
        if isinstance(children_ages, list):
            children_ages = json.dumps(children_ages)
        else:
            try:
                json.loads(children_ages)
            except (json.JSONDecodeError, TypeError):
                return jsonify({"error": "children_ages must be a valid JSON array"}), 400
    upcoming_events = body.get("upcoming_events")
    if upcoming_events is not None:
        if isinstance(upcoming_events, list):
            upcoming_events = json.dumps(upcoming_events)
        else:
            try:
                json.loads(upcoming_events)
            except (json.JSONDecodeError, TypeError):
                return jsonify({"error": "upcoming_events must be a valid JSON array"}), 400

    conn = get_db()
    conn.execute(
        """INSERT INTO budget_builder_profile (id, expected_income, num_children, children_ages,
           location, housing_type, upcoming_events, other_info)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
               expected_income = excluded.expected_income,
               num_children = excluded.num_children,
               children_ages = excluded.children_ages,
               location = excluded.location,
               housing_type = excluded.housing_type,
               upcoming_events = excluded.upcoming_events,
               other_info = excluded.other_info,
               updated_at = datetime('now')""",
        (
            body.get("expected_income"),
            body.get("num_children", 0),
            children_ages,
            body.get("location"),
            ht,
            upcoming_events,
            body.get("other_info"),
        ),
    )
    conn.commit()
    return jsonify({"ok": True})


# ── Regional Data ───────────────────────────────────────────────────────────

@app.route("/api/budget-builder/regional")
def get_builder_regional():
    conn = get_db()
    row = conn.execute("SELECT * FROM budget_builder_regional WHERE id = 1").fetchone()
    if not row:
        return jsonify({"exists": False})
    data = dict(row)
    data["exists"] = True
    data["other_factors"] = json.loads(data["other_factors"]) if data["other_factors"] else []
    return jsonify(data)


@app.route("/api/budget-builder/regional", methods=["POST"])
def save_builder_regional():
    body = request.get_json() or {}
    other_factors = body.get("other_factors")
    if other_factors is not None and isinstance(other_factors, list):
        other_factors = json.dumps(other_factors)

    conn = get_db()
    conn.execute(
        """INSERT INTO budget_builder_regional (id, food_cost_trend, childcare_cost,
           gas_fuel_price, insurance_trend, electricity_cost, other_factors, source)
           VALUES (1, ?, ?, ?, ?, ?, ?, 'user_edited')
           ON CONFLICT(id) DO UPDATE SET
               food_cost_trend = excluded.food_cost_trend,
               childcare_cost = excluded.childcare_cost,
               gas_fuel_price = excluded.gas_fuel_price,
               insurance_trend = excluded.insurance_trend,
               electricity_cost = excluded.electricity_cost,
               other_factors = excluded.other_factors,
               source = 'user_edited',
               updated_at = datetime('now')""",
        (
            body.get("food_cost_trend"),
            body.get("childcare_cost"),
            body.get("gas_fuel_price"),
            body.get("insurance_trend"),
            body.get("electricity_cost"),
            other_factors,
        ),
    )
    conn.commit()
    return jsonify({"ok": True})


@app.route("/api/budget-builder/regional/fetch", methods=["POST"])
def fetch_builder_regional_ai():
    blocked = _check_ai_rate_limit("fetch_builder_regional_ai")
    if blocked:
        return blocked
    conn = get_db()
    # Check AI config
    api_key = _get_ai_key(conn)
    if not api_key:
        return jsonify({"error": "AI not configured"}), 400

    # Check profile exists with location
    profile = conn.execute("SELECT * FROM budget_builder_profile WHERE id = 1").fetchone()
    if not profile or not profile["location"]:
        return jsonify({"error": "Profile with location required before fetching regional data"}), 400

    location = _sanitize_prompt_field(profile["location"], 200)
    prompt = f"""You are a personal finance research assistant. For the location "{location}", provide current cost-of-living data.

Return ONLY valid JSON (no markdown, no explanation) with exactly these keys:
{{
  "food_cost_trend": "average monthly grocery cost for a household and recent trend",
  "childcare_cost": "monthly childcare cost range",
  "gas_fuel_price": "current gas price per gallon",
  "insurance_trend": "average monthly auto/health insurance costs",
  "electricity_cost": "average monthly electricity cost",
  "other_factors": []
}}

The "other_factors" array can contain objects like {{"label": "Water", "value": "$60/mo"}} for any additional notable cost factors.
Be specific with dollar amounts and percentages. Use current 2026 data."""

    try:
        text, stop_reason, provider = _call_ai(prompt, conn, max_tokens=1024)
        if text is None:
            return jsonify({"error": "AI not configured"}), 400
    except Exception:
        app.logger.exception("Regional data AI call failed")
        return jsonify({"error": "Regional data fetch failed. Check server logs."}), 500

    try:
        data = _extract_json(text)
    except (json.JSONDecodeError, KeyError):
        app.logger.exception("Failed to parse regional AI response")
        return jsonify({"error": "Failed to parse AI response. Try again."}), 500

    other_factors = data.get("other_factors", [])
    if isinstance(other_factors, list):
        other_factors = json.dumps(other_factors)

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO budget_builder_regional (id, food_cost_trend, childcare_cost,
           gas_fuel_price, insurance_trend, electricity_cost, other_factors, source, fetched_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, 'ai', ?)
           ON CONFLICT(id) DO UPDATE SET
               food_cost_trend = excluded.food_cost_trend,
               childcare_cost = excluded.childcare_cost,
               gas_fuel_price = excluded.gas_fuel_price,
               insurance_trend = excluded.insurance_trend,
               electricity_cost = excluded.electricity_cost,
               other_factors = excluded.other_factors,
               source = 'ai',
               fetched_at = excluded.fetched_at,
               updated_at = datetime('now')""",
        (
            data.get("food_cost_trend"),
            data.get("childcare_cost"),
            data.get("gas_fuel_price"),
            data.get("insurance_trend"),
            data.get("electricity_cost"),
            other_factors,
            now,
        ),
    )
    conn.commit()

    # Return the saved data
    row = conn.execute("SELECT * FROM budget_builder_regional WHERE id = 1").fetchone()
    result = dict(row)
    result["exists"] = True
    result["other_factors"] = json.loads(result["other_factors"]) if result["other_factors"] else []
    return jsonify(result)


# ── Budget Generation ───────────────────────────────────────────────────────


def _build_budget_prompt(conn, profile, months_ahead):
    """Assemble the AI prompt for budget generation.

    Returns (prompt, categories, category_ids, max_tokens).
    """
    from datetime import date

    # Load regional
    regional_row = conn.execute("SELECT * FROM budget_builder_regional WHERE id = 1").fetchone()
    regional = dict(regional_row) if regional_row else {}

    # Get categories (exclude transfers)
    categories = conn.execute(
        "SELECT id, name, group_name, group_type FROM categories "
        "WHERE group_type IS NULL OR group_type <> 'transfer' "
        "ORDER BY group_name, name"
    ).fetchall()
    category_ids = {c["id"] for c in categories}

    # Get historical budget data (6 months, exclude transfers)
    history = conn.execute(
        """SELECT b.category_id, b.month, b.budgeted_amount, b.actual_amount, b.variance,
                  c.name AS category_name, c.group_name, c.group_type
           FROM budgets b
           LEFT JOIN categories c ON c.id = b.category_id
           WHERE b.budgeted_amount IS NOT NULL
             AND (c.group_type IS NULL OR c.group_type <> 'transfer')
             AND b.month < date('now', 'start of month')
             AND b.month >= date('now', 'start of month', '-6 months')
           ORDER BY c.group_name, c.name, b.month ASC"""
    ).fetchall()

    # Format category list and history
    cat_list = "\n".join(f"  - ID: {c['id']}, Name: {c['name']}, Group: {c['group_name'] or 'Other'}"
                         for c in categories)

    history_lines = []
    for h in history:
        history_lines.append(
            f"  {h['category_name']} ({h['category_id']}): {h['month']} — "
            f"budgeted=${h['budgeted_amount']:.0f}, actual=${h['actual_amount']:.0f}, "
            f"variance=${h['variance']:.0f}"
        )
    history_text = "\n".join(history_lines) if history_lines else "  No historical data available."

    # Sanitize profile fields
    income = _sanitize_prompt_field(str(profile.get("expected_income", "not specified")), 50)
    location = _sanitize_prompt_field(str(profile.get("location", "not specified")), 200)
    housing = _sanitize_prompt_field(str(profile.get("housing_type", "not specified")), 50)
    children = profile.get("num_children", 0)
    children_ages = profile.get("children_ages") or "[]"
    if isinstance(children_ages, str):
        try:
            children_ages = json.loads(children_ages)
        except json.JSONDecodeError:
            children_ages = []
    children_ages = [_sanitize_prompt_field(str(a), 50) for a in (children_ages or [])[:20]]
    events = profile.get("upcoming_events") or "[]"
    if isinstance(events, str):
        try:
            events = json.loads(events)
        except json.JSONDecodeError:
            events = []
    events = [_sanitize_prompt_field(str(e), 200) for e in (events or [])[:20]]
    other_info = _sanitize_prompt_field(str(profile.get("other_info", "none")), 1000)

    regional_text = ""
    if regional:
        regional_text = f"""
Regional cost data for {location}:
  Food: {regional.get('food_cost_trend', 'n/a')}
  Childcare: {regional.get('childcare_cost', 'n/a')}
  Gas/Fuel: {regional.get('gas_fuel_price', 'n/a')}
  Insurance: {regional.get('insurance_trend', 'n/a')}
  Electricity: {regional.get('electricity_cost', 'n/a')}"""

    # Generate future month keys
    today = date.today()
    future_months = []
    for i in range(1, months_ahead + 1):
        m = today.month + i
        y = today.year
        while m > 12:
            m -= 12
            y += 1
        future_months.append(f"{y:04d}-{m:02d}-01")

    prompt = f"""You are a personal finance budget planner. Generate budget recommendations for the next {months_ahead} month(s).

USER PROFILE:
  Expected monthly income: ${income}
  Location: {location}
  Housing: {housing}
  Children: {children} (ages: {children_ages})
  Upcoming events: {events}
  Other info: {other_info}
{regional_text}

HISTORICAL BUDGET DATA (last 6 months):
{history_text}

AVAILABLE CATEGORIES (use ONLY these exact IDs — do NOT invent new ones):
{cat_list}

FUTURE MONTHS to budget for: {', '.join(future_months)}

Return ONLY valid JSON (no markdown, no explanation) with this structure:
{{
  "recommendations": [
    {{
      "category_id": "exact_id_from_list_above",
      "category_name": "category name",
      "group_name": "group name",
      "rationale": "brief explanation for this amount",
      "months": {{"YYYY-MM-01": amount, ...}}
    }}
  ],
  "summary": "2-3 sentence overview of the budget plan",
  "total_monthly_budget": {{"YYYY-MM-01": total_amount, ...}}
}}

Rules:
- Total expenses must not exceed the expected income of ${income}/month
- Use category IDs EXACTLY as listed above
- Include amounts for each future month
- Base recommendations on historical patterns, adjusted for regional costs and trends"""

    max_tokens = 4096 + max(0, (len(categories) - 30)) * 512 // 10
    return prompt, categories, category_ids, max_tokens


def _save_budget_plan(conn, data, months_ahead):
    """Persist AI-generated budget plan to the database. Returns the saved plan dict."""
    now = datetime.now(timezone.utc).isoformat()
    line_items = data.get("recommendations", [])
    summary = data.get("summary", "")
    total_monthly = data.get("total_monthly_budget", {})
    plan_name = f"AI Plan — {datetime.now().strftime('%b %d, %Y')}"

    cursor = conn.execute(
        """INSERT INTO budget_builder_plans (name, months_ahead, line_items, summary, ai_generated_at)
           VALUES (?, ?, ?, ?, ?)""",
        (plan_name, months_ahead, json.dumps(line_items), summary, now),
    )
    plan_id = cursor.lastrowid
    conn.commit()

    return {
        "id": plan_id,
        "name": plan_name,
        "months_ahead": months_ahead,
        "line_items": line_items,
        "summary": summary,
        "total_monthly_budget": total_monthly,
        "ai_generated_at": now,
    }


@app.route("/api/budget-builder/generate", methods=["POST"])
def generate_budget_plan():
    blocked = _check_ai_rate_limit("generate_budget_plan")
    if blocked:
        return blocked
    body = request.get_json() or {}
    months_ahead = body.get("months_ahead", 3)
    profile_overrides = body.get("profile_overrides", {})

    conn = get_db()

    api_key = _get_ai_key(conn)
    if not api_key:
        return jsonify({"error": "AI not configured"}), 400

    # Load and merge profile
    profile_row = conn.execute("SELECT * FROM budget_builder_profile WHERE id = 1").fetchone()
    profile = dict(profile_row) if profile_row else {}
    profile.update(profile_overrides)

    prompt, categories, category_ids, max_tokens = _build_budget_prompt(conn, profile, months_ahead)

    try:
        text, stop_reason, provider = _call_ai(prompt, conn, max_tokens=max_tokens)
        if text is None:
            return jsonify({"error": "AI not configured"}), 400
    except Exception:
        app.logger.exception("Budget generation AI call failed")
        return jsonify({"error": "Budget generation failed. Check server logs."}), 500

    if stop_reason in ("max_tokens", "length"):
        return jsonify({
            "error": "Response was truncated — try reducing months_ahead or the number of categories."
        }), 400

    try:
        data = _extract_json(text, valid_category_ids=category_ids)
    except (json.JSONDecodeError, KeyError):
        app.logger.exception("Failed to parse budget generation AI response")
        return jsonify({"error": "Failed to parse AI response. Try again."}), 500

    plan = _save_budget_plan(conn, data, months_ahead)
    return jsonify({"plan": plan})


# ── Plan CRUD ───────────────────────────────────────────────────────────────

@app.route("/api/budget-builder/plans")
def list_builder_plans():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, name, created_at, months_ahead, applied_at FROM budget_builder_plans ORDER BY created_at DESC"
    ).fetchall()
    return jsonify({"plans": [dict(r) for r in rows]})


@app.route("/api/budget-builder/plans/<int:plan_id>")
def get_builder_plan(plan_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM budget_builder_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return jsonify({"error": "Plan not found"}), 404
    data = dict(row)
    data["line_items"] = json.loads(data["line_items"])
    return jsonify(data)


@app.route("/api/budget-builder/plans/<int:plan_id>", methods=["PUT"])
def update_builder_plan(plan_id):
    body = request.get_json() or {}
    conn = get_db()
    row = conn.execute("SELECT id FROM budget_builder_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return jsonify({"error": "Plan not found"}), 404

    updates = []
    params = []
    if "name" in body:
        updates.append("name = ?")
        params.append(body["name"])
    if "line_items" in body:
        updates.append("line_items = ?")
        params.append(json.dumps(body["line_items"]))
    if updates:
        updates.append("user_edited_at = datetime('now')")
        params.append(plan_id)
        conn.execute(
            f"UPDATE budget_builder_plans SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/budget-builder/plans/<int:plan_id>", methods=["DELETE"])
def delete_builder_plan(plan_id):
    conn = get_db()
    conn.execute("DELETE FROM budget_builder_plans WHERE id = ?", (plan_id,))
    conn.commit()
    return jsonify({"ok": True})


# ── Apply to Monarch ───────────────────────────────────────────────────────

@app.route("/api/budget-builder/plans/<int:plan_id>/apply", methods=["POST"])
def apply_builder_plan(plan_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM budget_builder_plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return jsonify({"error": "Plan not found"}), 404

    line_items = json.loads(row["line_items"])

    # Collect all (category_id, month, amount) pairs sorted chronologically
    calls = []
    for item in line_items:
        cat_id = item["category_id"]
        for month, amount in item.get("months", {}).items():
            calls.append((cat_id, month, amount))
    calls.sort(key=lambda x: x[1])  # chronological order

    applied = 0
    failed = 0
    errors = []

    async def _apply():
        nonlocal applied, failed
        mm = await auth.get_client(SESSION_PATH, TOKEN_PATH)

        if not hasattr(mm, "set_budget_amount"):
            raise AttributeError(
                "set_budget_amount not available — update monarchmoney package"
            )

        for cat_id, month, amount in calls:
            try:
                await mm.set_budget_amount(
                    category_id=cat_id,
                    start_date=month,
                    amount=amount,
                    apply_to_future=False,
                )
                applied += 1
            except Exception:
                app.logger.exception("Failed to apply budget for %s/%s", cat_id, month)
                failed += 1
                errors.append({
                    "category_id": cat_id,
                    "month": month,
                    "error": "Failed to apply budget amount",
                })

    try:
        asyncio.run(_apply())
    except AttributeError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Budget apply failed")
        return jsonify({"error": "Budget apply failed. Check server logs."}), 500

    # Set applied_at only if all succeeded
    if failed == 0:
        conn.execute(
            "UPDATE budget_builder_plans SET applied_at = datetime('now') WHERE id = ?",
            (plan_id,),
        )
        conn.commit()

    return jsonify({"applied": applied, "failed": failed, "errors": errors})


# ===========================================================================
# Retirement / Milestones
# ===========================================================================

@app.route("/api/retirement")
def get_retirement():
    conn = get_db()
    row = conn.execute("SELECT * FROM retirement_settings WHERE id = 1").fetchone()
    if not row:
        return jsonify({"exists": False})
    data = dict(row)
    data["exists"] = True
    data["milestones"] = json.loads(data["milestones"]) if data["milestones"] else []
    return jsonify(data)


@app.route("/api/retirement", methods=["POST"])
def save_retirement():
    body = request.get_json() or {}

    # Finding #1: validate both ages present and are positive integers
    current_age = body.get("current_age")
    target_age = body.get("target_retirement_age")

    if current_age is None or target_age is None:
        return jsonify({"error": "current_age and target_retirement_age are required"}), 400
    if not isinstance(current_age, int) or not isinstance(target_age, int):
        return jsonify({"error": "current_age and target_retirement_age must be integers"}), 400
    if current_age <= 0 or target_age <= 0:
        return jsonify({"error": "current_age and target_retirement_age must be positive"}), 400

    # Finding #11: upper bounds on age
    if current_age > 120 or target_age > 120:
        return jsonify({"error": "Age values cannot exceed 120"}), 400

    if target_age <= current_age:
        return jsonify({"error": "target_retirement_age must be greater than current_age"}), 400

    # Validate numeric fields: type check + lower/upper bounds
    def _validate_numeric(name, val, lo, hi):
        if val is None:
            return None
        if not isinstance(val, (int, float)):
            return jsonify({"error": f"{name} must be a number"}), 400
        if val < lo:
            return jsonify({"error": f"{name} cannot be less than {lo}"}), 400
        if val > hi:
            return jsonify({"error": f"{name} cannot exceed {hi}"}), 400
        return None

    withdrawal_rate = body.get("withdrawal_rate_pct")
    err = _validate_numeric("withdrawal_rate_pct", withdrawal_rate, 0, 100)
    if err:
        return err

    expected_return = body.get("expected_return_pct")
    err = _validate_numeric("expected_return_pct", expected_return, 0, 50)
    if err:
        return err

    monthly_contribution = body.get("monthly_contribution")
    err = _validate_numeric("monthly_contribution", monthly_contribution, 0, 1_000_000)
    if err:
        return err

    desired_income = body.get("desired_annual_income")
    err = _validate_numeric("desired_annual_income", desired_income, 0, 10_000_000)
    if err:
        return err

    inflation_rate = body.get("inflation_rate_pct")
    err = _validate_numeric("inflation_rate_pct", inflation_rate, 0, 100)
    if err:
        return err

    ss_annual = body.get("social_security_annual")
    err = _validate_numeric("social_security_annual", ss_annual, 0, 10_000_000)
    if err:
        return err

    # Finding #4: validate milestones
    milestones_raw = body.get("milestones")
    if milestones_raw is not None:
        if not isinstance(milestones_raw, list):
            return jsonify({"error": "milestones must be a list"}), 400
        if len(milestones_raw) > 20:
            return jsonify({"error": "milestones may not exceed 20 items"}), 400
        for m in milestones_raw:
            if not isinstance(m, dict):
                return jsonify({"error": "Each milestone must be an object"}), 400
            if not isinstance(m.get("amount"), (int, float)) or m["amount"] <= 0:
                return jsonify({"error": "Each milestone amount must be a positive number"}), 400
            label = m.get("label", "")
            if len(str(label)) > 100:
                return jsonify({"error": "Milestone label must be 100 characters or fewer"}), 400
        milestones_json = json.dumps(milestones_raw)
    else:
        milestones_json = None

    try:
        conn = get_db()
        conn.execute(
            """INSERT INTO retirement_settings
                   (id, current_age, target_retirement_age, desired_annual_income,
                    monthly_contribution, expected_return_pct, inflation_rate_pct,
                    social_security_annual, withdrawal_rate_pct, milestones)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   current_age             = excluded.current_age,
                   target_retirement_age   = excluded.target_retirement_age,
                   desired_annual_income   = excluded.desired_annual_income,
                   monthly_contribution    = excluded.monthly_contribution,
                   expected_return_pct     = excluded.expected_return_pct,
                   inflation_rate_pct      = excluded.inflation_rate_pct,
                   social_security_annual  = excluded.social_security_annual,
                   withdrawal_rate_pct     = excluded.withdrawal_rate_pct,
                   milestones              = excluded.milestones,
                   updated_at              = datetime('now')""",
            (
                current_age,
                target_age,
                desired_income,
                monthly_contribution,
                expected_return,
                inflation_rate if inflation_rate is not None else 2.5,
                ss_annual if ss_annual is not None else 0.0,
                withdrawal_rate if withdrawal_rate is not None else 4.0,
                milestones_json,
            ),
        )
        conn.commit()
        return jsonify({"ok": True})
    except Exception:
        app.logger.exception("Failed to save retirement settings")
        return jsonify({"error": "Failed to save retirement settings"}), 500


# ===========================================================================
# Boot
# ===========================================================================

def _startup() -> None:
    """
    Initialize the app — called from __main__ (dev) or wsgi.py (production).
    Creates the data directory, bootstraps the token from env, initialises the
    DB schema, starts the background scheduler, and restores the saved interval.
    """
    ensure_data_dir()
    bootstrap_token_from_env()
    init_dashboard_schema()
    if not scheduler.running:
        scheduler.start()
    conn = get_db()
    saved_interval = int(get_setting(conn, "sync_interval_hours", "0"))
    conn.close()
    _reschedule(saved_interval)


if __name__ == "__main__":
    _startup()
    print(f"Starting Monarch Dashboard API — reading from {DB_PATH}")
    app.run(host="0.0.0.0", port=5050, debug=os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true"))
