# Architectural Decision: SQLite to PostgreSQL Migration

**Date:** 2026-03-02
**Agent:** Architect
**Status:** Complete
**Decision:** NO-GO

---

## 1. Research Validation

### What the Research Got Right

The research report is thorough and accurate. I verified every major claim against the actual codebase:

- **13 tables, two DDL sources** -- confirmed. Pipeline schema in `pipeline/monarch_pipeline/schema.py` (6 tables), dashboard DDL in `backend/app.py` as `DASHBOARD_DDL` (7 tables).

- **`get_db()` pattern with no pooling** -- confirmed at line 138 of `app.py`. Fresh `sqlite3.connect(DB_PATH)` per call, `PRAGMA foreign_keys = ON`, `row_factory = sqlite3.Row`.

- **Pervasive SQLite-dialect SQL** -- confirmed. I counted the following SQLite-specific patterns in `app.py` alone:
  - `date('now')`, `date('now', '-1 month')`, `date('now', '-1 year')` -- used in `net_worth_on_date()` (lines 501-503)
  - `date('now', 'start of month')` and `date('now', 'start of month', '-' || ? || ' months')` -- used in budget history (lines 827-828), AI analysis (lines 1105-1106), and budget builder (lines 1505-1506)
  - `datetime('now')` -- used in 5 UPDATE statements (lines 1322, 1371, 1444, 1696, 1773)
  - `DEFAULT (date('now'))` and `DEFAULT (datetime('now'))` -- used in 4 DDL column defaults
  - `INTEGER PRIMARY KEY AUTOINCREMENT` -- used in 3 tables
  - `INSERT OR REPLACE INTO` -- used throughout `storage.py` (6 occurrences)
  - `PRAGMA foreign_keys = ON` -- used in `get_db()` and `pipeline_schema.init_db()`
  - `sqlite_master` -- queried in `schema.py:get_table_names()`

- **`net_worth_on_date()` uses f-string SQL composition** -- confirmed at line 487. SQLite date expressions are injected directly into the SQL string (not parameterized). This is safe because the inputs are hardcoded string literals, but it is a pattern that would need restructuring for PostgreSQL since the equivalent date expressions differ syntactically.

- **Test infrastructure uses in-memory SQLite** -- confirmed. Every test file creates `sqlite3.connect(":memory:")`, manually defines DDL (duplicated, not imported), and patches `get_db`. The `conn.close()` omission is real and documented.

- **DDL duplication in tests** -- confirmed. `test_budgets.py` and `test_budget_builder.py` both define their own `PIPELINE_DDL` strings for `categories` and `budgets` tables, separate from the source in `pipeline/monarch_pipeline/schema.py`.

- **No ORM, no migration tooling** -- confirmed. All SQL is hand-written strings. Schema changes rely on `CREATE TABLE IF NOT EXISTS` at startup.

- **Query complexity is moderate** -- confirmed. JOINs with SUM/CASE/GROUP BY are the most complex patterns. No CTEs, window functions, subqueries, or recursive queries.

- **40-60 individual SQL changes estimate** -- I'd revise this slightly upward to **50-70** when including `storage.py` (6 `INSERT OR REPLACE` calls with `executemany`), `schema.py` (DDL + `sqlite_master` query), all 7 test files (DDL + test data insertion), and `app.py` itself.

### What the Research Missed or Understated

1. **The `net_worth_on_date()` f-string pattern is worse than typical SQLite coupling.** The function injects raw SQLite date expressions (`date('now')`, `date('now', '-1 month')`) directly into SQL via Python f-strings. PostgreSQL equivalents (`CURRENT_DATE`, `CURRENT_DATE - INTERVAL '1 month'`) have different syntax. This function would need not just find-and-replace but a structural rewrite -- either parameterizing the date logic in Python or building a dialect-aware query generator.

2. **The pipeline package is independently installable.** `pipeline/` is `pip install ./pipeline`. Switching its internals from `sqlite3` to `psycopg2` means it can no longer run as a zero-dependency stdlib-only tool. The research mentions this but understates the impact: the pipeline is a separate concern from the dashboard, and forcing PostgreSQL onto it breaks its lightweight design.

3. **`sqlite_master` usage in `schema.py:get_table_names()`** -- this is a SQLite system table. PostgreSQL uses `information_schema.tables` or `pg_catalog.pg_tables`. Minor but another change point.

4. **`?` placeholder syntax** -- SQLite uses `?` for parameterized queries. `psycopg2` uses `%s`. Every parameterized query (dozens) would need placeholder replacement. The research doesn't call this out explicitly.

5. **`executemany()` behavior differences** -- SQLite's `executemany()` and PostgreSQL's `executemany()` (via psycopg2) have subtly different performance characteristics and error handling. The pipeline's bulk upsert pattern would need testing.

---

## 2. Decision: NO-GO

**Do not migrate Stashtrend from SQLite to PostgreSQL.**

---

## 3. Rationale

### The Core Problem: There Is No Problem

The research correctly identifies that Stashtrend has no database-level pain points that PostgreSQL would solve:

- **No concurrency issues.** Single-user app. Two Gunicorn workers + one sync thread is well within SQLite's capability, especially with WAL mode (which is not even enabled yet -- a one-line fix).
- **No performance issues.** 13 tables, simple queries, low write volume. SQLite handles this workload trivially.
- **No data integrity issues.** No corruption, no lost writes, no constraint violations.
- **No feature blocked by SQLite.** No planned feature requires JSONB, full-text search, replication, pub/sub, or multi-user access.

### Cost-Benefit Analysis

| Factor | Assessment |
|--------|------------|
| **Benefit** | Near-zero for current and foreseeable use case |
| **Cost** | 50-70 SQL changes, full test infrastructure rewrite, new Docker service, new Python dependencies, pipeline package redesign |
| **Time** | 50-100 hours (I'm revising the research estimate upward given the placeholder syntax changes and pipeline impact) |
| **Risk** | High regression risk -- no ORM means every change is manual and error-prone |
| **Ongoing cost** | PostgreSQL container to maintain, connection pooling to manage, slower test runs, more complex local dev setup |

The migration has a strongly negative ROI. Every hour spent on it is an hour not spent building features that provide actual user value.

### The "Future-Proofing" Argument Is Premature

If Stashtrend eventually needs PostgreSQL (multi-user, hosted SaaS, etc.), the correct time to migrate is when that need materializes -- not speculatively. At that point, the scope of changes would be the same whether done now or later, but doing it later means the investment is justified by a concrete feature.

---

## 4. Rejected Alternatives

### Alternative C: Full PostgreSQL Migration -- REJECTED

Rejected for the reasons above. High cost, high risk, near-zero benefit for a single-user personal finance dashboard.

### Alternative D: Hybrid (PostgreSQL for Docker, SQLite for local dev) -- REJECTED

The research correctly identifies this as the worst option. Two SQL dialects means two code paths, dialect-specific bugs that hide in the gap, and double the testing burden. Strongly rejected.

### Alternative B: SQLAlchemy Core Abstraction Layer -- REJECTED (for now)

This would replace all hand-written SQL with SQLAlchemy Core expressions, gaining dialect portability. While technically sound, it is a large refactor (rewrite every query in the codebase) with no immediate payoff. The only benefit is "if we ever switch databases, it will be easier" -- which is speculative. SQLAlchemy also adds a significant dependency and learning curve, and the current raw SQL is simple and readable.

**Reconsider if:** A concrete PostgreSQL requirement emerges. At that point, adopting SQLAlchemy Core as a prerequisite step to migration would be the right sequence.

---

## 5. Recommended Action: Option A (SQLite Improvements)

Instead of migrating, address the actual pain points with targeted, low-risk improvements:

### Priority 1: Enable WAL Mode (1 hour)

Add `PRAGMA journal_mode=WAL` to `get_db()`. This is SQLite's multi-reader/single-writer mode. It eliminates read blocking during sync writes and is the single highest-value change for concurrency robustness. One line of code.

### Priority 2: Connection Context Manager (2-3 hours)

Replace the manual `get_db()` / `conn.close()` pattern with a context manager:

```python
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
    finally:
        conn.close()
```

This eliminates the `conn.close()` omission gotcha entirely. Tests would need adjustment (the patched `get_db` would also need to be a context manager), but this is a much smaller change than a full DB migration.

### Priority 3: Extract Shared DDL for Tests (2-3 hours)

Have test files import DDL from `pipeline/monarch_pipeline/schema.py` and `backend/app.py` instead of duplicating it. Eliminates schema drift risk between tests and production.

### Priority 4: Add Alembic for SQLite (4-6 hours, optional)

Alembic supports SQLite (with some limitations on ALTER TABLE). This would give proper schema versioning and migration scripts, replacing the current "additive-only CREATE IF NOT EXISTS" approach. Lower priority because the current approach works, but good hygiene for the future.

### Total Estimated Effort: 4-6 hours (priorities 1-3), up to 12 hours with Alembic

Compare to 50-100 hours for PostgreSQL migration. Same pain points addressed. Fraction of the cost and risk.

---

## 6. Decision Summary

| Question | Answer |
|----------|--------|
| **Should we migrate to PostgreSQL?** | No. |
| **Why not?** | No problem exists that PostgreSQL solves. High cost, high risk, near-zero benefit. |
| **What should we do instead?** | Enable WAL mode, add connection context manager, extract shared test DDL. |
| **When to reconsider?** | When a concrete feature requires PostgreSQL capabilities (multi-user, hosted deployment, full-text search, etc.). |
| **If we reconsider, what prep?** | Adopt SQLAlchemy Core first as an intermediate step to gain dialect portability before switching the backend. |
