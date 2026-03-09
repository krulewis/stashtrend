# Phase 6 Research — Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Agent:** Research Agent
**Status:** Complete

---

## 1. Existing Codebase Patterns

### Charting Infrastructure
- **Library:** Recharts 2.x (`AreaChart`, `LineChart`, `ComposedChart` available)
- **Shared utilities:** `frontend/src/components/chartUtils.jsx` provides:
  - `fmtCompact`, `fmtFull`, `fmtPct` — currency/percentage formatters
  - `filterByRange(data, months)` — time-range filtering by YYYY-MM-DD
  - `downsample(data, maxPoints=200)` — downsampling for performance
  - `sharedChartElements()` — returns grid, axes, tooltip as reusable array
  - `COMMON_RANGES` — `[3M, 6M, 1Y, 2Y, All]`
  - Design tokens: `COLOR_ACCENT (#4D9FFF)`, `COLOR_POSITIVE (#2ECC8A)`, `COLOR_NEGATIVE (#FF5A7A)`, `COLOR_AMBER (#F5A623)`, `AXIS_TICK`, `GRID_STROKE`, `TOOLTIP_STYLE`
- **Chart components:**
  - `NetWorthChart.jsx` — single AreaChart with optional asset/liability breakdown, uses `sharedChartElements()`
  - `TypeStackedChart.jsx` — stacked AreaChart with dual Y-axis (positive/negative buckets), CAGR sidebar, ReferenceLine milestones
  - `GroupsTimeChart.jsx` — multi-series line chart for account groups
  - `BudgetChart.jsx` — bar chart for budget data
- **RangeSelector** — reusable time-range toggle component, used by all time-series charts
- **Pattern for adding a line:** Use `<Area>` or `<Line>` component inside the chart. For overlay, a `<Line>` with dashed stroke would differentiate from area fills.

### Backend API Patterns
- **Framework:** Flask, single `app.py` file (monolith)
- **Database:** SQLite via `get_db_connection()` context manager
- **API style:** REST JSON endpoints at `/api/<resource>/<action>`
- **Existing endpoints relevant to investments:**
  - `GET /api/networth/history` — returns `[{date, net_worth, assets, liabilities}]`
  - `GET /api/networth/by-type` — returns `{series, cagr, bucket_colors, bucket_order}`
  - `GET /api/retirement` / `POST /api/retirement` — settings CRUD
- **Holdings sync:** `fetch_holdings()` already runs during sync, upserting into `holdings` table
- **No existing investment performance endpoints** — Phase 3 will create these; Phase 6 extends them

### Frontend API Layer
- `frontend/src/api.js` — centralized `fetchJSON()` / `postJSON()` helpers
- Pattern: `export const fetchX = () => fetchJSON('/api/x')` one-liner exports
- Phase 6 will add `fetchBenchmarkData()` following this pattern

### Database Schema (existing relevant tables)
- `holdings` — per-position data (account_id, ticker, quantity, cost_basis, current_value, etc.)
- `security_prices` — ticker/date/price history (created in Phase 0)
- `account_history` — daily account-level balance snapshots
- `retirement_settings` — stores retirement config (will store target allocation too, or a new table)

### Design System
- Dark theme throughout — backgrounds `#0B1120` to `#1C2333`, text `#F0F6FF`
- CSS Modules for component styling (`.module.css` files)
- No global CSS token file found — tokens are hardcoded in `chartUtils.jsx` and component CSS
- Responsive via `useResponsive()` hook (returns `{isMobile}`)

---

## 2. S&P 500 Data Sources (Free)

### Option A: Yahoo Finance (yfinance Python package)
- **Ticker:** `^GSPC`
- **Method:** `pip install yfinance` → `yf.download("^GSPC", start="2000-01-01")`
- **Rate limits:** Unofficial API; no guaranteed SLA. Rate limits are generous for personal use (several hundred requests/day)
- **Data quality:** Daily OHLCV, adjusted close, goes back to 1927
- **Pros:** Dead simple, well-maintained Python package, excellent data quality
- **Cons:** Unofficial API — Yahoo could change/break it. No API key needed. Occasionally throttles heavy usage.
- **Latency:** ~1-2 seconds for a full history download
- **License:** Data is from Yahoo Finance; personal use is fine

### Option B: FRED (Federal Reserve Economic Data)
- **API:** `https://api.stlouisfed.org/fred/series/observations?series_id=SP500`
- **Rate limits:** Free API key required, 120 requests/minute
- **Data quality:** Daily close, sourced from S&P Dow Jones Indices. Some gaps on non-trading days.
- **Pros:** Official government API, stable, well-documented
- **Cons:** Requires free API key registration. Only goes back to ~2010 for the SP500 series (older data uses different series IDs). No OHLCV — just close.

### Option C: Alpha Vantage
- **API:** REST endpoint with free tier
- **Rate limits:** 25 requests/day on free tier (very restrictive)
- **Data quality:** Good OHLCV data
- **Pros:** Official API with key
- **Cons:** 25 requests/day is too low for reliable daily updates. Paid tiers start at $50/mo.

### Option D: Static CSV + Periodic Update
- **Method:** Download S&P 500 CSV once, store in DB, update daily during sync
- **Pros:** No external API dependency at runtime; fast queries
- **Cons:** Need a mechanism to keep it updated

### Recommendation: Yahoo Finance (yfinance) → SQLite cache
- Use `yfinance` to fetch S&P 500 data
- Store in `security_prices` table (already exists from Phase 0) with ticker `^GSPC`
- Fetch incrementally during sync (only fetch new dates since last stored date)
- Cache in DB means the frontend never waits on an external API
- Fallback: if yfinance fails during sync, silently skip — stale benchmark data is better than no data

---

## 3. Performance Return Calculations

### Simple Return
```
return_pct = (end_value / start_value - 1) * 100
```
Works for S&P 500 (no cash flows). Also works for account comparison when you want a naive view.

### Time-Weighted Rate of Return (TWRR)
For accounts with contributions/withdrawals, TWRR is the industry standard:
```
TWRR = [(1 + r1) * (1 + r2) * ... * (1 + rn)] - 1
```
Where each `ri` is the return for a sub-period between cash flows. Requires knowing the account value immediately before and after each cash flow.

**Simplification for Phase 6:** Since we have daily `account_history` snapshots and can detect contributions from transactions, we can approximate TWRR by computing daily returns and chaining them. This is "modified Dietz" approximation and is accurate enough for a personal dashboard.

**Simpler alternative:** If Phase 3 doesn't implement TWRR, Phase 6 can use simple return as a v1 and note the caveat. The S&P 500 comparison is still directionally useful even with simple returns.

### Normalization for Comparison
Both series normalized to 0% at the start of the selected time range:
```python
normalized = [(price / prices[0] - 1) * 100 for price in prices]
```

---

## 4. Phase 3 Dependency Analysis

Phase 6 depends on Phase 3 creating:
1. **Investments page** with routing (`/investments` route in App.jsx)
2. **Account performance chart** — the chart we'll overlay the S&P 500 line onto
3. **Account selection mechanism** — ability to select individual accounts or "All"
4. **Performance data endpoint** — e.g., `GET /api/investments/performance?account_id=X&range=1Y`

**What Phase 6 adds on top of Phase 3:**
- New backend endpoint: `GET /api/benchmark/sp500?start=YYYY-MM-DD&end=YYYY-MM-DD`
- S&P 500 data sync step in the sync pipeline
- Frontend: benchmark toggle + overlay line on the existing performance chart
- Frontend: optional target allocation section

**Risk:** If Phase 3's chart implementation differs significantly from what's assumed here, the frontend overlay approach may need adjustment. However, since all charts in the codebase use Recharts with consistent patterns, the overlay pattern (adding a `<Line>` to an existing chart) is straightforward regardless of Phase 3's specific implementation.

---

## 5. Target Allocation Feature Research

### Storage
- New table `target_allocation` or add columns to an existing settings table
- Schema: `{id, asset_class TEXT, target_pct REAL, created_at TEXT}`
- Asset classes: Stocks, Bonds, Cash, Other (matches holdings `type` field from Phase 0)

### Actual Allocation Calculation
- Aggregate `holdings.current_value` grouped by `holdings.type`
- Compute percentage of total for each type
- Compare against target percentages

### Visualization
- Side-by-side donut/bar charts: Target vs Actual
- Drift indicator: highlight when |actual - target| > threshold
- Common UX pattern in investment dashboards

### Complexity Assessment
This is genuinely a separate sub-feature from the S&P 500 overlay. Given the S-sizing of Phase 6, recommend:
- **Core deliverable:** S&P 500 performance overlay (US-1, US-2)
- **Stretch:** Target allocation comparison (US-3) — can be deferred to a future PR if Phase 6 runs long
