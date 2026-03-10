# Phase 6 Final Implementation Plan — Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Agent:** Engineer Agent (Final Plan)
**Inputs:** phase6-impl-plan.md (initial), phase6-review.md (staff findings)
**Status:** Ready for implementation

---

## Staff Review Resolutions

| Finding | Resolution |
|---------|------------|
| #1 Phase 3 dependency | All Phase 3 references now use placeholder names with explicit "Phase 3 prerequisite" notes. Implementation must not begin until Phase 3 is complete. |
| #2 Benchmark as sync entity | Removed benchmark from entity maps. Added standalone `sync_benchmark_data()` helper called at end of sync worker. |
| #3 yfinance lazy import | Import moved inside `sync_benchmark_data()` function body. |
| #4 Date alignment algorithm | Specified O(n) single-pass merge algorithm in B1. |
| #5 Rate limiting | Added rate limiter to benchmark endpoint. |
| #6 Chart data merge | Added `mergeBenchmarkSeries()` utility spec in E2. |
| #7 Toggle persistence | Toggle state persisted in localStorage. |
| #8 benchmark:null handling | Added inline message for null benchmark response. |
| #9 Integration test | Added integration test in G5. |
| #10 yfinance Docker impact | Evaluated; using direct HTTP to Yahoo Finance instead of yfinance to avoid pandas/numpy. See A1 revision. |
| #11 Allocation validation | Using [99.9, 100.1] tolerance with auto-adjust. |

---

## PREREQUISITE

**Phase 3 (Investments page) must be complete before Phase 6 implementation begins.** Phase 6 extends components and pages created by Phase 3. All references to Phase 3 components below use placeholder names — the actual filenames will be determined by Phase 3's implementation. The integration patterns (adding a Recharts `<Line>`, rendering cards) are chart-agnostic and will work regardless of Phase 3's specific component structure.

---

## Change Groups

### Group A: Backend — S&P 500 Data Sync
**Tag:** `independent`

#### A1. Add Yahoo Finance fetch utility (no yfinance dependency)
- **File:** `backend/app.py`
- **Change:** Add a `fetch_sp500_prices(start_date)` helper function that:
  - Makes a direct HTTP GET to Yahoo Finance's chart API: `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1={unix_start}&period2={unix_now}&interval=1d`
  - Parses the JSON response to extract dates and closing prices
  - Returns a list of `(date_str, price)` tuples
  - Wrapped in try/except: returns empty list on any failure
  - **No new pip dependencies** — uses stdlib `urllib.request` and `json`
  - This avoids the pandas/numpy dependency chain from `yfinance` (staff finding #10)
- **Estimated lines:** ~30 lines

#### A2. Add benchmark sync helper (NOT a sync entity)
- **File:** `backend/app.py`
- **Changes:**
  1. **Do NOT** add benchmark to `ENTITY_TABLE_MAP`, `ENTITY_RUN_ORDER`, or `ENTITY_LABELS` (staff finding #2)
  2. Add `sync_benchmark_data(conn)` function:
     - Queries `security_prices` for `MAX(date) WHERE ticker = '^GSPC'`
     - If no data exists, fetch from 2000-01-01; otherwise fetch from last_date + 1 day
     - Calls `fetch_sp500_prices(start_date)`
     - Upserts rows into `security_prices` (ticker `^GSPC`, date, price)
     - Returns count of rows upserted
     - On any error: logs warning, returns 0 (never fails the sync)
  3. Call `sync_benchmark_data(conn)` at the end of the sync worker function, after all Monarch entity syncs complete, inside a separate try/except block
  4. Log the result: "Benchmark: {n} new S&P 500 prices" or "Benchmark: skipped (fetch failed)"
- **Estimated lines:** ~25 lines

#### A3. Add `target_allocation` DDL
- **File:** `backend/app.py`
- **Change:** Add to `DASHBOARD_DDL`:
  ```sql
  CREATE TABLE IF NOT EXISTS target_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_class TEXT NOT NULL UNIQUE,
      target_pct REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- **Lines:** ~7 lines

---

### Group B: Backend — Benchmark Comparison API
**Tag:** `depends-on: A`

#### B1. GET /api/benchmark/comparison endpoint
- **File:** `backend/app.py`
- **Changes:**
  1. New route `@app.route("/api/benchmark/comparison")`
  2. Apply existing rate limiter (staff finding #5): 30 requests/minute
  3. Query params: `account_id` (default `"all"`), `range` (default `"1y"`)
  4. Logic:
     - Parse range to start date: `{"3m": 3, "6m": 6, "1y": 12, "2y": 24, "all": None}` months before today
     - Fetch account history: if `account_id == "all"`, aggregate all investment account balances per date; otherwise filter to single account
     - Fetch S&P 500 prices: `SELECT date, price FROM security_prices WHERE ticker = '^GSPC' AND date >= ? ORDER BY date`
     - **Date alignment (staff finding #4):** O(n) single-pass merge:
       ```python
       # Both series sorted by date ascending
       sp500_map = {}
       last_price = None
       sp500_idx = 0
       for row in account_series:
           # Advance sp500 pointer to the latest date <= row.date
           while sp500_idx < len(sp500_data) and sp500_data[sp500_idx].date <= row.date:
               last_price = sp500_data[sp500_idx].price
               sp500_idx += 1
           sp500_map[row.date] = last_price
       ```
     - Normalize both series: `return_pct = (value / start_value - 1) * 100`
     - Compute summary: `{portfolio_return, benchmark_return, outperformance: portfolio - benchmark, period_label}`
     - If no S&P 500 data: return `{"benchmark": null, "summary": null, "benchmark_last_updated": null, "portfolio": [...]}`
     - If no account data for the given account_id: return 404
  5. Return JSON:
     ```json
     {
       "portfolio": [{"date": "...", "return_pct": 0.0}, ...],
       "benchmark": [{"date": "...", "return_pct": 0.0}, ...],
       "summary": {"portfolio_return": 12.5, "benchmark_return": 10.2, "outperformance": 2.3, "period_label": "1Y"},
       "benchmark_last_updated": "2026-03-08"
     }
     ```
- **Estimated lines:** ~70 lines

#### B2. GET/POST /api/allocation/target endpoint (stretch)
- **File:** `backend/app.py`
- **Changes:**
  - GET: return all rows from `target_allocation`
  - POST: accept `[{asset_class, target_pct}, ...]`
    - Validate sum is within [99.9, 100.1] (staff finding #11)
    - If sum is in tolerance but not exactly 100.0, auto-adjust the largest category
    - Delete all existing rows, insert new ones (full replace)
  - Apply rate limiter
- **Estimated lines:** ~35 lines

#### B3. GET /api/allocation/actual endpoint (stretch)
- **File:** `backend/app.py`
- **Change:** Aggregate `holdings.current_value` grouped by `holdings.type`, compute percentage of total
- **Estimated lines:** ~20 lines

---

### Group C: Backend — Tests
**Tag:** `independent` (can start in parallel with Group A using mocked data)

#### C1. Benchmark comparison endpoint tests
- **File:** `backend/tests/test_benchmark.py` (new)
- **Setup:** Create test fixtures with mock `account_history` and `security_prices` data
- **Tests:**
  1. `test_benchmark_comparison_returns_both_series` — verify response shape has portfolio + benchmark arrays
  2. `test_benchmark_comparison_single_account` — filters correctly to one account
  3. `test_benchmark_comparison_range_3m` — respects 3-month range filter
  4. `test_benchmark_comparison_range_all` — returns full history when range=all
  5. `test_benchmark_no_sp500_data_returns_null` — benchmark field is null, portfolio still returned
  6. `test_benchmark_no_account_returns_404` — nonexistent account_id returns 404
  7. `test_benchmark_date_alignment_forward_fill` — weekend dates use Friday's S&P price
  8. `test_benchmark_normalization_starts_at_zero` — both series start at return_pct=0.0
  9. `test_benchmark_summary_outperformance_math` — outperformance = portfolio_return - benchmark_return
  10. `test_benchmark_rate_limited` — exceeding rate limit returns 429
- **Estimated lines:** ~150 lines

#### C2. Benchmark sync tests
- **File:** `backend/tests/test_benchmark.py` (same file)
- **Tests:**
  1. `test_sync_benchmark_inserts_prices` — mock HTTP response, verify rows in security_prices
  2. `test_sync_benchmark_incremental` — pre-populate some dates, verify only new dates fetched
  3. `test_sync_benchmark_failure_graceful` — mock HTTP error, verify sync continues, returns 0
  4. `test_fetch_sp500_prices_parses_response` — unit test for the Yahoo Finance response parser
- **Estimated lines:** ~60 lines

#### C3. Target allocation tests (stretch)
- **File:** `backend/tests/test_benchmark.py` (same file)
- **Tests:**
  1. `test_target_allocation_save_and_load` — round-trip CRUD
  2. `test_target_allocation_rejects_over_100` — sum > 100.1 returns error
  3. `test_target_allocation_auto_adjusts` — sum 99.9 is accepted, largest category adjusted
  4. `test_actual_allocation_aggregates_holdings` — correct percentages from mock holdings
- **Estimated lines:** ~50 lines

---

### Group D: Frontend — API Layer
**Tag:** `independent`

#### D1. Add benchmark API functions
- **File:** `frontend/src/api.js`
- **Changes:** Add new section:
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
**Tag:** `depends-on: D` + Phase 3 prerequisite

**Note:** All file references to Phase 3 components are placeholders. Actual filenames will be confirmed after Phase 3 is complete.

#### E1. BenchmarkToggle component
- **File:** `frontend/src/components/BenchmarkToggle.jsx` (new)
- **Props:** `checked: bool`, `onChange: fn`, `disabled: bool`, `disabledReason: string`
- **Behavior:**
  - Renders checkbox with label "Compare to S&P 500"
  - When `disabled`, checkbox is grayed out with `title={disabledReason}`
  - **Persist state in localStorage** (staff finding #7): key `stashtrend-benchmark-visible`
  - On mount, read localStorage to set initial state; call `onChange` if true
- **Estimated lines:** ~30 lines

- **File:** `frontend/src/components/BenchmarkToggle.module.css` (new)
- **Styling per design spec:** flex row, gap 6px, secondary text color, amber accent-color
- **Estimated lines:** ~15 lines

#### E2. Integrate benchmark overlay into Phase 3 performance chart
- **File:** Phase 3's performance chart component (placeholder: `PerformanceChart.jsx`)
- **Changes:**
  1. Import `BenchmarkToggle`, `fetchBenchmarkComparison`, `COLOR_AMBER` from chartUtils
  2. Add state: `showBenchmark` (init from localStorage), `benchmarkData`, `benchmarkLoading`, `benchmarkError`
  3. `useEffect` to fetch when `showBenchmark` is true (and refetch when account/range changes)
  4. **Add `mergeBenchmarkSeries()` utility** (staff finding #6):
     - **File:** `frontend/src/components/chartUtils.jsx`
     - **Function:**
       ```js
       /**
        * Merge benchmark return data into a portfolio series by date.
        * @param {Array} portfolio - [{date, return_pct, ...}]
        * @param {Array} benchmark - [{date, return_pct}] (from API)
        * @returns {Array} - [{date, return_pct, benchmark_return_pct}, ...]
        */
       export function mergeBenchmarkSeries(portfolio, benchmark) {
         if (!benchmark) return portfolio
         const benchmarkMap = new Map(benchmark.map(b => [b.date, b.return_pct]))
         return portfolio.map(p => ({
           ...p,
           benchmark_return_pct: benchmarkMap.get(p.date) ?? null,
         }))
       }
       ```
     - **Estimated lines:** ~10 lines in chartUtils.jsx
  5. Use `mergeBenchmarkSeries()` to combine data before passing to Recharts
  6. Add Recharts `<Line>` for S&P 500:
     ```jsx
     {showBenchmark && benchmarkData?.benchmark && (
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
  7. **Handle benchmark:null** (staff finding #8): when API returns `benchmark: null`, show inline message below toggle: "No benchmark data available. Run a sync to fetch S&P 500 data."
  8. Extend existing tooltip: add S&P 500 row + delta row when benchmark active
  9. Add "S&P 500" to legend when overlay active
- **Estimated lines:** ~50 lines of changes across the chart component

#### E3. BenchmarkSummaryCard component
- **File:** `frontend/src/components/BenchmarkSummaryCard.jsx` (new)
- **Props:** `summary: {portfolio_return, benchmark_return, outperformance, period_label}`, `lastUpdated: string`
- **Renders:**
  - Three inline cards: Your Return, S&P 500, vs Benchmark
  - Colors: portfolio uses `COLOR_POSITIVE`/`COLOR_NEGATIVE` based on sign, S&P uses `COLOR_AMBER`, delta uses positive/negative colors
  - Period label in header: "Benchmark Comparison ({period_label})"
  - "Last updated: {date}" in footer, secondary text
  - Returns null when summary is null/undefined
- **Estimated lines:** ~55 lines

- **File:** `frontend/src/components/BenchmarkSummaryCard.module.css` (new)
- **Responsive:** 3-column on desktop, stacked on mobile
- **Estimated lines:** ~45 lines

#### E4. Integrate into Investments page
- **File:** Phase 3's Investments page (placeholder: `InvestmentsPage.jsx`)
- **Change:** Render `<BenchmarkSummaryCard>` below the chart when `showBenchmark && benchmarkData?.summary`
- **Estimated lines:** ~8 lines

---

### Group F: Frontend — Target Allocation Panel (Stretch)
**Tag:** `depends-on: D` + Phase 3 prerequisite

#### F1. TargetAllocationPanel component
- **File:** `frontend/src/components/TargetAllocationPanel.jsx` (new)
- **Props:** None (fetches own data via `fetchTargetAllocation`, `fetchActualAllocation`)
- **States:**
  - **No target set:** "Set a target allocation to track your portfolio balance" + "Set Target" button
  - **Display mode:** Side-by-side horizontal bars (Target vs Actual) + drift warnings
  - **Edit mode:** Inline form with text inputs per asset class, validation with tolerance (staff finding #11), save/cancel
  - **No holdings:** "Sync your accounts to see actual allocation"
- **Drift threshold:** 5% — shows amber warning per drifted class
- **Estimated lines:** ~130 lines

- **File:** `frontend/src/components/TargetAllocationPanel.module.css` (new)
- **Estimated lines:** ~65 lines

#### F2. Integrate into Investments page
- **File:** Phase 3's Investments page (placeholder: `InvestmentsPage.jsx`)
- **Change:** Render `<TargetAllocationPanel>` below benchmark summary, in a collapsible section
- **Estimated lines:** ~10 lines

---

### Group G: Frontend — Tests
**Tag:** `depends-on: E, F`

#### G1. BenchmarkToggle tests
- **File:** `frontend/src/components/BenchmarkToggle.test.jsx` (new)
- **Tests:**
  1. Renders unchecked by default
  2. Fires onChange when clicked
  3. Renders disabled state with tooltip
  4. Reads initial state from localStorage
  5. Writes state to localStorage on change
- **Estimated lines:** ~45 lines

#### G2. BenchmarkSummaryCard tests
- **File:** `frontend/src/components/BenchmarkSummaryCard.test.jsx` (new)
- **Tests:**
  1. Renders all three sub-cards with correct values
  2. Positive outperformance shows green color
  3. Negative outperformance shows red color
  4. Returns null when summary is null
  5. Shows "Last updated" text
- **Estimated lines:** ~55 lines

#### G3. mergeBenchmarkSeries tests
- **File:** `frontend/src/components/chartUtils.test.jsx` (existing)
- **Tests:**
  1. Merges matching dates correctly
  2. Sets null for missing benchmark dates
  3. Returns portfolio unchanged when benchmark is null
- **Estimated lines:** ~25 lines

#### G4. TargetAllocationPanel tests (stretch)
- **File:** `frontend/src/components/TargetAllocationPanel.test.jsx` (new)
- **Tests:**
  1. Empty state: renders "Set Target" CTA
  2. Display mode: renders target vs actual bars
  3. Drift warning: shows warning when deviation > 5%
  4. Edit mode: form appears on Edit click
  5. Validation: rejects sum outside [99.9, 100.1]
  6. Save: calls saveTargetAllocation with correct data
  7. No holdings: shows sync message
- **Estimated lines:** ~90 lines

#### G5. Integration test (staff finding #9)
- **File:** Phase 3's Investments page test file (placeholder: `InvestmentsPage.test.jsx`)
- **Tests:**
  1. Toggle benchmark checkbox → fetchBenchmarkComparison is called
  2. With benchmark data loaded, S&P 500 line appears in chart (check for Line component with name="S&P 500")
  3. Summary card renders with correct values
  4. When benchmark API returns null, inline message shown instead of chart line
- **Estimated lines:** ~50 lines

#### G6. API function tests
- **File:** `frontend/src/api.test.js` (existing)
- **Tests:** `fetchBenchmarkComparison`, `fetchTargetAllocation`, `saveTargetAllocation`, `fetchActualAllocation` — standard fetch mock pattern
- **Estimated lines:** ~25 lines

---

## Parallelism Summary

```
                    ┌── Group A (Backend sync) ────────┐
                    │                                   │
Phase 3 complete →  ├── Group C (Backend tests) ───────┼──→ Group B (Backend API)
                    │                                   │           │
                    └── Group D (Frontend API) ────────┘           │
                                                                    ↓
                                                        Group E (Frontend overlay)
                                                                    │
                                                        Group F (Stretch: allocation)
                                                                    │
                                                        Group G (Frontend tests)
```

**Stream 1 (backend):** A → B (sequential, B needs A's sync helper)
**Stream 2 (backend tests):** C starts in parallel with A (uses mocked data)
**Stream 3 (frontend):** D starts in parallel with A+C, E starts after D (needs API functions)
**Stream 4 (stretch):** F starts after D, in parallel with E
**Stream 5 (tests):** G after E+F

---

## Estimated Scope (Revised)

| Group | New Files | Modified Files | Est. Lines | Stretch? |
|-------|-----------|---------------|------------|----------|
| A | 0 | 1 (app.py) | ~62 | No |
| B | 0 | 1 (app.py) | ~125 | B2, B3 are stretch |
| C | 1 (test_benchmark.py) | 0 | ~260 | C3 is stretch |
| D | 0 | 1 (api.js) | ~6 | No |
| E | 4 (Toggle, SummaryCard + CSS each) | 2 (chart component, chartUtils.jsx) | ~205 | No |
| F | 2 (AllocationPanel + CSS) | 1 (page) | ~205 | Yes |
| G | 3 (test files) | 2 (chartUtils.test, api.test) | ~290 | G4 is stretch |
| **Core total** | **5** | **7** | **~660** | |
| **With stretch** | **10** | **8** | **~1,150** | |

---

## Implementation Order

1. **Groups A + C + D** in parallel — backend sync helper, backend tests (mocked), frontend API layer
2. **Group B** — backend comparison endpoint (depends on A for sync data patterns)
3. **Group E** — frontend benchmark overlay + summary card (depends on D and Phase 3)
4. **Group G** (core tests: G1, G2, G3, G5, G6) — frontend tests
5. **Group F** (stretch) — target allocation panel
6. **Group G** (stretch: G4) — allocation panel tests
7. **Run `make test`** — all existing + new tests must pass
8. **Playwright QA** — visual verification of benchmark overlay on Investments page
