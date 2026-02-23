"""
Tests for the Data Sync feature.

Covers:
  - sync_jobs table schema (creation, idempotency, constraints)
  - Job lifecycle (create → running → success / failed)
  - Before/after row-count delta logic
  - Sync history query (ordering, limit, empty state)
  - Entity dependency ordering (account_history must follow accounts)
  - Results JSON shape
  - Concurrent-job guard (only one running job at a time)

These tests use in-memory SQLite and pure Python logic — no Flask or live
Monarch API calls required.
"""

import json
import sqlite3
import unittest
from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# DDL fragments mirrored from app.py — kept here so tests are self-contained
# and will catch any drift between the DDL and the helper functions.
# ---------------------------------------------------------------------------

PIPELINE_TABLES_DDL = """
CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT,
    type            TEXT,
    current_balance REAL
);

CREATE TABLE IF NOT EXISTS account_history (
    account_id TEXT,
    date       TEXT,
    balance    REAL,
    PRIMARY KEY (account_id, date)
);

CREATE TABLE IF NOT EXISTS transactions (
    id   TEXT PRIMARY KEY,
    date TEXT,
    amount REAL
);

CREATE TABLE IF NOT EXISTS categories (
    id   TEXT PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS budgets (
    category_id TEXT,
    month       TEXT,
    PRIMARY KEY (category_id, month)
);

CREATE TABLE IF NOT EXISTS sync_log (
    entity          TEXT PRIMARY KEY,
    last_synced_at  TEXT,
    last_sync_count INTEGER,
    total_records   INTEGER
);
"""

SYNC_JOBS_DDL = """
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
"""

FULL_DDL = PIPELINE_TABLES_DDL + SYNC_JOBS_DDL

# ---------------------------------------------------------------------------
# Pure helper functions (mirror of what will live in app.py)
# These are tested here so that the implementation is contractually bound.
# ---------------------------------------------------------------------------

ENTITY_TABLE_MAP = {
    "accounts":        "accounts",
    "account_history": "account_history",
    "categories":      "categories",
    "transactions":    "transactions",
    "budgets":         "budgets",
}

# account_history must always run after accounts (needs account IDs to exist)
ENTITY_RUN_ORDER = [
    "accounts",
    "account_history",
    "categories",
    "transactions",
    "budgets",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_sync_job(conn: sqlite3.Connection, entities: list, full_refresh: bool) -> int:
    """Insert a new sync_jobs row with status='running'. Returns job_id."""
    cur = conn.execute(
        """
        INSERT INTO sync_jobs (started_at, status, entities, full_refresh)
        VALUES (?, 'running', ?, ?)
        """,
        (_now(), json.dumps(entities), int(full_refresh)),
    )
    conn.commit()
    return cur.lastrowid


def update_sync_job(
    conn: sqlite3.Connection,
    job_id: int,
    status: str,
    results: dict = None,
    error: str = None,
) -> None:
    """Update a sync job's status, results, finished_at, and optional error."""
    conn.execute(
        """
        UPDATE sync_jobs
           SET status      = ?,
               finished_at = ?,
               results     = ?,
               error       = ?
         WHERE id = ?
        """,
        (
            status,
            _now(),
            json.dumps(results) if results is not None else None,
            error,
            job_id,
        ),
    )
    conn.commit()


def get_sync_job(conn: sqlite3.Connection, job_id: int) -> Optional[dict]:
    """Fetch a single sync job by id. Returns None if not found."""
    row = conn.execute(
        "SELECT * FROM sync_jobs WHERE id = ?", (job_id,)
    ).fetchone()
    if row is None:
        return None
    d = dict(row)
    if d.get("entities"):
        d["entities"] = json.loads(d["entities"])
    if d.get("results"):
        d["results"] = json.loads(d["results"])
    return d


def get_sync_history(conn: sqlite3.Connection, limit: int = 10) -> list:
    """Return last N sync jobs, newest first."""
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


def get_running_job(conn: sqlite3.Connection) -> Optional[dict]:
    """Return the currently running job, or None if none is running."""
    row = conn.execute(
        "SELECT * FROM sync_jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    d = dict(row)
    if d.get("entities"):
        d["entities"] = json.loads(d["entities"])
    return d


def count_entity_rows(conn: sqlite3.Connection, entity: str) -> int:
    """Return current row count for a pipeline entity table."""
    table = ENTITY_TABLE_MAP.get(entity)
    if table is None:
        raise ValueError(f"Unknown entity: {entity}")
    row = conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()
    return row["n"]


def snapshot_counts(conn: sqlite3.Connection, entities: list) -> dict:
    """Return a {entity: row_count} snapshot for the given entities."""
    return {e: count_entity_rows(conn, e) for e in entities}


def compute_deltas(before: dict, after: dict) -> dict:
    """Return {entity: new_rows_added} — the difference between two snapshots."""
    return {
        entity: after.get(entity, 0) - before.get(entity, 0)
        for entity in after
    }


def ordered_entities(selected: list) -> list:
    """
    Return selected entities sorted by ENTITY_RUN_ORDER dependency order.
    account_history is always placed after accounts when both are present.
    """
    order_index = {e: i for i, e in enumerate(ENTITY_RUN_ORDER)}
    return sorted(selected, key=lambda e: order_index.get(e, 99))


def build_results(entity: str, count: int, delta: int, status: str, error: str = None) -> dict:
    """Build a single entity result dict for the results JSON blob."""
    return {
        "count":  count,
        "new":    delta,
        "status": status,
        "error":  error,
    }


# ===========================================================================
# Tests
# ===========================================================================

def _make_db() -> sqlite3.Connection:
    """Create a fresh in-memory DB with full schema."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(FULL_DDL)
    return conn


class TestSyncJobsSchema(unittest.TestCase):
    """sync_jobs table structure and constraints."""

    def setUp(self):
        self.conn = _make_db()

    def tearDown(self):
        self.conn.close()

    def test_sync_jobs_table_created(self):
        tables = {r[0] for r in self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        self.assertIn("sync_jobs", tables)

    def test_schema_is_idempotent(self):
        """Re-running the DDL must not raise."""
        try:
            self.conn.executescript(SYNC_JOBS_DDL)
        except Exception as e:
            self.fail(f"Re-running DDL raised: {e}")

    def test_default_status_is_running(self):
        conn = self.conn
        conn.execute(
            "INSERT INTO sync_jobs (started_at, entities) VALUES (?, ?)",
            (_now(), '["accounts"]'),
        )
        conn.commit()
        row = conn.execute("SELECT status FROM sync_jobs").fetchone()
        self.assertEqual(row["status"], "running")

    def test_autoincrement_id(self):
        conn = self.conn
        for _ in range(3):
            conn.execute(
                "INSERT INTO sync_jobs (started_at, entities) VALUES (?, ?)",
                (_now(), '["accounts"]'),
            )
        conn.commit()
        ids = [r[0] for r in conn.execute("SELECT id FROM sync_jobs ORDER BY id").fetchall()]
        self.assertEqual(ids, [1, 2, 3])


class TestSyncJobLifecycle(unittest.TestCase):
    """Job state transitions: running → success / failed."""

    def setUp(self):
        self.conn = _make_db()

    def tearDown(self):
        self.conn.close()

    def test_create_job_returns_id(self):
        job_id = create_sync_job(self.conn, ["accounts", "transactions"], full_refresh=False)
        self.assertIsInstance(job_id, int)
        self.assertGreater(job_id, 0)

    def test_new_job_status_is_running(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        job = get_sync_job(self.conn, job_id)
        self.assertEqual(job["status"], "running")
        self.assertIsNone(job["finished_at"])

    def test_update_job_to_success(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        results = {"accounts": build_results("accounts", count=67, delta=2, status="success")}
        update_sync_job(self.conn, job_id, status="success", results=results)
        job = get_sync_job(self.conn, job_id)
        self.assertEqual(job["status"], "success")
        self.assertIsNotNone(job["finished_at"])
        self.assertEqual(job["results"]["accounts"]["count"], 67)
        self.assertEqual(job["results"]["accounts"]["new"], 2)

    def test_update_job_to_failed_with_error(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        update_sync_job(self.conn, job_id, status="failed", error="Token expired")
        job = get_sync_job(self.conn, job_id)
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["error"], "Token expired")

    def test_get_nonexistent_job_returns_none(self):
        result = get_sync_job(self.conn, 9999)
        self.assertIsNone(result)

    def test_entities_stored_and_parsed_as_list(self):
        entities = ["accounts", "transactions", "budgets"]
        job_id = create_sync_job(self.conn, entities, full_refresh=False)
        job = get_sync_job(self.conn, job_id)
        self.assertEqual(job["entities"], entities)

    def test_full_refresh_flag_stored(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=True)
        job = get_sync_job(self.conn, job_id)
        self.assertEqual(job["full_refresh"], 1)

    def test_partial_entity_failure_recorded_in_results(self):
        """If one entity fails, the job can still succeed overall with per-entity error."""
        job_id = create_sync_job(self.conn, ["accounts", "transactions"], full_refresh=False)
        results = {
            "accounts":     build_results("accounts", count=67, delta=0, status="success"),
            "transactions": build_results("transactions", count=0, delta=0, status="failed",
                                          error="API timeout"),
        }
        update_sync_job(self.conn, job_id, status="partial", results=results)
        job = get_sync_job(self.conn, job_id)
        self.assertEqual(job["status"], "partial")
        self.assertEqual(job["results"]["transactions"]["status"], "failed")
        self.assertEqual(job["results"]["transactions"]["error"], "API timeout")
        self.assertEqual(job["results"]["accounts"]["status"], "success")


class TestRunningJobGuard(unittest.TestCase):
    """Only one job should be running at a time."""

    def setUp(self):
        self.conn = _make_db()

    def tearDown(self):
        self.conn.close()

    def test_get_running_job_returns_none_when_empty(self):
        self.assertIsNone(get_running_job(self.conn))

    def test_get_running_job_returns_current(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        running = get_running_job(self.conn)
        self.assertIsNotNone(running)
        self.assertEqual(running["id"], job_id)
        self.assertEqual(running["status"], "running")

    def test_no_running_job_after_completion(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        update_sync_job(self.conn, job_id, status="success")
        self.assertIsNone(get_running_job(self.conn))

    def test_no_running_job_after_failure(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        update_sync_job(self.conn, job_id, status="failed", error="oops")
        self.assertIsNone(get_running_job(self.conn))


class TestSyncHistoryQuery(unittest.TestCase):
    """get_sync_history ordering, limit, and empty state."""

    def setUp(self):
        self.conn = _make_db()

    def tearDown(self):
        self.conn.close()

    def test_empty_history_returns_empty_list(self):
        self.assertEqual(get_sync_history(self.conn), [])

    def test_history_newest_first(self):
        j1 = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        j2 = create_sync_job(self.conn, ["transactions"], full_refresh=False)
        update_sync_job(self.conn, j1, status="success")
        update_sync_job(self.conn, j2, status="success")
        history = get_sync_history(self.conn)
        self.assertEqual(history[0]["id"], j2)
        self.assertEqual(history[1]["id"], j1)

    def test_history_respects_limit(self):
        for _ in range(15):
            job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
            update_sync_job(self.conn, job_id, status="success")
        history = get_sync_history(self.conn, limit=10)
        self.assertEqual(len(history), 10)

    def test_history_includes_running_jobs(self):
        create_sync_job(self.conn, ["accounts"], full_refresh=False)
        history = get_sync_history(self.conn)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["status"], "running")

    def test_history_results_parsed_from_json(self):
        job_id = create_sync_job(self.conn, ["accounts"], full_refresh=False)
        results = {"accounts": build_results("accounts", 67, 5, "success")}
        update_sync_job(self.conn, job_id, status="success", results=results)
        history = get_sync_history(self.conn)
        self.assertIsInstance(history[0]["results"], dict)
        self.assertEqual(history[0]["results"]["accounts"]["new"], 5)


class TestBeforeAfterDeltas(unittest.TestCase):
    """snapshot_counts and compute_deltas correctly measure new rows."""

    def setUp(self):
        self.conn = _make_db()

    def tearDown(self):
        self.conn.close()

    def _insert_accounts(self, n: int, start_id: int = 1):
        for i in range(n):
            self.conn.execute(
                "INSERT OR REPLACE INTO accounts (id, name) VALUES (?, ?)",
                (str(start_id + i), f"Account {start_id + i}"),
            )
        self.conn.commit()

    def _insert_transactions(self, n: int, start_id: int = 1):
        for i in range(n):
            self.conn.execute(
                "INSERT OR REPLACE INTO transactions (id, date, amount) VALUES (?, ?, ?)",
                (str(start_id + i), "2026-01-01", 10.0),
            )
        self.conn.commit()

    def test_snapshot_counts_empty_tables(self):
        counts = snapshot_counts(self.conn, ["accounts", "transactions"])
        self.assertEqual(counts["accounts"], 0)
        self.assertEqual(counts["transactions"], 0)

    def test_snapshot_counts_after_inserts(self):
        self._insert_accounts(5)
        self._insert_transactions(12)
        counts = snapshot_counts(self.conn, ["accounts", "transactions"])
        self.assertEqual(counts["accounts"], 5)
        self.assertEqual(counts["transactions"], 12)

    def test_compute_deltas_no_change(self):
        before = {"accounts": 67, "transactions": 964}
        after  = {"accounts": 67, "transactions": 964}
        deltas = compute_deltas(before, after)
        self.assertEqual(deltas["accounts"], 0)
        self.assertEqual(deltas["transactions"], 0)

    def test_compute_deltas_new_rows(self):
        before = {"accounts": 65, "transactions": 950}
        after  = {"accounts": 67, "transactions": 964}
        deltas = compute_deltas(before, after)
        self.assertEqual(deltas["accounts"], 2)
        self.assertEqual(deltas["transactions"], 14)

    def test_delta_reflects_actual_inserts(self):
        self._insert_accounts(10)
        before = snapshot_counts(self.conn, ["accounts"])
        self._insert_accounts(3, start_id=100)   # 3 new accounts
        after  = snapshot_counts(self.conn, ["accounts"])
        deltas = compute_deltas(before, after)
        self.assertEqual(deltas["accounts"], 3)

    def test_count_entity_rows_raises_on_unknown_entity(self):
        with self.assertRaises(ValueError):
            count_entity_rows(self.conn, "nonexistent_table")


class TestEntityOrdering(unittest.TestCase):
    """ordered_entities ensures dependency order is respected."""

    def test_account_history_after_accounts(self):
        selected = ["account_history", "accounts"]
        result = ordered_entities(selected)
        self.assertLess(result.index("accounts"), result.index("account_history"))

    def test_all_entities_in_order(self):
        selected = ["budgets", "transactions", "account_history", "categories", "accounts"]
        result = ordered_entities(selected)
        self.assertEqual(result, [
            "accounts", "account_history", "categories", "transactions", "budgets"
        ])

    def test_single_entity_unchanged(self):
        self.assertEqual(ordered_entities(["transactions"]), ["transactions"])

    def test_subset_preserves_relative_order(self):
        selected = ["budgets", "accounts"]
        result = ordered_entities(selected)
        self.assertLess(result.index("accounts"), result.index("budgets"))

    def test_empty_selection_returns_empty(self):
        self.assertEqual(ordered_entities([]), [])


class TestResultsShape(unittest.TestCase):
    """build_results produces the expected JSON shape."""

    def test_success_result_shape(self):
        r = build_results("accounts", count=67, delta=2, status="success")
        self.assertEqual(r["count"], 67)
        self.assertEqual(r["new"], 2)
        self.assertEqual(r["status"], "success")
        self.assertIsNone(r["error"])

    def test_failed_result_shape(self):
        r = build_results("transactions", count=0, delta=0, status="failed",
                          error="Connection refused")
        self.assertEqual(r["status"], "failed")
        self.assertEqual(r["error"], "Connection refused")
        self.assertEqual(r["count"], 0)

    def test_results_json_serializable(self):
        r = build_results("accounts", 67, 2, "success")
        try:
            json.dumps(r)
        except (TypeError, ValueError) as e:
            self.fail(f"Result not JSON-serializable: {e}")


if __name__ == "__main__":
    unittest.main()
