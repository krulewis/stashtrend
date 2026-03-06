# Plans Index — Stashtrend

## Completed
- `IMPLEMENTATION_PLAN.md` (parent dir) — Phases 1–7 distribution plan (monorepo consolidation → Docker Compose). All phases complete.
- `DISTRIBUTION_PLAN.md` (parent dir) — Distribution strategy and packaging plan.

## Active
- **UI/UX Improvements** — Comprehensive audit-driven redesign. Audit reports: `ui-ux-audit-pass1.md`, `ui-ux-audit-pass2.md`. 36 items across 4 phases. Completed: stats card deltas (XS), design token system (S), color consolidation (S), budget table progress bars (M), sidebar navigation with URL routing (M). Remaining: see audit docs for full backlog.
- **Stashtrend Design Guide v1.0 Alignment** — 3-PR CSS update to match official design guide. Plans: `ui-update-requirements.md`, `ui-update-research.md`, `ui-update-architecture.md`, `ui-update-pr1-plan.md`, `ui-update-pr3-plan.md`. PR 1 (Tokens + Typography): **merged** (PR #6). PR 2 (Navigation + Interactive): **merged** (PR #7). PR 3 (Polish): **implemented** (pending QA/review).

## Roadmap — Net Worth + Investments + Forecasting

Full requirements: `plans/investment-forecasting-requirements.md`

### Build Order (foundation-first, ship incrementally)

| Phase | Scope | Size | Status |
|-------|-------|------|--------|
| **0** | Sync holdings data from Monarch API (new `holdings` DB table + pipeline) | M | **Done** (PR #3) |
| **1** | NW by account type + CAGR estimates on existing Net Worth page | M | **Done** (PR #4) |
| **2** | NW milestones + retirement target tracker on Net Worth page | M | **Done** (PR #5, merged) |
| **2.1** | Fix retirement tracker to use investable capital, not total NW | S | **Done** |
| **3** | New Investments page — account-level performance dashboard + holdings drill-down | L | Planned |
| **4** | New Forecasting page — simple projections + retirement planner | L | Planned |
| **5** | Monte Carlo simulation + AI narrative layer on Forecasting page | M | Planned |
| **6** | Benchmark comparison vs S&P 500 (nice-to-have) | S | Planned |

### Phase 2.1 — Retirement Tracker: Investable Capital Fix

**Problem:** Phase 2 placed milestone markers on the NW Over Time chart and compares nest egg targets against total net worth. This is incorrect — total NW includes home equity, vehicles, and other illiquid assets that don't fund retirement. A user with $1M NW but $400K in retirement accounts isn't on track for a $2M nest egg target, even though the chart makes it look close.

**Correct model:** Retirement readiness = **Retirement + Brokerage account balances** (investable/spendable capital). This is the sum that the 4% safe withdrawal rate applies to.

**Changes needed:**
1. **Move milestone ReferenceLines** from `NetWorthChart` → `TypeStackedChart` (or a new dedicated chart), plotted against the Retirement + Brokerage bucket sum
2. **Nest egg / on-track calculation** should compare against current Retirement + Brokerage balance (available from `/api/networth/by-type` data), not total NW
3. **RetirementSummary** should display current investable capital as the baseline metric
4. **RetirementPanel** may need a `typeData` prop to access bucket balances for the computation
5. **Projection series** (when wired in Phase 4) should project investable capital growth, not total NW

**What stays the same:** retirement_settings table, form inputs, MilestoneEditor, save/load flow, computeNestEgg math, backend endpoints.

**Size:** S — mostly moving where milestones render and what balance they compare against. No new endpoints, no new tables, no new components.

### Future / Deferred
- FIRE number calculator (calculate financial independence number from expenses, show progress)

## Recently Completed (cont.)
- **Security Remediation (OWASP Top 10)** — 7 findings fixed: debug mode env-gated, CORS localhost-only, AI key to keychain, prompt sanitization, rate limiting, error sanitization, nginx security headers. 15 new tests in `test_security.py`.

## Research (No-Go)
- **PostgreSQL Migration** — Evaluated and rejected. SQLite is the right fit for a single-user personal finance dashboard. See `postgres-migration-research.md` and `postgres-migration-architect-decision.md`.

## Recently Completed
- **SQLite Improvements** — WAL mode enabled, `get_db_connection()` context manager added, shared test DDL via `conftest.py` (eliminates DDL duplication across 5 test files).
- **Budget Builder** — AI-powered budget recommendation engine. Profile → Regional data → AI generation → Editable table → Apply to Monarch. Backend: 27 tests. Frontend: 24 tests. 3 new DB tables, 11 API endpoints, 4 new React components.

## Known Bugs

| ID | File | Description | Root Cause |
|----|------|-------------|------------|
| BUG-001 | `frontend/src/components/chartUtils.test.jsx:62` | `fmtCompact > formats negative values` test fails — expected `-$50K`, got `-$50.0K` | `fmtCompact` uses `maximumFractionDigits: 1`, so round compact values include a trailing `.0`. Test regex `/-\$50K/` is too strict. Fix: update regex to `/-\$50(\.0)?K/`, or use `maximumSignificantDigits` to suppress trailing zero. |

## Tech Debt / Backlog
See `memory-decisions-archive.md` (parent dir) for decision history and rationale.
