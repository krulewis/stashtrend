# Phases 3-4 Integration: Architecture Decision Document

**Date:** 2026-03-12
**Author:** Architect Agent
**Status:** Ready for engineering plan
**Change Size:** M

---

## Decision Summary

This work fixes a scope gap: Phase 3-4 frontend components exist but the backend `investments.py` route file was never created during the merge, and all Phase 3-4 code lacks test coverage. The chosen approach creates `backend/routes/investments.py` following the established Blueprint pattern (matching `retirement.py`, `budgets.py`, etc.), registers it in `routes/__init__.py`, adds backend tests in `test_investments.py`, adds frontend tests for all 12 untested components/utilities, and extends `retirementMath.test.js` for the three new Phase 4 functions. All work follows existing patterns exactly -- no new infrastructure, no new test frameworks, no new mocking strategies.

---

## Critical Finding: `investments.py` Does Not Exist

The codebase research report describes `backend/routes/investments.py` as a 542-line file with three endpoints and a `current_app` bug. **This file does not exist on disk.** The `backend/routes/` directory contains 9 route modules (setup, settings, retirement, groups, budgets, networth, sync, ai_routes, budget_builder) but no `investments.py`. The `routes/__init__.py` file imports and registers 9 blueprints -- investments is not among them.

The frontend `api.js` defines three investment fetch functions (`fetchInvestmentsSummary`, `fetchInvestmentsHoldings`, `fetchInvestmentsPerformance`) pointing at endpoints that do not exist. The frontend components (`InvestmentsPage.jsx`, `InvestmentAccountsTable.jsx`, etc.) are fully implemented and import these API functions. They will render error states at runtime because every API call returns a 404.

**Implication:** The scope must include creating `investments.py`, not just fixing a bug in it. The research reports' description of the file's contents (endpoints, SQL queries, helpers, the `current_app` bug) should be treated as a specification for what to build, not a description of existing code.

---

## Chosen Approach

### 1. Backend Route Creation: `backend/routes/investments.py`

**Description:** Create `investments.py` as a Flask Blueprint module with three endpoints:

- `GET /api/investments/summary` -- returns all investment accounts with computed metrics (value, return, CAGR, allocation weight, staleness)
- `GET /api/investments/accounts/<id>/holdings` -- returns holdings detail for a specific account with allocation breakdown and totals
- `GET /api/investments/performance` -- returns time-series performance data with contribution detection

Follow the exact module structure of existing routes:
```python
import logging
from flask import Blueprint, jsonify, request
import app as _app

logger = logging.getLogger(__name__)
bp = Blueprint("investments", __name__)
```

Use `logger.exception(...)` in all `except Exception` handlers (not `current_app.logger`). Use `_app.get_db()` for database access. Use `INVESTMENT_TYPES = {"brokerage", "investment", "retirement"}` for account filtering.

**Rationale:** The module-level logger pattern is context-free (works in tests without a pushed Flask app context), simpler (no additional import), and consistent with how the module's own logging is structured. Every other route module uses `import app as _app` for DB access -- this must be followed for `patch("app.get_db", ...)` to work in tests.

**Alignment with Success Criteria:**
- SC1 (No runtime errors): Creating the file eliminates 404s on all three endpoints
- SC2 (No import errors): Using `logger` instead of `current_app.logger` prevents the `NameError` from ever being introduced
- SC8 (Phase B shim intact): Following `import app as _app` + `_app.get_db()` preserves the re-export chain
- SC9 (App starts without errors): Blueprint registration ensures clean startup

### 2. Blueprint Registration

**Description:** Add to `backend/routes/__init__.py`:
```python
from routes.investments import bp as investments_bp
```
And in `register_blueprints()`:
```python
app.register_blueprint(investments_bp)
```

No re-exports needed in `app.py` -- the investments helpers (`_get_investment_account_ids`, `_compute_all_cagrs`, `_normalize_security_type`) are internal to the Blueprint. No existing test imports symbols from investments.

### 3. Backend Test Architecture: `backend/tests/test_investments.py`

**Description:** One test file, three `unittest.TestCase` classes:

- `TestInvestmentsSummary` -- tests for `GET /api/investments/summary`
- `TestInvestmentsHoldings` -- tests for `GET /api/investments/accounts/<id>/holdings`
- `TestInvestmentsPerformance` -- tests for `GET /api/investments/performance`

**Fixture strategy:**
- Use `make_test_db()` from `test_helpers.py` for every test (fresh in-memory DB)
- Seed test data via direct `INSERT` statements in each test method (matching `test_retirement.py` pattern)
- Patch `"app.get_db"` -- same target as all existing tests, works because `investments.py` calls `_app.get_db()` and `_app` is the `app` module
- For error handler tests: use `MagicMock` with `execute.side_effect = Exception("DB error")` to trigger the `except` path

**Test cases per endpoint:**

`/api/investments/summary`:
- Happy path: 2-3 seeded investment accounts, verify response shape, computed metrics
- Empty: no investment accounts, verify `accounts: [], totals: {...}` (not error)
- Mixed types: seed investment + non-investment accounts, verify filtering
- NULL basis: holdings with NULL cost_basis, verify graceful handling
- Error path: DB exception returns 500 JSON

`/api/investments/accounts/<id>/holdings`:
- Happy path: seeded account with holdings, verify response structure
- No holdings: valid account, no holdings rows
- Invalid ID: non-existent account_id returns 404
- Non-investment account: checking account ID returns 404
- Error path: DB exception returns 500

`/api/investments/performance`:
- Happy path: account_history data, verify time-series response
- Range parameter: test '3m', '1y', 'all' filtering
- No data: empty history returns empty series
- Contribution detection: transactions with transfer category appear in contributions
- Error path: DB exception returns 500

**Rationale:** This mirrors `test_retirement.py` exactly in structure (TestCase classes, setUp with test_client, patch pattern). Each test is self-contained with its own seeded data -- no shared state, no ordering dependencies. The `make_test_db()` function applies full schema including `holdings`, `account_history`, `transactions`, and `categories` tables.

### 4. Frontend Test Architecture

**Description:** Create test files co-located with their components (matching existing pattern). All tests use Vitest + React Testing Library + behavioral assertions. No snapshot tests.

**Mocking strategy (uniform across all component tests):**
- `vi.mock('recharts')` for any component using Recharts (InvestmentPerformanceChart, AllocationChart, ForecastingChart)
- `vi.mock('../hooks/useResponsive', ...)` returning `{ isMobile: false, isTablet: false, isDesktop: true }`
- `vi.mock('react-router-dom', ...)` for components using `useNavigate`, `useParams`, `Link`
- `mockFetch()` from `src/test/fixtures.js` for page-level components that fetch data
- No mocking needed for pure components (SliderInput, ForecastingControls, ForecastingSummary, AccountDetailHeader) -- just pass props directly

**Test files and scope:**

| File | Component Type | Key Tests |
|------|---------------|-----------|
| `InvestmentAccountsTable.test.jsx` | Data table, no fetch | Renders accounts, sort columns, empty state, loading skeleton, group headers (Retirement/Brokerage), footer totals, NULL value handling |
| `InvestmentPerformanceChart.test.jsx` | Chart + controls | Loading skeleton, error state, empty data, range buttons render, y-mode toggle ($/%),  contribution toggle, account chips |
| `AccountDetailHeader.test.jsx` | Display, no fetch | Account name/institution display, metrics row, back link, stale badge, N/A for null values |
| `HoldingsTable.test.jsx` | Data table, no fetch | Renders holdings, sort columns, type filter dropdown, empty state (with filter), footer totals, manual badge, NULL ticker |
| `AllocationChart.test.jsx` | Pie chart | Empty state, loading state, legend items render, allocation data passed |
| `ForecastingChart.test.jsx` | Line chart | Chart title, range selector renders, empty/loading states, sr-only summary |
| `ForecastingControls.test.jsx` | Form with sliders | Both sliders render with correct labels, reset button calls handler, defaults note + CAGR warning render when provided |
| `ForecastingSummary.test.jsx` | Display cards | On-track badge, off-track badge, 4 metric cards, gap analysis text, setup prompt when no settings, edit button |
| `ForecastingSetup.test.jsx` | Form | Validation (missing ages, target <= current), required fields, advanced toggle shows extra fields, save button calls onSave with correct shape, loading state disables button |
| `SliderInput.test.jsx` | Reusable input | Renders label, slider and text input, text commit on blur, clamping to min/max, format function applied |
| `retirementMath.test.js` (extend) | Pure functions | `getInvestableCapital`: sums Retirement+Brokerage, null series, empty series. `computeBlendedCAGR`: balance-weighted, fallback to 7.0, single bucket. `calculateContributionToTarget`: on-track returns current, zero return rate, negative shortfall |

**Page-level tests (InvestmentsPage, ForecastingPage):** These are complex orchestration components with multiple fetches and state management. Testing them at the unit level would require extensive mocking of API calls and child components. The architecture decision is to **defer page-level integration tests** and instead test all child components thoroughly with props. The page-level behavior (loading -> data -> render children) will be covered by Playwright QA in the workflow. If the engineer deems page-level unit tests feasible with minimal additional effort, they may add them, but they are not required.

### 5. Existing Test Updates

**Description:** Verify (do not preemptively change) existing tests. Based on codebase research:

- `Sidebar.test.jsx` already asserts 7 nav items (confirmed, line 16) -- no change needed
- `App.test.jsx` has a stale comment ("5 NAV_ITEMS" at line 51) but assertions check all 7 items -- no change needed, comment is cosmetic
- `BottomTabBar.test.jsx` needs verification -- check if it asserts item count

If any existing test fails due to the new Blueprint registration, fix it as part of this work. But the research indicates no breakage is expected.

### 6. `fetchJSON` Status Attachment and `RangeSelector` Value Selection

Both were confirmed implemented by codebase research:
- `fetchJSON` attaches `.status` to thrown errors (confirmed in `api.js` lines 3-11)
- `RangeSelector` passes `r.value` (used by InvestmentPerformanceChart's INVEST_RANGES which have both `label` and `value` keys)

No action needed.

---

## Rejected Alternatives

### Alternative 1: Import `current_app` Instead of Using Module-Level Logger

**What:** Add `current_app` to the Flask import line and keep `current_app.logger.exception(...)` calls.

**Why rejected:** While `current_app.logger` works inside route handlers (which always have a request context), using `current_app` creates a tight coupling to Flask's application context. The module already defines `logger = logging.getLogger(__name__)` on line 10, which is context-free and works in any execution context (tests, background threads, import time). Using the module-level logger is also what Flask's own documentation recommends for Blueprint modules in larger applications. Adding an import to fix a bug when a better solution is already defined in the same file would be technically correct but architecturally inferior.

### Alternative 2: Create Separate Test Files Per Endpoint (3 Backend Test Files)

**What:** Create `test_investments_summary.py`, `test_investments_holdings.py`, `test_investments_performance.py` instead of one `test_investments.py`.

**Why rejected:** The existing codebase uses one test file per route module (`test_retirement.py` covers both GET and POST, `test_budgets.py` covers all budget endpoints). Splitting into three files would break this convention without adding value. The three endpoints share the same fixture setup pattern (seed accounts + holdings + account_history into `make_test_db()`), so having them in one file reduces boilerplate. Test isolation is achieved through fresh `make_test_db()` calls per test, not through file separation.

### Alternative 3: Use MSW (Mock Service Worker) for Frontend API Mocking

**What:** Replace `mockFetch()` with MSW for more realistic request interception in frontend tests.

**Why rejected:** The existing codebase has 50+ test files all using the `mockFetch()` pattern from `src/test/fixtures.js`. Introducing MSW for just these components would create an inconsistent testing approach. MSW adds real value when: (a) many tests share the same API handlers, (b) Playwright tests need the same mock server, or (c) the team wants response shape validation. None of these apply here. The `mockFetch()` pattern is simple, established, and sufficient for component-level tests that need to control API responses.

### Alternative 4: Add Page-Level Integration Tests for InvestmentsPage and ForecastingPage

**What:** Create `InvestmentsPage.test.jsx` and `ForecastingPage.test.jsx` with full API mocking to test the loading -> data -> render flow.

**Why rejected for mandatory scope:** These pages are orchestration components with complex state (InvestmentsPage has 10+ `useState` hooks, ForecastingPage has 15+ `useMemo` derivations). Testing them at the unit level requires mocking 3+ API calls, routing context, and asserting on deeply nested child component output. The ROI is low compared to: (a) thoroughly testing each child component with direct prop injection, and (b) Playwright QA exercising the real page. If the engineer finds these tests are tractable with reasonable effort, they may add them, but they are not required for this integration task.

### Alternative 5: Contract Testing Between Backend and Frontend

**What:** Define an OpenAPI schema or Pact contract for investment endpoints and validate both backend responses and frontend mock data against it.

**Why rejected:** No existing contract testing infrastructure in the project. The overhead of setting up OpenAPI validation or Pact for three endpoints in a single-developer project exceeds the benefit. The risk of mock shape drift is addressed by having both backend tests (verifying real response shape) and frontend tests (verifying component behavior with mock data shaped like the real response) -- a mismatch will surface as a UI bug during Playwright QA.

---

## Design Details

### Data Model Changes

None. All tables (`accounts`, `account_history`, `holdings`, `transactions`, `categories`) already exist in the pipeline schema. No new tables or columns are needed.

### API Contract (New Endpoints)

**`GET /api/investments/summary`**
```json
{
  "accounts": [
    {
      "id": "string",
      "name": "string",
      "institution": "string",
      "type": "string",
      "subtype": "string|null",
      "bucket": "Retirement|Brokerage",
      "current_value": "number",
      "total_cost_basis": "number|null",
      "total_return_dollars": "number|null",
      "total_return_pct": "number|null",
      "cagr_pct": "number|null",
      "allocation_weight_pct": "number",
      "is_stale": "boolean",
      "stale_days": "number"
    }
  ],
  "totals": {
    "current_value": "number",
    "total_return_dollars": "number|null",
    "total_return_pct": "number|null",
    "cagr_pct": "number|null"
  }
}
```

Note: The `bucket` field must be computed per-account. The frontend groups by `a.bucket === 'Retirement'` (InvestmentAccountsTable.jsx line 73). The mapping is: account `type === 'retirement'` maps to bucket `'Retirement'`; all other investment types map to `'Brokerage'`. This was identified as a secondary bug in the codebase research -- the research describes `investments.py` as never computing a `bucket` field, causing all accounts to land in "Brokerage". Since we are creating the file fresh, we include `bucket` from the start.

**`GET /api/investments/accounts/<id>/holdings`**
```json
{
  "account": {
    "id": "string",
    "name": "string",
    "institution": "string",
    "bucket": "string",
    "last_synced_at": "string|null"
  },
  "holdings": [
    {
      "ticker": "string|null",
      "security_name": "string|null",
      "security_type": "string",
      "quantity": "number|null",
      "cost_basis": "number|null",
      "current_value": "number",
      "unrealized_gain_loss_dollars": "number|null",
      "unrealized_gain_loss_pct": "number|null",
      "is_manual": "number"
    }
  ],
  "allocation": [
    { "type": "string", "value": "number", "pct": "number" }
  ],
  "totals": {
    "current_value": "number",
    "total_cost_basis": "number|null",
    "unrealized_gain_loss_dollars": "number|null",
    "unrealized_gain_loss_pct": "number|null",
    "holdings_count": "number"
  }
}
```

Returns 404 if account_id is not found or is not an investment account.

**`GET /api/investments/performance?range=1y&accounts=`**
```json
{
  "series": [
    {
      "date": "string",
      "total": "number",
      "accounts": { "<account_id>": "number" }
    }
  ],
  "contributions": [
    { "month": "string", "total": "number" }
  ],
  "account_names": { "<account_id>": "string" }
}
```

### Component Structure

No new components. All frontend components already exist. Tests are added alongside them.

### Integration Points

- `investments.py` -> `app.py` via `import app as _app` (DB access)
- `routes/__init__.py` registers `investments_bp`
- `app.py` does NOT re-export any investments symbols (none needed)
- Frontend `api.js` already defines the three fetch functions pointing at the correct URLs
- `make_test_db()` already includes `holdings` table DDL from pipeline schema

---

## Risks and Mitigations

### Risk 1: SQL Query Correctness (Medium)

The investment endpoints require non-trivial SQL (CAGR computation over account_history, contribution detection via transactions/categories join, allocation aggregation). The queries described in the research report were analyzed against the schema and found correct, but they are being implemented from specification, not copied from working code.

**Mitigation:** Backend tests seed realistic data and verify computed values (not just response shape). CAGR computation should be tested with known inputs/outputs. The 30-row minimum for CAGR should be tested with both sufficient and insufficient data.

### Risk 2: `bucket` Field Mapping (Low)

The frontend groups accounts by `bucket === 'Retirement'`. The mapping logic (type `retirement` -> bucket `Retirement`, else `Brokerage`) is straightforward but was never tested in the original implementation (since the file didn't exist).

**Mitigation:** Backend tests explicitly verify the `bucket` field in the response for different account types.

### Risk 3: Frontend Tests May Need Router Context (Low)

Components like `InvestmentAccountsTable` use `useNavigate()` and `AccountDetailHeader` uses `<Link>`. These require `MemoryRouter` wrapping in tests.

**Mitigation:** Established pattern exists in the codebase (e.g., `App.test.jsx` wraps with `MemoryRouter`). The engineer should follow this pattern. If `vi.mock('react-router-dom')` is simpler for isolated component tests, that is also acceptable.

### Risk 4: Performance Endpoint Range Filtering Logic (Low-Medium)

The `range` query parameter controls date filtering. Mapping '3m', '6m', '1y', '3y', '5y', 'all' to date cutoffs requires timezone-aware date arithmetic in Python. SQLite date functions work differently from PostgreSQL.

**Mitigation:** Test each range value explicitly. Use `datetime.date.today()` minus `relativedelta` or manual month arithmetic. Test edge case where range exceeds available data (should return all available data, not error).

### Risk 5: Test Data Seeding Complexity (Low)

Investment endpoint tests require seeding across 4 tables (accounts, holdings, account_history, transactions). This is more complex than retirement tests (1 table) but the same pattern applies.

**Mitigation:** Create a helper function within `test_investments.py` (e.g., `_seed_investment_data(db)`) that inserts a standard set of accounts/holdings/history. Individual tests can then add or modify specific records.

---

## Open Questions

### OQ1: `_get_bucket` Reuse vs. `INVESTMENT_TYPES` Set (Needs Engineer Input)

The `networth.py` module defines `_get_bucket(account_type)` which maps account types to display buckets. This function is re-exported via `app.py`. Should `investments.py` import and reuse `_get_bucket` (via `_app._get_bucket()`), or define its own simpler mapping?

**Recommendation:** Use `_app._get_bucket()` for consistency. If the bucket mapping ever changes, both modules stay in sync. However, if `_get_bucket` returns buckets that don't match what `InvestmentAccountsTable` expects ("Retirement" vs something else), the engineer should define the mapping locally.

### OQ2: `categories.group_type = 'transfer'` Correctness (Needs Verification at Implementation Time)

The contribution detection query joins `transactions` with `categories` on `group_type = 'transfer'`. The research confirmed `group_type TEXT` exists in the categories table. However, the actual values stored depend on the Monarch pipeline's data. The engineer should verify by examining real data or the pipeline code to confirm 'transfer' is the correct value for identifying contributions/transfers.

### OQ3: Account `last_synced_at` Source (Needs Engineer Input)

The holdings endpoint needs `last_synced_at` for the staleness badge. This could come from:
- (a) The `holdings` table's `synced_at` column (per-holding sync time)
- (b) The `sync_run_log` table's most recent successful sync for the 'holdings' entity
- (c) The `accounts` table (if it has a sync timestamp -- it does not based on schema)

**Recommendation:** Use `MAX(holdings.synced_at)` for the account, since it reflects when the most recent holding data was actually refreshed for that specific account.

---

## Parallelism Tags

The following work streams are independent and can be executed in parallel:

| Stream | Files | Dependencies |
|--------|-------|-------------|
| **A: Backend route + tests** | `backend/routes/investments.py`, `backend/routes/__init__.py`, `backend/tests/test_investments.py` | None |
| **B: Investment component tests** | `InvestmentAccountsTable.test.jsx`, `InvestmentPerformanceChart.test.jsx`, `AccountDetailHeader.test.jsx`, `HoldingsTable.test.jsx`, `AllocationChart.test.jsx` | None (components exist, tests only need props) |
| **C: Forecasting component tests** | `ForecastingChart.test.jsx`, `ForecastingControls.test.jsx`, `ForecastingSummary.test.jsx`, `ForecastingSetup.test.jsx`, `SliderInput.test.jsx` | None |
| **D: retirementMath tests** | `retirementMath.test.js` (extend) | None |

All four streams have zero file overlap and zero data dependencies. They can be assigned to separate implementer agents.

---

## Scope Summary

### What Will Be Built

1. **Create** `backend/routes/investments.py` -- 3 endpoints, helpers, Blueprint
2. **Update** `backend/routes/__init__.py` -- register investments Blueprint
3. **Create** `backend/tests/test_investments.py` -- 15-20 test cases across 3 endpoint groups
4. **Create** 10 frontend test files for Phase 3-4 components
5. **Extend** `retirementMath.test.js` with 3 new `describe` blocks (9-12 test cases)
6. **Verify** existing tests pass without modification

### What Will NOT Be Built

- No new frontend components
- No new API endpoints beyond the 3 investment endpoints
- No page-level integration tests (deferred to Playwright QA)
- No MSW, no snapshot tests, no contract testing
- No Phase B structural changes
- No Phase 5/6 features
