# Phases 3-4 + Phase B Integration -- Requirements Document

**Date:** 2026-03-12
**Author:** PM Agent
**Status:** Ready for research + architecture pipeline
**Size:** L
**Context:** Merging Phase B (backend modularization) into the Phases 3-4 (investments + forecasting) branch

---

## 1. Clarified Intent

Phases 3 (Investments Page) and 4 (Forecasting Page) were implemented against the old monolithic `backend/app.py`. Phase B decomposed that monolith into Blueprint modules under `backend/routes/`. These two lines of work happened on separate branches. An implementer agent has already resolved the merge conflicts by extracting investment endpoints into `backend/routes/investments.py` and cleaning up `app.py` to the Phase B shim form.

The goal is to ensure the integrated codebase is correct, complete, and shippable -- all Phase B modularization is intact, all Phase 3-4 features work on top of the modularized backend, tests pass, and no regressions exist.

The architect should decide the scope of validation, testing, and any additional integration work needed.

---

## 2. What Has Been Done (Current State)

### 2.1 Phase B -- Backend Modularization (COMPLETE, merged into branch)

The monolithic `app.py` (2,442 lines) has been split into:
- `backend/app.py` -- thin shim (~107 lines): Flask app creation, CORS, error handler, backward-compatible re-exports, Blueprint registration, `_startup()`
- `backend/db.py` -- database helpers (get_db, get_db_connection, DASHBOARD_DDL, etc.)
- `backend/ai.py` -- AI infrastructure (_call_ai, _get_ai_key, etc.)
- `backend/routes/__init__.py` -- Blueprint registration (10 blueprints)
- `backend/routes/` -- 10 route modules: setup, settings, retirement, groups, budgets, networth, sync, ai_routes, budget_builder, investments

### 2.2 Phase 3 -- Investments Page (IMPLEMENTED)

**Backend** (`backend/routes/investments.py`, 542 lines):
- `GET /api/investments/summary` -- all investment accounts with metrics, CAGR, staleness
- `GET /api/investments/accounts/<id>/holdings` -- holdings detail with allocation and totals
- `GET /api/investments/performance` -- time-series with contribution detection
- Helper functions: `_get_investment_account_ids`, `_compute_all_cagrs`, `_normalize_security_type`
- Uses `import app as _app` pattern and calls `_app.get_db()` (Phase B convention)

**Frontend** (all files exist):
- `InvestmentsPage.jsx` + `.module.css` -- page with dashboard/drill-down views
- `InvestmentAccountsTable.jsx` + `.module.css`
- `InvestmentPerformanceChart.jsx` + `.module.css`
- `AccountDetailHeader.jsx` + `.module.css`
- `HoldingsTable.jsx` + `.module.css`
- `AllocationChart.jsx` + `.module.css`
- Routes: `/investments` and `/investments/:accountId` in `App.jsx`
- Nav entry in `nav.js` at index 1

### 2.3 Phase 4 -- Forecasting Page (IMPLEMENTED)

**Backend:** No new endpoints needed (uses existing `/api/networth/by-type` and `/api/retirement`)

**Frontend** (all files exist):
- `ForecastingPage.jsx` + `.module.css`
- `ForecastingChart.jsx` + `.module.css`
- `ForecastingControls.jsx` + `.module.css`
- `ForecastingSummary.jsx` + `.module.css`
- `ForecastingSetup.jsx` + `.module.css`
- `SliderInput.jsx` + `.module.css` (reusable component)
- Math functions in `retirementMath.js` (getInvestableCapital, computeBlendedCAGR, calculateContributionToTarget)
- Route: `/forecasting` in `App.jsx`
- Nav entry in `nav.js` at index 5

### 2.4 Merge Conflict Resolution (DONE)

The implementer has:
- Resolved all merge conflicts (no `<<<<<<<` markers remain)
- Extracted investment endpoints from the monolith into `backend/routes/investments.py`
- Registered the investments Blueprint in `routes/__init__.py`
- Cleaned `app.py` to the Phase B shim form

---

## 3. Known Issues Identified During Review

### 3.1 Bug: Missing `current_app` Import in `investments.py`

`backend/routes/investments.py` uses `current_app.logger.exception(...)` in three exception handlers (lines 254, 402, 538) but does NOT import `current_app` from Flask. The import line reads:

    from flask import Blueprint, jsonify, request

This will cause a `NameError` at runtime when any endpoint hits an exception path. Fix: either add `current_app` to the import, or use `logger` (the module-level logger already defined on line 10).

### 3.2 No Backend Tests for Investment Endpoints

There is no `test_investments.py` in `backend/tests/`. The Phase 3 final plan specified backend tests, but they were not created during implementation. The investment endpoints have zero test coverage.

### 3.3 No Frontend Tests for Phase 3-4 Components

No test files exist for any Phase 3 or Phase 4 components:
- No `InvestmentsPage.test.jsx`, `InvestmentAccountsTable.test.jsx`, etc.
- No `ForecastingPage.test.jsx`, `ForecastingChart.test.jsx`, etc.
- No `retirementMath.test.js` additions for the three new functions
- No `SliderInput.test.jsx`

The existing `retirementMath.test.js` covers the Phase 2 functions but not the Phase 4 additions.

### 3.4 Existing Test Assertions May Be Stale

Tests that assert navigation item counts or labels may fail:
- `Sidebar.test.jsx`, `BottomTabBar.test.jsx` -- may expect 5 items instead of 7
- `App.test.jsx` -- may lack mocks/assertions for InvestmentsPage and ForecastingPage routes

### 3.5 `api.js` -- Verify `fetchJSON` Status Attachment

Phase 3 plan required `fetchJSON` to attach `.status` to thrown errors. The drill-down view depends on `err.status === 404` for account-not-found handling. Verify this change was implemented.

### 3.6 `RangeSelector` -- Verify Value-Based Selection

Phase 3 plan required `RangeSelector` to pass `r.value` (not `r.label`) to `onSelect`. This was needed for the investments performance chart. Verify this was implemented and that existing callers (other charts) still work.

---

## 4. Success Criteria

1. **No runtime errors:** All 3 investment endpoints return correct JSON responses when called with valid and invalid inputs
2. **No import errors:** `current_app` import bug in `investments.py` is fixed
3. **Backend tests exist and pass:** Investment endpoint test coverage (happy path, edge cases, error states)
4. **Frontend tests exist and pass:** Component tests for all Phase 3 and Phase 4 components
5. **Existing tests pass:** All pre-existing backend and frontend tests pass without modification (or with minimal updates for nav item count changes)
6. **Navigation works:** All 7 nav items render correctly in sidebar and bottom tab bar
7. **Routing works:** `/investments`, `/investments/:accountId`, and `/forecasting` routes render correct pages
8. **Phase B shim intact:** `app.py` re-exports work correctly; `import app as _app` pattern in routes works; all `patch("app.X", ...)` patterns in tests still function
9. **App starts without errors:** `_startup()` runs cleanly, all Blueprints register
10. **No dead code from merge:** No leftover monolith functions in `app.py` that should have been removed

---

## 5. Constraints and Anti-Goals

### Constraints
- Must not modify the Phase B shim architecture (backward-compatible re-exports in `app.py`)
- Must follow the `import app as _app` / `_app.get_db()` pattern established by Phase B for route modules
- All investment endpoints must live in `backend/routes/investments.py` (not in `app.py`)
- CSS must use design tokens (no hardcoded hex values)
- Tests use existing frameworks: `unittest` / `pytest` for backend, Vitest + React Testing Library for frontend

### Anti-Goals (what NOT to do)
- Do NOT implement Phase 5 (Monte Carlo) or Phase 6 (Benchmark) features
- Do NOT create new backend endpoints beyond what Phases 3-4 specified
- Do NOT refactor the Phase B module structure (it is done and working)
- Do NOT add mobile-specific components for investments or forecasting pages
- Do NOT modify the sync pipeline or holdings schema

---

## 6. Edge Cases and Error States

### Investment Endpoints
- No investment accounts exist (empty response, not error)
- Account has holdings with NULL basis (return "N/A" equivalents)
- Account has no holdings but has a current_balance (fallback to balance)
- Holdings last_synced_at is very old (staleness flags)
- Invalid account_id in holdings endpoint (404, not 500)
- Performance endpoint with unrecognized range param (default to 1y)
- Performance endpoint with account IDs that are not investment accounts (filter out silently)

### Forecasting Page
- No retirement settings saved (show setup form)
- No investment accounts / zero investable capital (distinguish null from $0)
- Historical CAGR exceeds slider max of 15% (clamp)
- Target age <= current age (show error message, no chart)
- Zero monthly contribution (single "Growth only" line, no +/-10% variants)

### Integration-Specific
- Blueprint registration order (investments blueprint must be registered)
- Re-export chain: `investments.py` -> `_app.get_db()` -> `db.get_db()` must work
- Test mock patching: `patch("app.get_db", ...)` must still work for investment tests

---

## 7. Deferred Decisions (for Architect)

1. **Scope of testing:** Should the architect prioritize backend tests, frontend tests, or both equally? Given zero test coverage on Phase 3-4 code, what is the minimum viable test set vs. comprehensive coverage?

2. **Integration testing strategy:** Should there be integration tests that exercise the full stack (Blueprint registration -> endpoint -> response), or are unit tests with mocked DB sufficient?

3. **Existing test updates:** How to handle `Sidebar.test.jsx`, `BottomTabBar.test.jsx`, and `App.test.jsx` that may assert stale nav item counts? Update inline or create a separate task?

4. **`current_app` fix strategy:** Should `investments.py` use `current_app` (Flask convention for Blueprints) or the module-level `logger` (already defined, simpler)? Other Phase B routes should be checked for consistency.

5. **Regression risk assessment:** Which files changed during merge conflict resolution are highest risk for subtle bugs (e.g., incorrect import paths, missing re-exports, broken mock targets)?

6. **Manual QA scope:** Should Playwright QA cover the investments page (data-dependent, requires seeded DB) or focus on the forecasting page (mostly client-side math, easier to test)?

---

## 8. Open Questions

1. **Were any Phase B re-exports missed for investment-related symbols?** The investments module introduces helpers (`_get_investment_account_ids`, `_compute_all_cagrs`, `_normalize_security_type`) that are NOT re-exported from `app.py`. Is this correct (they are internal to the investments blueprint), or should they be re-exported for test compatibility?

2. **Does `investments.py` need the `_get_bucket` function?** The original Phase 3 plan used `_get_bucket()` from the monolith to filter accounts. The implemented `investments.py` uses a simpler `INVESTMENT_TYPES` set check. Is this semantically equivalent? (It checks `type` directly rather than using the bucket mapping.)

3. **Is the contribution detection query correct?** The query joins `transactions` with `categories` on `group_type = 'transfer'`. This column name was flagged as needing verification in the Phase 3 plan. Has it been verified against the actual schema?

---

## 9. Scope Summary

### What Needs to Happen

1. **Fix the `current_app` import bug** in `backend/routes/investments.py`
2. **Write backend tests** for the three investment endpoints (architect decides scope)
3. **Write frontend tests** for Phase 3 components (InvestmentsPage, InvestmentAccountsTable, InvestmentPerformanceChart, AccountDetailHeader, HoldingsTable, AllocationChart)
4. **Write frontend tests** for Phase 4 components (ForecastingPage, ForecastingChart, ForecastingControls, ForecastingSummary, ForecastingSetup, SliderInput)
5. **Write unit tests** for new `retirementMath.js` functions (getInvestableCapital, computeBlendedCAGR, calculateContributionToTarget)
6. **Update existing tests** that assert nav item counts/labels (Sidebar, BottomTabBar, App)
7. **Verify `fetchJSON` status attachment** and `RangeSelector` value-based selection
8. **Verify all existing tests pass** with the integrated codebase
9. **Run the app** and verify all routes render without errors
10. **Update docs** (architecture.md, MEMORY.md, plans/index.md) per CLAUDE.md memory rules

### What Will NOT Be Built
- No new features beyond what Phases 3-4 specified
- No Phase 5 or Phase 6 work
- No Phase B structural changes
- No new backend endpoints
- No mobile-specific components
