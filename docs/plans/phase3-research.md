# Phase 3: Investments Page — Research Report

**Date:** 2026-03-09
**Source:** Research Agent — full codebase survey
**Status:** Complete — supersedes prior partial draft

---

## Problem Summary

Phase 3 adds a new Investments page to Stashtrend. It requires: an account-level performance dashboard (summary view), a holdings drill-down (per-account detail), contribution detection from transactions, CAGR per account, a donut allocation chart, and a multi-account performance line chart. All backing data already exists in the DB from Phase 0 (holdings sync) — no new tables are needed. No API endpoints for investments data exist yet.

---

## 1. Existing Page Patterns

### Page Structure Convention
Every page follows a consistent layout:

- Page component: `frontend/src/pages/PageName.jsx`
- CSS Module: `frontend/src/pages/PageName.module.css`
- Test file: `frontend/src/pages/PageName.test.jsx`
- Route: added to `App.jsx` inside `<Routes>` as `<Route path="/path" element={<PageComponent />} />`
- Nav entry: added to `NAV_ITEMS` array in `frontend/src/nav.js`

### Data Fetching Pattern (`NetWorthPage.jsx`)
Pages use local `useState` + `useEffect` with `Promise.all` for parallel loading. No React Query, no Redux:

```jsx
const [stats, setStats] = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

function loadDashboardData() {
  setError(null)
  setLoading(true)
  Promise.all([fetchA(), fetchB()])
    .then(([a, b]) => { setA(a); setB(b); setLastUpdated(new Date().toLocaleTimeString()) })
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false))
}

useEffect(() => { loadDashboardData() }, [])
```

Note that `NetWorthPage` exposes a `loadDashboardData` function bound to the Refresh button — this is the pattern for pages with a manual refresh control.

### Loading / Error State Pattern
Standard loading and error states are rendered conditionally:

```jsx
{loading && <div className={styles.loading}>Loading…</div>}
{!loading && error && <div className={styles.errorBox}>...</div>}
{!loading && !error && <>{/* content */}</>}
```

### Mobile vs Desktop Split (`BudgetPage.jsx`)
When a page needs fundamentally different mobile layouts, `BudgetPage` sets the pattern:
- All data fetching lives in the parent page component
- `useResponsive().isMobile` determines which view to render
- Mobile view component receives data as props — does NOT fetch independently
- Separate `useEffect` for each path (`[months]` for desktop, `[isMobile]` for mobile)
- The `isMobile` guard goes inside `useEffect` body, not in the deps array (prevents re-fetching on resize)

### Refresh Button Pattern
`NetWorthPage` has a named `loadDashboardData()` function referenced by both `useEffect` and the refresh `<button>`. This is the standard for pages that want a manual refresh.

---

## 2. Holdings Data

### Schema (`pipeline/monarch_pipeline/schema.py`, lines 74-89)
```sql
CREATE TABLE IF NOT EXISTS holdings (
    id                  TEXT PRIMARY KEY,
    account_id          TEXT NOT NULL,
    security_id         TEXT,
    security_name       TEXT,
    ticker              TEXT,
    security_type       TEXT,       -- 'stock', 'etf', 'mutual_fund', 'bond', etc.
    quantity            REAL,
    basis               REAL,       -- total cost basis (NOT per-share)
    total_value         REAL,       -- current market value (total)
    current_price       REAL,       -- price per share
    is_manual           INTEGER DEFAULT 0,
    last_synced_at      TEXT,       -- when Monarch last synced this holding
    synced_at           TEXT NOT NULL,  -- when pipeline wrote this row
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

Key point: `basis` is TOTAL cost basis (not per share). Unrealized gain/loss = `total_value - basis`.

### Sync Implementation (`pipeline/monarch_pipeline/storage.py`, lines 201-247)
`upsert_holdings(conn, account_id, holdings)` performs a DELETE+INSERT per account (stale cleanup). This means holdings reflect the most recent sync snapshot — no historical holdings data is stored.

### API Source
`fetchers.fetch_holdings(mm, account_id)` calls `mm.get_account_holdings(account_id)`. The Monarch API returns a GraphQL structure: `{"portfolio": {"aggregateHoldings": {"edges": [{"node": {..., "security": {...}, "holdings": [...]}}]}}}`. The fetcher normalizes this into flat dicts with fields matching the `holdings` schema. Manual holdings (with `is_manual=1`) may have NULL security_id, ticker, current_price, and quantity.

### Holdings Sync Scope
Only accounts with `type = 'investment'` receive holdings sync. In `app.py` line ~487:
```python
if a.get("type", {}).get("name") == "investment"
```
This uses the raw Monarch API type name (not our bucketed display type).

### No Existing Holdings API Endpoints
Despite the Phase 0 sync being complete and the `holdings` table being populated, there are zero `/api/investments/` or `/api/holdings/` endpoints in `app.py`. Phase 3 must create all of them.

---

## 3. Account Data

### Schema (`pipeline/monarch_pipeline/schema.py`, lines 12-25)
```sql
CREATE TABLE IF NOT EXISTS accounts (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    type                    TEXT,                   -- Monarch type (e.g. 'investment', 'checking')
    subtype                 TEXT,                   -- Monarch subtype (e.g. 'ira', 'roth_401k')
    current_balance         REAL,
    display_balance         REAL,
    institution             TEXT,
    is_hidden               INTEGER DEFAULT 0,
    is_asset                INTEGER DEFAULT 1,
    include_in_net_worth    INTEGER DEFAULT 1,
    last_updated            TEXT,
    synced_at               TEXT NOT NULL
);
```

### Investment Account Identification
Investment accounts are identified in two ways:
1. Raw Monarch API: `type = 'investment'` (used by holdings sync)
2. Bucketed display: `BUCKET_MAP` in `app.py` (lines 647-694) maps type+subtype to Retirement, Brokerage, etc.

The `_get_bucket(type, subtype)` function checks `TYPE_MAP` (subtype first) then `BUCKET_MAP` (type fallback). Relevant investment buckets:

```python
BUCKET_MAP = {
    "401k": "Retirement", "ira": "Retirement", "roth_ira": "Retirement",
    "brokerage": "Brokerage", "investment": "Brokerage", "hsa": "Brokerage",
    ...
}
TYPE_MAP = {
    "traditional_ira": "Retirement", "roth": "Retirement", "individual": "Brokerage", ...
}
```

The Investments page should filter for accounts in Retirement and Brokerage buckets (not just `type = 'investment'`) to match what users consider "investments".

### Account History Table
```sql
CREATE TABLE IF NOT EXISTS account_history (
    account_id  TEXT NOT NULL,
    date        TEXT NOT NULL,  -- YYYY-MM-DD
    balance     REAL,
    PRIMARY KEY (account_id, date),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

Daily balance snapshots. Used for CAGR calculation and the performance time-series chart. Can have thousands of rows per account.

### Existing Account Summary Endpoint
`GET /api/accounts/summary` (`app.py` line 610) returns all non-hidden, in-net-worth accounts with type, subtype, is_asset, institution, name, current_balance, display_balance, and a computed `bucket` field (via `_get_bucket`). This can be reused or adapted for the investments page's account list.

---

## 4. Charting Library and Patterns

### Library
Recharts v2.12.7 (`package.json`). Already used for AreaChart, LineChart, BarChart. `PieChart` (for donut) is available but not yet used in any component.

### Shared Chart Infrastructure (`frontend/src/components/chartUtils.jsx`)

Constants that must be used (CSS vars don't work in SVG attributes):
```js
COLOR_ACCENT   = '#4D9FFF'
COLOR_POSITIVE = '#2ECC8A'
COLOR_NEGATIVE = '#FF5A7A'
COLOR_AMBER    = '#F5A623'
AXIS_TICK      = { fill: '#4A6080', fontSize: 11 }
GRID_STROKE    = '#1E2D4A'
TOOLTIP_STYLE  = { background: '#1C2333', border: '1px solid #1E2D4A', borderRadius: 8, ... }
COMMON_RANGES  = [{ label: '3M', months: 3 }, { label: '6M', months: 6 }, { label: '1Y', months: 12 }, { label: '2Y', months: 24 }, { label: 'All', months: null }]
```

Shared helper:
```js
sharedChartElements({ yAxisWidth, tooltip }) // returns [CartesianGrid, XAxis, YAxis, Tooltip]
```

Formatters: `fmtFull` (full dollar), `fmtCompact` (compact dollar e.g. $1.2K), `fmtPct` (percent with sign), `fmtDollar` (parenthetical negative), `filterByRange`, `downsample`.

### Multi-Account Toggle Pattern (`GroupsTimeChart.jsx`)
`GroupsTimeChart` establishes the pattern for multi-series line charts with account toggles:

```jsx
const [selectedGroups, setSelectedGroups] = useState(new Set())
const toggleGroup = (name) => {
  setSelectedGroups((prev) => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })
}
// Chips row with toggle buttons per group
// LineChart renders one <Line> per active group
```

This pattern translates directly to the multi-account toggle for the investment performance chart.

### Area Chart Pattern (`NetWorthChart.jsx`)
Uses `<AreaChart>` with `<Area>` components. Gradient fills via `<defs><linearGradient>`. Range filter + downsample applied before passing data to recharts.

### Bar Chart Pattern (`BudgetChart.jsx`)
Uses `<BarChart>` with multiple `<Bar>` components. Custom `MonthTick` renderer demonstrates per-tick styling when `tickFormatter` is insufficient.

### Recharts Tooltip Convention (from conventions.md)
Tooltip styles must be `const tooltipStyles = {...}` at module level — recharts renders outside the React tree so CSS Modules cannot reach them. Always use `TOOLTIP_STYLE` as the base object.

### Donut Chart (Not Yet Used)
`PieChart` with `Pie innerRadius > 0` creates a donut. No existing component to reference — Phase 3 would establish this pattern. The `AllocationChart` component should accept `data` as `[{name, value, color}]` and render using recharts `PieChart + Pie + Cell`.

### Chart Height Pattern
Chart heights are controlled via JS (not CSS) since recharts needs numeric props:
```jsx
const { isMobile } = useResponsive()
const chartHeight = isMobile ? 220 : 340  // NetWorthChart
const yAxisWidth  = isMobile ? 52  : 72
```

### RangeSelector Component
`frontend/src/components/RangeSelector.jsx` — reusable button strip. Props: `ranges`, `activeRange`, `onSelect`, optional `className`. Already used by NetWorthChart, TypeStackedChart, GroupsTimeChart.

---

## 5. Design System

### Global Tokens (`frontend/src/index.css`, lines 9-103)
Complete token catalog. Key tokens for new pages:

**Backgrounds:**
- `--bg-root` (#0A0F1E) — page base
- `--bg-card` (#1C2333) — card surfaces
- `--bg-hover` (#243044) — hover state
- `--bg-raised` (#1E2D4A) — elevated elements

**Borders:**
- `--border` (#1E2D4A)
- `--border-focus` (#4D9FFF)
- `--accent-border-hover` (rgba(77,159,255,0.25)) — card hover glow

**Text:**
- `--text-primary` (#F0F6FF)
- `--text-secondary` (#8BA8CC)
- `--text-muted` (#4A6080)

**Semantic colors:**
- `--color-positive` / `--green` (#2ECC8A) — gains
- `--color-negative` / `--red` (#FF5A7A) — losses
- `--color-warning` / `--amber` (#F5A623) — warnings

**Spacing:** `--sp-1` (4px) through `--sp-12` (48px) in 4px steps.

**Radius:** `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px), `--radius-pill`.

### Typography Conventions (from conventions.md)
- Font weight 400: values, headlines, data amounts
- Font weight 500: section titles, table headers, card titles
- Font weight 600: buttons, badges, status indicators only
- Form labels: `9px / uppercase / letter-spacing 2px / --text-muted`
- Page title: `18px / weight 400 / --text-primary`, 20px at 768px+

### Primary Button Standard
All primary buttons: `color: var(--bg-root)`, `text-transform: uppercase`, `letter-spacing: 1.5px`. Toggle/range buttons get color change only (no uppercase).

### Stats Cards Pattern (`StatsCards.jsx` + `StatsCards.module.css`)
The stats card row is the established pattern for top-of-page summary numbers:
- `display: grid; grid-template-columns: 1fr` → `repeat(3, 1fr)` at 480px+
- Card: `background: var(--bg-card); border-radius: 12px; padding: 16px 20px; border: 1px solid var(--border)`
- Card hover: `border-color: var(--accent-border-hover)`
- Skeleton: shimmer animation using `linear-gradient` + `animation: shimmer 1.5s infinite` (defined in `index.css`)
- Label: `10px / uppercase / letter-spacing 2px / --text-muted`
- Value: `24px / weight 400 / --text-primary` → 28px at 768px+

### Page Header Pattern (`NetWorthPage.module.css`)
```css
.pageHeader { display: flex; justify-content: space-between; align-items: center; position: relative; }
.pageHeader::before { /* radial gradient glow pseudo-element */ }
.pageTitle { font-size: 18px; font-weight: 400; color: var(--text-primary); }
```

### CSS Module Rules (from conventions.md)
- All colors MUST use CSS custom properties — never hardcode hex in CSS modules
- Exception: recharts SVG attributes (can't use CSS vars) must use raw hex from `chartUtils.jsx` constants
- Inline styles: only for data-driven values (group colors, progress widths, status badges)

---

## 6. Transaction Data and Contribution Detection

### Transactions Schema (`pipeline/monarch_pipeline/schema.py`, lines 43-62)
```sql
CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,
    date                TEXT NOT NULL,   -- YYYY-MM-DD
    amount              REAL NOT NULL,
    merchant_name       TEXT,
    category_id         TEXT,
    category_name       TEXT,
    category_group      TEXT,           -- Monarch category group name (text)
    account_id          TEXT,           -- account the transaction is on
    account_name        TEXT,
    is_pending          INTEGER DEFAULT 0,
    is_recurring        INTEGER DEFAULT 0,
    notes               TEXT,
    hide_from_reports   INTEGER DEFAULT 0,
    created_at          TEXT,
    updated_at          TEXT,
    synced_at           TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

### Category Classification
The `categories` table has a `group_type` column with values `'income'`, `'expense'`, `'transfer'`. Transfer transactions have `group_type = 'transfer'`. Budget queries always exclude transfers:
```sql
AND (c.group_type IS NULL OR c.group_type <> 'transfer')
```

### Contribution Detection Challenge
The `transactions` table links to `categories` via `category_id`. Monarch categorizes investment contributions as transfers. To detect contributions, the query needs to:
1. Join `transactions` with `accounts` to identify transactions on investment accounts
2. Filter for transfer-type transactions (positive amounts = money coming in)
3. Aggregate by month per account

From the architecture decision (`phase3-architecture.md` Decision 6), the intended SQL pattern:
```sql
SELECT
    strftime('%Y-%m', t.date) AS month,
    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS contributions,
    SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END) AS withdrawals
FROM transactions t
JOIN accounts a ON t.account_id = a.id
WHERE a.type IN ('investment', 'brokerage', '401k', 'ira', ...)
  AND t.category_group LIKE '%transfer%'   -- or category_id join to categories
GROUP BY month
ORDER BY month
```

Risk: the exact Monarch category taxonomy for contributions/transfers is unknown without inspecting real transaction data. The field `category_group` stores the raw Monarch group name as a text string; `category_name` stores the specific category. A join to the `categories` table (via `category_id`) and filtering on `group_type = 'transfer'` is the more reliable approach than string matching on `category_group`.

---

## 7. CAGR Calculation

### Existing Implementation (`app.py`, lines 757-811)
The `_compute_bucket_cagr(bal_by_date)` function in `app.py` implements CAGR for the net-worth-by-type endpoint. The logic:

1. Takes a dict of `{date: balance}` for a bucket
2. Strips leading zero-balance entries (first non-zero is the start)
3. Returns `{1y: None, 3y: None, 5y: None}` if fewer than 30 non-zero days
4. For each period (1/3/5 years): finds the balance at the cutoff date, computes `(end/start)^(1/years) - 1`
5. Returns null if start or end balance is zero or negative

```python
cagr_val = (end_bal / start_bal) ** (1.0 / elapsed_years) - 1
return round(cagr_val * 100, 2)
```

This bucket-level function works on aggregated totals. For Phase 3, the same math applies per-account using `account_history` data directly.

### Phase 3 CAGR (per-account)
From the architecture decision (Decision 5):
```python
# Pseudocode for account-level CAGR
earliest = min(account_history rows for account_id, exclude zero/null balance)
latest = max(account_history rows for account_id)
years = (latest.date - earliest.date).days / 365.25
cagr = (latest.balance / earliest.balance) ** (1 / years) - 1
```

Guard conditions:
- Less than 1 year of history: return simple return % instead
- Zero or negative beginning balance: return null
- Fewer than 30 non-zero-balance days: return null

### Where CAGR Lives
The existing `_compute_bucket_cagr` lives in `backend/app.py` alongside the `/api/networth/by-type` endpoint. A new per-account CAGR function will sit alongside the new investments endpoints in the same `app.py` file. There is no dedicated math module for backend calculations (unlike the frontend's `retirementMath.js`).

---

## 8. Router and Navigation

### Routing Architecture (`App.jsx`)
`App.jsx` uses react-router-dom v6. `BrowserRouter` lives in `main.jsx`. `AppShell` inner component wraps `<Routes>` (needed because `useLocation` hook requires being inside a Router):

```jsx
// In AppShell:
<Routes>
  <Route path="/"        element={<Navigate to="/networth" replace />} />
  <Route path="/networth" element={<NetWorthPage />} />
  <Route path="/groups"  element={<GroupsPage />} />
  <Route path="/budgets" element={<BudgetPage />} />
  <Route path="/builder" element={<BudgetBuilderPage />} />
  <Route path="/sync"    element={<SyncPage />} />
  <Route path="*"        element={<Navigate to="/networth" replace />} />
</Routes>
```

Adding Phase 3 requires two new `<Route>` entries (dashboard + drill-down).

### Navigation Items (`nav.js`)
```js
export const NAV_ITEMS = [
  { path: '/networth', label: 'Net Worth',      icon: '📈' },
  // New item should go here at index 1
  { path: '/groups',   label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',  label: 'Budgets',        icon: '💰' },
  { path: '/builder',  label: 'Budget Builder', icon: '🏗'  },
  { path: '/sync',     label: 'Sync Data',      icon: '🔄' },
]
```

Both `Sidebar.jsx` and `BottomTabBar.jsx` consume `NAV_ITEMS` directly. Editing `nav.js` is the only change needed for navigation — both desktop sidebar and mobile bottom bar update automatically.

### Drill-Down URL Pattern
The architecture decision (`phase3-architecture.md` Decision 2) chose URL params for drill-down:
- `/investments` — account-level dashboard
- `/investments/:accountId` — holdings for one account

A single `InvestmentsPage` component reads `useParams()` to determine which view to render. This keeps the component tree simple while supporting bookmarkable URLs and native browser back-button navigation.

`useParams` from react-router-dom v6 is used in `GroupsPage` for reading URL state — it is available and well-supported in the current stack.

---

## Codebase Context Summary

### Relevant Files
- `/home/user/stashtrend/frontend/src/pages/NetWorthPage.jsx` — canonical page pattern (Promise.all fetch, loading/error states, refresh button)
- `/home/user/stashtrend/frontend/src/pages/BudgetPage.jsx` — mobile split pattern, range selector usage
- `/home/user/stashtrend/frontend/src/App.jsx` — routing shell (add routes here)
- `/home/user/stashtrend/frontend/src/nav.js` — nav items (add entry here)
- `/home/user/stashtrend/frontend/src/api.js` — API layer (add named exports here)
- `/home/user/stashtrend/frontend/src/components/chartUtils.jsx` — all chart constants and shared utilities
- `/home/user/stashtrend/frontend/src/components/StatsCards.jsx` + `.module.css` — stats card row pattern
- `/home/user/stashtrend/frontend/src/components/RangeSelector.jsx` — reusable range button strip
- `/home/user/stashtrend/frontend/src/components/GroupsTimeChart.jsx` — multi-series toggle pattern
- `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx` — CAGR table + stacked chart pattern
- `/home/user/stashtrend/frontend/src/hooks/useResponsive.js` — responsive breakpoints hook
- `/home/user/stashtrend/frontend/src/index.css` — all design tokens
- `/home/user/stashtrend/backend/app.py` — all Flask endpoints (add new endpoints here)
- `/home/user/stashtrend/pipeline/monarch_pipeline/schema.py` — pipeline table schemas (accounts, account_history, holdings, transactions)
- `/home/user/stashtrend/pipeline/monarch_pipeline/storage.py` — `upsert_holdings()` implementation
- `/home/user/stashtrend/docs/conventions.md` — CSS, testing, API conventions
- `/home/user/stashtrend/docs/architecture.md` — stack overview, BUCKET_MAP details, Monarch API shapes

### Architecture Decisions Already Made
An architecture decision record exists at `/home/user/stashtrend/docs/plans/phase3-architecture.md`. Key decisions already locked:
- Four endpoints: `GET /api/investments/summary`, `GET /api/investments/:accountId`, `GET /api/investments/performance`, `GET /api/investments/contributions`
- URL-based drill-down: `/investments` and `/investments/:accountId` via `useParams()`
- Component tree: `InvestmentsPage > InvestmentsSummary + HoldingsDetail`
- All state is page-local (useState + useEffect, no context/Redux)
- CAGR computed on backend in summary endpoint
- Recharts `PieChart` with `innerRadius` for donut chart
- Client-side sort/filter for holdings table
- Nav position: index 1, after Net Worth, icon '💼'

---

## Key Findings for Architect / Engineer

1. **No investment API endpoints exist** despite the holdings DB table being fully populated since Phase 0. All four endpoints must be created from scratch following established Flask patterns.

2. **CAGR function to create** — `_compute_bucket_cagr()` in `app.py` is the existing reference. A new per-account variant using `account_history` MIN/MAX dates is needed. Guard conditions from the existing function apply identically.

3. **`basis` is total cost basis, not per-share** — gain/loss = `total_value - basis` directly. No multiplication by quantity needed.

4. **Investment account scope** is broader than `type = 'investment'`** — accounts with subtypes like `ira`, `roth_401k`, `brokerage` may have `type` values other than 'investment' in Monarch data. The Investments page should use the `BUCKET_MAP`/`TYPE_MAP` bucket system (Retirement + Brokerage buckets) rather than filtering on raw `type = 'investment'`, to avoid missing accounts.

5. **Contribution detection is fuzzy** — the `transactions` table has `category_id`/`category_group` fields but the exact Monarch category names for investment contributions are unknown without examining real data. Joining to `categories` on `group_type = 'transfer'` plus filtering on the destination account being an investment account is the most reliable approach. Plan for flexibility in the WHERE clause.

6. **`RangeSelector` + `COMMON_RANGES` already exist** — the performance chart range selector is a two-line wiring, not a new build.

7. **Multi-series toggle pattern established in `GroupsTimeChart`** — the account toggle chips + selective `<Line>` rendering pattern already exists and can be directly adapted for the performance chart.

8. **Donut chart is the only truly new chart type** — `PieChart` with `innerRadius` is available in recharts but has no existing usage in the app. This component will establish the donut pattern for future use.

9. **Stale data detection** — the `holdings` table has `synced_at` and `last_synced_at` fields. The summary endpoint can compute hours since last sync and return it to the frontend for a stale-data warning badge.

10. **`app.py` is a single large file** (~2,400 lines) — new endpoints will add ~200 lines. The architecture decision notes this as accepted tech debt; a Flask Blueprints refactor is out of scope.

---

## Open Questions

1. **Exact Monarch transfer category names** — What does Monarch call contributions to 401k/IRA? Are they `category_group = 'Transfer'` or something else? Needs verification against real transaction data before the contribution detection query is finalized.

2. **Investment account type coverage** — Does Monarch always set `type = 'investment'` for all investment accounts (401k, IRA, brokerage), or does it sometimes use type-specific strings like `type = '401k'`? The holdings sync filter in `app.py` line ~487 uses `type.name == 'investment'` — if Monarch uses different type strings, some holdings may already be missing from the DB. Verification needed.

3. **Holdings data presence** — Since Phase 0 merged, have real holdings been synced? If the user's DB is empty or only partially populated, the page should degrade gracefully. The `last_synced_at` from `sync_log` table can be used to detect whether holdings have ever been synced.

4. **Performance chart data volume** — `account_history` can have daily data for years. For a 5-10 account portfolio, that's potentially 10,000+ rows. The `downsample()` utility in `chartUtils.jsx` handles this client-side (max 200 points), but the backend query should return filtered data when a range is specified — to avoid sending thousands of unused rows.

5. **Donut chart small-slice handling** — With many holdings of small value, the donut will have many tiny slices. The architecture decision mentions grouping allocations < 2% into "Other". The threshold and grouping logic need to be specified.
