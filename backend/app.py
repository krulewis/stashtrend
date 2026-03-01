"""
Monarch Dashboard — Flask API Backend
Reads from the monarch_pipeline database and serves JSON to the React frontend.

The database path defaults to ~/.monarch_pipeline/monarch.db and can be
overridden via the MONARCH_DATA_DIR environment variable (used by Docker).
"""

import asyncio
import json
import os
import sqlite3
import threading
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover
    class BackgroundScheduler:  # type: ignore[no-redef]
        """No-op stub used when APScheduler is not installed (e.g., test sandbox)."""
        def __init__(self, **kwargs): pass
        def start(self): pass
        def get_job(self, job_id): return None
        def add_job(self, *args, **kwargs): pass
        def remove_job(self, job_id): pass

from flask import Flask, jsonify, request
from flask_cors import CORS

from monarch_pipeline import auth, fetchers, schema as pipeline_schema, storage
from monarch_pipeline.config import DB_PATH, TOKEN_PATH, SESSION_PATH, ensure_data_dir

app = Flask(__name__)
CORS(app)  # Allow React dev server (localhost:5173) to call this API

scheduler = BackgroundScheduler(daemon=True)
SYNC_JOB_ID = "auto_sync"


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
"""


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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
    "categories":      "categories",
    "transactions":    "transactions",
    "budgets":         "budgets",
}

ENTITY_RUN_ORDER = [
    "accounts",
    "account_history",
    "categories",
    "transactions",
    "budgets",
]

ENTITY_LABELS = {
    "accounts":        "Accounts",
    "account_history": "Account History",
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

                except Exception as exc:
                    entity_status = "failed"
                    entity_error  = str(exc)
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
            top_level_error = str(exc)
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
    conn.close()
    return jsonify([dict(r) for r in rows])


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
        return jsonify({"error": f"Token validation failed: {e}"}), 400


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

@app.route("/api/ai/config", methods=["GET"])
def get_ai_config():
    """Return AI configuration status. Never returns the raw API key."""
    conn = get_db()
    api_key  = get_setting(conn, "ai_api_key")
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
    set_setting(conn, "ai_api_key",  data["api_key"])
    set_setting(conn, "ai_model",    data["model"])
    set_setting(conn, "ai_provider", provider)
    set_setting(conn, "ai_base_url", data.get("base_url", ""))
    return jsonify({"ok": True})


@app.route("/api/ai/analyze", methods=["POST"])
def ai_analyze():
    """Fetch budget history, build prompt, call AI, return analysis text."""
    conn = get_db()
    api_key  = get_setting(conn, "ai_api_key")
    model    = get_setting(conn, "ai_model")
    provider = get_setting(conn, "ai_provider")
    base_url = get_setting(conn, "ai_base_url", "")

    if not (api_key and model and provider):
        conn.close()
        return jsonify({"error": "AI not configured. Save config via /api/ai/config first."}), 400

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
    conn.close()

    if not rows:
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
        if provider == "anthropic":
            import anthropic as anthropic_sdk
            client = anthropic_sdk.Anthropic(api_key=api_key)
            response = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            analysis = response.content[0].text

        elif provider == "openai_compatible":
            from openai import OpenAI
            kwargs: dict = {"api_key": api_key}
            if base_url:
                kwargs["base_url"] = base_url
            client = OpenAI(**kwargs)
            response = client.chat.completions.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            analysis = response.choices[0].message.content

        else:
            return jsonify({"error": f"Unknown provider: {provider}"}), 400

    except Exception as exc:
        return jsonify({"error": f"AI call failed: {exc}"}), 500

    return jsonify({"analysis": analysis, "model": model, "provider": provider})


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
    app.run(host="0.0.0.0", port=5050, debug=True)
