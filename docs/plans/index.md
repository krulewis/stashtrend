# Plans Index — Stashtrend

## Completed
- `IMPLEMENTATION_PLAN.md` (parent dir) — Phases 1–7 distribution plan (monorepo consolidation → Docker Compose). All phases complete.
- `DISTRIBUTION_PLAN.md` (parent dir) — Distribution strategy and packaging plan.

## Active
- **UI/UX Improvements** — Comprehensive audit-driven redesign. Audit reports: `ui-ux-audit-pass1.md`, `ui-ux-audit-pass2.md`. 36 items across 4 phases. Completed: stats card deltas (XS), design token system (S), color consolidation (S), budget table progress bars (M), sidebar navigation with URL routing (M). Remaining: see audit docs for full backlog.

## Roadmap — Net Worth + Investments + Forecasting

Full requirements: `plans/investment-forecasting-requirements.md`

### Build Order (foundation-first, ship incrementally)

| Phase | Scope | Size | Status |
|-------|-------|------|--------|
| **0** | Sync holdings data from Monarch API (new `holdings` DB table + pipeline) | M | **Done** (PR #3) |
| **1** | NW by account type + CAGR estimates on existing Net Worth page | M | **Done** (PR #4) |
| **2** | NW milestones + retirement target tracker on Net Worth page | M | Planned |
| **3** | New Investments page — account-level performance dashboard + holdings drill-down | L | Planned |
| **4** | New Forecasting page — simple projections + retirement planner | L | Planned |
| **5** | Monte Carlo simulation + AI narrative layer on Forecasting page | M | Planned |
| **6** | Benchmark comparison vs S&P 500 (nice-to-have) | S | Planned |

### Future / Deferred
- FIRE number calculator (calculate financial independence number from expenses, show progress)

## Recently Completed (cont.)
- **Security Remediation (OWASP Top 10)** — 7 findings fixed: debug mode env-gated, CORS localhost-only, AI key to keychain, prompt sanitization, rate limiting, error sanitization, nginx security headers. 15 new tests in `test_security.py`.

## Research (No-Go)
- **PostgreSQL Migration** — Evaluated and rejected. SQLite is the right fit for a single-user personal finance dashboard. See `postgres-migration-research.md` and `postgres-migration-architect-decision.md`.

## Recently Completed
- **SQLite Improvements** — WAL mode enabled, `get_db_connection()` context manager added, shared test DDL via `conftest.py` (eliminates DDL duplication across 5 test files).
- **Budget Builder** — AI-powered budget recommendation engine. Profile → Regional data → AI generation → Editable table → Apply to Monarch. Backend: 27 tests. Frontend: 24 tests. 3 new DB tables, 11 API endpoints, 4 new React components.

## Tech Debt / Backlog
See `memory-decisions-archive.md` (parent dir) for decision history and rationale.
