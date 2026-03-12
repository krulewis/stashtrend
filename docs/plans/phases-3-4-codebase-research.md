# Phases 3-4 + Phase B Integration — Codebase Research

## 1. `backend/routes/investments.py` — Bug Analysis

### Primary Bug: `current_app` Used Without Import (Critical)

`investments.py` line 8 imports `import app as _app` but **never imports `current_app`** from Flask. Yet `current_app.logger.exception(...)` is called in all three exception handlers:

- Line 254: `current_app.logger.exception("Error in /api/investments/summary")`
- Line 402: `current_app.logger.exception("Error in /api/investments/holdings")`
- Line 538: `current_app.logger.exception("Error in /api/investments/performance")`

Every `except Exception` block in the module will itself raise a `NameError: name 'current_app' is not defined` instead of logging and returning the 500 response. The fix is to add `current_app` to the Flask import line (line 7) — the same pattern used by every other route module (`budget_builder.py`, `ai_routes.py`, `budgets.py`, `retirement.py`, `setup.py`, `networth.py`).

### Pattern Inconsistency: DB Access Via Module-Level `import app`

All other route modules use `import app as _app` and call `_app.get_db()` — `investments.py` follows this same pattern correctly for the happy path. The issue is only in the error handlers.

### Secondary Bug: `bucket` Field Not Populated in `/api/investments/summary` Response

`InvestmentAccountsTable.jsx` groups accounts by `a.bucket === 'Retirement'` vs. not (lines 73-74 of `InvestmentAccountsTable.jsx`). The backend `investments_summary()` never computes or returns a `bucket` field in the account objects it emits (verified: the word "bucket" does not appear anywhere in `investments.py`). This means all accounts will fall into the "Brokerage" group regardless of type. The `INVESTMENT_TYPES` set includes `"retirement"`, `"brokerage"`, and `"investment"` — but there is no logic mapping these to a display bucket in the JSON response.

### Account ID Type Consistency

The `holdings` endpoint (`investments_holdings`) receives `account_id` as a URL string parameter and does `if account_id not in valid_ids` where `valid_ids` is a list of string IDs from the `accounts` table (TEXT PRIMARY KEY). This is correct — accounts.id is TEXT.

### SQL Query Correctness vs. Schema

All queries align with the actual pipeline schema:
- `accounts` table: queried columns (`id`, `name`, `type`, `subtype`, `institution`, `current_balance`) — all defined in `schema.py` lines 13-29
- `account_history` table: queried columns (`account_id`, `date`, `balance`) — present in schema
- `holdings` table: queried columns (`ticker`, `security_name`, `quantity`, `basis`, `total_value`, `security_type`, `is_manual`, `last_synced_at`, `account_id`) — all defined in pipeline schema lines 74-88
- `transactions` JOIN `categories` on `category_id` with `categories.group_type = 'transfer'` — `group_type TEXT` column verified in `categories` table (schema.py line 40)
- `ORDER BY total_value DESC NULLS LAST` — valid SQLite syntax

### CAGR Logic: 30-Day Minimum

`_compute_all_cagrs` requires 30 rows with non-zero balance before computing CAGR. This matches the frontend tooltip text ("Requires at least 30 days of data") — consistent.

## 2. Existing Test Patterns

### Infrastructure

- **`test_helpers.py`**: `make_test_db(pipeline=True, dashboard=True)` creates in-memory SQLite with canonical DDL. All tests use this — schema never drifts.
- **Mock pattern**: Tests use `patch("app.get_db", return_value=make_db())` uniformly. Since `investments.py` calls `_app.get_db()` and `_app` is the `app` module, the patch target for investments tests must be `"app.get_db"` — same as all existing tests.
- **Test client pattern**: `app.test_client()` used universally; `setUp`/`tearDown` with `unittest.TestCase`.
- **No conftest.py**: Pure `unittest`, no pytest fixtures. All test files are self-contained.

### Existing tests that may be sensitive to Phase B refactor

- `test_networth_by_type.py` line 29: `from app import app, BUCKET_MAP, TYPE_MAP, BUCKET_ORDER, BUCKET_COLORS, _get_bucket` — these are re-exported from `routes.networth` via `app.py`. Already working.
- `test_pipeline_holdings.py` lines 342-358: imports `ENTITY_TABLE_MAP`, `ENTITY_RUN_ORDER` from `app` — re-exported from `routes.sync`. Already working.
- `test_retirement.py`: patches `app.get_db`. Works because `app.py` re-exports `get_db` from `db.py`.

No existing tests import from `routes.investments` directly — no breakage risk there.

## 3. Frontend Components

### InvestmentsPage.jsx

- API calls: `fetchInvestmentsSummary`, `fetchInvestmentsHoldings`, `fetchInvestmentsPerformance` — all defined in `api.js` pointing to `/api/investments/summary`, `/api/investments/accounts/:id/holdings`, `/api/investments/performance`. Matches backend routes exactly.
- Error handling: Distinguishes `err.status === 404` for the holdings endpoint. The backend does return 404 properly.
- No tests exist for this page.

### InvestmentAccountsTable.jsx

- **Bug reliance**: Groups by `a.bucket === 'Retirement'` but backend never emits `bucket` — all accounts land in "Brokerage" group silently. This is a frontend-visible defect but no runtime crash.
- PropTypes declare `bucket: PropTypes.string` (optional), so no prop warning either.

### ForecastingPage.jsx

- Uses only `fetchNetworthByType`, `fetchRetirement`, `saveRetirement` — all pre-existing endpoints, not Phase 3 endpoints. Fully decoupled from `investments.py`.
- No tests exist for this page or its 4 child components (`ForecastingChart`, `ForecastingControls`, `ForecastingSummary`, `ForecastingSetup`).

### Missing Component Tests (Zero)

Neither `InvestmentsPage.jsx` nor `ForecastingPage.jsx` nor any of the 9 Phase 3-4 sub-components have test files.

## 4. Nav/Routing Integration

### `frontend/src/nav.js`

7 items: Net Worth, Investments, Account Groups, Budgets, Budget Builder, Forecasting, Sync Data. Both Investments and Forecasting are already present.

### `frontend/src/App.jsx`

Routes registered:
- `/investments` → `InvestmentsPage`
- `/investments/:accountId` → `InvestmentsPage` (drill-down)
- `/forecasting` → `ForecastingPage`

Both routes are correctly registered.

### Tests That Assert Nav Item Count

`Sidebar.test.jsx` line 16: `it('renders all 7 nav items with correct labels', ...)` — explicitly checks for all 7 items including Investments and Forecasting. Test is already updated and **passes** for the current nav.

`App.test.jsx` line 51 has a stale comment saying "5 NAV_ITEMS" but the actual assertions at lines 59-65 check all 7 items. The comment is misleading but the test logic is correct.

## 5. Blueprint Registration

`backend/routes/__init__.py` imports `from routes.investments import bp as investments_bp` and calls `app.register_blueprint(investments_bp)`. This is correct and consistent with all other blueprints.

`backend/app.py` does not re-export any symbols from `routes.investments` (unlike `routes.networth`, `routes.sync` which have re-exports). This is fine — no existing test imports investment symbols from `app`.

## 6. Database Schema

All tables queried by `investments.py` exist:
- `accounts` (pipeline DDL, `schema.py`)
- `account_history` (pipeline DDL, `schema.py`)
- `holdings` (pipeline DDL, `schema.py` lines 74-88)
- `transactions` + `categories` (pipeline DDL, `schema.py`)

The `holdings` table has a `synced_at TEXT NOT NULL` constraint. Queries in `investments.py` never select `synced_at` directly — this constraint only matters for inserts (handled by pipeline, not the API). No issue.

---

## Summary for Pipeline Context Packet (≤500 words)

**Critical bugs in `investments.py`:**
1. `current_app` used in all three `except` blocks but never imported — `NameError` on any error path. Fix: add `current_app` to the `from flask import ...` line (line 7).
2. `bucket` field absent from `/api/investments/summary` response — `InvestmentAccountsTable.jsx` groups accounts by `bucket === 'Retirement'`; without this field all accounts fall into the "Brokerage" group. Fix: compute bucket per account from `type`/`subtype` before emitting the response.

**Zero tests for Phase 3-4 code:**
- No backend tests for any of the 3 investment endpoints.
- No frontend tests for `InvestmentsPage`, `ForecastingPage`, or any of the 9 child components (`InvestmentAccountsTable`, `InvestmentPerformanceChart`, `HoldingsTable`, `AllocationChart`, `AccountDetailHeader`, `ForecastingChart`, `ForecastingControls`, `ForecastingSummary`, `ForecastingSetup`).

**Test infrastructure is solid and consistent:**
- `make_test_db()` in `test_helpers.py` uses canonical DDL — no schema drift risk.
- Mock pattern is `patch("app.get_db", return_value=make_db())` — investment tests must use same target since `investments.py` calls `_app.get_db()` and `_app` is the `app` module.
- All tests use `unittest.TestCase` with `app.test_client()` — no pytest, no conftest.

**Nav/routing already integrated:**
- 7 items in `nav.js` including Investments and Forecasting.
- Both `/investments` and `/investments/:accountId` routes registered in `App.jsx`.
- `Sidebar.test.jsx` asserts all 7 nav labels — already correct.
- `App.test.jsx` has stale "5 NAV_ITEMS" comment (line 51) but test assertions check all 7 items correctly.

**Blueprint registration is correct:** `investments_bp` imported and registered in `routes/__init__.py`. No re-exports needed in `app.py`.

**Schema alignment confirmed:** All SQL queries in `investments.py` reference columns that exist in the pipeline schema. `categories.group_type` verified present. No schema drift.

**ForecastingPage is independent of `investments.py`:** Uses only `fetchNetworthByType`, `fetchRetirement`, `saveRetirement` — all pre-existing endpoints. No dependency on Phase 3 backend code.
