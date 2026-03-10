# Phase 3 Requirements — Investments Page

**Date:** 2026-03-09
**Phase:** 3 of 6 (Net Worth + Investments + Forecasting roadmap)
**Size:** L
**Status:** Requirements locked -- ready for research + architecture pipeline
**Depends on:** Phase 0 (holdings sync -- merged, PR #3), Phase 1 (NW by type + CAGR -- merged, PR #4)

---

## Clarified Intent

Build a new **/investments** page accessible from the sidebar navigation. The page serves as an account-level performance dashboard for all investment accounts (Retirement + Brokerage buckets), with drill-down into individual holdings per account. All data comes from the existing Monarch sync pipeline -- zero manual entry. The page is scannable and periodic-use, not a day-trading terminal.

---

## User Stories

### US-1: View All Investment Accounts at a Glance
**As** a retirement-focused investor,
**I want** a dashboard showing all my investment accounts with key performance metrics,
**so that** I can quickly assess my portfolio without logging into multiple providers.

**Acceptance Criteria:**
- [ ] Page loads at `/investments` route and appears in sidebar navigation
- [ ] Every account in the Retirement and Brokerage buckets (per existing `_get_bucket()` mapping in `app.py:742`) is listed
- [ ] Each account row shows: account name, institution, current value, total return ($), total return (%), estimated CAGR, allocation weight (% of total investment portfolio)
- [ ] Accounts with no holdings still appear (showing current balance from `accounts.current_balance`)
- [ ] Total portfolio summary row shows aggregate current value across all investment accounts
- [ ] Page loads in under 2 seconds with typical data volumes (< 20 accounts, < 200 holdings)

### US-2: Track Account Performance Over Time
**As** a retirement-focused investor,
**I want** to see how my investment accounts have performed over selectable time ranges,
**so that** I can identify trends and compare account growth.

**Acceptance Criteria:**
- [ ] Performance chart displays account value over time using `account_history` data
- [ ] User can select/deselect individual accounts on the chart (multi-select toggle)
- [ ] Time range selector with standard ranges (reuse existing `RangeSelector` component): 3M, 6M, 1Y, 3Y, 5Y, All
- [ ] Chart supports both absolute value ($ axis) and percentage change (% axis) toggle
- [ ] "All accounts combined" line shown by default alongside individual accounts

### US-3: Track Contributions Into Investment Accounts
**As** a retirement-focused investor,
**I want** to see how much I have contributed to my investment accounts over time,
**so that** I can distinguish market growth from my own contributions.

**Acceptance Criteria:**
- [ ] Contributions are auto-detected from the `transactions` table (transfers into investment accounts, identified by `category_group` containing 'transfer' and `account_id` belonging to an investment account)
- [ ] Monthly contribution totals displayed per account and in aggregate
- [ ] Contribution data shown as a summary metric on each account card (total contributions, or contributions this year)
- [ ] Visual separation between contribution-driven growth and market-driven growth on the performance chart (e.g., stacked area: contributions vs. market gains)

### US-4: Drill Down Into Account Holdings
**As** a retirement-focused investor,
**I want** to click on any account and see all individual positions,
**so that** I can review my asset allocation and individual holding performance.

**Acceptance Criteria:**
- [ ] Clicking an account row navigates to or expands a holdings detail view for that account
- [ ] Each holding row shows: ticker, security name, quantity, cost basis, current value, unrealized gain/loss ($), unrealized gain/loss (%), security type
- [ ] Holdings table is sortable by any column (click column header to toggle asc/desc)
- [ ] Holdings table is filterable by security type (stock, ETF, mutual fund, bond, other)
- [ ] Total row at bottom of table shows aggregate values
- [ ] Holdings with NULL ticker (manual/unknown securities) display gracefully with "N/A" or security name

### US-5: View Asset Allocation
**As** a retirement-focused investor,
**I want** a visual breakdown of my asset allocation for a selected account,
**so that** I can check if my portfolio is balanced.

**Acceptance Criteria:**
- [ ] Donut/pie chart showing allocation by `security_type` (stocks, ETFs, mutual funds, bonds, cash, other)
- [ ] Chart shows both percentage and dollar amount per slice (on hover or as labels)
- [ ] If only one security type exists, chart still renders cleanly
- [ ] Allocation chart appears in the holdings drill-down view alongside the holdings table

---

## Functional Requirements

### FR-1: New Backend Endpoints

#### FR-1.1: `GET /api/investments/accounts`
Returns all investment accounts with computed performance metrics.

Response shape:
```json
{
  "accounts": [
    {
      "id": "acct-1",
      "name": "Fidelity 401k",
      "institution": "Fidelity",
      "type": "401k",
      "bucket": "Retirement",
      "current_value": 250000.00,
      "total_cost_basis": 180000.00,
      "total_return_dollars": 70000.00,
      "total_return_pct": 38.89,
      "cagr_pct": 8.2,
      "allocation_weight_pct": 45.5,
      "holdings_count": 12,
      "last_synced_at": "2026-03-09T10:00:00Z"
    }
  ],
  "totals": {
    "current_value": 549000.00,
    "total_cost_basis": 400000.00,
    "total_return_dollars": 149000.00,
    "total_return_pct": 37.25,
    "holdings_count": 35
  }
}
```

Data sources:
- `accounts` table: name, institution, type, subtype, current_balance, is_hidden, include_in_net_worth
- `holdings` table: SUM(total_value) and SUM(basis) per account for return calculations
- `account_history` table: for CAGR computation (reuse existing `_compute_bucket_cagr` algorithm from `app.py:880`)
- Bucket assignment: reuse `_get_bucket(type, subtype)` from `app.py:742`
- Allocation weight: account total_value / sum of all investment account total_values

Account filtering: include accounts where `_get_bucket()` returns "Retirement" or "Brokerage", AND `include_in_net_worth = 1`, AND `is_hidden = 0`.

#### FR-1.2: `GET /api/investments/accounts/<account_id>/holdings`
Returns holdings for a specific account with computed fields.

Response shape:
```json
{
  "account": { "id": "acct-1", "name": "Fidelity 401k", "institution": "Fidelity" },
  "holdings": [
    {
      "id": "h1",
      "ticker": "AAPL",
      "security_name": "Apple Inc.",
      "security_type": "stock",
      "quantity": 50.0,
      "cost_basis": 7500.00,
      "current_value": 9800.00,
      "current_price": 196.00,
      "unrealized_gain_loss_dollars": 2300.00,
      "unrealized_gain_loss_pct": 30.67,
      "is_manual": 0,
      "last_synced_at": "2026-03-09T10:00:00Z"
    }
  ],
  "allocation": [
    { "type": "stock", "value": 180000.00, "pct": 72.0 },
    { "type": "ETF", "value": 50000.00, "pct": 20.0 },
    { "type": "bond", "value": 20000.00, "pct": 8.0 }
  ],
  "totals": {
    "current_value": 250000.00,
    "total_cost_basis": 180000.00,
    "unrealized_gain_loss_dollars": 70000.00,
    "unrealized_gain_loss_pct": 38.89
  }
}
```

Data source: `holdings` table filtered by `account_id`. Unrealized gain/loss computed as `total_value - basis`. Allocation computed by grouping `holdings.total_value` by `security_type`.

#### FR-1.3: `GET /api/investments/performance?accounts=<ids>&range=<range>`
Returns time-series performance data for charting.

Query params:
- `accounts`: comma-separated account IDs (optional; omit for all investment accounts)
- `range`: one of `3m`, `6m`, `1y`, `3y`, `5y`, `all` (default: `1y`)

Response shape:
```json
{
  "series": [
    {
      "date": "2025-03-09",
      "total": 480000.00,
      "acct-1": 220000.00,
      "acct-2": 260000.00
    }
  ],
  "contributions": [
    {
      "month": "2025-03",
      "total": 3500.00,
      "acct-1": 1500.00,
      "acct-2": 2000.00
    }
  ]
}
```

Data sources:
- `account_history` table for the time series (same source as `/api/networth/history`)
- `transactions` table for contribution detection

#### FR-1.4: Contribution Detection Logic
Detect contributions from existing transaction data:
- Filter transactions where `account_id` belongs to a Retirement or Brokerage bucket account
- Filter by transfer-type transactions. In existing codebase, transfers are identified by `category_group` (the `transactions.category_group` field from Monarch, which uses group_type = 'transfer' -- see `app.py:1171` where transfers are excluded from budget views)
- Aggregate by month per account
- No new DB tables needed -- computed from existing `transactions` data
- Display as "Estimated contributions" -- precision is limited by Monarch's categorization

### FR-2: Frontend -- Investments Page

#### FR-2.1: Page Shell and Navigation
- New route: `/investments`
- New nav item in `NAV_ITEMS` array in `frontend/src/nav.js`, positioned after "Net Worth" and before "Account Groups"
- Page component: `frontend/src/pages/InvestmentsPage.jsx` + `InvestmentsPage.module.css`
- Page header follows existing pattern (see `NetWorthPage.jsx:62-74`): title, "Updated at" timestamp, Refresh button

#### FR-2.2: Account Dashboard (Default View)
- Summary stats cards at top: total portfolio value, total return ($/%),  overall estimated CAGR (follow `StatsCards` component pattern)
- Account table/card list showing all investment accounts with metrics from FR-1.1
- Each account row is clickable (navigates to holdings drill-down)
- Accounts sorted by current value descending by default
- Skeleton loading state while data fetches (match existing skeleton pattern in `StatsCards`)

#### FR-2.3: Performance Chart
- Recharts-based line chart (consistent with existing `NetWorthChart` and `GroupsTimeChart`)
- Uses shared formatters from `chartUtils.jsx`: `fmtCompact`, `fmtFull`, `fmtPct`, `formatDateLabel`
- `RangeSelector` component for time range (reuse existing component from `frontend/src/components/RangeSelector.jsx`)
- Multi-select account toggles (checkboxes or interactive legend)
- Contribution overlay: bar or shaded area beneath the performance line showing monthly contributions
- Responsive: collapses gracefully on mobile viewport

#### FR-2.4: Holdings Drill-Down View
- Triggered by clicking an account from the dashboard
- Navigation pattern: architecture decision (accordion vs. sub-route)
- Holdings table with sortable columns (click header to toggle sort)
- Type filter dropdown: All / Stock / ETF / Mutual Fund / Bond / Other
- Asset allocation donut chart (Recharts `PieChart`)
- Back navigation to return to account dashboard
- Total row summarizing the table

### FR-3: Calculations

#### Total Return ($)
```
total_return = SUM(holdings.total_value) - SUM(holdings.basis)
```
Guard: if all basis values are NULL, show "N/A".

#### Total Return (%)
```
return_pct = total_return / SUM(holdings.basis) * 100
```
Guard: if SUM(basis) = 0 or NULL, return "N/A".

#### CAGR (per account)
```
CAGR = (ending_balance / beginning_balance) ^ (1 / years) - 1
```
Computed from `account_history`: earliest and latest balance for the account. This is balance-based CAGR (same approximation used in Phase 1), not time-weighted return. Label as "Estimated CAGR" with tooltip.

Guards:
- If < 30 days of history, show "Insufficient data"
- If beginning_balance <= 0, show "N/A"

#### Allocation Weight
```
weight_pct = account_total_value / SUM(all_account_total_values) * 100
```

#### Unrealized Gain/Loss (per holding)
```
gain_loss = total_value - basis
gain_loss_pct = (total_value - basis) / basis * 100
```
Guard: if basis is NULL or 0, show "N/A" for percentage.

---

## Edge Cases and Error States

### Empty / Missing Data
| Scenario | Expected Behavior |
|----------|------------------|
| No investment accounts exist | Show empty state: "No investment accounts found. Sync your accounts to get started." with link to `/sync` |
| Account exists but has zero holdings in `holdings` table | Show account in dashboard using `accounts.current_balance`; holdings drill-down shows "No holdings data available for this account" |
| Holdings have NULL ticker and NULL security_name | Display "Unknown Security"; ticker column shows "--" |
| Holdings have NULL cost_basis | Show current value; display "N/A" for return columns; do not compute gain/loss |
| Holdings have NULL quantity | Display "--" for quantity; still show value and other available fields |
| Account has no transaction history (no contribution data) | Contribution section shows "No contribution data detected" -- do not show $0 (which implies zero contributions were made) |
| `account_history` has gaps (missing dates) | Chart connects available points; does not interpolate fake data |
| `is_manual = 1` holdings with sparse data | Display whatever fields are available; NULL fields show "--" |

### Stale Data
| Scenario | Expected Behavior |
|----------|------------------|
| Holdings `last_synced_at` > 24 hours ago | Show subtle warning badge on account row: "Last synced [relative time]" |
| Holdings `last_synced_at` > 7 days ago | Show prominent warning banner at page top with link to sync page |
| Sum of `holdings.total_value` differs from `accounts.current_balance` | This is normal (cash positions, pending trades). Use `holdings` for holdings-specific views; use `accounts.current_balance` as fallback when holdings are absent. Do NOT show a discrepancy warning. |

### Calculation Edge Cases
| Scenario | Expected Behavior |
|----------|------------------|
| CAGR with < 30 days of history | Show "Insufficient data" instead of a misleading percentage |
| CAGR with zero or negative starting balance | Show "N/A" |
| Single investment account (100% allocation weight) | Display "100.0%" -- valid and expected |
| Negative total return (losses) | Display in negative color with down arrow (match `StatsCards` pattern using `COLOR_NEGATIVE` from `chartUtils.jsx`) |
| Very small holdings (< $1) | Display normally; round to 2 decimal places |
| Division by zero in return % (zero cost basis) | Show "N/A" for return percentage |
| Negative holdings quantity (short positions) | Display quantity as negative; compute gain/loss correctly (unlikely for retirement accounts but handle gracefully) |

### API Errors
| Scenario | Expected Behavior |
|----------|------------------|
| Backend returns 500 | Show error state: "Failed to load investment data. Please try again." with retry button |
| Backend returns empty but valid response | Show empty state (not error state) |
| Individual account holdings endpoint fails | Show error within the drill-down only; do not break the parent dashboard |
| Network timeout | Same as 500 handling; show error with retry button |

---

## Out of Scope (Explicit Exclusions)

1. **Benchmark comparison** (Phase 6) -- no S&P 500 comparison, no target allocation, no benchmark lines on charts
2. **Forecasting / projections** (Phase 4) -- no projected future values, no growth curves
3. **Monte Carlo simulation** (Phase 5) -- no probability analysis
4. **AI narrative analysis** (Phase 5) -- no AI commentary on investment performance
5. **Manual data entry** -- no manual position entry, no manual cost basis override, no manual contribution override (contribution detection is auto-only; manual override deferred)
6. **Real-time price data** -- no live price feeds, no intraday updates; all data from Monarch sync
7. **Tax lot tracking** -- no individual lot tracking, no tax-loss harvesting suggestions
8. **Trading / rebalancing actions** -- no buy/sell functionality
9. **`security_prices` table** -- defined in original requirements but not needed until Phase 5 (Monte Carlo). Do not create or populate.
10. **Dividend tracking** -- no dividend income tracking or yield calculations
11. **Transaction-level history per holding** -- no per-security transaction log
12. **Dedicated mobile layout** -- follow responsive CSS patterns already established (the page should work on mobile via responsive design, but no mobile-specific components like `MobileBudgetPage`)

---

## Data Requirements

### Existing Data (Available Now)
| Table | Fields Used | Notes |
|-------|------------|-------|
| `accounts` | id, name, type, subtype, institution, current_balance, is_asset, include_in_net_worth, is_hidden | Filter to Retirement + Brokerage buckets via `_get_bucket()` (defined at `app.py:742`) |
| `holdings` | All columns (id, account_id, security_id, security_name, ticker, security_type, quantity, basis, total_value, current_price, is_manual, last_synced_at, synced_at) | Primary data source for holdings drill-down. Schema at `pipeline/monarch_pipeline/schema.py:74`. |
| `account_history` | account_id, date, balance | Time series for performance chart and CAGR calculation |
| `transactions` | account_id, date, amount, category_group | For contribution detection. Filter: `category_group` indicating transfers (same field used to exclude transfers from budgets at `app.py:1171`) |

### Data Gaps / Risks
| Gap | Impact | Mitigation |
|-----|--------|------------|
| `holdings.basis` is NULL for some holdings (Monarch doesn't always have cost basis) | Cannot compute gain/loss for those holdings | Show "N/A" for return fields; still show current value |
| `security_type` may be NULL or inconsistent | Allocation chart may have large "Other/Unknown" slice | Normalize types server-side to canonical set: stock, ETF, mutual fund, bond, cash, other |
| Contribution detection via transfer transactions may be imprecise (inter-account transfers, employer matches, rollovers all look like transfers) | Contribution totals may over- or undercount | Display as "Estimated contributions" with tooltip explaining methodology |
| Accounts with `is_hidden = 1` may be investment accounts | User may not want to see them | Exclude `is_hidden = 1` accounts (consistent with `accounts_summary` endpoint at `app.py:626`) |
| CAGR is balance-based, not time-weighted (contributions inflate it) | CAGR is an approximation | Existing pattern from Phase 1: label as "Estimated CAGR" with disclaimer tooltip |
| Some accounts may have holdings but `include_in_net_worth = 0` | Unclear whether user wants these on investments page | Default: follow `include_in_net_worth` filter. Architecture decision. |

### No New Tables Required
All data for Phase 3 exists in `accounts`, `holdings`, `account_history`, and `transactions`. No schema migrations needed.

---

## Non-Functional Requirements

### Performance
- **Page load:** Initial data fetch completes in < 2s for typical dataset (< 20 accounts, < 200 holdings, < 5 years of daily history)
- **Chart rendering:** Performance chart renders in < 500ms after data arrives
- **Holdings drill-down:** Opens in < 500ms; data fetched on demand (not preloaded for all accounts)
- **Non-blocking:** Account dashboard renders immediately; contribution data and performance chart can load asynchronously (progressive loading)

### Accessibility
- All interactive elements keyboard-navigable (tab order, enter/space to activate)
- Account table uses semantic `<table>` markup with `<th scope="col">` headers
- Sortable columns announce sort direction via `aria-sort`
- Color is not the only indicator of positive/negative returns (use +/- prefix and arrow icons, matching `StatsCards` pattern with `Arrow` component)
- Donut chart segments have accessible labels (type name, value, percentage)
- Loading and error states announced to screen readers via `aria-live` region

### Design
- Dark theme using existing design token system
- CSS Modules (`.module.css`) for component styles
- Recharts for all charts (consistent with `NetWorthChart`, `TypeStackedChart`, `GroupsTimeChart`)
- Reuse existing shared components: `RangeSelector`, `chartUtils` formatters, color constants (`COLOR_POSITIVE`, `COLOR_NEGATIVE`)
- Loading: skeleton cards/rows matching existing skeleton patterns
- Error: centered error message with retry button matching existing patterns

---

## Deferred Decisions (For Architecture/Engineering to Resolve)

1. **Holdings drill-down navigation pattern:** Accordion expand in-place vs. sub-route (`/investments/:accountId`). Trade-offs: accordion keeps dashboard context but may be cramped; sub-route is cleaner but loses context. Consider URL shareability.
2. **Contribution detection specifics:** Exact transaction filtering logic -- which `category_group` values indicate contributions, how to distinguish inflows from inter-account shuffles, what sign convention Monarch uses for transfer amounts.
3. **Performance chart: absolute vs. % toggle:** Single chart with switchable Y-axis, or two chart modes.
4. **Account inclusion criteria:** Whether to use `include_in_net_worth = 1` filter (matching NW page) or show all investment accounts regardless. Current recommendation: match NW filter for consistency.
5. **CAGR computation reuse:** Whether to extract `_compute_bucket_cagr` (at `app.py:880`) into a shared utility or reimplement per-account CAGR inline.
6. **Security type normalization:** Define canonical mapping from Monarch's `security_type` values to display categories for the allocation chart.
7. **Portfolio-level allocation chart:** Whether to show an aggregate allocation chart on the main dashboard (across all accounts) in addition to per-account allocation in drill-down. Requirements say per-account; portfolio-level is a nice-to-have.

---

## Open Questions (For Research Agent)

1. **`holdings.basis` availability:** What percentage of holdings typically have NULL cost basis from Monarch? If most holdings lack basis, the gain/loss feature provides limited value and the UI should de-emphasize it.
2. **Transfer transaction identification:** Does Monarch's `category_group = 'transfer'` (lowercase, matching the filter at `app.py:1171`) reliably capture 401k payroll deductions, IRA contributions, and employer matches? Or do some contribution types appear under different categories?
3. **Holdings data freshness:** How often does Monarch update holdings data vs. account balances? If holdings lag significantly behind account balances, the discrepancy between `SUM(holdings.total_value)` and `accounts.current_balance` could be confusing.
4. **Account type completeness:** Are there Monarch account types or subtypes not yet in `BUCKET_MAP` / `TYPE_MAP` (defined at `app.py:647-728`) that should map to Retirement or Brokerage?

---

## Success Criteria

1. New "Investments" nav item appears in sidebar (in `nav.js` NAV_ITEMS array) between "Net Worth" and "Account Groups"
2. Default view shows all Retirement + Brokerage accounts with: name, institution, current value, total return ($, %), estimated CAGR, allocation weight
3. Performance chart renders with time range selector and multi-account selection
4. Contribution tracking shows estimated monthly contributions per account
5. Clicking an account opens holdings drill-down with sortable/filterable table
6. Asset allocation donut chart renders in drill-down view
7. Empty states display clear messaging (no investment accounts, no holdings, no contributions)
8. Stale data warnings appear when sync is > 24 hours old
9. All data sourced from existing DB tables -- zero manual entry
10. Page loads in < 2 seconds; no layout shift after async data arrives

---

## Scope Summary

### What Will Be Built
1. **3 new backend API endpoints:** `/api/investments/accounts`, `/api/investments/accounts/<id>/holdings`, `/api/investments/performance`
2. **Contribution detection logic:** Query `transactions` table for transfers into investment accounts, aggregate monthly
3. **Frontend: InvestmentsPage** -- new page component at `/investments` route
4. **Frontend: Account dashboard view** -- summary stats cards, account table with metrics, performance chart with range selector
5. **Frontend: Holdings drill-down view** -- sortable/filterable holdings table, asset allocation donut chart, account detail header
6. **Navigation update:** Add "Investments" entry to `NAV_ITEMS` in `frontend/src/nav.js`
7. **API client functions:** Add fetch helpers in `frontend/src/api.js`
8. **Stale data indicators:** Warning badges/banners for outdated sync data
9. **Tests:** Backend endpoint tests + frontend component tests (following existing patterns: `unittest` for backend, Vitest + React Testing Library for frontend)

### What Will NOT Be Built
- Benchmark comparison (Phase 6)
- Forecasting or projections (Phase 4)
- Monte Carlo or AI analysis (Phase 5)
- Manual data entry or override of any kind
- Security price history tracking
- Dedicated mobile layout components
- Tax lot tracking
- Trading actions
- Dividend tracking
