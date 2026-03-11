# Plans Index — Stashtrend

## Completed
- `IMPLEMENTATION_PLAN.md` (parent dir) — Phases 1–7 distribution plan (monorepo consolidation → Docker Compose). All phases complete.
- `DISTRIBUTION_PLAN.md` (parent dir) — Distribution strategy and packaging plan.
- **Security Remediation (OWASP Top 10)** — 7 findings fixed: debug mode env-gated, CORS localhost-only, AI key to keychain, prompt sanitization, rate limiting, error sanitization, nginx security headers. 15 new tests in `test_security.py`.
- **SQLite Improvements** — WAL mode enabled, `get_db_connection()` context manager added, shared test DDL via `conftest.py` (eliminates DDL duplication across 5 test files).
- **Budget Builder** — AI-powered budget recommendation engine. Profile → Regional data → AI generation → Editable table → Apply to Monarch. Backend: 27 tests. Frontend: 24 tests. 3 new DB tables, 11 API endpoints, 4 new React components.
- **UI/UX Improvements** — Audit-driven redesign (36 items across 4 phases). Completed: stats card deltas (XS), design token system (S), color consolidation (S), budget table progress bars (M), sidebar navigation with URL routing (M). Remaining items: see `ui-ux-audit-pass1.md`, `ui-ux-audit-pass2.md`.
- **Stashtrend Design Guide v1.0 Alignment** — 3-PR CSS update. PR 1 Tokens + Typography (PR #6), PR 2 Navigation + Interactive (PR #7), PR 3 Polish (PR #8). All merged.
- **Mobile Budgets vs. Actuals** — Mobile-optimized budget experience at `/budgets`. All groups (A–G) complete. 303 backend + 557 frontend tests. Merged (PR #10).
- **Budget Heatmap View** — Mobile-only 6-month heatmap as pane 0 in `HorizontalSwipeContainer`. All groups (A–F) complete. 607 frontend tests. Merged (PR #11).
- **Heatmap Refinements** — 6 visual/interaction improvements to `HeatmapView` + `WindowPicker`. 625 frontend tests. Merged (PR #12).
- **Net Worth Phases 0–2** — Holdings sync pipeline (PR #3), NW by account type + CAGR (PR #4), NW milestones + retirement tracker (PR #5). All merged.
- **Phase 2.1 — Dual-View Milestone Hero Card** — `MilestoneHeroCard` (Cards + Skyline views) between TypeStackedChart and AccountsBreakdown. Investable capital (Retirement + Brokerage) is the correct baseline. ReferenceLine loop removed from TypeStackedChart. New files: `milestoneUtils.js`, `useMilestoneData.js`, `MilestoneHeroCard.jsx/.module.css`, `MilestoneCardsView.jsx/.module.css`, `MilestoneSkylineView.jsx/.module.css`. New tokens: `--green-tint`, `--amber-tint` in `index.css`. New constant: `COLOR_ACCENT_LIGHT` in `chartUtils.jsx`. Implementation in progress (not yet committed).

## Active
None — Phase 2.1 implementation complete (pending commit/PR).

## Roadmap — Net Worth + Investments + Forecasting

Full requirements: `plans/investment-forecasting-requirements.md`

### Build Order (foundation-first, ship incrementally)

| Phase | Scope | Size | Depends On | Status |
|-------|-------|------|------------|--------|
| **0** | Sync holdings data from Monarch API (new `holdings` DB table + pipeline) | M | — | **Done** (PR #3) |
| **1** | NW by account type + CAGR estimates on existing Net Worth page | M | 0 | **Done** (PR #4) |
| **2** | NW milestones + retirement target tracker on Net Worth page | M | 1 | **Done** (PR #5, merged) |
| **2.1** | Fix retirement tracker to use investable capital, not total NW | S | 2 | **Implementation complete — pending commit** |
| **B** | Backend decomposition — split `app.py` into route blueprints + service modules | M | — | **Planning complete — ready for implementation** |
| **3** | New Investments page — account-level performance dashboard + holdings drill-down | L | 0, B | **Planning complete — ready for implementation** |
| **4** | New Forecasting page — simple projections + retirement planner | L | 1, 2, B | **Planning complete — ready for implementation** |
| **5** | Monte Carlo simulation + AI narrative layer on Forecasting page | M | 4 | **Planning complete — ready for implementation** |
| **6** | Benchmark comparison vs S&P 500 (nice-to-have) | S | 3 | **Planning complete — ready for implementation** |

### Planning Pipeline Status (Fresh-Context Agents)

All planning uses fresh-context agents per CLAUDE.md — each step gets only written artifacts from prior steps, no accumulated context.

| Step | Description | Phase B | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|------|-------------|---------|---------|---------|---------|---------|
| 1. PM | Requirements | Done | Done | Done | Done | Done |
| 2. Research | Codebase exploration | Done | Done | Done | Done | Done |
| 3. Architect | Architecture decisions | Done | Done | Done | Done | Done |
| 3b. Designer | UI/UX design spec | N/A | Done | Done | Done | Done |
| 4. Engineer | Initial impl plan | Done | Done | Done | Done | Done |
| 5. Staff Review | Pressure-test plan | Done (8 findings) | Done (17 findings) | Done (14 findings) | Done (19 findings) | Done (15 findings) |
| 6. Engineer | Final corrected plan | Done | Done | Done | Done | Done |

### Phase 3 — New Investments Page

**Planning complete. Artifacts in `plans/`:**
- `phase3-requirements.md` — detailed requirements (5 user stories, acceptance criteria, edge cases)
- `phase3-research.md` — codebase exploration: holdings schema, page patterns, charting, design tokens, CAGR, navigation
- `phase3-architecture.md` — 8 architecture decisions with rationale and rejected alternatives
- `phase3-design-spec.md` — UI design: 7 components, account dashboard, donut chart, holdings table, drill-down, responsive behavior
- `phase3-impl-plan.md` — initial implementation plan
- `phase3-review.md` — staff review: 17 findings (2 Critical, 5 High, 6 Medium, 4 Low)
- `phase3-final-plan.md` — final corrected plan, ready for implementation

**Key decisions:** Three API endpoints (`/api/investments/summary`, `/<id>/holdings`, `/performance`), URL-based drill-down (`/investments/:accountId`), ComposedChart with merged contribution data (no separate `data` prop), per-account CAGR via batch helper (N+1 fix), `python-dateutil` for date arithmetic, `fetchJSON` extended with `.status` on thrown errors.

**Prerequisites:** Phase 0 (holdings sync — done, PR #3).

### Phase 4 — New Forecasting Page

**Planning complete. Artifacts in `plans/`:**
- `phase4-requirements.md` — detailed requirements (7 user stories, acceptance criteria, 13 edge cases)
- `phase4-research.md` — codebase exploration: retirement tracker, CAGR, investable capital, page patterns, charting, design tokens
- `phase4-architecture.md` — 12 architecture decisions with rationale and rejected alternatives
- `phase4-design-spec.md` — UI design: projection chart, interactive sliders, summary cards, gap analysis, responsive behavior
- `phase4-impl-plan.md` — initial implementation plan (12 new files, 4 modifications, 4 parallel tracks)
- `phase4-review.md` — staff review: 14 findings (1 Critical, 2 High, 9 Medium, 2 Low)
- `phase4-final-plan.md` — final corrected plan, ready for implementation

**Key decisions:** Frontend-only projection math (reuses `retirementMath.js`), no new backend endpoints, LineChart with 4 lines (historical solid + 3 dashed scenarios), balance-weighted blended CAGR as default return rate, `useMemo` for instant slider feedback, `SliderInput` reusable component, `getInvestableCapital()` extracted from RetirementPanel, `calculateContributionToTarget` has `Math.max(result, currentContribution)` floor guard.

**Prerequisites:** Phase 1 (CAGR — done), Phase 2 (Retirement tracker — done). Phase 2.1 (investable capital fix) ideally lands first but not blocking.

### Phase 5 — Monte Carlo Simulation + AI Narrative

**Planning complete. Artifacts in `plans/`:**
- `phase5-requirements.md` — detailed requirements (user stories, acceptance criteria, 13 edge cases)
- `phase5-research.md` — codebase exploration: `_call_ai()`, AIAnalysisPanel, account_history volatility, charting patterns
- `phase5-architecture.md` — 10 architecture decisions with rationale and rejected alternatives
- `phase5-design-spec.md` — UI design: view toggle, probability bands, ProbabilityBadge, ForecastAIPanel
- `phase5-impl-plan.md` — initial implementation plan (11 new files, 4 modifications, 4-level parallelism)
- `phase5-review.md` — staff review: 19 findings (3 Critical, 5 High, 7 Medium, 4 Low)
- `phase5-final-plan.md` — final corrected plan, ready for implementation

**Key decisions:** Backend Python NumPy GBM (5K sims, optional `seed` param for tests), portfolio-level volatility from `account_history` with 2-year date filter, log-return formula `log(balance[t] / (balance[t-1] + daily_contribution_approx))`, in-memory cache with `threading.Lock` (exact portfolio_value in key — no rounding), GBM adds monthly contribution after growth factor, ForecastAIPanel reuses `AIAnalysisPanel.module.css`, p50 median replaces simple projection in Advanced view, zero-balance forward-fill before log-return computation.

**Prerequisites:** Phase 4 (Forecasting page must exist).

### Phase 6 — Benchmark Comparison vs S&P 500

**Planning complete. Artifacts in `plans/`:**
- `phase6-requirements.md` — detailed requirements (4 user stories, acceptance criteria, edge cases)
- `phase6-research.md` — codebase patterns, S&P 500 data source evaluation (critical: Yahoo `^GSPC` access problematic, use SPY)
- `phase6-architecture.md` — 8 architecture decisions (Yahoo Finance SPY, benchmark_prices table, post-entity sync hook, 3 API endpoints)
- `phase6-design-spec.md` — UI design: benchmark toggle, overlay line, delta card, allocation targets modal, drift table
- `phase6-impl-plan.md` — initial implementation plan
- `phase6-review.md` — staff review: 15 findings (3 Critical, 4 High, 7 Medium, 1 Low)
- `phase6-final-plan.md` — final corrected plan, ready for implementation

**Stale (kept as reference only):** `phase6-impl-plan-final.md` — from old orchestrator session.

**Key decisions:** `_sync_benchmark_prices` called inside `async def _sync()` before `pipeline_conn.close()`, uses `storage.update_sync_log()` (not raw SQL), `datetime.fromtimestamp(ts, tz=timezone.utc)` (not deprecated `utcfromtimestamp`), AbortController for range-change fetch cancellation, `postJSON` for allocation targets save, O(n+m) forward-fill for benchmark normalization.

**Prerequisite:** Phase 3 must be complete before implementation begins.

### Phase B — Backend Modularization

**Problem:** `backend/app.py` is a 2,442-line Flask monolith combining route handlers, DB helpers, sync logic, AI integration, background scheduling, DDL, and startup code. This makes Phases 3–6 development error-prone and creates merge conflicts as all new routes land in the same file.

**Approach:** Blueprint split with a backward-compatible shim in `app.py`. The monolith is split into `db.py`, `ai.py`, `sync_core.py`, `token_auth.py`, and 9 route modules under `routes/`. The original `app.py` becomes a ~90-line shim that re-exports all public names — all 15 existing test files and `wsgi.py` require zero changes.

**Prerequisites:** Should land before Phases 3–6 begin. Decomposing first avoids merge conflicts as those phases add routes and logic.

**Size:** M — multi-file refactor, no new features, existing tests must keep passing.

**Planning complete. Artifacts in `plans/`:**
- `phase-b-research.md` — codebase exploration of `app.py` monolith
- `phase-b-architecture.md` — architecture decision: backward-compatible shim approach
- `phase-b-impl-plan.md` — initial implementation plan
- `phase-b-review.md` — staff review: 8 findings (3 Blockers, 5 Major)
- `phase-b-final-plan.md` — final corrected plan, ready for implementation

**Key resolutions from review:** Route modules use `import app as _app` and call `_app.get_db()` at call time (preserves all `patch("app.get_db", ...)` mocking), `db.DB_PATH` patch target in `test_db_improvements.py`, `_ai_cooldowns` + lock re-exported in shim, `routes/networth.py` uses `logging.getLogger(__name__)`, functions COPIED during steps 1–12 (originals removed only in step 13).

---

### Phase 2.1 — Retirement Tracker: Investable Capital Fix

**Problem:** Phase 2 placed milestone markers on the NW Over Time chart and compares nest egg targets against total net worth. This is incorrect — total NW includes home equity, vehicles, and other illiquid assets that don't fund retirement. A user with $1M NW but $400K in retirement accounts isn't on track for a $2M nest egg target, even though the chart makes it look close.

**Correct model:** Retirement readiness = **Retirement + Brokerage account balances** (investable/spendable capital). This is the sum that the 4% safe withdrawal rate applies to.

**Changes needed:**
1. **Move milestone ReferenceLines** from `NetWorthChart` → new `MilestoneHeroCard` component with two views (Cards + Skyline chart), plotted against Retirement + Brokerage bucket sum
2. **Nest egg / on-track calculation** compares against current Retirement + Brokerage balance (from `/api/networth/by-type` data), not total NW
3. **MilestoneCardsView** shows achievement dates, projected dates, and progress bars per milestone
4. **MilestoneSkylineView** shows Recharts AreaChart of investable capital history + dashed projection
5. **TypeStackedChart** — ReferenceLine loop removed; `milestones` prop removed

**What stays the same:** retirement_settings table, form inputs, MilestoneEditor, save/load flow, computeNestEgg math, backend endpoints.

**Size:** S — new frontend components, no new backend endpoints or tables.

**Status:** Implementation complete — pending commit/PR.

**Planning artifacts:**
- `phase2.1-impl-plan.md` — base implementation plan
- `phase2.1-impl-plan-final.md` — errata/corrections (20 findings from staff review)
- `phase2.1-design-spec.md` — UI design specification

### Future / Deferred
- FIRE number calculator (calculate financial independence number from expenses, show progress)

## Research (No-Go)
- **PostgreSQL Migration** — Evaluated and rejected. SQLite is the right fit for a single-user personal finance dashboard. See `postgres-migration-research.md` and `postgres-migration-architect-decision.md`.

## Known Bugs

| ID | File | Description | Root Cause |
|----|------|-------------|------------|
| BUG-001 | `frontend/src/components/chartUtils.test.jsx:62` | `fmtCompact > formats negative values` test fails — expected `-$50K`, got `-$50.0K` | `fmtCompact` uses `maximumFractionDigits: 1`, so round compact values include a trailing `.0`. Test regex `/-\$50K/` is too strict. Fix: update regex to `/-\$50(\.0)?K/`, or use `maximumSignificantDigits` to suppress trailing zero. |

## Tech Debt / Backlog
See `memory-decisions-archive.md` (parent dir) for decision history and rationale.
