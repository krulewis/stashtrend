# Phases 3-4 Integration — Implementation Plan

**Date:** 2026-03-12
**Author:** Engineer Agent (Initial Plan)
**Status:** Ready for staff review
**Change Size:** M
**Streams:** 4 fully independent parallel work streams (A, B, C, D)

---

## Overview

This plan creates `backend/routes/investments.py` (which does not exist on disk despite being described by research as a 542-line file), registers it in `backend/routes/__init__.py`, and writes test coverage for all Phase 3-4 code that was implemented but never tested. The frontend components (`InvestmentsPage`, `ForecastingPage`, and all child components) already exist and are correct — this plan adds tests only, not new component code.

The work splits into four parallel streams with zero file overlap:

- **Stream A:** Backend route creation + Blueprint registration + backend tests
- **Stream B:** Investment component tests (5 new test files)
- **Stream C:** Forecasting component tests (5 new test files)
- **Stream D:** `retirementMath.test.js` extensions (3 new `describe` blocks)

`python-dateutil` is already in `backend/requirements.txt` (line 9) — no requirements change needed.

---

## Deviations from Architecture

1. **`_get_bucket` reuse (OQ1):** The architect asked whether `investments.py` should import `_app._get_bucket()` from `networth.py` via the `_app` module or define its own mapping. This plan uses `_app._get_bucket()` for consistency. The `BUCKET_MAP` in `networth.py` maps many retirement account subtypes (401k, ira, roth_ira, etc.) to "Retirement" and brokerage types to "Brokerage". Since `InvestmentAccountsTable.jsx` groups by `a.bucket === 'Retirement'`, reusing `_get_bucket` ensures the bucket assignment stays consistent with the rest of the app if Monarch adds new account types in the future. If `_app._get_bucket` returns values other than "Retirement"/"Brokerage" for an investment account, they will appear in the "Brokerage" group (since the frontend only checks `=== 'Retirement'`), which is an acceptable fallback.

2. **`last_synced_at` source (OQ3):** The architect recommended `MAX(holdings.synced_at)`. However, the pipeline schema (`schema.py`) uses `synced_at` as the column name in the `holdings` table (not `last_synced_at`). This plan uses `MAX(h.synced_at) AS last_synced_at` in the holdings endpoint query to match the schema column name while producing the response field name the frontend expects.

3. **Contribution detection column (OQ2):** Research confirmed `categories.group_type` exists in the schema. This plan uses `group_type = 'transfer'` per the Phase 3 final plan's specification. An inline comment in the backend code instructs the implementer to verify the actual value via `PRAGMA table_info(categories)` before finalizing.

4. **Stream B/C: no page-level unit tests:** The architect deferred `InvestmentsPage.test.jsx` and `ForecastingPage.test.jsx` to Playwright QA. This plan follows that decision. Child component tests cover all rendering logic; page orchestration is covered by Playwright.

5. **`_app._get_bucket` import path:** `networth.py` defines `_get_bucket` as a module-level function. It is re-exported from `app.py` via `from routes.networth import _get_bucket` (confirmed by codebase research: `test_networth_by_type.py` imports it from `app`). `investments.py` accesses it as `_app._get_bucket(account_type, account_subtype)` via the `import app as _app` pattern — consistent with how all route modules access shared app symbols.

---

## Changes

### Stream A — Backend Route Creation + Registration + Tests

---

#### Change A1: Create `backend/routes/investments.py`

```
File: /home/user/stashtrend/backend/routes/investments.py
Lines: new file (~320 lines)
Parallelism: independent
Description: Flask Blueprint implementing 3 investment endpoints. Uses module-level logger,
  import app as _app pattern, _app.get_db(), and _app._get_bucket() for bucket assignment.
```

Details:

**Module header (lines 1-15):**
```python
import logging
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request
import app as _app

logger = logging.getLogger(__name__)
bp = Blueprint("investments", __name__)

INVESTMENT_TYPES = {"brokerage", "investment", "retirement", "401k", "403b", "ira",
                    "roth_ira", "roth_401k", "sep_ira", "simple_ira", "pension",
                    "401a", "crypto", "hsa", "529", "education", "stock"}
```

**Helper: `_get_investment_accounts(conn)`** (lines 17-35):
- Queries all accounts from the `accounts` table
- Filters in Python to those whose `type` is in `INVESTMENT_TYPES`
- Returns list of dicts with keys: `id`, `name`, `institution`, `type`, `subtype`, `current_balance`
- Comment: "Filters all accounts in Python — O(all accounts). Acceptable for typical user account counts (< 20)."

**Helper: `_compute_all_cagrs(account_ids, conn)`** (lines 37-80):
- If `account_ids` is empty, returns `{}`
- Queries `account_history` in a single batch: `SELECT account_id, date, balance FROM account_history WHERE account_id IN (?, ...) ORDER BY account_id ASC, date ASC`
- Groups rows by `account_id` in Python using a `defaultdict(list)`
- For each account_id, applies CAGR logic:
  - Strips leading rows where `balance` is `None` or `<= 0`
  - If fewer than 30 non-zero-balance rows remain, result is `None`
  - Computes `elapsed_years = (latest_date - earliest_date).days / 365.25`
  - If `elapsed_years < 0.1`, result is `None`
  - Else: `cagr = round((latest_bal / earliest_bal) ** (1.0 / elapsed_years) - 1, 4) * 100`
  - All dates parsed with `datetime.strptime(row["date"], "%Y-%m-%d").date()`
- Returns `dict { account_id: cagr_pct_or_None, ... }`
- Comment: "Batch query — O(all investment accounts). Typical count < 20."

**Helper: `_normalize_security_type(raw_type)`** (lines 82-98):
- Maps raw security type strings to display categories
- Known mappings: `"equity"` / `"common stock"` → `"Stock"`, `"etf"` → `"ETF"`, `"mutual fund"` → `"Mutual Fund"`, `"fixed income"` / `"bond"` → `"Bond"`, `"cash"` / `"money market"` → `"Cash"`
- Default: `"Other"` for unrecognized types
- Case-insensitive comparison (lowercase input before matching)

**Endpoint: `GET /api/investments/summary`** (lines 100-175):
```python
@bp.route("/api/investments/summary")
def investments_summary():
    conn = _app.get_db()
    try:
        ...
    except Exception:
        logger.exception("Error in /api/investments/summary")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        conn.close()
```
Implementation steps:
1. Call `_get_investment_accounts(conn)` to get the list of investment accounts
2. If empty, return `{"accounts": [], "totals": {"current_value": 0, "total_return_dollars": None, "total_return_pct": None, "cagr_pct": None}}`
3. Extract `account_ids` list
4. Query holdings aggregated per account in a single SQL call:
   ```sql
   SELECT account_id,
          SUM(total_value) AS total_value,
          SUM(basis)       AS total_cost_basis,
          COUNT(*)         AS holdings_count,
          MAX(synced_at)   AS last_synced_at
   FROM holdings
   WHERE account_id IN (?, ...)
   GROUP BY account_id
   ```
5. Call `_compute_all_cagrs(account_ids, conn)` for CAGR dict
6. Build per-account result:
   - `current_value` = holdings total_value or `account["current_balance"]` as fallback if holdings_count = 0 or total_value is NULL
   - `total_cost_basis` = holdings total_cost_basis (None if NULL)
   - `total_return_dollars` = `current_value - total_cost_basis` if `total_cost_basis` is not None, else None
   - `total_return_pct` = `total_return_dollars / total_cost_basis * 100` if `total_cost_basis > 0` else None
   - `cagr_pct` = from cagr dict
   - `bucket` = `_app._get_bucket(account["type"], account["subtype"])`
   - `is_stale` = `last_synced_at` parsed and compared to `datetime.utcnow()`: `(now - parsed_dt).total_seconds() > 86400`
   - `stale_days` = `(now - parsed_dt).days` (or 0 if no last_synced_at)
7. Compute `portfolio_total = sum(a["current_value"] for a in accounts)`
8. For each account: `allocation_weight_pct = (account["current_value"] / portfolio_total * 100) if portfolio_total > 0 else 0`
9. Sort accounts by `current_value DESC`
10. Compute portfolio-level totals:
    - `current_value`: sum of all account current_values
    - `total_return_dollars`: sum of non-None per-account values, or None if all None
    - `total_return_pct`: from totals (return / basis * 100), or None
    - `cagr_pct`: weighted average of non-None per-account CAGRs weighted by current_value, or None
11. Return `jsonify({"accounts": [...], "totals": {...}})`

**Endpoint: `GET /api/investments/accounts/<account_id>/holdings`** (lines 177-260):
```python
@bp.route("/api/investments/accounts/<account_id>/holdings")
def investments_holdings(account_id):
    conn = _app.get_db()
    try:
        ...
    except Exception:
        logger.exception("Error in /api/investments/holdings")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        conn.close()
```
Implementation steps:
1. Call `_get_investment_accounts(conn)`; extract list of valid ids
2. Find the matching account dict or return `jsonify({"error": "Account not found"}), 404`
3. Query holdings: `SELECT ticker, security_name, quantity, basis, total_value, security_type, is_manual, synced_at FROM holdings WHERE account_id = ? ORDER BY total_value DESC NULLS LAST`, param = `account_id`
4. Query `MAX(synced_at)` for the account: `SELECT MAX(synced_at) AS last_synced_at FROM holdings WHERE account_id = ?`
5. Build holdings list — for each row:
   - `ticker`: row["ticker"]
   - `security_name`: row["security_name"]
   - `security_type`: `_normalize_security_type(row["security_type"])`
   - `quantity`: row["quantity"]
   - `cost_basis`: row["basis"]  (renamed from DB column)
   - `current_value`: row["total_value"]  (renamed from DB column)
   - `unrealized_gain_loss_dollars`: `row["total_value"] - row["basis"]` if `row["basis"] is not None` else None
   - `unrealized_gain_loss_pct`: `(gain_dollars / row["basis"]) * 100` if `row["basis"] is not None and row["basis"] != 0` else None
   - `is_manual`: row["is_manual"]
6. Build allocation from holdings grouped by normalized security_type:
   - Sum `total_value` per type
   - Compute `pct = type_value / total_holdings_value * 100`
   - Merge types where `pct < 2.0` into "Other" bucket
   - Guard: if after merging only "Other" remains, keep top 5 types and merge the rest into Other
   - Sort by value DESC
7. Compute totals:
   - `current_value`: sum of all `total_value`
   - `total_cost_basis`: sum of all `basis` where not None; or None if all None
   - `unrealized_gain_loss_dollars`: sum of non-None gain/loss values (or None if all None)
   - `unrealized_gain_loss_pct`: from totals (gain / basis * 100), or None
   - `holdings_count`: len(holdings)
8. Build account metadata:
   - `id`, `name`, `institution` from the matched account
   - `bucket` = `_app._get_bucket(account["type"], account["subtype"])`
   - `last_synced_at`: from MAX query result
9. Return `jsonify({"account": {...}, "holdings": [...], "allocation": [...], "totals": {...}})`

**Endpoint: `GET /api/investments/performance`** (lines 262-320):
```python
@bp.route("/api/investments/performance")
def investments_performance():
    conn = _app.get_db()
    try:
        ...
    except Exception:
        logger.exception("Error in /api/investments/performance")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        conn.close()
```
Implementation steps:
1. Parse `range` query param (default `'1y'`). Map to relativedelta:
   - `'3m'` → `relativedelta(months=3)`; `'6m'` → `relativedelta(months=6)`
   - `'1y'` → `relativedelta(years=1)`; `'3y'` → `relativedelta(years=3)`
   - `'5y'` → `relativedelta(years=5)`; `'all'` → `None`
   - Unrecognized → default to `relativedelta(years=1)`
   - Compute `cutoff_date = (date.today() - delta).isoformat()` if delta else None
2. Parse `accounts` query param (comma-separated IDs, default all)
3. Get investment accounts via `_get_investment_accounts(conn)`; extract valid ids
4. Intersect requested accounts with valid investment account ids
5. Build `account_names` dict: `{id: account["name"]}`
6. Query account_history with range filter:
   ```sql
   SELECT account_id, date, balance
   FROM account_history
   WHERE account_id IN (?, ...)
     [AND date >= ? if cutoff_date]
   ORDER BY date ASC
   ```
7. Pivot into date-keyed structure:
   - For each row: add to `series_map[date][account_id] = balance`
   - Also accumulate `series_map[date]["__total__"]`
8. Build `series` list sorted by date:
   - Each entry: `{"date": date, "total": total, "accounts": {id: balance, ...}}`
9. Query contributions:
   - NOTE TO IMPLEMENTER: Verify `categories.group_type` column name via `PRAGMA table_info(categories)` before running. The plan uses `group_type = 'transfer'` based on research.
   ```sql
   SELECT strftime('%Y-%m', t.date) AS month, SUM(ABS(t.amount)) AS total
   FROM transactions t
   JOIN categories c ON t.category_id = c.id
   WHERE c.group_type = 'transfer'
     AND t.account_id IN (?, ...)
     [AND t.date >= ? if cutoff_date]
   GROUP BY month
   ORDER BY month ASC
   ```
10. Return `jsonify({"series": [...], "contributions": [{"month": m, "total": t}, ...], "account_names": {...}})`

---

#### Change A2: Update `backend/routes/__init__.py`

```
File: /home/user/stashtrend/backend/routes/__init__.py
Lines: 1-22 (entire file — add 2 lines)
Parallelism: depends-on: Change A1 (investments.py must exist first)
Description: Register the investments Blueprint alongside the existing 9 blueprints.
```

Details:
- After line 9 (`from routes.budget_builder import bp as budget_builder_bp`), add:
  ```python
  from routes.investments import bp as investments_bp
  ```
- After line 21 (`app.register_blueprint(budget_builder_bp)`), add:
  ```python
  app.register_blueprint(investments_bp)
  ```

---

#### Change A3: Create `backend/tests/test_investments.py`

```
File: /home/user/stashtrend/backend/tests/test_investments.py
Lines: new file (~350 lines)
Parallelism: depends-on: Change A1, A2 (endpoint must exist and be registered)
Description: Three TestCase classes covering all three investment endpoints with ~18 test cases total.
  Follows the identical pattern as test_retirement.py: unittest.TestCase, app.test_client(),
  patch("app.get_db", return_value=make_test_db()), direct INSERT seeding.
```

Details:

**Module header:**
```python
"""Tests for GET /api/investments/summary, /api/investments/accounts/<id>/holdings,
and GET /api/investments/performance."""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app
from tests.test_helpers import make_test_db


def make_db():
    return make_test_db()
```

**Helper `_seed_investment_data(db)`** (internal to the test module):
Seeds a realistic but minimal dataset: 2 investment accounts (one `type='ira'` for Retirement, one `type='brokerage'` for Brokerage), 2 holdings per account with known values, 31 account_history rows per account (enough for CAGR), and 2 transaction rows with a matching category (group_type='transfer').

**Class `TestInvestmentsSummary`:**

- `test_empty_no_investment_accounts`: No investment accounts in DB. Calls `GET /api/investments/summary`. Asserts `status 200`, `accounts == []`, `totals.current_value == 0`.
- `test_summary_with_accounts_returns_correct_shape`: Seeds 2 accounts. Asserts response includes `accounts` list with both, each having `id`, `name`, `institution`, `bucket`, `current_value`, `total_cost_basis`, `total_return_dollars`, `total_return_pct`, `cagr_pct`, `allocation_weight_pct`, `is_stale`, `stale_days`.
- `test_bucket_assignment_retirement_vs_brokerage`: Seeds one `ira` account (→ Retirement) and one `brokerage` account (→ Brokerage). Asserts each account has the correct `bucket` value.
- `test_filters_out_non_investment_accounts`: Seeds 1 investment account + 1 checking account. Asserts response `accounts` list has length 1.
- `test_null_basis_returns_none_for_return_fields`: Seeds holdings with `basis = NULL`. Asserts `total_cost_basis` is None, `total_return_dollars` is None, `total_return_pct` is None.
- `test_error_path_returns_500`: Injects `MagicMock()` with `execute.side_effect = Exception("DB error")`. Asserts `status 500` and `{"error": "Internal server error"}`.

**Class `TestInvestmentsHoldings`:**

- `test_happy_path_returns_holdings_structure`: Seeds account + holdings. Asserts response has `account`, `holdings`, `allocation`, `totals`. Verifies `holdings[0]` has `cost_basis` (not `basis`) and `current_value` (not `total_value`).
- `test_invalid_account_id_returns_404`: Calls with non-existent account ID. Asserts `status 404` and `{"error": "Account not found"}`.
- `test_non_investment_account_returns_404`: Seeds a checking account. Calls holdings endpoint with its ID. Asserts `status 404`.
- `test_empty_holdings_returns_valid_structure`: Seeds account but no holdings rows. Asserts `holdings == []`, `totals.holdings_count == 0`, `allocation == []`.
- `test_last_synced_at_included_in_account`: Seeds holdings with a known `synced_at` value. Asserts `account.last_synced_at` is present in response (not None).
- `test_unrealized_gain_loss_computed`: Seeds holding with known `basis` and `total_value`. Asserts `unrealized_gain_loss_dollars = total_value - basis`.
- `test_null_basis_holding_returns_none_gain_loss`: Seeds holding with `basis = NULL`. Asserts `unrealized_gain_loss_dollars` and `unrealized_gain_loss_pct` are None.
- `test_error_path_returns_500`: Same MagicMock pattern as above.

**Class `TestInvestmentsPerformance`:**

- `test_happy_path_returns_series_and_contributions`: Seeds account_history for 1 account (31 rows) and transaction data. Asserts response has `series`, `contributions`, `account_names`. Series entries have `date`, `total`, `accounts`.
- `test_range_parameter_3m_filters_data`: Seeds history spanning 2 years. Calls with `range=3m`. Asserts series contains only entries from last 3 months.
- `test_range_parameter_all_returns_all_data`: Seeds history spanning 2 years. Calls with `range=all`. Asserts series has all data points.
- `test_unknown_range_defaults_to_1y`: Calls with `range=bogus`. Asserts series has same length as `range=1y` call.
- `test_empty_accounts_returns_empty_series`: No investment accounts or history. Asserts `series == []`.
- `test_error_path_returns_500`: MagicMock exception injection.

---

### Stream B — Investment Component Tests

All Stream B files are independent of each other and of Stream A (no file overlap).

---

#### Change B1: Create `frontend/src/components/InvestmentAccountsTable.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/InvestmentAccountsTable.test.jsx
Lines: new file (~130 lines)
Parallelism: independent
Description: Behavioral tests for InvestmentAccountsTable. Uses MemoryRouter for useNavigate.
  No recharts mock needed (component has no charts).
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import InvestmentAccountsTable from './InvestmentAccountsTable.jsx'

const MOCK_ACCOUNTS = [
  { id: 'acc1', name: 'Fidelity 401k', institution: 'Fidelity', bucket: 'Retirement',
    current_value: 200000, total_cost_basis: 150000, total_return_dollars: 50000,
    total_return_pct: 33.3, cagr_pct: 8.2, allocation_weight_pct: 57.1,
    is_stale: false, stale_days: 0 },
  { id: 'acc2', name: 'Vanguard Brokerage', institution: 'Vanguard', bucket: 'Brokerage',
    current_value: 150000, total_cost_basis: 130000, total_return_dollars: 20000,
    total_return_pct: 15.4, cagr_pct: null, allocation_weight_pct: 42.9,
    is_stale: true, stale_days: 3 },
]

const renderTable = (props = {}) =>
  render(<MemoryRouter><InvestmentAccountsTable accounts={MOCK_ACCOUNTS} loading={false} {...props} /></MemoryRouter>)
```

Tests:
- `renders account names and institutions`: Asserts "Fidelity 401k" and "Fidelity" present
- `renders Retirement group header when bucket=Retirement account exists`: Asserts "Retirement" group header text
- `renders Brokerage group header when non-Retirement account exists`: Asserts "Brokerage" header
- `renders stale badge for account with is_stale and stale_days < 7`: Asserts "Synced 3d ago" present
- `renders N/A for null return values`: Asserts "N/A" appears for cagr_pct null account
- `shows loading skeleton when loading=true`: Render with `loading={true}`, asserts skeleton rows present (check for `shimmerRow` class or count > 0 shimmer cells)
- `shows empty state when accounts is empty array`: Render with `accounts={[]}`, asserts "No investment accounts found."
- `clicking column header toggles sort direction`: Click "Value" header twice; assert `aria-sort` attribute cycles
- `renders footer total row`: Asserts "Total" appears in tfoot
- `clicking account row navigates`: `fireEvent.click(row)` — no crash (navigation tested at page level)

---

#### Change B2: Create `frontend/src/components/InvestmentPerformanceChart.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.test.jsx
Lines: new file (~120 lines)
Parallelism: independent
Description: Behavioral tests for InvestmentPerformanceChart. Mocks recharts and useResponsive.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import InvestmentPerformanceChart from './InvestmentPerformanceChart.jsx'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))

const MOCK_PERFORMANCE = {
  series: [
    { date: '2025-01-01', total: 350000, accounts: { acc1: 200000, acc2: 150000 } },
    { date: '2025-06-01', total: 370000, accounts: { acc1: 210000, acc2: 160000 } },
  ],
  contributions: [{ month: '2025-01', total: 2000 }],
  account_names: { acc1: 'Fidelity 401k', acc2: 'Vanguard Brokerage' },
}

const defaultProps = {
  performance: MOCK_PERFORMANCE,
  loading: false,
  error: null,
  range: '1y',
  onRangeChange: vi.fn(),
  perfLoading: false,
}
```

Tests:
- `renders Performance title`: Asserts "Performance" heading text
- `renders all 6 range buttons (3M, 6M, 1Y, 3Y, 5Y, All)`: Asserts each label present
- `clicking 3M range button calls onRangeChange with lowercase value "3m"`: `fireEvent.click(getByText('3M'))` → `expect(onRangeChange).toHaveBeenCalledWith('3m')`. This is the critical test for the value-vs-label bug fix from Phase 3 review.
- `renders loading skeleton when loading=true`: Props with `loading={true}`, asserts skeleton div present
- `renders error message when error prop provided`: Props with `error="Failed to load"`, asserts error text present
- `renders empty chart message when no series data`: Props with `performance={{ series: [], contributions: [], account_names: {} }}`, asserts "No performance data" message
- `renders $ Value and % Change toggle buttons`: Asserts both buttons present
- `renders account chip for each account_name`: Asserts "Fidelity 401k" and "Vanguard Brokerage" chip buttons
- `renders Show contributions toggle button`: Asserts checkbox-style button present

---

#### Change B3: Create `frontend/src/components/AccountDetailHeader.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/AccountDetailHeader.test.jsx
Lines: new file (~90 lines)
Parallelism: independent
Description: Behavioral tests for AccountDetailHeader. Uses MemoryRouter for Link component.
```

Details:

Mock setup:
```js
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import AccountDetailHeader from './AccountDetailHeader.jsx'

const MOCK_ACCOUNT = {
  id: 'acc1', name: 'Fidelity 401k', institution: 'Fidelity',
  bucket: 'Retirement', last_synced_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
}
const MOCK_TOTALS = {
  current_value: 200000, total_cost_basis: 150000,
  unrealized_gain_loss_dollars: 50000, unrealized_gain_loss_pct: 33.3,
  holdings_count: 5,
}
```

Tests:
- `renders account name and institution`: Asserts "Fidelity 401k" and "Fidelity" present
- `renders bucket badge when bucket provided`: Asserts "Retirement" badge text
- `renders back link to /investments`: Asserts "← Investments" link with href `/investments`
- `renders CURRENT VALUE metric`: Asserts "$200,000" in document
- `renders COST BASIS metric`: Asserts "$150,000" in document
- `renders holdings count`: Asserts "5 positions" present
- `renders N/A for null gain/loss`: Render with `totals={{ ...MOCK_TOTALS, unrealized_gain_loss_dollars: null, unrealized_gain_loss_pct: null }}`, asserts "N/A"
- `renders stale badge when last_synced_at > 1 day ago`: Render with `account` having `last_synced_at` 2 days ago, asserts "Stale" badge
- `renders relative time in last synced line`: Asserts "Last synced:" prefix present with time suffix

---

#### Change B4: Create `frontend/src/components/HoldingsTable.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/HoldingsTable.test.jsx
Lines: new file (~120 lines)
Parallelism: independent
Description: Behavioral tests for HoldingsTable. Pure props component — no mocking needed.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import HoldingsTable from './HoldingsTable.jsx'

const MOCK_HOLDINGS = [
  { ticker: 'VTI', security_name: 'Vanguard Total Stock', security_type: 'ETF',
    quantity: 50, cost_basis: 8000, current_value: 10000,
    unrealized_gain_loss_dollars: 2000, unrealized_gain_loss_pct: 25.0, is_manual: 0 },
  { ticker: null, security_name: 'Vanguard Bond', security_type: 'Bond',
    quantity: 20, cost_basis: null, current_value: 3000,
    unrealized_gain_loss_dollars: null, unrealized_gain_loss_pct: null, is_manual: 1 },
]
```

Tests:
- `renders Holdings title`: Asserts "Holdings" text
- `renders ticker symbols for holdings with tickers`: Asserts "VTI" present
- `renders N/A for null ticker`: Asserts "N/A" when ticker is null
- `renders Manual badge for is_manual=1`: Asserts "Manual" badge present
- `renders type filter dropdown with All selected by default`: Asserts `<select>` with "All" selected
- `filtering by type shows only matching holdings`: Select "Bond" in filter → Asserts "VTI" row disappears, "Vanguard Bond" remains
- `filtering with no match shows empty state message`: Select "Stock" with no Stock holdings → Asserts "No Stock holdings in this account."
- `shows No holdings found when holdings empty`: Render with `holdings={[]}`, asserts "No holdings found."
- `renders footer totals row when holdings present`: Asserts "Total" row in tfoot
- `renders N/A for null gain_loss in footer`: Since second holding has null basis, footer gain/loss should show "N/A"
- `loading skeleton shown when loading=true`: Render with `loading={true}`, asserts skeleton rows

---

#### Change B5: Create `frontend/src/components/AllocationChart.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/AllocationChart.test.jsx
Lines: new file (~80 lines)
Parallelism: independent
Description: Behavioral tests for AllocationChart. Mocks recharts and useResponsive.
```

Details:

Mock setup:
```js
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import AllocationChart from './AllocationChart.jsx'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false }),
}))

const MOCK_ALLOCATION = [
  { type: 'etf', value: 8000, pct: 72.7 },
  { type: 'stock', value: 2000, pct: 18.2 },
  { type: 'other', value: 1000, pct: 9.1 },
]
const MOCK_TOTALS = { current_value: 11000 }
```

Tests:
- `renders Asset Allocation title`: Asserts "Asset Allocation" heading
- `renders legend items for each allocation type`: Asserts "etf", "stock", "other" appear in legend
- `renders percentage values in legend`: Asserts "72.7%" visible
- `renders empty state when allocation is empty array`: Render with `allocation={[]}`, asserts "No allocation data available."
- `renders loading skeleton when loading=true`: Render with `loading={true}`, asserts skeleton circle (or no chart)
- `does not render figcaption when allocation is empty`: Render with `allocation={[]}`, asserts no figcaption text about percentages (since figcaption is inside the `allocation.length > 0` guard)
- `renders responsive-container when allocation provided`: Asserts `data-testid="responsive-container"` present (from recharts mock)

---

### Stream C — Forecasting Component Tests

All Stream C files are independent of each other and of Streams A and B.

---

#### Change C1: Create `frontend/src/components/ForecastingChart.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/ForecastingChart.test.jsx
Lines: new file (~100 lines)
Parallelism: independent
Description: Behavioral tests for ForecastingChart. Mocks recharts and useResponsive.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ForecastingChart from './ForecastingChart.jsx'

vi.mock('recharts')
vi.mock('../hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isDesktop: true }),
}))

const MOCK_CHART_DATA = [
  { date: '2024-01-01', net_worth: 300000 },
  { date: '2025-01-01', net_worth: 350000 },
  { date: '2030-01-01', projected_net_worth: 500000 },
]
```

Tests:
- `renders Investable Capital Projection title`: Asserts the h2 text
- `renders range buttons (5Y, 10Y, 20Y, All)`: Asserts all 4 range labels
- `clicking range button changes active range without crash`: `fireEvent.click(getByText('5Y'))` — no error; verify button still in document
- `renders sr-only paragraph with srSummary prop content`: Render with `srSummary="Projected $500k. On track."`, asserts that text present in document (in the sr-only `<p>`)
- `renders empty chart with empty chartData`: Render with `chartData={[]}`, asserts ResponsiveContainer still present (recharts mock renders it)
- `renders nest egg reference when nestEgg provided`: ReferenceLine is mocked — test verifies no crash and chart renders
- `renders retirement year reference when retirementYear provided`: Same as above
- `does not render variant reference lines when showVariants=false`: Render with `showVariants={false}` — no crash
- `renders responsive container`: Asserts `data-testid="responsive-container"` present

---

#### Change C2: Create `frontend/src/components/ForecastingControls.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/ForecastingControls.test.jsx
Lines: new file (~90 lines)
Parallelism: independent
Description: Behavioral tests for ForecastingControls + SliderInput integration.
  No mocks needed — pure prop-driven component.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ForecastingControls from './ForecastingControls.jsx'

const defaultProps = {
  contribution: 2000,
  returnRate: 7.0,
  onContributionChange: vi.fn(),
  onReturnRateChange: vi.fn(),
  onReset: vi.fn(),
  contributionMax: 10000,
  defaultsNote: null,
  cagrWarning: null,
}
```

Tests:
- `renders Projection Settings title`: Asserts "Projection Settings" text
- `renders Monthly Contribution label`: Asserts "Monthly Contribution" label
- `renders Annual Return Rate label`: Asserts "Annual Return Rate" label
- `renders Reset button`: Asserts "Reset" button present
- `clicking Reset calls onReset`: `fireEvent.click(getByText('Reset'))`, asserts `onReset` was called once
- `renders defaultsNote when provided`: Render with `defaultsNote="Default based on historical rate."`, asserts text present
- `does not render defaultsNote when null`: Render with default props (null), asserts text not present
- `renders cagrWarning when provided`: Render with `cagrWarning="Historical return is negative."`, asserts text present
- `does not render cagrWarning when null`: Asserts warning text not present when null
- `contribution slider updates on change`: `fireEvent.change(slider, {target: {value: '3000'}})`, asserts `onContributionChange` called
- `return rate slider updates on change`: Same pattern for return rate slider

---

#### Change C3: Create `frontend/src/components/ForecastingSummary.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSummary.test.jsx
Lines: new file (~100 lines)
Parallelism: independent
Description: Behavioral tests for ForecastingSummary. Pure prop-driven — no mocks needed.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ForecastingSummary from './ForecastingSummary.jsx'

const onTrackProps = {
  investableCapital: 440000,
  nestEgg: 1700000,
  projectedAtRetirement: 2000000,
  targetYear: 2051,
  neededContribution: null,
  currentContribution: 2000,
  onEditSettings: vi.fn(),
  hasSettings: true,
}
const offTrackProps = {
  ...onTrackProps,
  projectedAtRetirement: 800000,
  neededContribution: 4000,
}
```

Tests:
- `renders Retirement Readiness title`: Asserts "Retirement Readiness" text
- `renders On Track badge when projectedAtRetirement >= nestEgg`: Render with onTrackProps, asserts "✓ On Track" badge
- `renders Off Track badge when projectedAtRetirement < nestEgg`: Render with offTrackProps, asserts "Off Track" badge
- `renders 4 metric cards`: Asserts "Investable Capital Today", "Nest Egg Needed", "Projected at Retirement", "Target Year" labels
- `renders formatted dollar values in cards`: Asserts "$440,000" and "$1,700,000" visible
- `renders target year`: Asserts "2051" in document
- `renders ahead gap text when on track`: Asserts "ahead of your target" text
- `renders off-track gap text with contribution increase when neededContribution provided`: Asserts "Increase contributions by" text with amount
- `renders setup prompt when hasSettings=false`: Render with `hasSettings={false}`, asserts "Set your desired retirement income" prompt
- `renders Edit Retirement Settings button`: Asserts "Edit Retirement Settings" button
- `clicking Edit Retirement Settings calls onEditSettings`: `fireEvent.click(...)`, asserts `onEditSettings` called

---

#### Change C4: Create `frontend/src/components/ForecastingSetup.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSetup.test.jsx
Lines: new file (~110 lines)
Parallelism: independent
Description: Behavioral tests for ForecastingSetup form. Tests validation, onSave payload shape,
  and advanced toggle. Component is purely presentational — parent owns the API call.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ForecastingSetup from './ForecastingSetup.jsx'

const onSave = vi.fn()
const render_setup = (props = {}) =>
  render(<ForecastingSetup onSave={onSave} loading={false} error={null} {...props} />)
```

Tests:
- `renders Set Up Retirement Projections title`: Asserts h2 text
- `renders Current age and Target retirement age inputs`: Both fields present
- `renders Save Settings button enabled by default`: Asserts button not disabled
- `disables Save button when loading=true`: Render with `loading={true}`, asserts button disabled
- `shows Saving… label when loading=true`: Asserts "Saving…" text
- `validation error when ages missing`: Click Save without filling fields, asserts "required" error message via `role="alert"`
- `validation error when targetAge <= currentAge`: Fill currentAge=65, targetAge=40, click Save, asserts "must be greater" error message
- `valid form calls onSave with correct shape`: Fill currentAge=35, targetAge=65, click Save. Asserts `onSave` called with `{ current_age: 35, target_retirement_age: 65, ... }` (numeric values).
- `clicking Save does NOT call saveRetirement directly`: Import `saveRetirement` is not in the component; no API mock needed — just assert `onSave` is the only external call.
- `advanced toggle shows extra fields`: Click "▼ Advanced settings", asserts "Expected annual return" field appears
- `advanced toggle hides extra fields again on second click`: Click twice, asserts field not present
- `renders API error from error prop`: Render with `error="Network error"`, asserts "Network error" in alert

---

#### Change C5: Create `frontend/src/components/SliderInput.test.jsx`

```
File: /home/user/stashtrend/frontend/src/components/SliderInput.test.jsx
Lines: new file (~90 lines)
Parallelism: independent
Description: Behavioral tests for SliderInput reusable component.
```

Details:

Mock setup:
```js
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import SliderInput from './SliderInput.jsx'

const defaultProps = {
  label: 'Monthly Contribution',
  value: 2000,
  onChange: vi.fn(),
  min: 0,
  max: 10000,
  step: 100,
  format: (v) => '$' + Math.round(v).toLocaleString(),
  ariaLabel: 'Monthly contribution amount',
}
```

Tests:
- `renders label text`: Asserts "Monthly Contribution" present
- `renders initial formatted value in text input`: Asserts "$2,000" in text input
- `renders range slider`: Asserts `type="range"` input present
- `slider change calls onChange with numeric value`: `fireEvent.change(slider, {target: {value: '3000'}})`, asserts `onChange` called with `3000`
- `text input blur commits parsed value clamped to max`: Set text input to "99999", blur, asserts `onChange` called with `10000` (max)
- `text input blur commits value clamped to min`: Set text to "-500", blur, asserts `onChange` called with `0` (min)
- `non-numeric text input on blur reverts to formatted value`: Set text to "abc", blur, asserts `onChange` not called and text resets to "$2,000"
- `format function applied to displayed value`: Render with `format={(v) => v.toFixed(1) + '%'}`, value=7, asserts "7.0%" in text field
- `Enter key on text input commits value`: `fireEvent.keyDown(input, {key: 'Enter'})` then blur — asserts `onChange` called

---

### Stream D — retirementMath.test.js Extensions

---

#### Change D1: Extend `frontend/src/utils/retirementMath.test.js`

```
File: /home/user/stashtrend/frontend/src/utils/retirementMath.test.js
Lines: append after line 145 (current end of file) — add ~100 lines
Parallelism: independent
Description: Add 3 new describe blocks for the 3 Phase 4 functions. No changes to existing tests.
```

Details:

Add the following imports at the top of the file (extend existing import statement):
```js
import {
  computeNestEgg,
  generateProjectionSeries,
  mergeHistoryWithProjection,
  getInvestableCapital,
  computeBlendedCAGR,
  calculateContributionToTarget,
} from './retirementMath.js'
```

Append 3 new `describe` blocks after line 145:

**`describe('getInvestableCapital', ...)`:**
- `returns null when typeData is null`: `expect(getInvestableCapital(null)).toBeNull()`
- `returns null when series is empty array`: `expect(getInvestableCapital({ series: [] })).toBeNull()`
- `returns null when typeData has no series key`: `expect(getInvestableCapital({})).toBeNull()`
- `sums Retirement and Brokerage from latest series point`: Provide `MOCK_NETWORTH_BY_TYPE` from fixtures (or inline data), assert result is `240000 + 200000 = 440000`
- `returns 0 when both buckets are 0`: Series point has `Retirement: 0, Brokerage: 0`, asserts `0`
- `returns Retirement amount when Brokerage is missing`: Series point with only `Retirement: 100000`, asserts `100000` (Brokerage defaults to 0 via `?? 0`)

**`describe('computeBlendedCAGR', ...)`:**
- `returns 7.0 fallback when no CAGR data`: `typeData` with no cagr entries, asserts `7.0`
- `returns single bucket CAGR when only one has data`: `cagr = { Retirement: {'5y': 8.5} }`, brokerage balance 0, asserts `8.5`
- `returns balance-weighted average when both buckets have data`: `Retirement: 240000 at 8.0%, Brokerage: 200000 at 6.0%`, expected weighted avg = `(240000*8.0 + 200000*6.0) / 440000 ≈ 7.09` — assert close to that value using `toBeCloseTo`
- `returns simple average when both have CAGR but $0 balance`: Both balances 0, both have CAGR. Asserts `(a + b) / 2`.
- `picks 5y over 3y over 1y`: CAGR object has `{1y: 5.0, 3y: 6.0, 5y: 7.0}`, asserts picks `7.0`
- `returns one bucket CAGR when other is null`: Only Brokerage CAGR set, Retirement null. Asserts returns Brokerage CAGR.

**`describe('calculateContributionToTarget', ...)`:**
- `returns null when years <= 0`: `years: 0`, asserts `null`
- `returns null when targetAmount is null`: `targetAmount: null`, asserts `null`
- `returns currentContribution when already on track (shortfall <= 0)`: Seed with very high `currentNetWorth` so growth alone exceeds target, asserts return equals `currentContribution`
- `computes required contribution and rounds up to nearest 100`: Known inputs with expected math result, asserts result is a multiple of 100 and `>= currentContribution`
- `floor: never returns less than currentContribution`: Even when neededContrib < currentContribution, asserts result `>= currentContribution`
- `zero return rate uses linear formula`: `annualReturnPct: 0`, verify it still returns a sensible number (not infinity/NaN)
- `very short timeline produces high contribution`: `years: 1, targetAmount: 2000000, currentNetWorth: 100000`, asserts result is very large (> 100000/month) — no crash

---

## Dependency Order

### Tier 0 — No dependencies (run all in parallel immediately):

All four streams are independent. Within each stream:

- **Stream A:** A1 (investments.py) runs first; A2 (__init__.py) and A3 (test_investments.py) depend on A1
- **Stream B:** B1, B2, B3, B4, B5 all run in parallel (zero dependencies on each other)
- **Stream C:** C1, C2, C3, C4, C5 all run in parallel (zero dependencies on each other)
- **Stream D:** D1 runs immediately (no dependencies)

### Tier 1 — Within Stream A:

- A1 must complete before A2 and A3 begin
- A2 and A3 can run in parallel after A1

### Summary parallelism diagram:

```
START ──┬── [Stream A] A1 → (A2 ∥ A3)
        ├── [Stream B] B1 ∥ B2 ∥ B3 ∥ B4 ∥ B5
        ├── [Stream C] C1 ∥ C2 ∥ C3 ∥ C4 ∥ C5
        └── [Stream D] D1
```

Agent assignments:
- Agent 1: Stream A (A1 → A2, A3 in parallel)
- Agent 2: Stream B (B1 through B5 in parallel or sequentially)
- Agent 3: Stream C (C1 through C5 in parallel or sequentially)
- Agent 4: Stream D (D1)

---

## Test Strategy

### Backend Tests (`test_investments.py`)

**Happy path (per endpoint):**
- Summary: 2 seeded accounts → correct account count, bucket assignment, CAGR computation
- Holdings: seeded account with known holdings → correct field renaming (cost_basis, current_value), correct gain/loss calculation
- Performance: seeded account_history → correct series structure, account_names dict, contributions list

**Edge cases:**
- Summary: no investment accounts → empty list, not 404
- Summary: NULL basis holdings → None for return fields
- Summary: mixed investment and non-investment accounts → filters correctly
- Holdings: 404 for non-existent account ID
- Holdings: 404 for non-investment account (e.g., checking)
- Holdings: valid account with zero holdings → holdings=[], allocation=[], holdings_count=0
- Holdings: holdings with NULL basis → unrealized gain/loss fields are None
- Performance: `range=all` returns all history; `range=3m` filters by date
- Performance: unrecognized range defaults to 1y behavior
- Performance: no accounts/history → empty series

**Error paths:**
- All 3 endpoints: MagicMock with `execute.side_effect = Exception(...)` → 500 with `{"error": "Internal server error"}`

**Integration assurance:**
- All tests use `app.test_client()` which exercises real Blueprint routing; this implicitly verifies A2 (Blueprint registration)

### Frontend Tests

**Happy path (per component):**
- All components render with full valid props without crashing
- Correct text content appears (account names, dollar values, percentages)

**Edge cases:**
- Null/None data fields render gracefully (N/A, —, empty states)
- Empty arrays show correct empty state messages
- Loading=true shows skeleton/spinner states
- Type filter with no matches shows "No X holdings in this account."
- Slider text input with invalid input reverts to formatted value
- ForecastingSetup: both age fields missing → validation error; target <= current → validation error

**Error cases:**
- InvestmentPerformanceChart with `error` prop → error message shown
- ForecastingSetup with `error` prop from parent → API error shown

**Interaction tests:**
- Column header click toggles sort (InvestmentAccountsTable, HoldingsTable)
- Range button click calls `onRangeChange` with **lowercase value** (critical correctness test)
- Reset button calls `onReset`
- ForecastingSetup: advanced toggle shows/hides advanced fields
- ForecastingSetup: Save with valid data calls `onSave` with numeric-typed values

### retirementMath Tests

All pure function tests — no setup/teardown required. Cover:
- Null/missing inputs for all 3 functions
- Known numeric inputs with verifiable outputs
- Edge cases: zero return rate, zero balance, mismatched CAGR availability

### Existing Tests — What May Break

Based on codebase research, the following existing tests already pass correctly and should NOT break:
- `Sidebar.test.jsx`: Already asserts 7 nav items including Investments and Forecasting
- `App.test.jsx`: Has stale "5 NAV_ITEMS" comment but assertions correctly check all 7 items
- All backend tests: `patch("app.get_db", ...)` pattern is unaffected by adding investments Blueprint

No existing test updates are required. If any fail after implementation, they must be fixed before proceeding to code review.

### Tests That Can Run in Parallel with Implementation

- All Stream B, C, D test files can be written by a QA agent in parallel with Stream A implementation, since they only depend on components that already exist (they do not need the backend route to exist)
- Stream A tests (`test_investments.py`) must wait for A1 and A2 to complete

---

## Rollback Notes

- **Stream A rollback:** Delete `backend/routes/investments.py`, revert `backend/routes/__init__.py` to 9-blueprint form, delete `backend/tests/test_investments.py`. The app returns to its pre-plan state with no investment endpoints registered.
- **Stream B/C/D rollback:** Delete the new test files. No production code is changed.
- **No data migrations:** No schema changes.
- **No requirements.txt changes:** `python-dateutil` is already in requirements.txt at line 9.
- **Verification before rollback:** Run `make test` to confirm all tests pass; if any pre-existing test fails, that is the rollback signal.

---

## Appendix: API Contract Reference

These contracts are consumed by the frontend components that already exist. The backend implementation must match exactly.

**`GET /api/investments/summary`** response:
```json
{
  "accounts": [
    { "id": "str", "name": "str", "institution": "str", "type": "str", "subtype": "str|null",
      "bucket": "Retirement|Brokerage|...",
      "current_value": 0.0, "total_cost_basis": 0.0|null,
      "total_return_dollars": 0.0|null, "total_return_pct": 0.0|null,
      "cagr_pct": 0.0|null, "allocation_weight_pct": 0.0,
      "is_stale": false, "stale_days": 0 }
  ],
  "totals": { "current_value": 0.0, "total_return_dollars": 0.0|null,
               "total_return_pct": 0.0|null, "cagr_pct": 0.0|null }
}
```

**`GET /api/investments/accounts/<id>/holdings`** response:
```json
{
  "account": { "id": "str", "name": "str", "institution": "str",
               "bucket": "str", "last_synced_at": "ISO8601|null" },
  "holdings": [
    { "ticker": "str|null", "security_name": "str|null", "security_type": "str",
      "quantity": 0.0|null, "cost_basis": 0.0|null, "current_value": 0.0,
      "unrealized_gain_loss_dollars": 0.0|null, "unrealized_gain_loss_pct": 0.0|null,
      "is_manual": 0|1 }
  ],
  "allocation": [{ "type": "str", "value": 0.0, "pct": 0.0 }],
  "totals": { "current_value": 0.0, "total_cost_basis": 0.0|null,
              "unrealized_gain_loss_dollars": 0.0|null,
              "unrealized_gain_loss_pct": 0.0|null, "holdings_count": 0 }
}
```

**`GET /api/investments/performance?range=1y&accounts=`** response:
```json
{
  "series": [{ "date": "YYYY-MM-DD", "total": 0.0,
               "accounts": { "<account_id>": 0.0 } }],
  "contributions": [{ "month": "YYYY-MM", "total": 0.0 }],
  "account_names": { "<account_id>": "str" }
}
```
