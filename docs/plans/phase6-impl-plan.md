# Phase 6 Implementation Plan — Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Agent:** Engineer Agent (Initial Plan)
**Inputs:** phase6-requirements.md, phase6-research.md, phase6-architecture.md, phase6-design-spec.md
**Status:** Draft — pending staff review

---

## Change Groups

### Group A: Backend — S&P 500 Data Sync
**Tag:** `independent`

#### A1. Add `yfinance` dependency
- **File:** `backend/requirements.txt`
- **Change:** Add `yfinance>=0.2.0` to dependencies
- **Lines:** ~1 line addition

#### A2. Add benchmark sync to pipeline
- **File:** `backend/app.py`
- **Changes:**
  1. Add `"benchmark"` to `ENTITY_TABLE_MAP` (maps to `security_prices`)
  2. Add `"benchmark"` to `ENTITY_RUN_ORDER` (after `holdings`)
  3. Add `"benchmark"` to `ENTITY_LABELS` (display name: "S&P 500 Benchmark")
  4. In the sync worker function, add a `elif entity == "benchmark":` branch that:
     - Queries `security_prices` for the latest date with ticker `^GSPC`
     - Calls `yfinance.download("^GSPC", start=last_date)` to fetch new data
     - Upserts rows into `security_prices` (ticker, date, price)
     - Wraps in try/except: on failure, log warning and continue (don't fail sync)
  5. Import `yfinance` at the top (with try/except ImportError for test environments)
- **Estimated lines:** ~30-40 lines

#### A3. Add `target_allocation` DDL
- **File:** `backend/app.py`
- **Change:** Add `CREATE TABLE IF NOT EXISTS target_allocation (...)` to `DASHBOARD_DDL`
- **Lines:** ~7 lines

---

### Group B: Backend — Benchmark Comparison API
**Tag:** `depends-on: A`

#### B1. GET /api/benchmark/comparison endpoint
- **File:** `backend/app.py`
- **Changes:**
  1. New route `@app.route("/api/benchmark/comparison")`
  2. Query params: `account_id` (default "all"), `range` (default "1y")
  3. Logic:
     - Parse range to a start date (3m, 6m, 1y, 2y, or "all")
     - Fetch account history for the specified account(s) from `account_history` table
     - Fetch S&P 500 prices from `security_prices` where ticker = `^GSPC`
     - For each date in account history, find the closest S&P 500 price (forward-fill for weekends/holidays)
     - Normalize both series to percentage return from start date
     - Compute summary: portfolio_return, benchmark_return, outperformance
     - Return JSON per architecture spec
  4. Handle edge cases: no S&P 500 data → return `{benchmark: null, ...}`, no account data → 404
- **Estimated lines:** ~60-80 lines

#### B2. GET /api/allocation/target endpoint (stretch)
- **File:** `backend/app.py`
- **Change:** CRUD endpoint for target allocation
  - GET: read all rows from `target_allocation`
  - POST: upsert target allocation percentages (validate sum = 100%)
- **Estimated lines:** ~30 lines

#### B3. GET /api/allocation/actual endpoint (stretch)
- **File:** `backend/app.py`
- **Change:** Aggregate `holdings.current_value` by `type`, compute percentages
- **Estimated lines:** ~20 lines

---

### Group C: Backend — Tests
**Tag:** `independent` (can start in parallel with Group A using mocked data)

#### C1. Benchmark comparison endpoint tests
- **File:** `backend/tests/test_benchmark.py` (new)
- **Tests:**
  1. `test_benchmark_comparison_basic` — returns portfolio + benchmark series with correct shape
  2. `test_benchmark_comparison_single_account` — filters to one account
  3. `test_benchmark_comparison_range_filter` — respects time range parameter
  4. `test_benchmark_no_sp500_data` — returns benchmark: null gracefully
  5. `test_benchmark_no_account_data` — returns 404
  6. `test_benchmark_date_alignment` — weekends/holidays correctly forward-filled
  7. `test_benchmark_normalization` — both series start at 0% on start date
  8. `test_benchmark_summary_math` — outperformance = portfolio - benchmark
- **Setup:** Insert mock `account_history` and `security_prices` rows into test DB
- **Estimated lines:** ~120-150 lines

#### C2. Benchmark sync tests
- **File:** `backend/tests/test_benchmark.py` (same file)
- **Tests:**
  1. `test_sync_benchmark_fetches_sp500` — mock yfinance, verify rows inserted into security_prices
  2. `test_sync_benchmark_incremental` — only fetches dates after last stored date
  3. `test_sync_benchmark_failure_graceful` — yfinance error doesn't fail the sync
- **Estimated lines:** ~50-60 lines

#### C3. Target allocation tests (stretch)
- **File:** `backend/tests/test_benchmark.py` (same file)
- **Tests:**
  1. `test_target_allocation_crud` — save and retrieve target allocation
  2. `test_target_allocation_validation` — reject if percentages don't sum to 100%
  3. `test_actual_allocation` — correctly aggregates holdings by type
- **Estimated lines:** ~40-50 lines

---

### Group D: Frontend — API Layer
**Tag:** `independent`

#### D1. Add benchmark API functions
- **File:** `frontend/src/api.js`
- **Changes:**
  ```js
  // ── Benchmark ──────────────────────────────────────────────────────────
  export const fetchBenchmarkComparison = (accountId = 'all', range = '1y') =>
    fetchJSON(`/api/benchmark/comparison?account_id=${accountId}&range=${range}`)
  export const fetchTargetAllocation = () => fetchJSON('/api/allocation/target')
  export const saveTargetAllocation = (data) => postJSON('/api/allocation/target', data)
  export const fetchActualAllocation = () => fetchJSON('/api/allocation/actual')
  ```
- **Estimated lines:** ~6 lines

---

### Group E: Frontend — Benchmark Chart Overlay
**Tag:** `depends-on: D` (and assumes Phase 3 performance chart exists)

#### E1. BenchmarkToggle component
- **File:** `frontend/src/components/BenchmarkToggle.jsx` (new)
- **Props:** `checked: bool`, `onChange: fn`, `disabled: bool`, `disabledReason: string`
- **Renders:** Checkbox with label "Compare to S&P 500", styled per design spec
- **Estimated lines:** ~25 lines

- **File:** `frontend/src/components/BenchmarkToggle.module.css` (new)
- **Estimated lines:** ~15 lines

#### E2. Integrate benchmark overlay into Phase 3 performance chart
- **File:** Phase 3's performance chart component (exact filename TBD — likely `frontend/src/components/PerformanceChart.jsx` or similar)
- **Changes:**
  1. Import `BenchmarkToggle` and `fetchBenchmarkComparison`
  2. Add state: `showBenchmark`, `benchmarkData`, `benchmarkLoading`
  3. When `showBenchmark` toggled on, call `fetchBenchmarkComparison(selectedAccount, selectedRange)`
  4. Re-fetch when account or range changes while toggle is on
  5. Add Recharts `<Line>` for S&P 500:
     ```jsx
     {showBenchmark && benchmarkData && (
       <Line
         type="monotone"
         dataKey="benchmark_return_pct"
         name="S&P 500"
         stroke={COLOR_AMBER}
         strokeWidth={1.5}
         strokeDasharray="6 3"
         dot={false}
         yAxisId="pct"
       />
     )}
     ```
  6. Merge benchmark data into chart data array (align by date)
  7. Extend existing tooltip to show S&P 500 value when overlay active
  8. Add S&P 500 to legend when overlay active
- **Estimated lines:** ~40-50 lines of changes

#### E3. BenchmarkSummaryCard component
- **File:** `frontend/src/components/BenchmarkSummaryCard.jsx` (new)
- **Props:** `summary: {portfolio_return, benchmark_return, outperformance, period_label}`, `lastUpdated: string`
- **Renders:** Three inline cards (Your Return, S&P 500, vs Benchmark) per design spec
- **Estimated lines:** ~50 lines

- **File:** `frontend/src/components/BenchmarkSummaryCard.module.css` (new)
- **Estimated lines:** ~40 lines

#### E4. Integrate summary card into Investments page
- **File:** Phase 3's Investments page component (likely `frontend/src/pages/InvestmentsPage.jsx`)
- **Change:** Render `<BenchmarkSummaryCard>` below the chart when benchmark data is loaded
- **Estimated lines:** ~5-10 lines

---

### Group F: Frontend — Target Allocation Panel (Stretch)
**Tag:** `depends-on: D`

#### F1. TargetAllocationPanel component
- **File:** `frontend/src/components/TargetAllocationPanel.jsx` (new)
- **Props:** `target: [{asset_class, target_pct}]`, `actual: [{asset_class, actual_pct}]`
- **Features:**
  - Side-by-side horizontal bars for target vs actual
  - Edit mode with inline form
  - Drift warnings when deviation > 5%
  - Empty state with "Set Target" CTA
- **Estimated lines:** ~120 lines

- **File:** `frontend/src/components/TargetAllocationPanel.module.css` (new)
- **Estimated lines:** ~60 lines

#### F2. Integrate into Investments page
- **File:** Phase 3's Investments page component
- **Change:** Render `<TargetAllocationPanel>` below benchmark summary
- **Estimated lines:** ~15 lines

---

### Group G: Frontend — Tests
**Tag:** `depends-on: E, F`

#### G1. BenchmarkToggle tests
- **File:** `frontend/src/components/BenchmarkToggle.test.jsx` (new)
- **Tests:** Renders checked/unchecked, fires onChange, disabled state with tooltip
- **Estimated lines:** ~40 lines

#### G2. BenchmarkSummaryCard tests
- **File:** `frontend/src/components/BenchmarkSummaryCard.test.jsx` (new)
- **Tests:** Renders all three sub-cards, correct colors for positive/negative, handles null data
- **Estimated lines:** ~50 lines

#### G3. TargetAllocationPanel tests (stretch)
- **File:** `frontend/src/components/TargetAllocationPanel.test.jsx` (new)
- **Tests:** Renders bars, edit mode, validation (sum to 100%), drift warnings, empty state
- **Estimated lines:** ~80 lines

#### G4. API function tests
- **File:** `frontend/src/api.test.js` (existing — add benchmark section)
- **Tests:** `fetchBenchmarkComparison`, `fetchTargetAllocation`, `saveTargetAllocation`, `fetchActualAllocation`
- **Estimated lines:** ~20 lines

---

## Parallelism Summary

```
Group A (Backend sync) ──────────────┐
                                      ├──→ Group B (Backend API) ──→ Group E (Frontend overlay)
Group C (Backend tests) ─────────────┤                                      │
                                      │                               Group G (Frontend tests)
Group D (Frontend API layer) ────────┘──→ Group F (Stretch: allocation) ──┘
```

- **Parallel streams:** A + C + D can all start simultaneously
- **B** depends on A (needs sync infrastructure)
- **E** depends on D (needs API functions) and conceptually on B (needs backend endpoint)
- **F** depends on D
- **G** depends on E and F

---

## Estimated Scope

| Group | New Files | Modified Files | Est. Lines | Stretch? |
|-------|-----------|---------------|------------|----------|
| A | 0 | 2 | ~40 | No |
| B | 0 | 1 | ~110 | B2, B3 are stretch |
| C | 1 | 0 | ~220 | C3 is stretch |
| D | 0 | 1 | ~6 | No |
| E | 4 | 2 | ~180 | No |
| F | 2 | 1 | ~195 | Yes |
| G | 3 | 1 | ~190 | G3 is stretch |
| **Core total** | **5** | **6** | **~550** | |
| **With stretch** | **10** | **7** | **~940** | |

---

## Implementation Order

1. **Groups A + C + D** (parallel) — backend sync, backend tests, frontend API
2. **Group B** — backend comparison endpoint
3. **Group E** — frontend chart overlay + summary card
4. **Group G** (non-stretch tests) — frontend tests
5. **Group F** (if time permits) — target allocation panel
6. **Group G** (stretch tests) — allocation panel tests
