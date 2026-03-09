# Phase 6 Research — Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Agent:** Research Agent
**Status:** Complete

---

## Problem Summary

Phase 6 adds an S&P 500 benchmark overlay to the Investments page (Phase 3) so users can compare their portfolio and individual account returns against the market. A secondary stretch goal is a target asset allocation comparison. The architect needs to decide: (1) which external data source to use, (2) how to store and serve it, (3) how to integrate the overlay into Phase 3's chart, and (4) what the actual Phase 3 component names will be to anchor the implementation plan.

---

## Codebase Context

### Phase 3 Status: Planned but Not Yet Built

Phase 3 (the Investments page) is **Planned** in `docs/plans/index.md` — it has not been implemented. There is:
- No `/investments` route in `frontend/src/App.jsx`
- No `InvestmentsPage.jsx` in `frontend/src/pages/`
- No `InvestmentPerformanceChart.jsx` in `frontend/src/components/`
- No `/api/investments/*` endpoints in `backend/app.py`
- No `investments` nav item in `frontend/src/nav.js`

The Phase 3 implementation plan (`docs/plans/phase3-impl-plan.md`) defines the planned component names:
- Page: `frontend/src/pages/InvestmentsPage.jsx` (with URL params for drill-down at `/investments/:accountId`)
- Chart: `frontend/src/components/InvestmentPerformanceChart.jsx`
- API functions in `frontend/src/api.js`: `fetchInvestmentsSummary`, `fetchInvestmentHoldings`, `fetchInvestmentsPerformance`, `fetchInvestmentContributions`
- Backend endpoints: `GET /api/investments/summary`, `GET /api/investments/<account_id>/holdings`, `GET /api/investments/performance`, `GET /api/investments/contributions`

Phase 6 implementation cannot begin until Phase 3 is complete. The file names above are planned, not final.

### The `security_prices` Table Does NOT Exist

The Phase 6 architecture document asserts that `security_prices` was "already created in Phase 0." This is incorrect. Phase 0 created only the `holdings` table. The `security_prices` table was explicitly deferred: the Phase 0 final plan (`docs/plans/phase0-holdings-sync-final-plan.md`) notes "Deferred: closing_price, price change fields… These belong in Phase 5 (security_prices table)." Phase 5 architecture (`docs/plans/phase5-architecture.md`) then explicitly chose NOT to create it: "The security_prices table was never built (Phase 0 made it optional)."

Phase 6 must create the `security_prices` table itself, as part of `DASHBOARD_DDL` in `backend/app.py`.

### Existing Account/Holdings Data

The `holdings` table (from Phase 0, `pipeline/monarch_pipeline/schema.py`) contains:
- `id`, `account_id`, `security_id`, `security_name`, `ticker`, `security_type`
- `quantity`, `basis`, `total_value`, `current_price`
- `is_manual`, `last_synced_at`, `synced_at`

The `account_history` table contains daily balance snapshots: `(account_id, date, balance)`.

The `accounts` table contains: `id`, `name`, `type`, `subtype`, `is_asset`, `include_in_net_worth`, `is_hidden`, `current_balance`.

CAGR calculations already exist in `_compute_bucket_cagr()` in `backend/app.py` (lines 757–811): the function takes a `{date: balance}` dict, computes 1Y/3Y/5Y CAGR using `(end/start)^(1/years) - 1` with edge case handling for < 30 data points. This pattern is directly reusable for portfolio return calculations.

### Existing Charting Patterns

All time-series charts use Recharts 2.x. The pattern for adding a benchmark overlay line to Phase 3's chart is:

```jsx
// Inside an existing AreaChart or ComposedChart
{showBenchmark && benchmarkData && (
  <Line
    type="monotone"
    dataKey="benchmark_return_pct"
    name="S&P 500"
    stroke={COLOR_AMBER}
    strokeWidth={1.5}
    strokeDasharray="6 3"
    dot={false}
  />
)}
```

Shared chart utilities live in `frontend/src/components/chartUtils.jsx`:
- `filterByRange(data, months)` — YYYY-MM-DD date filter
- `downsample(data, maxPoints=200)` — performance downsampling
- `COMMON_RANGES` — `[{label: '3M', months: 3}, {label: '6M', months: 6}, {label: '1Y', months: 12}, {label: '2Y', months: 24}, {label: 'All', months: null}]`
- `COLOR_AMBER = '#F5A623'` — unused by existing chart series, appropriate for benchmark line
- `COLOR_ACCENT`, `COLOR_POSITIVE`, `COLOR_NEGATIVE` — taken by portfolio/return display
- `TOOLTIP_STYLE`, `AXIS_TICK`, `GRID_STROKE` — shared across all charts

`NetWorthChart.jsx` has a precedent for the toggle pattern (the "Show assets / liabilities" checkbox), and `TypeStackedChart.jsx` demonstrates multi-series charts with milestones and CAGR tables.

`RangeSelector.jsx` is a reusable component accepting `{ranges, activeRange, onSelect}` props.

### Backend API Patterns

- All endpoints are in the single-file `backend/app.py` (2,442 lines)
- Route pattern: `@app.route("/api/<domain>/<action>")` with `def function_name():`
- Database: `conn = get_db()` → SQLite3 → `finally: conn.close()`
- Rate limiting: `_check_ai_rate_limit(endpoint)` — applies to compute-heavy endpoints
- Error handling: `try/except` blocks returning `jsonify({"error": "..."})`, `app.logger.exception()`
- Settings key-value store: `get_setting(conn, key, default)` / `set_setting(conn, key, value)` for feature flags or config

The sync worker (`_run_sync_worker`, lines 395–540) loops over `ordered_entities(entities)` with `elif entity == "holdings":` branches. The benchmark sync helper should NOT be added as an entity (per the staff review finding #2) — it should be a separate function called after the entity loop.

### Frontend API Layer

`frontend/src/api.js` pattern:
```js
export const fetchBenchmarkComparison = (accountId = 'all', range = '1y') =>
  fetchJSON(`/api/benchmark/comparison?account_id=${accountId}&range=${range}`)
```
Named exports only — no raw `fetchJSON` calls in page components.

### Design System

Dark theme. CSS tokens from `index.css`. Key tokens relevant to Phase 6:
- `var(--accent)` / `COLOR_ACCENT #4D9FFF` — currently used for cobalt accent (do not use for benchmark)
- `var(--color-warning)` / `COLOR_AMBER #F5A623` — available for benchmark line (currently used for milestone ReferenceLines and warning states only)
- `var(--bg-card) #1C2333` — card backgrounds
- `var(--text-secondary) #8BA8CC` — labels

Recharts cannot use CSS variables in SVG attrs — use the `chartUtils.jsx` constants directly.

---

## Options Evaluated

### Option 1: yfinance Python Package → SQLite Cache (Existing Architecture Decision)

**Description:** Install `yfinance>=1.0` via `requirements.txt`. Lazily import inside `sync_benchmark_data()`. Download `^GSPC` or `SPY` incremental daily data. Cache in `security_prices` table. Frontend reads from cache; never hits Yahoo directly.

**Pros:**
- Zero API key required
- Simple Python API: `yf.Ticker("SPY").history(start=last_date)`
- Widely documented; large community
- Incremental fetch minimizes data transfer

**Cons:**
- Yahoo Finance changed its policy in 2024-2025. Historical data downloads for `^GSPC` (the direct S&P 500 index) are now reported to require a paid Yahoo Finance subscription on some accounts. The `yfinance` GitHub issue tracker (#2340) documents this failure mode.
- `SPY` ETF may still work as a proxy ticker, but this is unreliable across user accounts and time.
- `yfinance` pulls in `pandas` and `numpy` as heavy transitive dependencies. The Docker image currently has no data science dependencies (only `flask`, `flask-cors`, `apscheduler`, `anthropic`, `openai`, `keyring`). Adding `yfinance` would add ~150-300MB to the Docker image via pandas/numpy.
- yfinance is an unofficial API with no SLA. It has broken multiple times as Yahoo changes their endpoints.

**Effort estimate:** Low for the Python code; Medium when accounting for Docker image size and the reliability risks.

**Compatibility:** Fits existing patterns if lazy-imported. Risk: may not work for users without Yahoo Finance Gold accounts for the `^GSPC` symbol.

---

### Option 2: FRED API (Federal Reserve Economic Data)

**Description:** Use the `fredapi` Python package or direct HTTP calls to `https://api.stlouisfed.org/fred/series/observations?series_id=SP500`. Cache in `security_prices`. Requires a free API key (registered at fred.stlouisfed.org).

**Pros:**
- Official government API — reliable, well-documented, stable
- No paid subscription required (free API key)
- The `fredapi` package is lightweight (no pandas/numpy required — returns standard Python dicts)
- FRED has SLA and is run by the Federal Reserve Bank of St. Louis — it will not be broken by commercial policy changes

**Cons:**
- Requires user to register for a free API key and store it in the app settings — adds setup friction
- FRED's SP500 series only covers **the last 10 years** due to a licensing agreement with S&P Dow Jones Indices. Users with accounts older than 10 years will have a gap in their benchmark comparison.
- The series ID is `SP500` (not `^GSPC`) — different format
- Direct HTTP using `urllib` or `requests` without a wrapper adds slightly more code; the `fredapi` package wraps it cleanly but adds a dependency

**Effort estimate:** Low-Medium (API key setup UI adds frontend complexity; library is simple).

**Compatibility:** Fits existing patterns for settings/API keys (the AI provider already uses stored keys). The 10-year limit is a material constraint.

---

### Option 3: SPY ETF via Direct HTTP (No Package)

**Description:** Call Yahoo Finance's unofficial JSON API directly for `SPY` (an ETF that tracks the S&P 500), without the `yfinance` package. Use Python's standard `urllib.request` or the existing `requests` library (not currently in requirements). Cache in `security_prices`. No API key, no heavy dependencies.

**Pros:**
- No pandas/numpy dependency — keeps Docker image lean
- No API key required
- `SPY` as an ETF differs from `^GSPC` only negligibly for benchmarking purposes (SPY includes dividend reinvestment; `^GSPC` is price-only)
- Data goes back to 1993 (SPY inception), covering any realistic user account history
- Avoids the `yfinance` abstraction layer, giving direct control over request format and retry logic

**Cons:**
- Relies on Yahoo Finance's unofficial API endpoint — same reliability risk as yfinance, just without the packaging
- The specific endpoint format (`https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=max`) is undocumented and can change
- Dividend-adjusted `adjclose` vs unadjusted `close` must be handled manually — `yfinance` handles this automatically
- Historical access restrictions may affect direct API calls the same as they affect yfinance

**Effort estimate:** Medium (more code to write, test, and maintain than using a library).

**Compatibility:** Fits the pattern of avoiding external API keys. Same reliability risk as Option 1.

---

### Option 4: Stagger with SPY Fallback (Hybrid Recommended)

**Description:** Try `yfinance` with `SPY` as the primary ticker. If the fetch fails (exception or empty response), fall back to FRED with a stored API key (optional — only used if user has configured it). If both fail, use existing cached data with a staleness indicator. Benchmark sync never fails the main Monarch sync.

**Pros:**
- Best reliability: multiple fallback layers
- `SPY` via yfinance works for most users today; FRED is the quality backup
- Graceful degradation matches the existing pattern in the sync pipeline

**Cons:**
- More complex implementation — two code paths for data ingestion
- Slightly harder to test (mocking two fetch paths)

**Effort estimate:** Medium.

**Compatibility:** High — follows the pattern of try/except with fallback that already exists in the sync pipeline.

---

## Recommendation

Use **Option 1 (yfinance with SPY ticker)** as the starting implementation, with the following constraints addressed:

1. Use `SPY` ticker (not `^GSPC`) as the primary target — SPY's historical data is still accessible without a Yahoo Finance Gold subscription, and SPY tracks the S&P 500 closely enough for personal finance benchmarking.
2. Lazy-import `yfinance` inside `sync_benchmark_data()` to avoid startup overhead.
3. Wrap all yfinance calls in `try/except` — if fetch fails for any reason, log a warning and use existing cached data. The sync job does not fail.
4. Document the known Yahoo Finance policy risk in the PR and consider upgrading to Option 4 (hybrid with FRED fallback) in a follow-on if users report failures.

If the `yfinance` situation remains unstable (the GitHub issues as of early 2026 are unresolved), **Option 2 (FRED)** is the most reliable alternative, at the cost of requiring a one-time API key registration.

**Do not implement both simultaneously** — keep it simple for v1.

---

## Open Questions

1. **Will Phase 3 use `InvestmentPerformanceChart.jsx` as the exact filename?** The Phase 3 implementation plan uses this name, but the plan is not yet final. Phase 6's integration point depends on this. Resolution: confirm when Phase 3 is implemented.

2. **Does Phase 3's performance chart use `ComposedChart` or `AreaChart`?** Adding a `<Line>` to an existing `<AreaChart>` in Recharts requires switching to `<ComposedChart>` (which supports both Area and Line types in the same chart). The Phase 3 plan does not explicitly state which Recharts chart type it uses. Resolution: check Phase 3 implementation.

3. **Is the `security_prices` table schema already defined anywhere?** It is not — it must be designed as part of Phase 6. The Phase 6 architecture document proposes columns `(ticker TEXT, date TEXT, price REAL, PRIMARY KEY (ticker, date))`. This should be sufficient for daily close prices.

4. **What is the Phase 3 account selector's interface?** Phase 6 must re-use whatever account selection mechanism Phase 3 creates. If Phase 3 uses a state variable like `selectedAccountId` (where `"all"` means all investment accounts), Phase 6 needs to pass that value to `fetchBenchmarkComparison`.

5. **yfinance reliability in 2026:** The Yahoo Finance policy change on historical data downloads is ongoing. At writing, SPY historical data via `yfinance` appears to still work for many users, but `^GSPC` does not. The architect should decide whether to launch with `SPY` (slightly impure, very pragmatic) or invest in FRED integration from day one.

6. **Docker image size:** `yfinance` requires `pandas` and `numpy`. These add ~150-300MB to the Docker build. If the project follows a "lean image" principle, this may be unacceptable. Direct HTTP calls (Option 3) or FRED (Option 2 via `fredapi`, which has no pandas dependency) avoid this. The current `Dockerfile.backend` should be reviewed before committing to yfinance.

---

## Summary of Codebase Findings

| Area | Finding |
|------|---------|
| Phase 3 components | Not yet built; planned names are `InvestmentsPage.jsx`, `InvestmentPerformanceChart.jsx` |
| `security_prices` table | Does NOT exist — must be created in Phase 6 as part of `DASHBOARD_DDL` |
| `holdings` table | Exists with ticker, quantity, basis, total_value, current_price |
| `account_history` | Exists with daily balance snapshots per account |
| CAGR calculation | `_compute_bucket_cagr()` in `app.py` is reusable pattern |
| Chart library | Recharts 2.x; all charts use `chartUtils.jsx` constants |
| Adding a benchmark line | Requires switching Phase 3 chart to `ComposedChart` if it uses `AreaChart` |
| yfinance | Listed in architecture doc; has known reliability issues with `^GSPC` in 2025-2026 |
| FRED API | 10-year data limit; reliable; requires free API key |
| Docker impact | yfinance adds pandas/numpy; ~150-300MB image size increase |
| Benchmark toggle precedent | `NetWorthChart.jsx` has a checkbox toggle ("Show assets / liabilities") as UX model |

---

## Relevant File Paths

- `/home/user/stashtrend/backend/app.py` — all backend endpoints, DASHBOARD_DDL, `_compute_bucket_cagr()`, sync worker
- `/home/user/stashtrend/pipeline/monarch_pipeline/schema.py` — pipeline DDL (holdings, account_history)
- `/home/user/stashtrend/pipeline/monarch_pipeline/storage.py` — `upsert_holdings()` as pattern for `upsert_benchmark_prices()`
- `/home/user/stashtrend/frontend/src/components/chartUtils.jsx` — `COLOR_AMBER`, `filterByRange`, `downsample`, `TOOLTIP_STYLE`
- `/home/user/stashtrend/frontend/src/components/NetWorthChart.jsx` — benchmark toggle UX precedent (checkbox)
- `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx` — multi-series chart with CAGR sidebar
- `/home/user/stashtrend/frontend/src/api.js` — API function export pattern
- `/home/user/stashtrend/frontend/src/nav.js` — nav items (needs `/investments` added by Phase 3)
- `/home/user/stashtrend/frontend/src/App.jsx` — routes (needs `/investments` route added by Phase 3)
- `/home/user/stashtrend/backend/requirements.txt` — yfinance would be added here
- `/home/user/stashtrend/docs/plans/phase3-impl-plan.md` — Phase 3 planned file names and endpoints
- `/home/user/stashtrend/docs/plans/phase5-architecture.md` — confirms `security_prices` was never built
