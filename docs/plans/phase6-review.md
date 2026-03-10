# Phase 6: Benchmark Comparison — Staff Review

**Date:** 2026-03-09
**Reviewer:** Staff Engineer Agent
**Status:** Changes required before final plan

---

## Findings

1. [Critical] backend/app.py — `_sync_benchmark_prices` placement uses already-closed connection

   The plan (Group B, second block) says to add the `_sync_benchmark_prices(pipeline_conn)` call "after the `for entity in ordered_entities(entities):` loop body completes" and "AFTER the existing any_failed / sync result reporting logic." However, `pipeline_conn` is closed at line 521 (immediately after the entity loop ends, inside the `async def _sync()` function), and the `any_failed` / status reporting logic runs at lines 530-537, OUTSIDE `asyncio.run(_sync())`. The plan's placement description is contradictory and will either (a) use a closed `pipeline_conn` or (b) try to call `_sync_benchmark_prices` outside the async function where `pipeline_conn` is not in scope.

   Required action: Place the `_sync_benchmark_prices(pipeline_conn)` call inside the `async def _sync()` function, BEFORE `pipeline_conn.close()` at line 521 but AFTER the entity `for` loop. The try/except guard goes around this call at that location. Update the plan text to explicitly reference this insertion point (after line 520, before line 521).

2. [Critical] backend/app.py — `_sync_benchmark_prices` writes to `sync_log` via raw SQL with wrong schema

   The plan has `_sync_benchmark_prices` executing: `INSERT OR REPLACE INTO sync_log (entity, last_synced_at, status) VALUES ('benchmark_prices', ?, 'success')`. However, the actual `sync_log` table schema (from `pipeline/monarch_pipeline/schema.py` lines 91-96) is:
   ```
   entity TEXT PRIMARY KEY, last_synced_at TEXT NOT NULL, last_sync_count INTEGER DEFAULT 0, total_records INTEGER DEFAULT 0
   ```
   There is no `status` column. The INSERT will fail with a column mismatch.

   Required action: Change the sync_log insert to match the actual schema: `INSERT OR REPLACE INTO sync_log (entity, last_synced_at, last_sync_count, total_records) VALUES ('benchmark_prices', ?, ?, ?)` where last_sync_count is the number of rows fetched and total_records is the total count in the benchmark_prices table. Alternatively, use `storage.update_sync_log(conn, 'benchmark_prices', count)` to stay consistent with all other sync operations.

3. [Critical] backend/app.py — `_sync_benchmark_prices` uses `pipeline_conn` to write to `benchmark_prices`, but `benchmark_prices` is defined in `DASHBOARD_DDL`

   The plan adds `benchmark_prices` to `DASHBOARD_DDL` (Group A), which is applied via `init_dashboard_schema()` using a `get_db()` connection. However, inside `_run_sync_worker`, the `pipeline_conn` is created via `pipeline_schema.init_db(DB_PATH)`, which only creates pipeline tables (accounts, account_history, etc.). The dashboard tables are created separately. While both connections point to the same DB file (`DB_PATH`), the `pipeline_conn` will see the dashboard tables only if `DASHBOARD_DDL` was already applied to the database (it is, at app startup). But the plan writes to `sync_log` (a pipeline table) as a side effect of writing to `benchmark_prices` (a dashboard table) via the same connection — this works but is architecturally confusing.

   More critically: the plan passes `pipeline_conn` to `_sync_benchmark_prices`, but the function needs to write to `benchmark_prices` (dashboard table) AND `sync_log` (pipeline table). Since both exist in the same SQLite file this technically works, but the plan should acknowledge this cross-schema access and use the `conn` variable (the `_run_sync_worker`'s own connection at line 397) instead, which is the dashboard connection and has the same DB_PATH. This avoids conflating pipeline and dashboard concerns through a single connection.

   Required action: Use `conn` (the `_run_sync_worker` level connection) rather than `pipeline_conn` for the benchmark sync call. This is the dashboard connection and is a cleaner separation. Adjust the function signature and call site accordingly.

4. [High] frontend/src/api.js — `fetchBenchmarkPrices` uses `fetchJSON` but passes POST-style options

   The plan defines `fetchBenchmarkPrices` as:
   ```js
   export const fetchBenchmarkPrices = (start, end, ticker = 'SPY') =>
     fetchJSON(`/api/investments/benchmark?ticker=${encodeURIComponent(ticker)}&start=${start}&end=${end}`)
   ```
   The `start` and `end` parameters are not URL-encoded. If they ever contain unexpected characters, the URL will be malformed. More importantly, `saveAllocationTargets` is defined as:
   ```js
   export const saveAllocationTargets = (targets) =>
     fetchJSON('/api/investments/allocation-targets', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ targets }),
     })
   ```
   But `fetchJSON` (line 3 of api.js) only accepts a single `url` argument: `export async function fetchJSON(url) { const res = await fetch(url) ... }`. It does not pass options to `fetch()`. The POST call will be sent as a GET and fail silently or return the wrong data.

   Required action: Use `postJSON` (or `mutateJSON`) for `saveAllocationTargets`, consistent with all other mutation calls in api.js (e.g., `saveCustomGroups`, `saveSettings`). The correct pattern is: `export const saveAllocationTargets = (targets) => postJSON('/api/investments/allocation-targets', { targets })`.

5. [High] frontend/src/pages/InvestmentsPage.jsx — Benchmark fetch race condition is documented but not implemented

   The plan acknowledges the race condition in the "Edge Cases to Cover" section (line 1049): "user clicks toggle rapidly — only one fetch should be in-flight; ignore stale responses." However, neither `handleToggleBenchmark` nor the `selectedRange` change useEffect implement any cancellation mechanism. The `handleToggleBenchmark` callback checks `!benchmarkData` before fetching, which means the second toggle-on will skip fetching (because benchmarkData was already set from the first toggle). But the range-change useEffect has no guard — rapid range changes will fire multiple concurrent fetches, and stale responses may overwrite fresh ones.

   Required action: Add an AbortController pattern to the range-change useEffect. Create a controller, pass `signal` to the fetch, and return a cleanup function that aborts. Alternatively, use a ref counter (fetchIdRef) to discard stale responses. The plan must specify the implementation, not just note the edge case.

6. [High] frontend/src/pages/InvestmentsPage.jsx — `selectedRange` useEffect missing `showBenchmark` in dependency array

   The range-change useEffect (lines 622-636) checks `if (!showBenchmark) return` at the top, but `showBenchmark` is not in the dependency array (`[selectedRange]`). This means: (1) the effect won't fire when the user turns benchmark on (so if the range was changed while benchmark was off, the data won't be fetched for the new range), and (2) the stale closure of `showBenchmark` may cause the early return to use an outdated value.

   Required action: Add `showBenchmark` to the dependency array: `[selectedRange, showBenchmark]`. Also add a guard to avoid double-fetching on initial toggle (since `handleToggleBenchmark` already fetches).

7. [High] backend/app.py — `save_allocation_targets` POST endpoint lacks atomicity on validation failure paths

   The POST endpoint opens a connection, and on certain validation failure paths (lines 173-177), returns a 400 response WITHOUT closing the connection. The `conn = get_db()` for the "clear all targets" path (line 165) has a try/finally, but the validation block (lines 172-180) runs BEFORE `conn = get_db()` at line 182. Wait — re-reading: the validation runs before the second `get_db()` call, so no connection leak there. However, the "clear all targets" path (lines 163-170) opens its own connection with try/finally. The main path (lines 182-192) also has try/finally. This is actually correct.

   But there is a different issue: the clear-all path and the save path each open their own `get_db()` connection. This means two connections are opened for what should be a single codepath. The pattern is inconsistent with the rest of the codebase.

   Required action: Restructure to open a single connection at the top of the function (before the empty-targets check), and use a single try/finally block for the entire function. This matches the existing pattern in other endpoints.

8. [Medium] backend/app.py — `_fetch_benchmark_prices` uses `datetime.utcfromtimestamp` which is deprecated

   `datetime.utcfromtimestamp(ts)` has been deprecated since Python 3.12 (and this project runs on a modern Python). The replacement is `datetime.fromtimestamp(ts, tz=timezone.utc)`.

   Required action: Use `datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')` instead.

9. [Medium] backend/app.py — Yahoo Finance API URL uses v8 endpoint which may be unreliable

   The plan uses `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}`. Yahoo Finance's unofficial API has historically changed URLs, added rate limits, and required cookies/crumb tokens. The v8 endpoint specifically has been known to require a `crumb` parameter and `cookie` header since mid-2023. A bare request with just a User-Agent header will likely receive a 401 or 403.

   Required action: (1) Add a note that this API integration should be tested against the live endpoint before implementation begins to verify it still works without authentication. (2) Add a fallback/retry mechanism or at minimum surface the HTTP status code in logs when the fetch fails. (3) Consider documenting that if Yahoo blocks requests, the benchmark feature degrades gracefully (which the plan does handle via the catch-all in `_sync_benchmark_prices`). (4) Consider adding a `Referer` and `Origin` header, or using the `yfinance` Python package as a more resilient alternative (though the plan explicitly chose no new packages).

10. [Medium] backend/app.py — `allocation_targets` table uses INTEGER for `target_pct`, preventing decimal allocations

    The CHECK constraint enforces `target_pct >= 0 AND target_pct <= 100` as INTEGER. The frontend modal also uses `step="1"` on inputs. This means users cannot set targets like 33.3% for a three-way split. Three equal allocations would need to be 33/33/34 to sum to 100.

    Required action: This is a design decision, not necessarily a bug. However, the plan should explicitly acknowledge this limitation and confirm it is intentional. If decimal targets are desired in the future, changing from INTEGER to REAL and updating the CHECK and frontend validation will be needed. Add a note to the plan stating this is a deliberate simplification.

11. [Medium] frontend/src/components/InvestmentPerformanceChart.jsx — Forward-fill normalization has O(n*m) worst case

    The normalization logic (lines 401-410) says "For each portfolio data point, find the benchmark close for that date by walking backward through dates until a benchmark entry is found." If the benchmark data is sparse or starts much later than the portfolio data, each portfolio point walks backward through the entire benchmark dataset. For 7 years of daily data (~1,800 portfolio points), this could be slow.

    Required action: Pre-build a sorted array of benchmark dates and use binary search (or simply iterate once with a pointer) to build a forward-filled lookup map. The normalization useMemo should create the forward-filled map in a single pass, then look up each portfolio date in O(1). Specify this optimization in the plan.

12. [Medium] frontend/src/pages/InvestmentsPage.jsx — `handleClearTargets` has no error handling

    The `handleClearTargets` callback (lines 734-738) calls `await saveAllocationTargets([])` but has no try/catch. If the API call fails, the error will be an unhandled promise rejection. The `handleSaveTargets` also has no error handling — it relies on the modal's own catch block, but `handleSaveTargets` is the `onSave` prop, so the modal does catch. However, `handleClearTargets` is called directly from a button click, not through the modal.

    Required action: Wrap `handleClearTargets` in a try/catch. On failure, either show an error message or at minimum do not clear the local state (`setAllocationTargets([])`).

13. [Medium] frontend/src/pages/InvestmentsPage.jsx — Clear confirmation auto-dismiss timeout not cleaned up

    Line 710: `setTimeout(() => setClearConfirm(false), 4000)` sets a timer but never stores the timeout ID. If the component unmounts while the timer is pending, it will call `setClearConfirm` on an unmounted component (React warning). Also, if the user clicks "Yes" to confirm, the timeout still fires and sets state unnecessarily.

    Required action: Store the timeout ID in a ref, clear it in a useEffect cleanup, and clear it in the "Yes" handler.

14. [Medium] frontend/src/pages/InvestmentsPage.jsx — `handleToggleBenchmark` has stale closure risk

    `handleToggleBenchmark` is wrapped in `useCallback` with dependencies `[showBenchmark, benchmarkData, selectedRange]`. This means the callback is recreated every time any of these values change. The `const next = !showBenchmark` pattern correctly captures the current value. However, the effect that re-fetches on range change (lines 622-636) duplicates the fetch logic from `handleToggleBenchmark`. This duplication means any fix to one must be applied to both.

    Required action: Extract the fetch logic into a shared `fetchBenchmark(rangeLabel)` function and call it from both `handleToggleBenchmark` and the range-change useEffect. This eliminates duplication and reduces the surface area for bugs.

15. [Low] backend/app.py — GET `/api/investments/benchmark` does not validate date format

    The `start` and `end` parameters are passed directly to the SQL query without format validation. While SQLite string comparison works for YYYY-MM-DD format and invalid formats will simply return no rows (not cause errors), malicious or malformed input could produce confusing results (e.g., `start=abc` would match no rows silently).

    Required action: Add a simple regex or try/parse validation for YYYY-MM-DD format on both parameters. Return 400 with a descriptive error if the format is wrong.

16. [Low] frontend/src/pages/InvestmentsPage.jsx — Date arithmetic uses 30-day months

    Lines 606-607 compute `months * 30 * 24 * 60 * 60 * 1000` for date range calculation. This means "1 year" is 360 days, not 365. For a "5 year" range, the error compounds to 25 days. The benchmark data fetched may be slightly shorter than the portfolio data range if the portfolio uses a different date calculation.

    Required action: Use `new Date()` and `setMonth(getMonth() - months)` for accurate month arithmetic, or use the same `COMMON_RANGES` logic from Phase 3's `chartUtils` to ensure the benchmark range matches the portfolio range exactly.

17. [Low] backend/app.py — `VALID_ASSET_CLASSES` is a set literal defined inside the function

    This set is recreated on every POST request. While trivial in cost, it would be cleaner as a module-level constant, especially since the same list appears in the frontend `CANONICAL_CLASSES`.

    Required action: Move `VALID_ASSET_CLASSES` to module level alongside other constants. Add a comment noting it must stay in sync with the frontend `CANONICAL_CLASSES` in `AllocationTargetsModal.jsx`.

18. [Low] frontend/src/components/AllocationTargetsModal.jsx — `CANONICAL_CLASSES` color values are duplicated

    The plan notes (line 776) that `ALLOCATION_COLORS` in the comparison table "must match the AllocationChart donut palette" but says to "define once in a shared location or duplicate." Duplication across three locations (modal, comparison table, and AllocationChart) is a maintenance risk.

    Required action: Define the canonical asset class list with colors in a single shared file (e.g., `frontend/src/constants/assetClasses.js`) and import from all three locations. Add this file to the plan.

---

## Parallelism Assessment

The dependency ordering is mostly correct. Two observations:

- Group F is tagged `depends-on: Group D (api.js functions)`. However, `InvestmentPerformanceChart.jsx` does not call any API functions directly — it receives data via props from `InvestmentsPage`. Group F only depends on Phase 3's chart component existing. It could be moved to Round 1 as independent.

- Group H (CSS) is tagged `depends-on: Group G`. CSS classes can be written in parallel with Group G since the class names are specified in Group G's JSX. The plan even acknowledges this ("can be drafted before G is finalized but must be reconciled after"). Tag it as `independent` with a reconciliation note.

---

## Missing Items

- **No test for duplicate asset classes in POST payload.** The POST endpoint does not check for duplicate `asset_class` entries in the targets array. A payload like `[{asset_class: 'Stock', target_pct: 50}, {asset_class: 'Stock', target_pct: 50}]` would sum to 100 and pass validation, but the `INSERT` would fail on the PRIMARY KEY constraint (or the second row would overwrite the first with `INSERT OR REPLACE`, resulting in only 50% total). Add validation to reject duplicate asset classes, and add a test for it.

- **No test for non-integer `target_pct` in POST payload.** The validation checks `isinstance(pct, int)`, which would reject float values like 33.3. But JSON numbers are parsed as int or float by Python depending on whether they have a decimal point. `33.0` in JSON becomes `33.0` (float) in Python, which would be rejected. This is technically correct but may surprise API consumers. Add a test case.

- **No test for concurrent sync runs.** If two sync workers run simultaneously (unlikely but possible if the scheduler fires while a manual sync is in progress), both could try to write to `benchmark_prices`. The `INSERT OR REPLACE` makes this safe, but it is worth a note.

- **Missing `encodeURIComponent` for `start` and `end` in `fetchBenchmarkPrices`.** While dates in YYYY-MM-DD format contain no characters that need encoding, this is inconsistent with the `ticker` parameter which is encoded.

---

## Checklist

- [x] Plan covers all files that need changes
- [x] Dependency ordering is mostly correct (see parallelism notes above)
- [x] Test strategy covers happy paths
- [x] Test strategy covers error cases
- [ ] Edge cases fully addressed (race condition implementation missing — finding 5)
- [ ] API contracts match existing patterns (fetchJSON misuse — finding 4)
- [ ] Database schema matches existing tables (sync_log column mismatch — finding 2)
- [x] Rollback strategy is documented
- [x] No breaking changes to existing functionality
- [ ] All cross-file dependencies identified (CANONICAL_CLASSES duplication — finding 18)

---

## Summary

Three critical findings must be fixed before the plan can proceed to final plan stage:

1. The `_sync_benchmark_prices` placement will use a closed connection or an out-of-scope variable (finding 1)
2. The `sync_log` INSERT uses columns that do not exist in the actual table schema (finding 2)
3. The `saveAllocationTargets` API function calls `fetchJSON` with options it does not support — the POST will be sent as a GET (finding 4, marked High but arguably Critical since the save feature will not work at all)

Five high-severity findings require design corrections in the plan. The remaining findings are medium/low improvements.
