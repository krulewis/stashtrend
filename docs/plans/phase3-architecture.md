# Phase 3: Investments Page -- Architecture Decision Document

**Date:** 2026-03-09
**Author:** Architect Agent
**Status:** Approved -- ready for engineering plan
**Depends on:** Phase 0 (holdings sync), Phase 1 (NW by type + CAGR)
**Size:** L

---

## Decision Summary

Phase 3 adds a new `/investments` page to Stashtrend with three backend API endpoints serving account-level performance metrics, per-account holdings detail, and time-series performance data including contribution detection. The frontend uses a URL-parameter-driven two-view architecture (dashboard at `/investments`, drill-down at `/investments/:accountId`) within a single page component, following established patterns for data fetching (useState + useEffect + Promise.all), charting (Recharts), and navigation (NAV_ITEMS). No new database tables are required. All computation (CAGR, returns, allocation, contributions) happens server-side. Client-side sort and filter apply to the holdings table only.

---

## Decision 1: API Endpoint Structure

### Decision
Three endpoints in `backend/app.py`:

1. **`GET /api/investments/summary`** -- Returns all investment accounts with computed metrics (returns, CAGR, allocation weight, staleness) and portfolio-level totals.
2. **`GET /api/investments/accounts/<account_id>/holdings`** -- Returns holdings for one account with computed gain/loss, allocation breakdown by security type, and account-level totals.
3. **`GET /api/investments/performance?accounts=<ids>&range=<range>`** -- Returns time-series balance data and monthly contribution estimates for charting.

### Rationale
Three endpoints rather than one monolithic endpoint or four fine-grained endpoints. The split follows the data access pattern: the dashboard view needs summary data (endpoint 1), the drill-down needs holdings for one account (endpoint 2), and the chart needs time-series data that can be filtered by range and account selection (endpoint 3). Contributions are bundled into the performance endpoint because they share the same time-range filter and are always displayed alongside performance data on the chart. This avoids an extra round trip compared to a separate `/contributions` endpoint.

### Rejected Alternatives

**Option A: Single monolithic endpoint returning everything.**
Rejected because the holdings drill-down is per-account and on-demand. Preloading all holdings for all accounts wastes bandwidth and increases response time. A user may never drill into most accounts.

**Option B: Four endpoints (summary, holdings, performance, contributions separately).**
Rejected because contributions and performance share the same time-range context and are always displayed together on the chart. Separating them adds an unnecessary HTTP request and complicates the frontend data-joining logic. The performance endpoint already queries `account_history` by date range; adding a `transactions` query in the same handler is a minor addition.

**Option C: Reuse/extend the existing `/api/accounts/summary` endpoint.**
Rejected because investment-specific computed fields (CAGR, total return, allocation weight, holdings count) would bloat a general-purpose accounts endpoint. The investments page has materially different data requirements from the net worth page's account breakdown.

### Risks
- `app.py` grows by approximately 200-250 lines, continuing the single-file pattern. Accepted tech debt; Flask Blueprints refactor is out of scope.
- The performance endpoint queries both `account_history` (potentially thousands of rows) and `transactions` tables in a single request. Mitigated by server-side date filtering and returning pre-aggregated data.

---

## Decision 2: Holdings Drill-Down Navigation Pattern

### Decision
URL-based sub-route: `/investments/:accountId` for the holdings drill-down. A single `InvestmentsPage` component reads `useParams()` to determine which view to render:

- No `accountId` param --> render the account dashboard (summary view)
- `accountId` present --> render the holdings detail view for that account

Two `<Route>` entries in `App.jsx`:
```
<Route path="/investments" element={<InvestmentsPage />} />
<Route path="/investments/:accountId" element={<InvestmentsPage />} />
```

The nav item in `nav.js` uses `path: '/investments'` with the `end` prop on its `NavLink` so that `/investments/:accountId` does not highlight the nav item differently (it should stay highlighted as the investments section).

### Rationale
URL-based drill-down provides bookmarkable URLs, browser back-button support, and clean separation of data fetching (summary data fetched only on the dashboard view, holdings data fetched only on drill-down). This matches user expectations for navigation: clicking an account changes the URL, and the back button returns to the dashboard. The single component approach avoids duplicating page chrome (header, refresh button, error handling).

### Rejected Alternatives

**Option A: Accordion expand in-place.**
Rejected because it does not produce shareable URLs, breaks browser back-button expectations, requires preloading or lazy-loading holdings data within the dashboard component (complicating state management), and becomes visually cramped with a full holdings table including sort/filter controls and a donut chart inside an accordion panel.

**Option B: Separate page components (`InvestmentsDashboard` and `InvestmentsDetail`).**
Rejected because it duplicates page shell code (header, refresh button, error boundary pattern). Both views share the same page-level concerns. A single component with conditional rendering based on `useParams()` is cleaner and matches how the existing codebase handles similar patterns.

**Option C: Modal/drawer overlay.**
Rejected because the holdings view is data-dense (sortable table, allocation chart, multiple metrics) and does not fit well in a constrained overlay. It also breaks URL expectations and accessibility patterns (focus trapping in a large data view is awkward).

### Risks
- The `nav.js` comment warns about the `end` prop for NavLink when sub-routes share a prefix. The `/investments` and `/investments/:accountId` routes share a prefix, so the NavLink for "Investments" needs `end={false}` (or no `end` prop, which is the default in react-router v6) to stay active on both routes. This is straightforward but must not be overlooked.
- Browser forward/back with stale data: if a user navigates back to the dashboard after viewing holdings, the dashboard state should still be in memory (React keeps it since the same component instance handles both routes). No extra caching needed.

---

## Decision 3: Frontend Component Hierarchy and Data Flow

### Decision

```
InvestmentsPage (page component, owns all state)
  |-- [Dashboard View: when no accountId param]
  |     |-- StatsCards (reuse pattern, not component -- investments-specific stats)
  |     |-- InvestmentAccountsTable (account list with metrics, clickable rows)
  |     |-- InvestmentPerformanceChart (Recharts LineChart + contribution bars)
  |     |     |-- RangeSelector (reuse existing component)
  |     |     |-- AccountToggleChips (multi-select checkboxes)
  |
  |-- [Detail View: when accountId param present]
        |-- AccountDetailHeader (account name, institution, back link, summary metrics)
        |-- HoldingsTable (sortable, filterable table)
        |-- AllocationChart (Recharts PieChart donut)
```

Data flow:
- `InvestmentsPage` fetches summary + performance data on mount (dashboard view) using `Promise.all` with `useState`/`useEffect`, following the `NetWorthPage` pattern.
- When `accountId` changes (drill-down), the page fetches holdings data for that account.
- Sort/filter state for the holdings table is local to `HoldingsTable` (client-side only).
- Chart range and account selection state live in `InvestmentsPage` and are passed down as props to `InvestmentPerformanceChart`.
- The performance endpoint is re-fetched when range changes. Account toggle is client-side filtering of already-fetched series data (all accounts are returned by default).

### Rationale
This follows the established pattern exactly: page component owns data, children are presentational. `NetWorthPage` does the same thing with `StatsCards`, `NetWorthChart`, `AccountsBreakdown`, and `TypeStackedChart`. No global state management (Context, Redux) is needed because data does not cross page boundaries.

### Rejected Alternatives

**Option A: Each child component fetches its own data.**
Rejected because it fragments loading/error state management, makes coordinated refresh (the Refresh button) harder to implement, and deviates from the established pattern where the page component is the single data owner.

**Option B: React Context for shared investments state.**
Rejected because the data does not need to be shared across pages or deeply nested components. Props drilling is shallow (one level) and the component tree is not deep enough to justify the indirection. Adding Context here would be an unnecessary architectural divergence from every other page in the app.

### Risks
- The dashboard view fetches both summary and performance data in parallel. If the performance endpoint is slow (large date ranges), it should not block the summary stats from rendering. Mitigation: fetch summary and performance independently with separate loading states, so summary cards and account table render first while the chart shows a skeleton.
- Component count: 6-7 new components. This is larger than typical for this codebase but justified by the feature scope. Each component has a clear single responsibility.

---

## Decision 4: Performance Chart Architecture

### Decision
A single `InvestmentPerformanceChart` component using Recharts `ComposedChart` (combining `Line` for performance and `Bar` for contributions). Features:

- **Y-axis toggle:** Switch between absolute value ($) and percentage change (%) using a simple toggle button. When in percentage mode, the data is transformed client-side to show each series as `((value - first_value) / first_value) * 100`. This is a display transformation, not a separate API call.
- **Account toggles:** Multi-select chips (following `GroupsTimeChart` pattern). Default: "All accounts combined" line shown. Individual accounts toggleable. The API returns all requested account series; toggling is client-side show/hide of `<Line>` components.
- **Range selector:** Reuse `RangeSelector` component with `COMMON_RANGES`. When range changes, re-fetch from the performance endpoint with the new range parameter to avoid sending years of unnecessary data.
- **Contribution overlay:** Monthly contribution bars rendered as `<Bar>` elements on a secondary Y-axis (right side) so the scale does not distort the performance lines.

### Rationale
`ComposedChart` from Recharts supports mixing `Line` and `Bar` in a single chart, which is exactly what the contribution overlay requires. The percentage toggle is a client-side transform because both modes use the same underlying data; making a separate API call for percentage data would be wasteful. Re-fetching on range change (rather than fetching all data and filtering client-side) keeps response payloads reasonable for users with years of history.

### Rejected Alternatives

**Option A: Two separate charts (performance line chart + contributions bar chart).**
Rejected because the requirements specify visual integration of contributions with performance (distinguishing contribution-driven growth from market growth). Separate charts make this comparison harder and waste vertical space.

**Option B: Fetch all data once and filter client-side for all ranges.**
Rejected because `account_history` can have daily data for 5+ years across 10+ accounts, resulting in tens of thousands of rows. The backend should filter by date range to keep payload sizes manageable. The `downsample()` utility handles rendering performance, but network transfer of unused data is still wasteful.

**Option C: Stacked area chart for contributions vs. market growth.**
Rejected because accurately decomposing total value into "contribution-driven" vs. "market-driven" growth requires tracking cumulative contributions over time and subtracting from total balance. While conceptually appealing, the imprecision of contribution detection (fuzzy transfer matching) would make the stacked areas misleading. A separate bar overlay for contributions is honest about what it shows: "this is how much went in each month" alongside "this is total value over time."

### Risks
- Dual Y-axis charts can be visually confusing. Mitigation: use clearly distinct visual treatment (lines for performance, subtle bars for contributions), label both axes, and consider making the contribution bars optional (collapsible).
- Contribution bars may dwarf or be dwarfed by the performance line depending on scale. The secondary Y-axis handles this, but the visual relationship between the two scales could mislead users. Mitigation: use a muted color for contribution bars and add a tooltip explaining the dual scale.

---

## Decision 5: CAGR Computation

### Decision
Create a new `_compute_account_cagr(account_id, conn)` function in `app.py` alongside the investments endpoints. This function queries `account_history` for the given account and computes CAGR using the same math as `_compute_bucket_cagr` but adapted for per-account use:

1. Query `account_history` for the account, ordered by date.
2. Strip leading zero/null balance entries.
3. If fewer than 30 non-zero days, return `None`.
4. Compute overall CAGR from earliest non-zero balance to latest balance.
5. Return a single CAGR percentage (not the 1y/3y/5y breakdown that bucket CAGR uses).

The summary endpoint calls this function once per investment account. Results are labeled "Estimated CAGR" in the frontend with a tooltip explaining the balance-based approximation.

### Rationale
A single overall CAGR per account (rather than 1y/3y/5y) is simpler for the account dashboard table where screen space is limited. Users can assess time-period performance via the interactive chart. The function reuses the same mathematical formula as `_compute_bucket_cagr` but does not share code because the bucket function operates on a pre-built dict of date-to-balance, while the account function queries the DB directly. The duplication is minimal (5-10 lines of math) and the calling patterns are different enough that a shared abstraction would be forced.

### Rejected Alternatives

**Option A: Extract a shared CAGR math utility used by both bucket and account CAGR.**
Rejected because the refactor touches existing working code (`_compute_bucket_cagr`) for marginal benefit. The math is a 3-line formula. Extracting it into a shared function adds indirection without reducing meaningful duplication. If a third CAGR consumer appears, refactoring at that point follows the "rule of three."

**Option B: Compute CAGR client-side from the performance time-series data.**
Rejected because it creates a dependency between the summary view (which does not fetch performance data) and the chart data. It also means the summary endpoint cannot return CAGR, forcing the frontend to make two requests before rendering the account table. Server-side computation keeps the API self-contained.

**Option C: Return 1y/3y/5y CAGR per account (matching bucket CAGR structure).**
Rejected for the dashboard view because displaying three CAGR values per account in a table row is too dense. However, this could be added to the holdings drill-down view in a future iteration if users request it. The architecture does not preclude this.

### Risks
- Computing CAGR per account in the summary endpoint means N database queries (one per investment account) for CAGR. For typical portfolios (< 20 accounts), this is fast. Mitigation: if performance becomes an issue, batch the `account_history` query to fetch all investment accounts at once and compute CAGR in Python.
- Balance-based CAGR is inflated by contributions (a known limitation carried forward from Phase 1). The "Estimated CAGR" label and tooltip mitigate user confusion.

---

## Decision 6: Contribution Detection Logic

### Decision
Detect contributions by querying the `transactions` table joined to `categories` on `category_id`, filtering for:

1. `account_id` belongs to a Retirement or Brokerage bucket account
2. The category's `group_type = 'transfer'` (from the `categories` table, not string matching on `category_group`)
3. `amount > 0` (positive amounts indicate money flowing into the account)
4. `is_pending = 0` (exclude pending transactions)

Aggregate by `strftime('%Y-%m', t.date)` per account and in total.

SQL sketch:
```sql
SELECT
    t.account_id,
    strftime('%Y-%m', t.date) AS month,
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS contributions
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE t.account_id IN (?)  -- investment account IDs
  AND c.group_type = 'transfer'
  AND t.is_pending = 0
GROUP BY t.account_id, strftime('%Y-%m', t.date)
ORDER BY month ASC
```

Results are labeled "Estimated Contributions" everywhere in the UI with a tooltip: "Based on transfer transactions detected by Monarch. May include rollovers and inter-account transfers."

### Rationale
Joining to the `categories` table on `group_type = 'transfer'` is more reliable than string matching on `transactions.category_group` because `group_type` is a structured enum-like field that Monarch uses consistently, whereas `category_group` is a display name that could vary. The budget endpoint already uses this exact filter pattern (`c.group_type <> 'transfer'` at app.py:1171) to exclude transfers, so we know the data model supports it. Filtering on `amount > 0` captures inflows; negative amounts on investment accounts would be withdrawals (which we may want to track separately in future phases but are out of scope here).

### Rejected Alternatives

**Option A: String match on `transactions.category_group`.**
Rejected because `category_group` is a text field containing Monarch's display group name. It could be "Transfer", "Transfers", "transfer", or localized differently. The `categories.group_type` field is the canonical classification used by the existing codebase for this purpose.

**Option B: Create a separate contributions table populated by a background job.**
Rejected because contributions are derived data from existing transactions. A separate table adds schema complexity, sync maintenance, and potential staleness issues for no benefit. The query is fast (indexed by account_id and date) and the results are small (one row per account per month).

**Option C: Detect contributions by looking at large deposits or specific merchant names.**
Rejected because it requires heuristics that are fragile and account-type-specific. Transfer categorization from Monarch is the best signal available without manual user input.

### Risks
- Contribution detection is inherently imprecise. Rollovers between investment accounts, employer matches, and inter-account shuffles all appear as transfers. The "Estimated" label is essential.
- If a user has no transfer-categorized transactions on their investment accounts (e.g., Monarch categorizes 401k payroll deductions differently), the contribution section will show "No contribution data detected." This is an acceptable degraded state per the requirements.
- Monarch's sign convention for transfers is not verified against real data. The assumption that `amount > 0` means inflow needs validation during implementation. If inverted, the fix is a one-line change (`amount < 0`).

---

## Decision 7: Security Type Normalization

### Decision
Normalize `holdings.security_type` server-side in the holdings endpoint to a canonical set of display categories:

| Raw Monarch Value | Display Category |
|---|---|
| `stock`, `equity` | Stock |
| `etf`, `exchange_traded_fund` | ETF |
| `mutual_fund`, `mutual fund` | Mutual Fund |
| `bond`, `fixed_income` | Bond |
| `cash`, `money_market`, `cash_equivalent` | Cash |
| NULL, empty, or unrecognized | Other |

The normalization mapping is a Python dict in `app.py`. The allocation chart groups holdings by the normalized type. Types representing less than 2% of total value are grouped into "Other" for the donut chart (this grouping happens server-side in the `allocation` array of the holdings response).

### Rationale
Monarch's `security_type` values are not documented and may vary across providers. Normalizing server-side ensures consistent display regardless of upstream data quality. Grouping small slices into "Other" prevents the donut chart from having many unreadable tiny segments. The 2% threshold balances informativeness with readability.

### Rejected Alternatives

**Option A: Display raw Monarch values without normalization.**
Rejected because raw values include inconsistent casing, underscores, and provider-specific terminology. "mutual_fund" and "Mutual Fund" should not appear as separate allocation categories.

**Option B: Normalize client-side.**
Rejected because the allocation breakdown is returned pre-computed from the API. Putting normalization logic in the frontend would mean the client needs to know about Monarch's raw values, coupling it to the data pipeline. Server-side normalization keeps this concern in the backend.

### Risks
- Unknown Monarch security types will fall into "Other." If a significant portion of holdings have unrecognized types, the allocation chart will be dominated by "Other." Mitigation: log unrecognized types server-side (similar to the unknown account type warning in `_get_bucket`) so new types can be added to the mapping.

---

## Decision 8: Account Filtering Criteria

### Decision
The investments endpoints filter accounts using the same criteria as the existing net worth page:

```sql
WHERE include_in_net_worth = 1
  AND is_hidden = 0
  AND _get_bucket(type, subtype) IN ('Retirement', 'Brokerage')
```

This means: visible, included-in-net-worth accounts that fall into the Retirement or Brokerage buckets per `BUCKET_MAP`/`TYPE_MAP`.

### Rationale
Consistency with the net worth page prevents user confusion about why account totals differ between pages. The `include_in_net_worth` filter is the user's explicit signal about which accounts matter. The `is_hidden` filter excludes accounts the user has deliberately hidden. The bucket filter narrows to investment-type accounts only. This matches the requirements (FR-1.1: "include accounts where `_get_bucket()` returns Retirement or Brokerage, AND `include_in_net_worth = 1`, AND `is_hidden = 0`").

### Rejected Alternatives

**Option A: Show all accounts in Retirement/Brokerage buckets regardless of `include_in_net_worth`.**
Rejected because it contradicts user intent. If a user excluded an account from net worth, showing it on the investments page would be confusing. Consistency across pages is more important than completeness.

**Option B: Add a separate "include in investments" flag.**
Rejected because it requires a schema change and user-facing settings for a problem that does not exist yet. If users request different visibility rules for investments vs. net worth, this can be added later.

### Risks
- An account with `include_in_net_worth = 0` but valid investment holdings will not appear. This is intentional but could surprise users who expect the investments page to be comprehensive. The empty state messaging should guide users to check their account settings if they expect to see more accounts.

---

## Design Details

### API Contracts

#### `GET /api/investments/summary`

Response:
```json
{
  "accounts": [
    {
      "id": "acct-1",
      "name": "Fidelity 401k",
      "institution": "Fidelity",
      "type": "401k",
      "subtype": "st_401k",
      "bucket": "Retirement",
      "current_value": 250000.00,
      "total_cost_basis": 180000.00,
      "total_return_dollars": 70000.00,
      "total_return_pct": 38.89,
      "cagr_pct": 8.2,
      "allocation_weight_pct": 45.5,
      "holdings_count": 12,
      "last_synced_at": "2026-03-09T10:00:00Z",
      "is_stale": false,
      "stale_days": 0
    }
  ],
  "totals": {
    "current_value": 549000.00,
    "total_cost_basis": 400000.00,
    "total_return_dollars": 149000.00,
    "total_return_pct": 37.25,
    "holdings_count": 35,
    "cagr_pct": 7.8
  }
}
```

Data assembly:
1. Query `accounts` with bucket filter (Retirement + Brokerage, in-net-worth, not hidden).
2. For each account, query `holdings` aggregates: `SUM(total_value)`, `SUM(basis)`, `COUNT(*)`, `MAX(last_synced_at)`.
3. Compute per-account: total_return, return_pct, allocation_weight.
4. Compute per-account CAGR from `account_history`.
5. Compute staleness: `is_stale` = last_synced_at > 24 hours ago; `stale_days` = days since last sync.
6. Compute totals across all accounts.

Accounts with zero holdings: use `accounts.current_balance` as `current_value`, set `total_cost_basis` / returns / CAGR to null, `holdings_count` to 0.

#### `GET /api/investments/accounts/<account_id>/holdings`

Response:
```json
{
  "account": {
    "id": "acct-1",
    "name": "Fidelity 401k",
    "institution": "Fidelity",
    "bucket": "Retirement"
  },
  "holdings": [
    {
      "id": "h1",
      "ticker": "AAPL",
      "security_name": "Apple Inc.",
      "security_type": "Stock",
      "quantity": 50.0,
      "cost_basis": 7500.00,
      "current_value": 9800.00,
      "current_price": 196.00,
      "unrealized_gain_loss_dollars": 2300.00,
      "unrealized_gain_loss_pct": 30.67,
      "is_manual": 0
    }
  ],
  "allocation": [
    { "type": "Stock", "value": 180000.00, "pct": 72.0 },
    { "type": "ETF", "value": 50000.00, "pct": 20.0 },
    { "type": "Other", "value": 20000.00, "pct": 8.0 }
  ],
  "totals": {
    "current_value": 250000.00,
    "total_cost_basis": 180000.00,
    "unrealized_gain_loss_dollars": 70000.00,
    "unrealized_gain_loss_pct": 38.89
  }
}
```

Data assembly:
1. Validate account_id belongs to an investment account (Retirement/Brokerage bucket). Return 404 if not.
2. Query all holdings for the account.
3. Normalize security_type per Decision 7.
4. Compute per-holding gain/loss. Null basis -> null gain/loss fields.
5. Compute allocation by grouping normalized types. Merge types < 2% into "Other."
6. Compute totals.

#### `GET /api/investments/performance?accounts=<ids>&range=<range>`

Query params:
- `accounts`: comma-separated account IDs (optional; omit for all investment accounts)
- `range`: `3m`, `6m`, `1y`, `3y`, `5y`, `all` (default: `1y`)

Response:
```json
{
  "series": [
    {
      "date": "2025-03-09",
      "total": 480000.00,
      "accounts": {
        "acct-1": 220000.00,
        "acct-2": 260000.00
      }
    }
  ],
  "contributions": [
    {
      "month": "2025-03",
      "total": 3500.00,
      "accounts": {
        "acct-1": 1500.00,
        "acct-2": 2000.00
      }
    }
  ],
  "account_names": {
    "acct-1": "Fidelity 401k",
    "acct-2": "Schwab Brokerage"
  }
}
```

Data assembly:
1. Determine investment account IDs (from `accounts` param or all investment accounts).
2. Compute date cutoff from `range` param.
3. Query `account_history` for those accounts from cutoff date forward.
4. Pivot into date-keyed series with per-account values and a total.
5. Query `transactions` joined to `categories` for contribution detection (Decision 6).
6. Aggregate contributions by month per account.
7. Include `account_names` map so the frontend can label chart legends without a separate request.

### Data Model Changes

**None.** All data sources exist: `accounts`, `holdings`, `account_history`, `transactions`, `categories`. No new tables, columns, or migrations.

### Component Structure (New Files)

| File | Purpose |
|------|---------|
| `frontend/src/pages/InvestmentsPage.jsx` | Page component, data fetching, view switching |
| `frontend/src/pages/InvestmentsPage.module.css` | Page styles |
| `frontend/src/components/InvestmentAccountsTable.jsx` | Account dashboard table |
| `frontend/src/components/InvestmentAccountsTable.module.css` | Table styles |
| `frontend/src/components/InvestmentPerformanceChart.jsx` | Performance line chart + contribution bars |
| `frontend/src/components/InvestmentPerformanceChart.module.css` | Chart styles |
| `frontend/src/components/HoldingsTable.jsx` | Sortable/filterable holdings table |
| `frontend/src/components/HoldingsTable.module.css` | Table styles |
| `frontend/src/components/AllocationChart.jsx` | Donut chart for asset allocation |
| `frontend/src/components/AllocationChart.module.css` | Donut styles |
| `frontend/src/components/AccountDetailHeader.jsx` | Drill-down header with back link |
| `frontend/src/components/AccountDetailHeader.module.css` | Header styles |

Modified files:
- `frontend/src/App.jsx` -- add two Route entries
- `frontend/src/nav.js` -- add nav item at index 1
- `frontend/src/api.js` -- add three fetch functions
- `backend/app.py` -- add three endpoints + helper functions

### Navigation Integration

Nav item added to `NAV_ITEMS` at index 1 (after Net Worth, before Account Groups):
```js
{ path: '/investments', label: 'Investments', icon: '\uD83D\uDCBC' }
```

Routes in `App.jsx`:
```jsx
<Route path="/investments" element={<InvestmentsPage />} />
<Route path="/investments/:accountId" element={<InvestmentsPage />} />
```

Both `Sidebar.jsx` and `BottomTabBar.jsx` automatically pick up the new nav item since they consume `NAV_ITEMS` directly.

### API Client Functions (`api.js`)

```js
// -- Investments
export const fetchInvestmentsSummary = () => fetchJSON('/api/investments/summary')
export const fetchInvestmentsHoldings = (accountId) => fetchJSON(`/api/investments/accounts/${accountId}/holdings`)
export const fetchInvestmentsPerformance = (range = '1y', accounts = '') =>
  fetchJSON(`/api/investments/performance?range=${range}${accounts ? `&accounts=${accounts}` : ''}`)
```

---

## Performance Considerations

### Data Volume Estimates
- Accounts: < 20 investment accounts (typical)
- Holdings: < 200 total across all accounts
- Account history: up to ~1,800 rows per account per 5 years (daily), so ~36,000 rows for 20 accounts at 5Y range
- Transactions: variable, but transfer-type transactions on investment accounts are a small subset

### Optimization Strategy
1. **Summary endpoint:** Single pass through accounts, batch holdings aggregation with `GROUP BY account_id` rather than per-account queries. CAGR queries are per-account but fast (index on account_id + date).
2. **Holdings endpoint:** Single account, typically < 50 holdings. No optimization needed.
3. **Performance endpoint:** Server-side date filtering reduces data volume. The frontend applies `downsample()` from `chartUtils.jsx` (max 200 points) for chart rendering performance.
4. **Progressive loading:** The dashboard view fetches summary data and performance data independently. Summary stats and account table render immediately; the chart can show a skeleton while performance data loads.
5. **On-demand drill-down:** Holdings data is fetched only when a user clicks into an account, not preloaded.

### Target Performance
- Summary endpoint: < 500ms for 20 accounts
- Holdings endpoint: < 200ms for a single account
- Performance endpoint: < 1s for 1Y range, < 2s for All range
- Full page render: < 2s from navigation (matching NFR)

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `holdings.basis` is NULL for most holdings, making return calculations useless | Medium | Show "N/A" for return fields; still show current value. UI should not feel broken when basis is missing. |
| Contribution detection misclassifies rollovers/transfers as contributions | Medium | Label as "Estimated Contributions" with tooltip. This is a known approximation. |
| Monarch's `amount` sign convention for transfers is inverted from assumption | Low | Verify during implementation against real data. Fix is a one-line change. |
| `security_type` values from Monarch include unknown types | Low | Log unrecognized types (like `_get_bucket` does). Default to "Other." |
| `app.py` continues growing (already ~2,400 lines) | Low | Accepted tech debt. Blueprints refactor is out of scope but should be considered for Phase 4+. |
| Performance endpoint slow for large date ranges (All) | Medium | Server-side date filtering. Frontend downsample. Consider caching if needed post-launch. |

---

## Open Questions (Requiring Human Judgment)

1. **Monarch transfer sign convention:** Does `amount > 0` on a transaction mean money flowing into the account, or is Monarch's convention inverted? This needs verification against real transaction data before the contribution query is finalized. The implementer should check a sample of known contribution transactions in the DB during development.

2. **Portfolio-level allocation chart:** The requirements specify per-account allocation charts in the drill-down. Should the dashboard also show an aggregate allocation chart across all accounts? This is a nice-to-have and can be deferred to a follow-up if scope needs to be controlled. Recommendation: defer to post-Phase 3 unless trivially addable.

3. **Contribution bar visibility default:** Should the contribution bars on the performance chart be shown by default, or hidden behind a toggle? If most users have no contribution data, showing empty bars wastes chart space. Recommendation: show by default if contribution data exists; hide the contribution layer entirely if no contributions are detected.

4. **Donut chart small-slice threshold:** The 2% threshold for grouping into "Other" is an assumption. Should it be higher (5%) for cleaner visuals, or is 2% appropriate? Recommendation: start with 2% and adjust based on real data during QA.
