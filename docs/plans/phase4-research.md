# Phase 4: Forecasting Page — Research Report

**Date:** 2026-03-09
**Author:** Research Agent
**Status:** Complete
**Supersedes:** Earlier draft of the same file

---

## Problem Summary

Phase 4 adds a new top-level `/forecasting` page to Stashtrend that shows compound-growth projections of investable capital (Retirement + Brokerage balances) from today to a user's target retirement age. The page provides interactive sliders for contribution and return rate, three scenario lines (baseline, +10%, -10% contributions), a gap analysis versus the nest egg target, and a "Save as defaults" flow back to retirement settings. All projection math runs in the frontend; no new backend endpoints are needed. This report surveys every relevant area of the codebase to ground the architecture decision.

---

## Codebase Context

### 1. Retirement Tracker Implementation (Phase 2)

**Files:**
- `/home/user/stashtrend/frontend/src/components/RetirementPanel.jsx`
- `/home/user/stashtrend/frontend/src/components/RetirementSummary.jsx`
- `/home/user/stashtrend/frontend/src/utils/retirementMath.js`
- `/home/user/stashtrend/frontend/src/utils/retirementMath.test.js`
- `/home/user/stashtrend/backend/tests/test_retirement.py`

#### Database schema

`retirement_settings` table (single row enforced by `CHECK (id = 1)`):

```sql
CREATE TABLE IF NOT EXISTS retirement_settings (
    id                      INTEGER PRIMARY KEY CHECK (id = 1),
    current_age             INTEGER,
    target_retirement_age   INTEGER,
    desired_annual_income   REAL,
    monthly_contribution    REAL,
    expected_return_pct     REAL,
    inflation_rate_pct      REAL    DEFAULT 2.5,
    social_security_annual  REAL    DEFAULT 0.0,
    withdrawal_rate_pct     REAL    DEFAULT 4.0,
    milestones              TEXT,   -- JSON array: [{"label": "...", "amount": N}]
    updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Upsert pattern on save: `INSERT OR REPLACE INTO retirement_settings ... VALUES (1, ...)`. Milestones serialized as JSON text, deserialized on `GET` with `json.loads()`.

#### API endpoints

- `GET /api/retirement` — returns all fields plus `exists: True/False`. When `exists: False`, body is `{"exists": false}`. Frontend wraps this call with `.catch(() => ({ exists: false }))` in `Promise.all` for graceful degradation.
- `POST /api/retirement` — validates and upserts. Validation enforced: both ages required as positive integers ≤120, `target > current`, `withdrawal_rate ≤ 100`, `expected_return_pct ≤ 50`, milestones ≤ 20 items with positive amounts and labels ≤ 100 chars.

Frontend API helpers in `/home/user/stashtrend/frontend/src/api.js`:
```js
export const fetchRetirement = () => fetchJSON('/api/retirement')
export const saveRetirement = (data) => postJSON('/api/retirement', data)
```

#### RetirementPanel component

`RetirementPanel({ data, onSave, loading, error, typeData })` — all form state is local `useState`. Hydrates from `data` prop via `useEffect([data])`. Computes `investableCapital` inline (lines 44–48) from the last point in `typeData.series`:

```js
const investableCapital = (() => {
  if (!typeData?.series?.length) return null
  const latest = typeData.series[typeData.series.length - 1]
  return (latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)
})()
```

Calls `generateProjectionSeries()` to compute `projectedAtRetirement`. Passes both to `RetirementSummary` for display. Passes `milestones` to `MilestoneEditor` (editable list, max 20, add/remove rows). Save handler merges form state into the `POST /api/retirement` shape, then re-fetches.

#### RetirementSummary component

`RetirementSummary({ nestEgg, projectedAtRetirement, investableCapital, targetYear })` — pure display. Shows four rows: current investable capital, nest egg needed, projected at retirement, target year. On/off track badge using `projectedAtRetirement >= nestEgg` comparison.

#### retirementMath.js — Pure utility functions

Three exported functions, no React, no side effects:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `computeNestEgg` | `(desiredAnnualIncome, socialSecurityAnnual, withdrawalRatePct) => number\|null` | Safe withdrawal rate calculation. Returns `null` when withdrawalRate ≤ 0 or income is null. Returns 0 when SS covers all income. Formula: `Math.round((incomeGap / withdrawalRatePct) * 100)` |
| `generateProjectionSeries` | `({ currentNetWorth, monthlyContribution, annualReturnPct, years, startDate? }) => Array<{date, projected_net_worth}>` | Monthly compound growth. `years * 12 + 1` points. Dates always land on the 1st using `new Date(startYear, startMonth + i, 1)` to prevent month-end drift. Balance formula: `balance = balance * (1 + monthlyRate) + monthlyContribution` |
| `mergeHistoryWithProjection` | `(history, projection) => Array` | Map-based merge by date key. Overlap dates get both `net_worth` and `projected_net_worth` keys. Returns sorted ascending by date. |

All three are directly reusable for Phase 4. `generateProjectionSeries` is the core projection engine. `computeNestEgg` is the gap analysis formula. `mergeHistoryWithProjection` enables overlaying historical data on the chart.

---

### 2. CAGR Calculation

**Files:**
- `/home/user/stashtrend/backend/app.py` — `_compute_bucket_cagr()` (line 757) and `networth_by_type()` (line 814)

CAGR is computed **backend-only** using aggregate balance history per bucket. The calculation is an approximation (not true time-weighted return — contributions are not stripped out).

#### `_compute_bucket_cagr(bal_by_date)` algorithm

1. Filters to non-zero balance dates only (strips leading zero-balance entries)
2. If fewer than 30 non-zero dates: returns `{"1y": None, "3y": None, "5y": None}`
3. For each time period (1Y, 3Y, 5Y): finds the most recent date `N` years ago, looks backward for the nearest available date using a 30-day fuzzy match window to handle leap years
4. CAGR formula: `(end_bal / start_bal) ** (1.0 / elapsed_years) - 1`, rounded to 2 decimal places, expressed as a percentage

The API response from `GET /api/networth/by-type`:
```json
{
  "series": [{"date": "2024-01-01", "Retirement": 250000, "Brokerage": 50000, ...}],
  "cagr": {
    "Retirement": {"1y": 12.5, "3y": 8.2, "5y": 9.1},
    "Brokerage":  {"1y": 15.0, "3y": null, "5y": null},
    "Cash":       {"1y": 2.1,  "3y": 1.8,  "5y": null},
    ...
  },
  "bucket_colors": {"Retirement": "#4D9FFF", ...},
  "bucket_order": ["Retirement", "Brokerage", "Cash", "Real Estate", "Debt", "Other"]
}
```

For Phase 4, the Forecasting page needs a **blended CAGR** from Retirement and Brokerage buckets. No existing utility does this — it requires a new function in `retirementMath.js`. The architecture document specifies a balance-weighted average using 1Y CAGR as primary, falling back to 3Y, then 5Y, then 7% hardcoded default.

---

### 3. Net Worth By-Type Data and Investable Capital

**Files:**
- `/home/user/stashtrend/backend/app.py` — `networth_by_type()` endpoint (line 814), `BUCKET_MAP`, `TYPE_MAP`, `BUCKET_ORDER`, `BUCKET_COLORS` constants (lines 647–739)
- `/home/user/stashtrend/frontend/src/api.js` — `fetchNetworthByType()`
- `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx`

#### Bucket classification

Monarch account types are mapped to one of six display buckets via a two-level lookup:
1. `TYPE_MAP` checked first (subtype overrides)
2. `BUCKET_MAP` checked next (type fallback)
3. Unknown types default to "Other" and log a `WARNING`

Investable capital for retirement forecasting = `Retirement + Brokerage` buckets from the most recent series point. This excludes Cash, Real Estate, Other, and Debt — consistent with the 4% rule applying only to portfolio assets. Debt is stored as negative values in the series.

#### Current investable capital computation location

Currently computed inline in `RetirementPanel.jsx` (lines 44–48). The architecture decision calls for extracting this to a `getInvestableCapital(typeData)` utility in `retirementMath.js` to avoid duplication across `RetirementPanel` and `ForecastingPage`.

#### Series data shape

Each series point contains a key per bucket. Debt values are negative (sign convention for net worth contribution). `TypeStackedChart` converts Debt to absolute values for right-axis display. For the Forecasting page, only `Retirement` and `Brokerage` keys are used from the latest point.

---

### 4. Contribution Detection

**Status: Manual entry only.** No auto-detection from transactions exists in the current codebase.

The `transactions` table (defined in `/home/user/stashtrend/pipeline/monarch_pipeline/schema.py`) contains:

```sql
CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,
    date                TEXT NOT NULL,
    amount              REAL NOT NULL,
    merchant_name       TEXT,
    category_id         TEXT,
    category_name       TEXT,
    category_group      TEXT,
    account_id          TEXT,
    account_name        TEXT,
    is_pending          INTEGER DEFAULT 0,
    is_recurring        INTEGER DEFAULT 0,
    notes               TEXT,
    hide_from_reports   INTEGER DEFAULT 0,
    ...
);
```

The `categories` table has a `group_type` field (`'income'`, `'expense'`, `'transfer'`). The budget history endpoint (`GET /api/budgets/history`) already filters `group_type <> 'transfer'` to exclude double-counted money movement.

Contribution auto-detection would require querying transactions for transfers INTO investment accounts — this is explicitly marked out of scope in the Phase 4 requirements document. The Forecasting page uses `retirement_settings.monthly_contribution` (user-entered) as the slider default value.

---

### 5. Existing Page Patterns

**Files:**
- `/home/user/stashtrend/frontend/src/pages/NetWorthPage.jsx` — primary reference pattern
- `/home/user/stashtrend/frontend/src/pages/BudgetPage.jsx` — secondary reference (mobile branching pattern)
- `/home/user/stashtrend/frontend/src/pages/GroupsPage.jsx` — multiple data sources pattern

#### Standard page component structure

```
Page component (*.jsx + *.module.css in src/pages/)
├── useState for each data slice + loading + error state
├── useEffect → loadDashboardData() → Promise.all([...fetches])
├── useCallback for mutation handlers
├── return JSX:
│   ├── page header (h1 + refresh button + "Updated at" timestamp)
│   ├── loading guard
│   ├── error guard
│   └── component tree
```

The `NetWorthPage` is the closest analog to `ForecastingPage`:
- Parallel `Promise.all` fetch on mount: `fetchNetworthStats()`, `fetchNetworthHistory()`, `fetchAccountsSummary()`, `fetchNetworthByType()`, `fetchRetirement().catch(...)`
- `handleSaveRetirement` uses `useCallback`, `setLoading`, try/catch/finally, re-fetches after save
- Error state shows API troubleshooting instructions
- No global state — all state local to the page component

#### CSS module patterns

- All layout CSS in co-located `.module.css` file
- CSS custom properties from `index.css :root` — never hardcoded hex
- Page header pattern from `NetWorthPage.module.css`: flex row with `justify-content: space-between`, accent-tint glow via `::before` pseudo-element with `radial-gradient`
- Card containers: `background: var(--bg-card)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)`, `padding: 20px 24px`
- Mobile-first with `@media (min-width: 768px)` overrides

#### Data fetching convention

All API calls go through named exports in `/home/user/stashtrend/frontend/src/api.js`. Pages never use raw `fetchJSON`/`postJSON` with URL strings — those are internal helpers. `mutateJSON` is the internal helper for POST/PUT/DELETE.

---

### 6. Charting Library

**Library:** Recharts 2.12.7 (no upgrade pending)

**Files:**
- `/home/user/stashtrend/frontend/src/components/chartUtils.jsx` — shared utilities
- `/home/user/stashtrend/frontend/src/components/NetWorthChart.jsx` — AreaChart example
- `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx` — AreaChart + CAGR table
- `/home/user/stashtrend/frontend/src/components/GroupsTimeChart.jsx` — LineChart example with multiple lines

#### Recharts components in use

| Component | Used In | Notes |
|-----------|---------|-------|
| `AreaChart` | NetWorthChart, TypeStackedChart | Single or stacked areas |
| `LineChart` | GroupsTimeChart | Multiple lines, closest to Phase 4 needs |
| `Line` | GroupsTimeChart | `strokeDasharray` for dashed lines |
| `Area` | NetWorthChart | `strokeDasharray` supported |
| `ResponsiveContainer` | All charts | Wraps all charts |
| `CartesianGrid` | All charts | Horizontal lines only (`vertical={false}`) |
| `XAxis`, `YAxis` | All charts | Shared via `sharedChartElements()` |
| `Tooltip` | All charts | Custom `content` prop |
| `Legend` | TypeStackedChart | `iconType="line"` |
| `ReferenceLine` | TypeStackedChart | Used for milestones — directly applicable to "Retire @ age" marker |

#### Tooltip pattern

Tooltips render outside the React tree (Recharts appends to DOM). CSS Modules cannot reach them. All tooltip styles are defined as inline style objects at module level (not inside the render function), typically as a `const tooltipStyles = {}` object that references `TOOLTIP_STYLE` from chartUtils. Using CSS variables in tooltip inline styles IS supported (they're CSS custom properties, not SVG attributes). However, the established pattern uses raw hex in `TOOLTIP_STYLE` since the first charts were built that way — consistency is the convention.

#### Interactive slider controls — existing precedent

No existing Recharts-controlled sliders exist in the codebase. The app uses plain HTML `<input type="range">` for interactive controls (established in `RetirementPanel.jsx` for numeric inputs, though sliders themselves are new to Phase 4). React's controlled input pattern (`value` + `onChange`) applies directly.

#### `sharedChartElements()` utility

Returns an array `[CartesianGrid, XAxis, YAxis, Tooltip]` — used by `NetWorthChart` and `GroupsTimeChart`. Note: the recharts `Children.forEach` behavior with array returns was explicitly verified and documented as safe in `chartUtils.jsx`. For Phase 4's `LineChart`, this utility is directly reusable.

#### `GroupsTimeChart` as closest analog to ForecastingChart

`GroupsTimeChart` already uses `LineChart` with multiple `Line` components. It uses `useMemo` for both `filterByRange` and `downsample` steps. It uses `useResponsive()` for height/yAxisWidth. Multiple colors per line from `groupsMeta` object. `strokeDasharray` is available on `Line` for dashed/dotted lines. This is the reference implementation for multi-line charts.

#### Long-range data considerations

`generateProjectionSeries()` for 30 years produces 361 data points (30 * 12 + 1). The existing `downsample()` utility (in `chartUtils.jsx`) reduces to max 200 points using step-based sampling. 3 scenario lines = 3 calls = 1,083 pre-downsample points, 600 post-downsample. Well within Recharts' performance comfort zone.

---

### 7. Design System

**File:** `/home/user/stashtrend/frontend/src/index.css`

#### Complete token inventory

**Backgrounds:**
- `--bg-root: #0A0F1E` — page background
- `--bg-card: #1C2333` — card surfaces (chart containers, form panels)
- `--bg-deep: #0E1423`
- `--bg-inset: #0D1220` — inputs, code blocks (number inputs for sliders)
- `--bg-raised: #1E2D4A` — elevated surfaces (slider track background)
- `--bg-hover: #243044`
- `--bg-info: #1E2D4A` — empty state info boxes

**Borders:**
- `--border: #1E2D4A`
- `--border-focus: #4D9FFF` — focused inputs

**Text:**
- `--text-primary: #F0F6FF`
- `--text-secondary: #8BA8CC`
- `--text-muted: #4A6080`

**Accent and semantic:**
- `--accent: #4D9FFF` — cobalt blue (slider fill, primary button, chart historical line)
- `--accent-hover: #2B7FE0`
- `--accent-light: #7DBFFF`
- `--accent-tint: rgba(77,159,255,0.12)` — glow pseudo-elements
- `--green: #2ECC8A` — on-track / +10% scenario line
- `--red: #FF5A7A` — off-track state
- `--amber: #F5A623` — -10% scenario line, retirement age marker, nest egg reference line
- `--color-positive: var(--green)`
- `--color-negative: var(--red)`
- `--color-warning: var(--amber)`

**Spacing:** `--sp-1` (4px) through `--sp-12` (48px) in 4px increments

**Radius:**
- `--radius-sm: 6px`
- `--radius-md: 8px`
- `--radius-lg: 12px`
- `--radius-xl: 16px`
- `--radius-pill: 9999px`

**Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`

**Transitions:** `--ease-quick: 150ms ease`, `--ease-default: 200ms ease`, `--ease-smooth: 300ms ease`

**Chart constants (hardcoded hex in `chartUtils.jsx` — SVG attrs cannot use CSS vars):**
- `COLOR_ACCENT = '#4D9FFF'`
- `COLOR_POSITIVE = '#2ECC8A'`
- `COLOR_NEGATIVE = '#FF5A7A'`
- `COLOR_AMBER = '#F5A623'`
- `AXIS_TICK = { fill: '#4A6080', fontSize: 11 }` — all axis tick configs must use this
- `GRID_STROKE = '#1E2D4A'`
- `TOOLTIP_STYLE` — bg `#1C2333`, border `#1E2D4A`, text `#F0F6FF`

#### Typography conventions (from conventions.md)

- Form labels: `9px / weight 400 / uppercase / letter-spacing 2px / var(--text-muted)`
- Values/headlines: weight 400
- Section titles, card titles: weight 500
- Buttons, badges: weight 600 with `text-transform: uppercase`, `letter-spacing: 1.5px`
- Primary button: `background: var(--accent)`, `color: var(--bg-root)` (dark text on cobalt)

#### Input focus standard

```css
border-color: var(--accent);
box-shadow: 0 0 0 1px var(--accent);
outline: none;
/* Accessibility fallback: */
@media (forced-colors: active) { outline: 2px solid; }
```

---

### 8. Router and Navigation

**Files:**
- `/home/user/stashtrend/frontend/src/nav.js` — single source of truth for all navigation
- `/home/user/stashtrend/frontend/src/App.jsx` — route definitions
- `/home/user/stashtrend/frontend/src/components/Sidebar.jsx` — desktop nav
- `/home/user/stashtrend/frontend/src/components/BottomTabBar.jsx` — mobile nav

#### Current NAV_ITEMS

```js
export const NAV_ITEMS = [
  { path: '/networth', label: 'Net Worth',      icon: '📈' },
  { path: '/groups',   label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',  label: 'Budgets',        icon: '💰' },
  { path: '/builder',  label: 'Budget Builder', icon: '🏗'  },
  { path: '/sync',     label: 'Sync Data',      icon: '🔄' },
]
```

Both `Sidebar` and `BottomTabBar` iterate `NAV_ITEMS` — adding an entry to this array automatically populates both navigation surfaces.

#### Adding a new page — required changes

Three files must be modified; no others:

1. `nav.js` — add entry to `NAV_ITEMS` array
2. `App.jsx` — add `import ForecastingPage` + `<Route path="/forecasting" element={<ForecastingPage />} />`
3. New files: `src/pages/ForecastingPage.jsx` + `src/pages/ForecastingPage.module.css`

The router uses react-router-dom v6. `NavLink` in `Sidebar` and `BottomTabBar` handles the `isActive` styling automatically via the `className` prop callback pattern. The wildcard `*` redirect to `/networth` is at the bottom of the routes — inserting `/forecasting` before it is safe.

`AppShell` inner component handles focus management (`mainRef.current?.focus()` on location change) — this benefits the new page automatically via `useLocation`.

The architecture decision places `/forecasting` immediately after `/networth` in `NAV_ITEMS` (Net Worth → Forecasting → Account Groups → Budgets → Budget Builder → Sync Data), justified by the data domain relationship.

---

## Component Reuse Summary

| Existing Component/Utility | Reuse in Phase 4 | How |
|---------------------------|-----------------|-----|
| `retirementMath.js` — `generateProjectionSeries` | Direct | Core projection calculation |
| `retirementMath.js` — `computeNestEgg` | Direct | Gap analysis |
| `retirementMath.js` — `mergeHistoryWithProjection` | Direct | Chart data preparation (historical + projection overlay) |
| `chartUtils.jsx` — formatters (`fmtCompact`, `fmtFull`, `fmtPct`, `formatDateLabel`) | Direct | Axis ticks, tooltips, summary cards |
| `chartUtils.jsx` — `sharedChartElements()` | Direct | Grid/axes/tooltip in `ForecastingChart` |
| `chartUtils.jsx` — color constants | Direct | Line colors in SVG context |
| `chartUtils.jsx` — `filterByRange`, `downsample` | Direct | Range selector + data management |
| `chartUtils.jsx` — `COMMON_RANGES`, `TOOLTIP_STYLE` | Direct | Range options, tooltip styling |
| `RangeSelector` component | Direct | Range toggle for projection chart |
| `useResponsive` hook | Direct | Chart height and Y-axis width |
| `api.js` — `fetchRetirement`, `saveRetirement`, `fetchNetworthByType` | Direct | All data fetching |
| `RetirementSummary` | Not directly | Phase 4 has different card layout but same data; build new `ForecastingSummary` |
| `RetirementPanel` | Not directly | Tightly coupled to editing/saving; Forecasting sliders are exploration-only with different UX |
| `StatsCards` | Pattern reference | Card grid layout pattern to follow |
| `GroupsTimeChart` | Pattern reference | Multi-line LineChart implementation pattern |

---

## Options Evaluated

The research task called for surveying options even though the requirements specify the approach at a high level. Three areas had genuine design alternatives worth documenting.

### Option Area A: Projection calculation location

**Option A1: Frontend-only (recommended)**
- Pure JS functions in `retirementMath.js`, called during render with `useMemo`
- Pros: instant slider feedback (no network latency), no new API surface, reuses existing utilities, calculations are deterministic
- Cons: cannot support Phase 5 Monte Carlo in the same location (frontend JS cannot run thousands of iterations efficiently)
- Effort: Low — utilities already exist
- Compatibility: Matches all existing patterns

**Option A2: Backend projection endpoint**
- `POST /api/forecasting/project` receives parameters and returns series
- Pros: offloads computation, consistent with Monte Carlo approach for Phase 5
- Cons: 100–300ms round-trip latency on every slider change, duplicates `retirementMath.js` logic in Python, no server-side data needed beyond what's already fetched
- Effort: Medium
- Compatibility: Inconsistent with the "instant slider feedback" requirement

**Option A3: Web Worker**
- Move calculation to a Web Worker for non-blocking computation
- Pros: non-blocking, could support Monte Carlo simulations later
- Cons: complexity overhead for O(n) calculation that already runs in sub-millisecond, adds tooling complexity (Vite Web Worker support), no existing precedent in codebase
- Effort: High
- Compatibility: No existing pattern

**Recommendation:** A1. The projection math for Layer 1 is O(n) with n ≤ 361 — benchmarks consistently show < 1ms. Frontend-only is the correct choice.

---

### Option Area B: Chart type for multi-line projection

**Option B1: LineChart with multiple Line components (recommended)**
- `GroupsTimeChart` is the existing reference implementation
- `strokeDasharray` per `Line` for solid/dashed/dotted differentiation
- Pros: clear visual separation of scenarios, matches established multi-line pattern, historical vs projected clearly distinguished by style
- Compatibility: Direct reuse of `GroupsTimeChart` pattern

**Option B2: AreaChart with multiple Area components**
- Used by `NetWorthChart` and `TypeStackedChart`
- Pros: already familiar pattern
- Cons: overlapping filled areas create visual noise with 4 series; the fill makes the chart cluttered when scenarios diverge significantly
- Compatibility: Misfit for multi-scenario use case

**Option B3: ComposedChart (Area for historical + Lines for projections)**
- Recharts `ComposedChart` allows mixing chart types
- Pros: visual distinction between historical (area) and projected (lines)
- Cons: no existing precedent, added complexity, `sharedChartElements()` utility may not compose cleanly
- Effort: Medium

**Recommendation:** B1. `LineChart` is correct for multi-scenario comparison. Historical can be a solid line (same visual weight as other charts' area strokes). The distinction between historical and projected is handled by line style (`strokeDasharray`), not chart type.

---

### Option Area C: Blended CAGR calculation formula

**Option C1: Balance-weighted average (recommended)**
- Formula: `(retirementBalance * retirementCAGR + brokerageBalance * brokerageCAGR) / totalBalance`
- Pros: more accurate than simple average (larger balance bucket has proportionally more influence), naturally handles cases where one bucket dominates
- Cons: requires current balances from latest series point (already available)

**Option C2: Simple arithmetic average**
- `(retirementCAGR + brokerageCAGR) / 2`
- Pros: simpler
- Cons: misleading if balances are very different sizes (e.g., $500K retirement with 8% vs $10K brokerage with 15% should not average to 11.5%)

**Option C3: Use the larger-balance bucket's CAGR**
- Take the CAGR of whichever bucket has the higher current balance
- Pros: simplest
- Cons: ignores the contribution of the smaller bucket entirely

**Recommendation:** C1. Balance-weighted average with a fallback cascade: 1Y → 3Y → 5Y → 7% hardcoded. The fallback to 7% is the conventional long-term stock market average. A new `computeBlendedCAGR(typeData)` function belongs in `retirementMath.js` (consistent with the existing utility file for all projection math).

---

## Recommendation

All architectural decisions converge on the same approach already documented in `phase4-architecture.md`:

1. Frontend-only projection math reusing existing `retirementMath.js` utilities
2. Two new utility functions needed: `getInvestableCapital(typeData)` (extracted from `RetirementPanel`) and `computeBlendedCAGR(typeData)` (new)
3. `LineChart` with four `Line` components (historical solid, baseline dashed, +10% dotted green, -10% dotted amber)
4. Balance-weighted blended CAGR as default return rate
5. Navigation added to `nav.js` and route to `App.jsx`
6. Four new component files + two modifications to `retirementMath.js`

---

## Open Questions

1. **Nav icon:** The architecture document specifies `🔮` (crystal ball). Confirm this is acceptable or propose an alternative (e.g., `📊`, `📉`, `🔭`).

2. **"Save as defaults" read-modify-write race condition:** The save flow reads current retirement settings, merges slider values, then POSTs. If the user has edited retirement settings in another tab since page load, the save will overwrite those changes. The risk is low (single-user, local-only app), but worth documenting.

3. **Range selector options:** The design spec adds 5Y, 10Y, 20Y, "All" ranges beyond the standard `COMMON_RANGES` (3M, 6M, 1Y, 2Y, All). The "All" range for the Forecasting page means historical + full projection to retirement, which is different from the NW chart's "All" (all history). A custom `FORECASTING_RANGES` constant is needed in `ForecastingChart.jsx` — `COMMON_RANGES` cannot be reused directly.

4. **`ReferenceeLine` for nest egg target and retirement age marker:** `TypeStackedChart` already uses `ReferenceLine` from recharts for milestones. The Forecasting chart needs similar reference lines. However, the nest egg horizontal reference line and the retirement vertical reference line both need `yAxisId` and `xAxisId` props matching the chart's axis IDs. Verify recharts API for `LineChart` reference lines vs `AreaChart` reference lines (same API, but axis ID defaults differ).

5. **Negative CAGR warning display:** The requirements specify showing "Your historical return rate is negative" when the blended CAGR is negative. The design spec does not specify where this warning appears. Should it appear inline in the controls section next to the slider, or as a banner above the chart? Needs clarification before implementation.

6. **Mobile slider thumb sizing:** The design spec calls for 24px thumb on mobile vs 18px on desktop. CSS-only custom range slider styling requires vendor prefixes (`::-webkit-slider-thumb`, `::-moz-range-thumb`) and is a known cross-browser pain point. The `RetirementPanel` form does not currently include range inputs — this will be the first use in the codebase. Budget sufficient time for cross-browser testing.

7. **Test count delta:** The architecture plan notes this is an "L" size change. The Phase 2 retirement tracker added 63 tests (16 backend + 47 frontend). Phase 4 is frontend-only with no new backend. Estimate 40–60 new frontend tests covering: utility functions (blended CAGR, investable capital extraction), component rendering (all 3 new components), slider interaction, slider-to-chart data flow integration test, and navigation.
