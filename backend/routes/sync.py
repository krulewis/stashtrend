import asyncio
import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Optional

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:
    class BackgroundScheduler:  # type: ignore[no-redef]
        """No-op stub used when APScheduler is not installed."""
        running = False
        def __init__(self, **kwargs): pass
        def start(self): self.running = True
        def get_job(self, job_id): return None
        def add_job(self, *args, **kwargs): pass
        def remove_job(self, job_id): pass

from flask import Blueprint, jsonify, request
import app as _app
from monarch_pipeline import auth, fetchers, schema as pipeline_schema, storage
from monarch_pipeline.config import DB_PATH, SESSION_PATH, TOKEN_PATH

bp = Blueprint("sync", __name__)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(daemon=True)
SYNC_JOB_ID = "auto_sync"

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


def run_scheduled_sync() -> None:
    """
    Called by APScheduler on the configured interval.
    Starts a full sync in a background thread unless one is already running.
    """
    import app as _app
    conn = _app.get_db()
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
    import app as _app
    if _app.scheduler.get_job(SYNC_JOB_ID):
        _app.scheduler.remove_job(SYNC_JOB_ID)
    if interval_hours > 0:
        _app.scheduler.add_job(
            run_scheduled_sync,
            "interval",
            hours=interval_hours,
            id=SYNC_JOB_ID,
        )


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
                    logger.exception("Sync error for %s", entity)
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
            logger.exception("Top-level sync error")
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


@bp.route("/api/sync/start", methods=["POST"])
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

    conn = _app.get_db()

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


@bp.route("/api/sync/status/<int:job_id>")
def sync_status(job_id):
    """Poll status for a specific sync job."""
    conn = _app.get_db()
    job  = get_sync_job(conn, job_id)
    conn.close()
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@bp.route("/api/sync/history")
def sync_history():
    """Return the last 10 sync jobs, newest first."""
    conn    = _app.get_db()
    history = get_sync_history(conn, limit=10)
    conn.close()
    return jsonify(history)


@bp.route("/api/sync/last-status")
def sync_last_status():
    """
    Return the pipeline's sync_log table — last sync time and record counts
    per entity. Used by the control panel to show when each entity was last synced.
    """
    conn  = _app.get_db()
    rows  = conn.execute(
        "SELECT entity, last_synced_at, last_sync_count, total_records FROM sync_log ORDER BY entity"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])
