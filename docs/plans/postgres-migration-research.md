# Research Report: Should Stashtrend Migrate from SQLite to PostgreSQL?

**Date:** 2026-03-02
**Agent:** Research
**Status:** Complete — ready for Architect review

---

## 1. Current Database Architecture

### Engine
SQLite 3, accessed via Python's built-in `sqlite3` module. No ORM. All SQL is hand-written.

### Database File Location
- **Local dev:** `~/.monarch_pipeline/monarch.db`
- **Docker:** `/data/monarch.db` on a named Docker volume (`monarch_data`)
- Configured via `MONARCH_DATA_DIR` env var; resolved in `pipeline/monarch_pipeline/config.py` as `DB_PATH`.

### Connection Pattern
A single helper function in `backend/app.py`:

```python
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
```

Every endpoint calls `get_db()`, creating a fresh connection per request. There is **no connection pooling**. Some endpoints call `conn.close()` explicitly; others intentionally omit it (see Gotchas below). The background sync worker creates its own connection in a separate thread (`sqlite3.connect(DB_PATH)` directly, not via `get_db()`).

### Schema: Two DDL Sources (13 Tables Total)

**Pipeline tables** (6 tables, defined in `pipeline/monarch_pipeline/schema.py`):
1. `accounts` — synced account data
2. `account_history` — daily balance snapshots per account
3. `categories` — transaction category taxonomy
4. `transactions` — individual transactions
5. `budgets` — budget vs actual per category per month
6. `sync_log` — per-entity sync timestamps

**Dashboard tables** (7 tables, defined as `DASHBOARD_DDL` in `backend/app.py`):
7. `account_groups` — user-defined account groupings
8. `account_group_members` — group membership (many-to-many)
9. `sync_jobs` — background sync job tracking
10. `settings` — key/value config store (AI provider, API keys, etc.)
11. `budget_builder_profile` — singleton user profile for budget builder
12. `budget_builder_regional` — singleton regional cost data
13. `budget_builder_plans` — saved budget plans

**Init order is critical:** `pipeline_schema.init_db(DB_PATH)` must run before `DASHBOARD_DDL` because dashboard tables reference pipeline tables via foreign keys.

### Query Complexity
- **Simple CRUD:** Most endpoints are straightforward SELECT/INSERT/UPDATE on single tables.
- **Moderate JOINs:** Net worth history (`account_history JOIN accounts`), budget history (`budgets LEFT JOIN categories`), group history and snapshots (`account_history JOIN account_group_members JOIN account_groups`).
- **Aggregate queries:** `SUM(CASE WHEN ...)`, `GROUP BY date`, `GROUP BY ag.id`.
- **No subqueries, CTEs, window functions, or recursive queries.**
- **SQLite-specific functions used extensively:** `date('now')`, `datetime('now')`, `date('now', '-1 month')`, `date('now', 'start of month')`, `date('now', 'start of month', '-' || ? || ' months')`.
- **SQLite-specific DDL:** `INTEGER PRIMARY KEY AUTOINCREMENT`, `CHECK (id = 1)` for singleton tables, `DEFAULT (date('now'))`, `DEFAULT (datetime('now'))`.
- **SQLite-specific DML:** `INSERT OR REPLACE` (used heavily in pipeline storage), `ON CONFLICT(...) DO UPDATE SET` (used in dashboard settings and budget builder).

### Write Patterns (Upserts)
All pipeline sync operations use `INSERT OR REPLACE INTO` via `executemany()`. Dashboard settings use `ON CONFLICT(key) DO UPDATE`. Budget builder uses `ON CONFLICT(id) DO UPDATE SET`. These are SQLite's upsert dialects; PostgreSQL equivalents exist (`INSERT ... ON CONFLICT ... DO UPDATE`) but the syntax differs slightly for `INSERT OR REPLACE`.

### Test Infrastructure
All 6 test files use **in-memory SQLite** (`sqlite3.connect(":memory:")`). Each test file duplicates the relevant DDL locally (not imported from source) to remain self-contained. Tests patch `get_db` to return the in-memory connection. This is a lightweight, fast, zero-infrastructure test setup.

### No Migration Tooling
There is no Alembic, no migration scripts, no schema versioning. Tables use `CREATE TABLE IF NOT EXISTS` and are re-run on every startup. Schema changes are additive only.

### Concurrency Model
- **Gunicorn:** 2 workers in production Docker (`--workers 2`).
- **Background sync:** runs in a `threading.Thread` with its own `sqlite3.connect()` call.
- **No WAL mode, no busy_timeout configured.** SQLite defaults to journal_mode=DELETE and a 5-second busy timeout.
- Two Gunicorn workers + one sync thread = up to 3 concurrent connections to the same SQLite file. This is a potential issue under write contention but has not been reported as a problem.

---

## 2. Current Pain Points / Limitations

### Confirmed Issues
1. **`conn.close()` omission pattern** — documented in `docs/gotchas.md`. Budget-related endpoints intentionally skip `conn.close()` because the test infrastructure shares in-memory connections. This is a workaround for SQLite's in-memory DB semantics, not a design choice.

2. **DDL duplication in tests** — every test file manually replicates table DDL instead of importing from source. Schema drift between test DDL and production DDL is possible and would be silent.

3. **No connection pooling** — every request creates a new `sqlite3.connect()` call. For SQLite this is fine (connecting is ~0.1ms to a local file), but it is a pattern that does not translate to PostgreSQL without a pool.

4. **No WAL mode** — without `PRAGMA journal_mode=WAL`, SQLite uses exclusive write locks. The background sync thread holds write locks during multi-entity sync operations (which can run 30-60 seconds), potentially blocking API read-write requests.

5. **SQLite-specific date functions embedded in SQL** — `date('now', 'start of month', '-' || ? || ' months')` and similar expressions appear in at least 6 queries. These have no direct PostgreSQL equivalent.

### Theoretical Limitations (Not Currently Hit)
6. **No concurrent writes** — SQLite serializes all writes. With 2 Gunicorn workers + sync thread, write contention is possible but the app's write volume is low (syncs are infrequent, user writes are rare).

7. **No JSONB, full-text search, or advanced types** — JSON data is stored as TEXT and parsed in Python. Not a current pain point, but PostgreSQL would enable JSON queries at the DB level.

8. **Single-file storage** — the entire database is one file. Backup is file copy. No replication, no point-in-time recovery.

9. **No role-based access control** — SQLite has no user/permission model. Not relevant for a single-user personal finance app.

---

## 3. Benefits PostgreSQL Would Bring

| Benefit | Relevance to Stashtrend |
|---------|------------------------|
| True concurrent reads/writes (MVCC) | **Low.** Single-user app with infrequent writes. SQLite WAL mode would solve most contention. |
| Connection pooling (via pgbouncer or SQLAlchemy pool) | **Low.** Current connection-per-request is fine for SQLite; adding a pool is only needed because PostgreSQL connections are expensive. |
| Advanced data types (JSONB, arrays, timestamp with timezone) | **Low-Medium.** Could clean up JSON-as-TEXT storage (budget builder line_items, sync results), but Python already handles parsing. |
| Full-text search | **Not needed.** No search feature exists or is planned. |
| Proper migration tooling (Alembic) | **Medium.** Would solve DDL drift problem, but Alembic can also work with SQLite. |
| Replication / HA / backups | **Not needed.** Personal finance dashboard for one user. Docker volume backup is sufficient. |
| Stored procedures / triggers | **Not needed.** All logic is in Python. |
| Better date/time functions | **Medium.** Would replace SQLite's string-based date arithmetic with proper `DATE_TRUNC`, `INTERVAL`, etc. |

### Honest Assessment
For this application's scale and use case (single-user personal finance dashboard), PostgreSQL's primary strengths (concurrency, replication, multi-user access) provide essentially zero value.

---

## 4. Costs and Risks of Migration

### High-Cost Items

1. **Rewrite all SQL queries (~40+ queries):**
   - Replace `date('now')` → `CURRENT_DATE` or `NOW()`
   - Replace `date('now', 'start of month')` → `DATE_TRUNC('month', CURRENT_DATE)`
   - Replace `date('now', '-1 month')` → `CURRENT_DATE - INTERVAL '1 month'`
   - Replace string concatenation date arithmetic (`'-' || ? || ' months'`) → parameterized `INTERVAL`
   - Replace `INSERT OR REPLACE` → `INSERT ... ON CONFLICT ... DO UPDATE SET`
   - Replace `datetime('now')` in DDL defaults → `NOW()` or `CURRENT_TIMESTAMP`
   - Replace `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL` or `GENERATED ALWAYS AS IDENTITY`
   - Replace `PRAGMA foreign_keys = ON` → default behavior (always on in PostgreSQL)
   - **Estimated: 40-60 individual SQL changes across app.py and storage.py**

2. **Rewrite entire test infrastructure:**
   - In-memory SQLite cannot be replaced with in-memory PostgreSQL. Options:
     - Run a real PostgreSQL instance for tests (Docker, CI overhead)
     - Use `testing.postgresql` or `pytest-postgresql` fixtures (adds deps, slower)
     - Use SQLite for tests and PostgreSQL for prod (defeats the purpose; bugs hide in dialect differences)
   - Every test file's DDL would need rewriting.
   - The `conn.close()` omission pattern would need revisiting.
   - **Estimated: Complete rewrite of 6 test files, new test infrastructure.**

3. **Add operational dependency:**
   - Docker Compose gains a `postgres` service (container, volume, healthcheck).
   - Local dev requires PostgreSQL installed or a Docker container running.
   - Backup strategy changes from "copy a file" to `pg_dump`.
   - New environment variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`.

4. **Add Python dependencies:**
   - `psycopg2` or `psycopg` (PostgreSQL adapter)
   - Possibly `SQLAlchemy` for connection pooling (or raw `psycopg` pool)
   - Possibly `alembic` for migrations

5. **Data migration:**
   - Export existing SQLite data → import into PostgreSQL.
   - One-time script needed. Low risk (13 tables, simple types), but must be tested.

6. **Pipeline module changes:**
   - `pipeline/monarch_pipeline/schema.py` and `storage.py` use `sqlite3` directly.
   - These modules are a separate package (`pip install ./pipeline`). Changing them to PostgreSQL means the pipeline itself can no longer function standalone with just Python stdlib.

### Risk Assessment
- **Regression risk:** HIGH. Every SQL query changes. No ORM abstracts the dialect. Raw SQL everywhere means manual, error-prone translation.
- **Test confidence:** DROPS. Current test setup is fast, simple, zero-dependency. PostgreSQL tests are slower and require infrastructure.
- **Development velocity:** DECREASES. Local dev requires running PostgreSQL. Test runs become slower.
- **Deployment complexity:** INCREASES. One more container, one more volume, one more thing to back up and monitor.

---

## 5. Alternative Options

### Option A: Stay on SQLite, Add Improvements
- **Enable WAL mode:** Add `PRAGMA journal_mode=WAL` to `get_db()`. Solves read/write contention. One line of code.
- **Add busy_timeout:** `PRAGMA busy_timeout = 5000` (already default, but make explicit).
- **Extract DDL from tests:** Import DDL from source modules instead of duplicating. Eliminates schema drift risk.
- **Add Alembic for SQLite:** Alembic supports SQLite. Would give proper migration versioning.
- **Add connection context manager:** Replace manual `get_db()` + `conn.close()` with a context manager to prevent the close-omission gotcha.
- **Cost:** Low (hours, not days). **Risk:** Minimal. **Value:** Addresses all confirmed pain points.

### Option B: Add an Abstraction Layer (SQLAlchemy Core) Without Changing DB
- Use SQLAlchemy Core (not ORM) to generate SQL, gaining dialect portability.
- Keep SQLite as the backend.
- If PostgreSQL is ever needed, the SQL layer is already portable.
- **Cost:** Medium (refactor all queries to use SQLAlchemy expression language). **Risk:** Medium (large refactor, but incremental). **Value:** Future-proofs without adding operational complexity now.

### Option C: Migrate to PostgreSQL
- Full migration as analyzed above.
- **Cost:** High. **Risk:** High. **Value:** Low for current use case.

### Option D: Hybrid — PostgreSQL for Docker, SQLite for Local Dev
- Run PostgreSQL in Docker Compose, keep SQLite for local dev and tests.
- Requires dialect-portable SQL (effectively Option B as a prerequisite).
- **Cost:** Very High (two code paths). **Risk:** Very High (dialect differences cause subtle bugs). **Not recommended.**

---

## 6. Key Questions for the Architect

1. **What problem are we actually solving?** The current SQLite setup has no reported performance issues, no data corruption, no concurrency failures. The pain points are code hygiene (DDL duplication, conn.close() pattern), not database limitations.

2. **Is this a single-user app permanently?** If Stashtrend will always be a personal dashboard (one user, one household), PostgreSQL's multi-user concurrency story is irrelevant.

3. **Is there a future feature that requires PostgreSQL?** For example: multi-user support, real-time collaboration, full-text transaction search, pub/sub notifications. If yes, migration may be justified — but should be tied to that feature, not done speculatively.

4. **What is the ROI on developer time?** Estimated 40-80 hours for a clean PostgreSQL migration (query rewrite, test rewrite, Docker changes, data migration, QA). What features could that time build instead?

5. **Would WAL mode + code hygiene improvements satisfy the actual needs?** Adding `PRAGMA journal_mode=WAL`, extracting shared DDL, and adding a connection context manager would address all confirmed pain points in under 4 hours.

6. **If we proceed, should we add SQLAlchemy first?** Migrating raw SQL directly from SQLite dialect to PostgreSQL dialect is error-prone. An intermediate step (adopt SQLAlchemy Core) would make the migration safer but adds its own cost.

---

## 7. Summary / Recommendation Signal

**The research does not support migrating to PostgreSQL at this time.** The application is a single-user personal finance dashboard with 13 tables, simple queries, low write volume, and no concurrency problems. PostgreSQL's strengths are irrelevant to this workload. The migration cost is high (40-80 hours) due to pervasive raw SQLite-dialect SQL, and the test infrastructure would need a complete rebuild.

**Option A (SQLite improvements)** addresses all confirmed pain points at a fraction of the cost. The Architect should evaluate whether any planned feature genuinely requires PostgreSQL before proceeding with migration.
