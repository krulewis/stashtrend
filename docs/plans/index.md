# Plans Index — Stashtrend

## Completed
- `IMPLEMENTATION_PLAN.md` (parent dir) — Phases 1–7 distribution plan (monorepo consolidation → Docker Compose). All phases complete.
- `DISTRIBUTION_PLAN.md` (parent dir) — Distribution strategy and packaging plan.

## Active
None currently.

## Recently Completed (cont.)
- **Security Remediation (OWASP Top 10)** — 7 findings fixed: debug mode env-gated, CORS localhost-only, AI key to keychain, prompt sanitization, rate limiting, error sanitization, nginx security headers. 15 new tests in `test_security.py`.

## Research (No-Go)
- **PostgreSQL Migration** — Evaluated and rejected. SQLite is the right fit for a single-user personal finance dashboard. See `postgres-migration-research.md` and `postgres-migration-architect-decision.md`.

## Recently Completed
- **SQLite Improvements** — WAL mode enabled, `get_db_connection()` context manager added, shared test DDL via `conftest.py` (eliminates DDL duplication across 5 test files).
- **Budget Builder** — AI-powered budget recommendation engine. Profile → Regional data → AI generation → Editable table → Apply to Monarch. Backend: 27 tests. Frontend: 24 tests. 3 new DB tables, 11 API endpoints, 4 new React components.

## Tech Debt / Backlog
See `memory-decisions-archive.md` (parent dir) for decision history and rationale.
