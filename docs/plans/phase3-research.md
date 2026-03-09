# Phase 3: Investments Page — Research Report

**Date:** 2026-03-09
**Source:** Research Agent — codebase exploration
**Status:** Complete

---

## 1. Project Architecture Overview

**Stack:** React (Vite) frontend + Python/Flask backend + SQLite DB + Docker Compose

- Backend: single-file Flask app (`backend/app.py`, ~900+ lines) with all endpoints
- Frontend: React with react-router-dom, recharts for charts, CSS Modules for styling
- Data pipeline: `pipeline/monarch_pipeline/` — fetchers, storage, schema modules
- DB: SQLite at `~/.monarch_pipeline/monarch.db` (configurable via `MONARCH_DATA_DIR`)

---

## 2. Existing Page Patterns

### Page Structure
Every page follows the same pattern:
1. **Page component** in `frontend/src/pages/PageName.jsx`
2. **CSS Module** in `frontend/src/pages/PageName.module.css`
3. **Test file** in `frontend/src/pages/PageName.test.jsx`
4. **Route** defined in `App.jsx` via `<Route path="/path" element={<PageComponent />} />`
5. **Nav item** in `nav.js` (`NAV_ITEMS` array) — used by both `Sidebar.jsx` and `BottomTabBar.jsx`

### Data Fetching Pattern
Pages use `useState` + `useEffect` with `Promise.all` for parallel data loading:
```jsx
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
  setLoading(true)
  Promise.all([fetchA(), fetchB()])
    .then(([a, b]) => { setA(a); setB(b) })
    .catch(err => setError(err.message))
    .finally(() => setLoading(false))
}, [])
```

No Redux or external state management — all state is local to pages/components.

### API Layer
All API calls go through `frontend/src/api.js`:
- `fetchJSON(url)` for GET requests
- `mutateJSON(url, method, data)` for POST/PUT/DELETE
- Named exports per endpoint (e.g., `fetchNetworthStats`)
- All URLs are relative (e.g., `/api/networth/stats`) — proxied in dev via Vite, reverse-proxied via nginx in Docker

### Responsive Pattern
- `useResponsive()` hook returns `{ isMobile, isTablet, isDesktop }`
- Breakpoints: mobile < 768px, tablet 768-1023px, desktop >= 1024px
- BudgetPage conditionally renders `MobileBudgetPage` on mobile
- CSS Modules handle most responsive layout via `@media` queries
- Chart dimensions are controlled via JS (useResponsive) since recharts needs numeric props

---

## 3. Design System

### CSS Custom Properties (Design Tokens)
Defined in `frontend/src/index.css`:

**Backgrounds:** `--bg-root` (#0A0F1E), `--bg-card` (#1C2333), `--bg-deep`, `--bg-hover`, `--bg-surface`
**Borders:** `--border` (#1E2D4A), `--border-sub`, `--border-focus` (#4D9FFF)
**Text:** `--text-primary` (#F0F6FF), `--text-secondary` (#8BA8CC), `--text-muted` (#4A6080)
**Accent:** `--accent` (#4D9FFF), `--green` (#2ECC8A), `--red` (#FF5A7A), `--amber` (#F5A623)
**Spacing:** `--sp-1` (4px) through `--sp-12` (48px)
**Radius:** `--radius-sm` (6px) through `--radius-xl` (16px), `--radius-pill`
**Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`
**Transitions:** `--ease-quick` (150ms), `--ease-default` (200ms), `--ease-smooth` (300ms)

### Chart Constants (from `chartUtils.jsx`)
- `COLOR_ACCENT` = '#4D9FFF', `COLOR_POSITIVE` = '#2ECC8A', `COLOR_NEGATIVE` = '#FF5A7A'
- `AXIS_TICK`, `GRID_STROKE`, `TOOLTIP_STYLE` — shared across all charts
- `sharedChartElements()` — returns CartesianGrid + XAxis + YAxis + Tooltip for consistency
- `COMMON_RANGES` — [{label: '3M', months: 3}, ..., {label: 'All', months: null}]
- `fmtCompact`, `fmtFull`, `fmtPct`, `fmtDollar` — currency/percent formatters
- `filterByRange`, `downsample` — data utilities

### Reusable Components
- `RangeSelector` — button strip for time range selection (used by NetWorthChart, GroupsTimeChart)
- `StatsCards` — horizontal row of stat cards with skeleton loading
- `AccountsBreakdown` — collapsible account list grouped by type
- `chartUtils.jsx` — shared chart utilities and formatters

### Page Header Pattern
From `NetWorthPage.module.css`:
```css
.pageHeader { display: flex; justify-content: space-between; align-items: center; }
.pageTitle { font-size: 18px; font-weight: 400; color: var(--text-primary); }
```
All pages use this consistent header with title + actions.

---

## 4. Holdings Data — Existing Infrastructure

### DB Schema (`pipeline/monarch_pipeline/schema.py`)
```sql
CREATE TABLE IF NOT EXISTS holdings (
    id                  TEXT PRIMARY KEY,
    account_id          TEXT NOT NULL,
    security_id         TEXT,
    security_name       TEXT,
    ticker              TEXT,
    security_type       TEXT,
    quantity            REAL,
    basis               REAL,
    total_value         REAL,
    current_price       REAL,
    is_manual           INTEGER DEFAULT 0,
    last_synced_at      TEXT,
    synced_at           TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

### Key Fields
- `basis` = cost basis (total, not per-share)
- `total_value` = current market value (total)
- `current_price` = price per share
- `security_type` = stock, ETF, mutual fund, bond, etc.
- `quantity` = number of shares
- `last_synced_at` = when Monarch last synced this holding
- `synced_at` = when our pipeline last wrote this row

### Sync Pipeline
- `fetchers.fetch_holdings(mm, account_id)` — calls `mm.get_account_holdings(account_id)`, parses GraphQL response, returns list of holding dicts
- `storage.upsert_holdings(conn, account_id, holdings)` — DELETEs all holdings for account, then bulk-INSERTs current snapshot
- Holdings sync runs as part of the entity sync flow (entity = "holdings")
- Only runs for accounts where `type = 'investment'`

### Accounts Table (relevant columns)
```sql
accounts (id, type, subtype, is_asset, institution, name, current_balance, display_balance, include_in_net_worth, is_hidden)
```

### Account History Table
```sql
account_history (id, account_id, date, balance)
```
Daily snapshots — used for performance charts and CAGR calculation.

### Transactions Table
```sql
transactions (id, account_id, category, amount, date, ...)
```
Used for contribution detection (transfers into investment accounts).

### BUCKET_MAP (in `app.py`, line ~647)
Maps account subtypes to display buckets:
- Retirement: 401k, 403b, IRA, Roth IRA, etc.
- Brokerage: brokerage, investment, crypto, HSA, 529, etc.
- Cash: checking, savings, depository

---

## 5. Existing API Patterns

### Endpoint Pattern
Flask route decorators with `get_db()` for connection, `jsonify()` for response:
```python
@app.route("/api/thing")
def thing_endpoint():
    conn = get_db()
    try:
        rows = conn.execute("SELECT ...").fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()
```

Or with context manager:
```python
with get_db_connection() as conn:
    ...
```

### Existing Relevant Endpoints
- `GET /api/accounts/summary` — all accounts with type, balance, bucket
- `GET /api/networth/history` — daily NW time series (aggregated from account_history)
- `GET /api/networth/stats` — current NW + MoM/YoY changes
- `GET /api/networth/by-type` — NW broken down by account type bucket

### No Holdings Endpoints Yet
Despite Phase 0 building the sync pipeline and DB table, **there are no `/api/holdings` endpoints in `app.py`**. The holdings data is stored but not yet served to the frontend. Phase 3 needs to create these.

---

## 6. Navigation System

### `nav.js` — Single source of truth
```js
export const NAV_ITEMS = [
  { path: '/networth', label: 'Net Worth',      icon: '📈' },
  { path: '/groups',   label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',  label: 'Budgets',        icon: '💰' },
  { path: '/builder',  label: 'Budget Builder', icon: '🏗'  },
  { path: '/sync',     label: 'Sync Data',      icon: '🔄' },
]
```

New "Investments" item should be inserted after "Net Worth" (position index 1).

### Routing (`App.jsx`)
```jsx
<Routes>
  <Route path="/" element={<Navigate to="/networth" replace />} />
  <Route path="/networth" element={<NetWorthPage />} />
  <Route path="/groups" element={<GroupsPage />} />
  ...
</Routes>
```

Need to add: `<Route path="/investments" element={<InvestmentsPage />} />` and potentially `<Route path="/investments/:accountId" element={<InvestmentsPage />} />` for drill-down.

---

## 7. Testing Patterns

### Frontend Tests
- Vitest + React Testing Library
- Test files co-located: `PageName.test.jsx` alongside `PageName.jsx`
- Integration tests: `PageName.integration.test.jsx` for API-dependent flows
- Mock pattern: `vi.mock('../api.js', () => ({ fetchThing: vi.fn() }))`
- Standard assertions: render, screen.getByText, waitFor

### Backend Tests
- Located in `backend/tests/`
- Run via `make test` (which calls `backend/run_tests.sh`)

---

## 8. Frontend Dependencies (from package.json inspection)

Based on imports observed:
- `react`, `react-dom`, `react-router-dom` — core
- `recharts` — all charts (LineChart, AreaChart, PieChart available)
- `prop-types` — runtime prop validation
- `vite` — build tool
- `vitest` — test runner
- CSS Modules (built into Vite) — no external CSS-in-JS

---

## 9. Key Findings & Recommendations

1. **No existing holdings API endpoints** — must be built from scratch, but follow established Flask patterns
2. **CAGR calculation** needs `account_history` data — this exists and is populated by sync
3. **Contribution detection** requires querying `transactions` for transfers — the `transactions` table exists but needs specific query logic for investment transfers
4. **Reusable components** — `RangeSelector`, `StatsCards` pattern, `chartUtils` utilities can all be leveraged
5. **Navigation** — simple addition to `NAV_ITEMS` array and `App.jsx` routes
6. **No global state** — all state is page-local; this is fine for Phase 3 (investments data doesn't need to be shared across pages)
7. **Drill-down pattern** — can use either URL params (`:accountId`) or local state; URL params are preferred for bookmarkability
8. **Recharts PieChart** — available but not yet used in the app; will need to establish the pattern for the donut chart
9. **The `basis` field** in holdings is total cost basis (not per-share), which simplifies gain/loss calculation
