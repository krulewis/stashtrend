# Phase 3: Investments Page — Architecture Decision Record

**Date:** 2026-03-09
**Source:** Architect Agent
**Inputs:** phase3-requirements.md, phase3-research.md
**Status:** Approved for design + engineering

---

## Decision 1: API Design — New Endpoints

### Decision
Create four new Flask endpoints following existing patterns:

```
GET /api/investments/summary        → account-level performance dashboard data
GET /api/investments/:accountId     → holdings drill-down for one account
GET /api/investments/performance    → time-series for performance chart
GET /api/investments/contributions  → contribution detection from transactions
```

### Rationale
- Follows the existing pattern of domain-scoped endpoints (`/api/networth/*`, `/api/budgets/*`)
- Separates concerns: summary (list view), detail (drill-down), time-series (chart), contributions (derived data)
- `/api/investments/summary` returns aggregated data per account (joins holdings + accounts + account_history for CAGR)
- `/api/investments/:accountId` returns raw holdings rows for the drill-down table
- `/api/investments/performance` returns time-series from `account_history` filtered to investment accounts, with optional `?accounts=id1,id2` query param
- `/api/investments/contributions` queries `transactions` for transfers into investment accounts, aggregated monthly

### Rejected Alternative: Single monolithic endpoint
A single `/api/investments` returning everything would be simpler but creates a slow, over-fetching request on initial page load. The performance chart data (potentially thousands of daily data points) should only load when the chart section is visible or requested.

### Rejected Alternative: GraphQL
Overkill for this project. The app uses simple REST everywhere — no reason to introduce GraphQL complexity.

---

## Decision 2: Frontend Routing — URL-Based Drill-Down

### Decision
Use URL parameters for the holdings drill-down:

```
/investments              → account-level dashboard (default view)
/investments/:accountId   → holdings drill-down for specific account
```

### Rationale
- Bookmarkable URLs — user can share or return to a specific account's holdings
- Browser back button works naturally (return from drill-down to dashboard)
- Consistent with web app best practices
- Single `InvestmentsPage` component reads `useParams()` to determine view mode

### Rejected Alternative: Modal/panel overlay
Would keep the user on the same URL but loses bookmarkability and complicates the component tree. Also inconsistent with the app's page-based navigation pattern.

### Rejected Alternative: Separate route/page for drill-down
`/holdings/:accountId` as a completely separate page would work but creates unnecessary code duplication (page header, loading states, error handling). A single page component with conditional rendering based on URL params is cleaner.

---

## Decision 3: Component Architecture

### Decision

```
InvestmentsPage (page)
├── InvestmentsSummary (account-level dashboard)
│   ├── InvestmentStatsCards (portfolio totals)
│   ├── InvestmentPerformanceChart (multi-account line chart)
│   ├── InvestmentAccountList (sortable account cards/rows)
│   └── PortfolioAllocationChart (donut chart - aggregate)
├── HoldingsDetail (drill-down, shown when :accountId present)
│   ├── HoldingsHeader (account name, back button, summary stats)
│   ├── HoldingsAllocationChart (donut chart - per account)
│   └── HoldingsTable (sortable/filterable table)
```

### Rationale
- Mirrors the pattern established by NetWorthPage (StatsCards + Chart + Breakdown)
- Each component has a single responsibility
- Donut chart component is shared between portfolio-level and account-level views
- `InvestmentStatsCards` follows the `StatsCards` pattern (horizontal card row)
- Performance chart reuses `sharedChartElements()`, `RangeSelector`, `COMMON_RANGES` from chartUtils

### File Layout
```
frontend/src/pages/
  InvestmentsPage.jsx
  InvestmentsPage.module.css
  InvestmentsPage.test.jsx

frontend/src/components/
  InvestmentStatsCards.jsx
  InvestmentStatsCards.module.css
  InvestmentStatsCards.test.jsx
  InvestmentPerformanceChart.jsx
  InvestmentPerformanceChart.module.css
  InvestmentPerformanceChart.test.jsx
  InvestmentAccountList.jsx
  InvestmentAccountList.module.css
  InvestmentAccountList.test.jsx
  AllocationChart.jsx              (shared donut chart)
  AllocationChart.module.css
  AllocationChart.test.jsx
  HoldingsDetail.jsx
  HoldingsDetail.module.css
  HoldingsDetail.test.jsx
  HoldingsTable.jsx
  HoldingsTable.module.css
  HoldingsTable.test.jsx
```

---

## Decision 4: State Management — Page-Local

### Decision
All state lives in `InvestmentsPage` via `useState` + `useEffect`, passed down as props. No global state, no context, no external state library.

### Rationale
- Consistent with every other page in the app (NetWorthPage, BudgetPage, etc.)
- Investment data doesn't need to be shared across pages
- Simple data flow: page fetches → sets state → passes to children
- Loading/error states handled at page level (same pattern as NetWorthPage)

### Rejected Alternative: React Context for investment state
Unnecessary complexity. Context would only be useful if multiple unrelated components at different tree levels needed investment data — they don't.

---

## Decision 5: CAGR Calculation — Backend

### Decision
CAGR is calculated on the backend in the `/api/investments/summary` endpoint using `account_history` data.

```python
# Pseudocode
earliest = SELECT MIN(date), balance FROM account_history WHERE account_id = ?
latest = SELECT MAX(date), balance FROM account_history WHERE account_id = ?
years = (latest.date - earliest.date).days / 365.25
cagr = (latest.balance / earliest.balance) ** (1 / years) - 1
```

### Rationale
- `account_history` can have thousands of rows per account — better to query aggregate on backend
- CAGR needs earliest/latest balance which is a simple SQL query
- Keeps frontend calculations minimal (just formatting)
- Consistent with how `networth_stats` calculates MoM/YoY on the backend

### Edge Cases Handled
- < 1 year of history: return simple return % instead of CAGR
- Zero beginning balance: return null
- Negative balance (shouldn't happen for investments): return null

---

## Decision 6: Contribution Detection — Backend Query

### Decision
Detect contributions by querying the `transactions` table for transfers into investment accounts:

```sql
SELECT
    strftime('%Y-%m', t.date) AS month,
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS contributions,
    SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END) AS withdrawals
FROM transactions t
JOIN accounts a ON t.account_id = a.id
WHERE a.type IN ('investment', 'brokerage', '401k', 'ira', ...)
  AND t.category IN ('transfer', 'deposit', ...)
GROUP BY month
ORDER BY month
```

### Rationale
- Transaction data already exists from Monarch sync
- No new data storage needed — computed on-the-fly
- Monthly aggregation keeps the response payload small
- The exact category matching will need tuning based on actual Monarch category names

### Risk
- Monarch's category taxonomy for transfers may vary — will need to inspect actual transaction data to finalize the WHERE clause
- May need a configurable category filter rather than hardcoded values

---

## Decision 7: Donut/Pie Chart — Recharts PieChart

### Decision
Use recharts `PieChart` with `Pie` component configured as a donut (inner radius > 0). New shared `AllocationChart` component.

### Rationale
- Recharts is already the charting library in use
- PieChart supports donut configuration natively via `innerRadius` prop
- One component serves both portfolio-level and account-level allocation views
- Props: `data` (array of {name, value, color}), `title` (string)

### Rejected Alternative: External donut chart library (e.g., nivo, chart.js)
Adding a new dependency for a single chart type is not justified when recharts already supports it.

---

## Decision 8: Sort/Filter — Client-Side

### Decision
Holdings table sorting and filtering is implemented entirely on the client side.

### Rationale
- Typical holding count per account is 10-50 — trivially handled client-side
- Avoids round-trips to the server for sort/filter changes
- Consistent with how BudgetTable handles its display logic
- If data volume ever becomes an issue (unlikely for personal finance), can add server-side pagination later

### Implementation
- `useMemo` with sort key + direction state
- Filter state for security type dropdown
- No external table library — plain HTML table with click-to-sort headers

---

## Decision 9: Navigation Placement

### Decision
Insert "Investments" as the second item in `NAV_ITEMS` (after "Net Worth", before "Account Groups"):

```js
{ path: '/investments', label: 'Investments', icon: '💼' }
```

### Rationale
- Investments is the natural next step after Net Worth — both are wealth-related
- Account Groups and Budgets are operational/tracking features — conceptually separate
- Position 2 (index 1) groups the wealth overview tools together

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Contribution detection categories don't match Monarch's taxonomy | Incorrect contribution amounts | Inspect actual transaction data during implementation; use broad category matching; log unmatched transfers |
| Large account_history tables slow CAGR query | Slow page load | Add index on `account_history(account_id, date)`; cache CAGR values if needed |
| Holdings table empty for freshly connected accounts | Poor UX | Clear empty states with sync CTA |
| Donut chart with many small slices | Visual clutter | Group small allocations (< 2%) into "Other" |
| Mobile drill-down navigation confusion | Users can't get back | Prominent back button + breadcrumb in HoldingsDetail header |

---

## Technical Debt Considerations

- The monolithic `backend/app.py` continues to grow. Phase 3 adds ~150-200 lines. A future refactor to Flask Blueprints would be beneficial but is out of scope.
- No database migration tool (Alembic, etc.) — schema changes are additive (`CREATE TABLE IF NOT EXISTS`). No new tables needed for Phase 3 (uses existing holdings + account_history + transactions).
