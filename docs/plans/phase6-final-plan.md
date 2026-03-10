# Phase 6: Benchmark Comparison — Final Plan (Delta Document)

**Date:** 2026-03-10
**Author:** Engineer Agent (Final Plan)
**Status:** Ready for implementation
**Read with:** `/home/user/stashtrend/docs/plans/phase6-impl-plan.md` (initial plan)

The implementer must read BOTH the initial plan AND this delta document. Sections not mentioned here are unchanged from the initial plan.

---

## Review Response Table

| # | Severity | Finding | Decision | Change |
|---|----------|---------|----------|--------|
| 1 | Critical | `_sync_benchmark_prices` called after `pipeline_conn` is already closed | Accepted | Move call inside `async def _sync()`, before `pipeline_conn.close()`. See Group B correction. |
| 2 | Critical | `sync_log` INSERT uses non-existent `status` column | Accepted | Use `storage.update_sync_log(conn, 'benchmark_prices', count)` to match actual schema and codebase pattern. See Group B correction. |
| 3 | Critical | Benchmark function passed `pipeline_conn` but should use dashboard connection | Accepted | Use `conn` (the `_run_sync_worker` dashboard-level connection) instead of `pipeline_conn`. Adjust signature and call site. See Group B correction. |
| 4 | High | `saveAllocationTargets` calls `fetchJSON` with POST options that `fetchJSON` ignores | Accepted | Change to `postJSON` (consistent with `saveCustomGroups`, `saveSettings`). See Group D correction. |
| 5 | High | Range-change useEffect has no fetch cancellation — stale responses may overwrite fresh data | Accepted | Add AbortController pattern. See Group G correction. |
| 6 | High | `showBenchmark` missing from range-change useEffect dependency array | Accepted | Add `showBenchmark` to the dependency array and add a guard to prevent double-fetch on initial toggle-on. See Group G correction. |
| 7 | High | `save_allocation_targets` opens two separate connections (clear-all path + main path) | Accepted | Refactor to a single `get_db()` connection with one `try/finally`. See Group C correction. |
| 8 | Medium | `datetime.utcfromtimestamp` is deprecated since Python 3.12 | Accepted | Use `datetime.fromtimestamp(ts, tz=timezone.utc)`. See Group B correction. |
| 9 | Medium | Yahoo Finance v8 endpoint may require crumb/cookie authentication | Accepted | Add pre-implementation verification note, surface HTTP status in logs, document graceful degradation. See Group B note. |
| 10 | Medium | `allocation_targets.target_pct` is INTEGER, preventing decimal targets like 33.3% | Accepted | Explicitly document as intentional design decision. No code change. See Group A note. |
| 11 | Medium | Forward-fill normalization has O(n*m) worst case | Accepted | Pre-build sorted array and iterate with a pointer for O(n+m). See Group F correction. |
| 12 | Medium | `handleClearTargets` has no try/catch — unhandled promise rejection on failure | Accepted | Wrap in try/catch, do not clear local state on failure. See Group G correction. |
| 13 | Medium | `setTimeout` in Clear Targets confirm not cleaned up on unmount | Accepted | Store timeout ID in a ref, clear in `useEffect` cleanup and in the "Yes" handler. See Group G correction. |
| 14 | Medium | Fetch logic duplicated between `handleToggleBenchmark` and range-change useEffect | Accepted | Extract shared `fetchBenchmark(rangeLabel, signal?)` helper called from both sites. See Group G correction. |
| 15 | Low | GET `/api/investments/benchmark` does not validate `start`/`end` date format | Accepted | Add regex validation for YYYY-MM-DD, return 400 on mismatch. See Group C correction. |
| 16 | Low | Date arithmetic uses 30-day months, causing range misalignment | Accepted | Use `setMonth`/`getMonth` arithmetic or reuse `COMMON_RANGES` from `chartUtils`. See Group G correction. |
| 17 | Low | `VALID_ASSET_CLASSES` set defined inside the POST handler function | Accepted | Move to module-level constant. See Group C correction. |
| 18 | Low | `CANONICAL_CLASSES` color values duplicated across modal, comparison table, AllocationChart | Accepted | Create `frontend/src/constants/assetClasses.js` shared file. See new Group I. |
| P1 | Parallelism | Group F incorrectly tagged as `depends-on: Group D` — it only receives props from parent | Accepted | Retag Group F as `independent`. |
| P2 | Parallelism | Group H can be written in parallel with Group G since class names are specified in G's JSX | Accepted | Retag Group H as `independent` with reconciliation note. |
| M1 | Missing | No test for duplicate `asset_class` entries in POST payload | Accepted | Add test + backend validation. See Group C correction and Test Strategy additions. |
| M2 | Missing | No test for non-integer `target_pct` (e.g., `33.0` float in JSON) | Accepted | Add test. See Test Strategy additions. |
| M3 | Missing | `encodeURIComponent` missing for `start` and `end` in `fetchBenchmarkPrices` | Accepted | Encode all three query parameters for consistency. See Group D correction. |

---

## Corrected Sections

### Group A — Backend: Database Schema

No change to the DDL SQL itself.

**Design decision note (finding 10):** The `allocation_targets.target_pct` column is deliberately typed `INTEGER`. This means targets like 33.3% are not supported — a three-way split must be expressed as 33/33/34. This is an intentional simplification for Phase 6. Changing to `REAL` in a future phase requires updating the column type, the CHECK constraint, and the frontend `step` attribute on inputs. Document this in a code comment adjacent to the DDL.

---

### Group B — Backend: Benchmark Fetch + Sync Functions

Replace the entire Group B description from the initial plan with the following:

```
File: /home/user/stashtrend/backend/app.py
Lines: New functions — insert before _run_sync_worker definition
Parallelism: depends-on: Group A
Description: Implement the Yahoo Finance fetch helper and the sync orchestrator.
Details:
  - Required import additions at top of app.py (add if not already present):
      from datetime import timezone
      import urllib.request, urllib.error, json, calendar, time
      (datetime and timedelta are likely already imported — confirm before adding)

  - Add _fetch_benchmark_prices(start_date, end_date, ticker='SPY') function:
      - Converts start_date and end_date (YYYY-MM-DD strings) to Unix timestamps via
        calendar.timegm(time.strptime(date_str, '%Y-%m-%d'))
      - Constructs URL:
        https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&period1={unix_start}&period2={unix_end}
      - Opens request with urllib.request.urlopen(req, timeout=20) where req has
        User-Agent set to 'Mozilla/5.0 (compatible; stashtrend/1.0)'
      - Reads and JSON-parses the response body
      - On urllib.error.HTTPError: log app.logger.warning("Benchmark fetch HTTP error: %s %s",
        e.code, e.reason) BEFORE re-raising so the HTTP status is visible in logs.
      - Navigates to result['chart']['result'][0] and extracts:
          timestamps: result_obj['timestamp']  (list of Unix timestamps)
          adjclose:   result_obj['indicators']['adjclose'][0]['adjclose']
      - Zips timestamps and adjclose, converts each timestamp to YYYY-MM-DD via:
          datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')
        (NOT datetime.utcfromtimestamp which is deprecated in Python 3.12+)
      - Returns list of (ticker, date, close) tuples, filtering out any rows where close is None
      - Raises on HTTP errors (urllib.error.HTTPError, urllib.error.URLError)

  - Add _sync_benchmark_prices(conn) function:
      NOTE: `conn` here is the dashboard-level connection from _run_sync_worker (the variable
      named `conn` at line 397, created by get_db()), NOT pipeline_conn. Both point to the same
      DB_PATH file, but using the dashboard connection keeps pipeline and dashboard concerns separate.
      - Queries SELECT MAX(date) FROM benchmark_prices WHERE ticker='SPY' to find last_date
      - If last_date is None: fetches 7 years of history
          start_date = (datetime.now(tz=timezone.utc) - timedelta(days=365*7)).strftime('%Y-%m-%d')
      - If last_date is not None: fetches from last_date + 1 day to today
          start_date = (datetime.strptime(last_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
      - end_date = datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')
      - If start_date > end_date: returns early (already up to date)
      - Calls rows = _fetch_benchmark_prices(start_date, end_date)
      - Upserts results: conn.executemany(
            "INSERT OR REPLACE INTO benchmark_prices (ticker, date, close) VALUES (?,?,?)", rows)
        conn.commit()
      - Updates sync_log using the storage module helper to stay consistent with all other sync
        operations:
            storage.update_sync_log(conn, 'benchmark_prices', len(rows))
        (This writes entity, last_synced_at, last_sync_count, total_records matching the actual
        sync_log schema in pipeline/monarch_pipeline/schema.py lines 91-96.)
      - All exceptions caught with app.logger.warning("Benchmark price sync failed", exc_info=True)
        — does NOT re-raise

  PRE-IMPLEMENTATION NOTE (finding 9): Before writing any code, make a manual test request to
  https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&period1=1700000000&period2=1700086400
  with a User-Agent header to verify the endpoint responds without authentication. If it returns
  401/403, the integration must use the `yfinance` package or a crumb-fetch flow before proceeding.
  Document the result in a comment in the function. The feature degrades gracefully (sync failure
  is logged, benchmark data stays empty, toggle remains disabled) — this is already handled by the
  catch-all in _sync_benchmark_prices.
```

```
File: /home/user/stashtrend/backend/app.py
Lines: Inside async def _sync() in _run_sync_worker — after the entity for-loop, before pipeline_conn.close()
Parallelism: depends-on: Group B _sync_benchmark_prices function definition
Description: Call benchmark sync at the correct location inside the async function using the
             dashboard connection, isolated from entity loop failures.
Details:
  - The existing _run_sync_worker function contains:
      async def _sync():
          ...
          for entity in ordered_entities(entities):
              ...          ← entity loop body
          pipeline_conn.close()   ← approximately line 521

  - Insert the benchmark sync call AFTER the for-loop body ends and BEFORE pipeline_conn.close():
      # Benchmark sync uses the dashboard connection (conn), not pipeline_conn, to avoid
      # mixing pipeline and dashboard concerns through a single connection handle.
      try:
          _sync_benchmark_prices(conn)
      except Exception:
          app.logger.warning("Benchmark price sync failed (outer guard)", exc_info=True)
      pipeline_conn.close()   ← this line stays; the call above goes before it

  - `conn` here is the _run_sync_worker level dashboard connection (get_db() at line 397),
    which is in scope inside the nested async def _sync() closure.
  - A benchmark failure CANNOT affect the reported sync outcome for Monarch entities because
    the any_failed / status reporting logic runs AFTER asyncio.run(_sync()) returns, in the
    outer scope — the benchmark sync result is not reflected in any_failed.
```

---

### Group C — Backend: API Endpoints

Replace the entire Group C description with the following:

```
File: /home/user/stashtrend/backend/app.py
Lines: New route functions — insert near other /api/investments/* routes (added by Phase 3)
Parallelism: depends-on: Group A (tables must exist); can be written in parallel with Group B
Description: Implement three new API endpoints with corrected connection management,
             date validation, duplicate-class validation, and module-level constant.

Details:

  - Module-level constant (add near other module-level constants at top of app.py):
      VALID_ASSET_CLASSES = {"Stock", "ETF", "Mutual Fund", "Bond", "Cash", "Other"}
      # Must stay in sync with CANONICAL_CLASSES in frontend/src/constants/assetClasses.js

  - GET /api/investments/benchmark:
      @app.route("/api/investments/benchmark")
      def get_benchmark():
          import re
          DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
          ticker = request.args.get('ticker', 'SPY')
          start  = request.args.get('start')
          end    = request.args.get('end')
          if not start or not end:
              return jsonify({"error": "start and end query params are required"}), 400
          if not DATE_RE.match(start) or not DATE_RE.match(end):
              return jsonify({"error": "start and end must be YYYY-MM-DD format"}), 400
          conn = get_db()
          try:
              rows = conn.execute(
                  "SELECT date, close FROM benchmark_prices "
                  "WHERE ticker=? AND date>=? AND date<=? ORDER BY date",
                  (ticker, start, end)
              ).fetchall()
              last_updated_row = conn.execute(
                  "SELECT last_synced_at FROM sync_log WHERE entity='benchmark_prices'"
              ).fetchone()
              last_updated = last_updated_row[0] if last_updated_row else None
              return jsonify({
                  "ticker": ticker,
                  "prices": [{"date": r[0], "close": r[1]} for r in rows],
                  "last_updated": last_updated
              })
          finally:
              conn.close()

  NOTE: move `import re` to the top-level import block if not already present.

  - GET /api/investments/allocation-targets:
      Unchanged from initial plan (no corrections needed).

  - POST /api/investments/allocation-targets:
      @app.route("/api/investments/allocation-targets", methods=["POST"])
      def save_allocation_targets():
          # Uses module-level VALID_ASSET_CLASSES constant
          data    = request.get_json(silent=True) or {}
          targets = data.get("targets", [])
          # Validation (runs before opening any DB connection)
          seen_classes = set()
          for t in targets:
              ac = t.get("asset_class")
              if ac not in VALID_ASSET_CLASSES:
                  return jsonify({"error": f"Invalid asset_class: {ac}"}), 400
              if ac in seen_classes:
                  return jsonify({"error": f"Duplicate asset_class: {ac}"}), 400
              seen_classes.add(ac)
              pct = t.get("target_pct")
              # Accept int only; reject float (33.0 from JSON is float in Python)
              if not isinstance(pct, int) or isinstance(pct, bool) or pct < 0 or pct > 100:
                  return jsonify({"error": "target_pct must be an integer 0-100"}), 400
          if len(targets) > 0:
              total = sum(t["target_pct"] for t in targets)
              if total != 100:
                  return jsonify({"error": f"Targets must sum to 100 (currently {total})"}), 400
          # Single connection for the entire function (clear-all and save paths unified)
          conn = get_db()
          try:
              conn.execute("DELETE FROM allocation_targets")
              if len(targets) > 0:
                  conn.executemany(
                      "INSERT INTO allocation_targets (asset_class, target_pct) VALUES (?,?)",
                      [(t["asset_class"], t["target_pct"]) for t in targets]
                  )
              conn.commit()
              return jsonify({"ok": True})
          finally:
              conn.close()

  Key changes from initial plan:
    - Duplicate asset_class check added (finding M1): reject before DB write
    - isinstance(pct, bool) guard added: Python bool is a subclass of int; True/False would
      otherwise pass isinstance(pct, int)
    - Single get_db() / try/finally block covers both clear-all and save paths (finding 7)
    - VALID_ASSET_CLASSES moved to module level (finding 17)
    - Date format validation added to GET endpoint (finding 15)
```

---

### Group D — Frontend: API Functions

Replace the Group D description with the following:

```
File: /home/user/stashtrend/frontend/src/api.js
Lines: Append to end of file (new named exports)
Parallelism: independent
Description: Add three named export functions. saveAllocationTargets uses postJSON, not fetchJSON,
             because fetchJSON does not forward options to fetch(). All query params are encoded.
Details:
  - fetchBenchmarkPrices(start, end, ticker = 'SPY'):
      export const fetchBenchmarkPrices = (start, end, ticker = 'SPY') =>
        fetchJSON(
          `/api/investments/benchmark?ticker=${encodeURIComponent(ticker)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
        )
      Returns: { ticker, prices: [{date, close}], last_updated }
      Note: start and end are YYYY-MM-DD strings that contain no characters requiring encoding,
      but all three params are encoded for consistency.

  - fetchAllocationTargets():
      export const fetchAllocationTargets = () =>
        fetchJSON('/api/investments/allocation-targets')
      Returns: { targets: [{asset_class, target_pct}] }

  - saveAllocationTargets(targets):
      export const saveAllocationTargets = (targets) =>
        postJSON('/api/investments/allocation-targets', { targets })
      targets is an array of {asset_class, target_pct}; pass [] to clear all targets.
      Returns: { ok: true } on success; throws on HTTP error.
      Note: uses postJSON (not fetchJSON) — consistent with saveCustomGroups, saveSettings.
      postJSON handles Content-Type header and JSON serialization internally.
```

---

### Group E — Frontend: AllocationTargetsModal component

**CANONICAL_CLASSES source changed (finding 18):** Remove the `CANONICAL_CLASSES` constant from `AllocationTargetsModal.jsx`. Import it from the new shared file instead:

```js
import { CANONICAL_CLASSES } from '../constants/assetClasses.js'
```

All other Group E details are unchanged from the initial plan.

---

### New Group I — Frontend: Shared Asset Class Constants

```
File: /home/user/stashtrend/frontend/src/constants/assetClasses.js
Lines: new file
Parallelism: independent (no dependencies)
Description: Single source of truth for canonical asset class names and their chart colors.
             Eliminates color duplication across AllocationTargetsModal, the allocation comparison
             table in InvestmentsPage, and AllocationChart.
Details:
  - Export CANONICAL_CLASSES array:
      export const CANONICAL_CLASSES = [
        { name: 'Stock',       color: '#4D9FFF' },
        { name: 'ETF',         color: '#2ECC8A' },
        { name: 'Mutual Fund', color: '#9B7FE8' },
        { name: 'Bond',        color: '#F5A623' },
        { name: 'Cash',        color: '#5EDDA8' },
        { name: 'Other',       color: '#4A6080' },
      ]

  - Export ALLOCATION_COLORS as a derived Map for O(1) lookup:
      export const ALLOCATION_COLORS = Object.fromEntries(
        CANONICAL_CLASSES.map(c => [c.name, c.color])
      )

  - Export ASSET_CLASS_NAMES for validation use:
      export const ASSET_CLASS_NAMES = CANONICAL_CLASSES.map(c => c.name)

  - All three of AllocationTargetsModal.jsx, InvestmentsPage.jsx (allocation table),
    and AllocationChart.jsx (Phase 3) must be updated to import from this file instead
    of defining their own color constants.

  - Confirm Phase 3 AllocationChart color values match before importing. If they differ,
    the Phase 3 values are canonical (they are already rendered to users); update
    CANONICAL_CLASSES to match Phase 3's actual hex values.
```

---

### Group F — Frontend: InvestmentPerformanceChart modifications

**Parallelism retag (reviewer finding P1):** Group F does not call any API functions directly — it receives data via props from InvestmentsPage. Tag is corrected to `independent`.

**Normalization O(n*m) fix (finding 11):** Replace the forward-fill walk described in the initial plan with the following single-pass algorithm in the useMemo:

```
Corrected normalization algorithm:
  1. Build benchmarkArr: sorted array of {date, close} from benchmarkPrices,
     sorted ascending by date string (ISO format sorts lexicographically correctly).
  2. Forward-fill into a Map in a single pass:
       const filledMap = new Map()
       let bIdx = 0
       let lastClose = null
       for each portfolioPoint in portfolioData (sorted ascending by date):
           // Advance bIdx while benchmarkArr[bIdx].date <= portfolioPoint.date
           while (bIdx < benchmarkArr.length && benchmarkArr[bIdx].date <= portfolioPoint.date):
               lastClose = benchmarkArr[bIdx].close
               bIdx++
           filledMap.set(portfolioPoint.date, lastClose)
           // lastClose is null if no benchmark price exists on or before this date
  3. Compute bases from first portfolio point:
       portfolioBase = portfolioData[0].value  (use the correct field name from Phase 3)
       benchmarkBase = filledMap.get(portfolioData[0].date)  // null if no benchmark data
  4. Map portfolioData to merged array:
       portfolio_return_pct = ((point.value / portfolioBase) - 1) * 100
       benchmark_return_pct = benchmarkBase != null && filledMap.get(point.date) != null
           ? ((filledMap.get(point.date) / benchmarkBase) - 1) * 100
           : null

Complexity: O(n + m) where n = portfolio points, m = benchmark prices. Single pass each.
```

**ALLOCATION_COLORS import:** Remove any local definition of `ALLOCATION_COLORS` / color constants in this file. Import `ALLOCATION_COLORS` from `'../constants/assetClasses.js'` if needed.

All other Group F details are unchanged from the initial plan.

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.module.css
Lines: Existing file — additions only
Parallelism: independent (retag from initial plan's "depends-on: Group F")
             CSS class names are defined in Group F's JSX — can be written in parallel.
             Reconcile class names after Group F implementation completes.
Description: Unchanged from initial plan.
```

---

### Group G — Frontend: InvestmentsPage modifications

Replace or supplement the following sections from the initial plan:

**New shared imports:**
```js
import { CANONICAL_CLASSES, ALLOCATION_COLORS } from '../constants/assetClasses.js'
```
Remove any local color constant definitions from this file.

**Shared fetchBenchmark helper (finding 14):** Extract fetch logic from both `handleToggleBenchmark` and the range-change useEffect into a single shared function. This eliminates the duplication:

```js
// Shared fetch helper — called from toggle handler and range-change effect
// signal: optional AbortSignal for cancellation
const fetchBenchmark = useCallback(async (rangeLabel, signal) => {
  setBenchmarkLoading(true)
  const end = new Date().toISOString().slice(0, 10)
  const startDate = getRangeStart(rangeLabel)  // see date arithmetic fix below
  try {
    const data = await fetchBenchmarkPrices(startDate, end, 'SPY', signal)
    setBenchmarkData(data)
  } catch (err) {
    if (err.name === 'AbortError') return  // stale fetch — discard silently
    setBenchmarkData({ ticker: 'SPY', prices: [], last_updated: null })
  } finally {
    setBenchmarkLoading(false)
  }
}, [])
// Note: fetchBenchmarkPrices must forward the signal to fetch() — update api.js fetchBenchmarkPrices
// to accept an optional fourth argument `signal` and pass it as a fetch option.
```

**Updated fetchBenchmarkPrices to accept signal:**
```js
// In api.js — update the existing fetchBenchmarkPrices export:
export const fetchBenchmarkPrices = (start, end, ticker = 'SPY', signal = undefined) =>
  fetchJSON(
    `/api/investments/benchmark?ticker=${encodeURIComponent(ticker)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    signal ? { signal } : undefined
  )
// Note: fetchJSON must accept an optional options argument and pass it to fetch().
// If fetchJSON does not support this, either extend it or inline the fetch call here.
// Check the existing fetchJSON signature before deciding.
```

**Updated handleToggleBenchmark:**
```js
const handleToggleBenchmark = useCallback(async () => {
  const next = !showBenchmark
  setShowBenchmark(next)
  if (next && !benchmarkData) {
    fetchBenchmark(selectedRange)  // no signal needed — toggle is user-initiated, not auto-re-fired
  }
}, [showBenchmark, benchmarkData, selectedRange, fetchBenchmark])
```

**Corrected range-change useEffect with AbortController (findings 5, 6, 14):**
```js
// Correct dependency array includes both selectedRange AND showBenchmark.
// AbortController cancels in-flight fetches when range changes again before prior fetch resolves.
const abortRef = useRef(null)

useEffect(() => {
  if (!showBenchmark) return
  // Cancel any in-flight fetch from a previous range change
  if (abortRef.current) abortRef.current.abort()
  const controller = new AbortController()
  abortRef.current = controller
  fetchBenchmark(selectedRange, controller.signal)
  return () => {
    controller.abort()
  }
}, [selectedRange, showBenchmark, fetchBenchmark])
// Guard: showBenchmark in deps ensures the effect fires when benchmark is turned on
// (range may have changed while it was off). The early return when !showBenchmark prevents
// fetches while benchmark is toggled off.
// Double-fetch prevention: handleToggleBenchmark checks !benchmarkData before calling
// fetchBenchmark, so the initial toggle-on fetch goes through handleToggleBenchmark only.
// The range-change effect only fires for subsequent range changes while benchmark is active.
// When showBenchmark transitions from false→true AND selectedRange hasn't changed, the effect
// fires but benchmarkData is already set by handleToggleBenchmark (which fetched first).
// Add a guard: if showBenchmark just turned on AND benchmarkData is already present, skip.
// Implement: add a ref `benchmarkJustToggledOn` set to true in handleToggleBenchmark when next=true,
// read and reset in the useEffect. Alternatively, restructure so handleToggleBenchmark always
// triggers via the effect by setting a "benchmark requested" state boolean rather than calling
// fetchBenchmark directly — implementer may choose either approach.
```

**Date arithmetic fix (finding 16):** Replace `months * 30 * 24 * 60 * 60 * 1000` arithmetic with accurate month subtraction. Add a `getRangeStart(rangeLabel)` helper function:

```js
// Returns the start date string (YYYY-MM-DD) for a given range label.
// Uses setMonth for accurate calendar-month arithmetic; avoids the 30-day approximation.
function getRangeStart(rangeLabel) {
  const now = new Date()
  if (rangeLabel === 'All' || rangeLabel == null) {
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 7)
    return d.toISOString().slice(0, 10)
  }
  const months = getRangeMonths(rangeLabel)  // existing helper mapping label → month count
  if (!months) {
    // Fallback for unknown labels
    const d = new Date(now)
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  }
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}
// If COMMON_RANGES from chartUtils already provides start dates, use those directly
// to ensure benchmark range exactly matches the portfolio chart range.
```

**handleClearTargets with error handling (finding 12):**
```js
const handleClearTargets = useCallback(async () => {
  try {
    await saveAllocationTargets([])
    setAllocationTargets([])
    setClearConfirm(false)
  } catch {
    // Do not clear local state on failure — user sees targets remain, can retry
    setClearConfirm(false)
    // Optionally: surface an error toast or inline message here
  }
}, [])
```

**Clear confirm timeout cleanup (finding 13):**
```js
// Store timeout ID in a ref
const clearConfirmTimerRef = useRef(null)

// In the cleanup effect:
useEffect(() => {
  return () => {
    if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current)
  }
}, [])

// Where clearConfirm is set to true (Clear Targets button onClick):
onClick={() => {
  if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current)
  setClearConfirm(true)
  clearConfirmTimerRef.current = setTimeout(() => setClearConfirm(false), 4000)
}}

// In the "Yes" handler (handleClearTargets entry):
// Clear the timer at the top of handleClearTargets before the async operation:
if (clearConfirmTimerRef.current) {
  clearTimeout(clearConfirmTimerRef.current)
  clearConfirmTimerRef.current = null
}
```

**ALLOCATION_COLORS source:** Import from `'../constants/assetClasses.js'` — do not define locally. The `CANONICAL_CLASSES` import is also used if rendering the allocation table rows with color dots.

All other Group G details (state variables, handleSaveTargets, BenchmarkDeltaCard, stats grid, benchmarkDisabled logic, prop passing) are unchanged from the initial plan.

---

### Group H — Frontend: InvestmentsPage CSS additions

**Parallelism retag (reviewer finding P2):**

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.module.css
Parallelism: independent
             CSS class names are specified in Group G's JSX — can be written in parallel with Group G.
             Reconcile after Group G implementation to confirm no class names were renamed.
```

All other Group H details are unchanged from the initial plan.

---

## Updated Dependency Order

```
Phase 3 must be complete before any Phase 6 work begins.

Round 1 (all parallel):
  - Group A: backend/app.py — DDL additions
  - Group D: frontend/src/api.js — new API functions
  - Group E: AllocationTargetsModal.jsx + AllocationTargetsModal.module.css
  - Group I: frontend/src/constants/assetClasses.js (new — no dependencies)
  - Group F: InvestmentPerformanceChart.jsx + .module.css (retag to independent)
  - Group H: InvestmentsPage.module.css (retag to independent; reconcile with G after)

Round 2 (after Round 1):
  - Group B: backend/app.py — fetch/sync functions (needs Group A DDL)
  - Group C: backend/app.py — API endpoints (needs Group A DDL)
  - Group G: InvestmentsPage.jsx (needs Groups D, E, F, I)

Round 3 (after Round 2):
  - Integration verification: confirm Group H CSS classes match Group G JSX usage
  - Integration verification: confirm Group F chart prop names match Group G prop passing
```

---

## Additional Test Cases (from Missing Items section of review)

These supplement the test strategy in the initial plan without replacing it.

```
File: /home/user/stashtrend/backend/tests/test_phase6_benchmark.py
Additional test cases:

  - test_post_allocation_targets_rejects_duplicate_asset_class:
      POST with targets = [
        {asset_class: 'Stock', target_pct: 50},
        {asset_class: 'Stock', target_pct: 50}
      ].
      Assert 400 with error mentioning "Duplicate asset_class".

  - test_post_allocation_targets_rejects_float_pct:
      POST with targets = [{asset_class: 'Stock', target_pct: 33.0}, ...].
      Assert 400 with error mentioning "must be an integer".
      Note: 33.0 in JSON is parsed as float by Python even though it has no fractional part;
      the isinstance(pct, int) check (with bool exclusion) rejects it correctly.

  - test_get_benchmark_endpoint_rejects_invalid_date_format:
      GET /api/investments/benchmark?start=abc&end=2025-12-31.
      Assert 400 with error mentioning "YYYY-MM-DD".
      GET /api/investments/benchmark?start=2025-01-01&end=not-a-date.
      Assert 400.

  - test_sync_log_written_with_correct_schema:
      After calling _sync_benchmark_prices(conn) with mocked _fetch_benchmark_prices returning
      5 rows, query sync_log WHERE entity='benchmark_prices'. Assert row exists with
      last_sync_count=5 and total_records >= 5. Assert no 'status' column access (would raise).
```

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.benchmark.test.jsx
Additional test cases:

  - benchmark fetch is aborted when range changes before prior fetch resolves:
      showBenchmark=true. Mock fetchBenchmarkPrices to return a promise that never resolves.
      Change selectedRange. Assert abort() was called on the AbortController.
      Assert setBenchmarkData is not called with stale data.

  - handleClearTargets does not clear local state when API call fails:
      Mock saveAllocationTargets to reject. Click "Yes" on confirm.
      Assert allocationTargets state is unchanged (non-empty).
      Assert clearConfirm is reset to false.

  - clear confirm timeout is cleaned up on unmount:
      Click "Clear Targets" to start the 4s timer. Unmount component.
      Assert no setState calls after unmount (no React unmounted component warning).
```

---

## Rollback Notes

No change from initial plan.

---

## Summary of Breaking Changes to Initial Plan

None of the corrections change external API contracts or component interfaces. All changes are:
- Internal connection handling (backend)
- Using `postJSON` instead of `fetchJSON` for POST (fixes a silent bug — the POST would have been sent as GET)
- Shared constants file (additive new file, import changes in existing files)
- AbortController and date arithmetic (implementation detail)
- Single-pass normalization algorithm (same output, better performance)
