# Phase 6: Benchmark Comparison -- Architecture Decision Document

**Date:** 2026-03-09
**Author:** Architect Agent
**Status:** Ready for engineering plan
**Size:** S
**Inputs:** phase6-requirements.md, phase6-research.md, codebase inspection
**Depends on:** Phase 3 (Investments page -- not yet implemented)

---

## Decision Summary

Phase 6 adds two features to the existing Investments page (built in Phase 3): (1) an S&P 500 benchmark overlay on the performance chart using percentage-return normalization, and (2) a target vs actual asset allocation comparison. Benchmark data is fetched via direct HTTP calls to Yahoo Finance's chart API for the SPY ETF ticker, stored in a new `benchmark_prices` table in SQLite, and refreshed incrementally as a post-entity step in the sync worker. No new Python packages are added. The frontend adds a benchmark toggle to `InvestmentPerformanceChart`, a return delta summary card, a data freshness indicator, and an allocation targets form with drift visualization. Allocation targets are persisted in a new `allocation_targets` table with two new API endpoints. All new frontend components integrate into the existing Phase 3 component hierarchy using the established patterns (props from page component, Recharts charting, CSS modules).

---

## Decision 1: Benchmark Data Source

### Decision

Use **direct HTTP calls to Yahoo Finance's unofficial chart API** for the `SPY` ETF ticker. No Python packages (`yfinance`, `fredapi`, `pandas`, `numpy`) are added. The fetch function uses Python's standard library `urllib.request` to call:

```
https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&period1={unix_start}&period2={unix_end}
```

The response is parsed as JSON. The `adjclose` (dividend-adjusted close) values are extracted and stored in `benchmark_prices`. A User-Agent header is set to avoid bot-blocking.

### Rationale

The deciding factors are Docker image size, dependency count, and reliability trade-offs:

1. **Docker image size.** The current `requirements.txt` has 7 lightweight packages (flask, flask-cors, apscheduler, pytest, anthropic, openai, plus the local pipeline package). Adding `yfinance` pulls in `pandas` and `numpy`, adding 150-300MB to the Docker image. This is a disproportionate cost for fetching ~1,260 rows of daily price data. Direct HTTP calls add zero bytes.

2. **Dependency stability.** `yfinance` is an unofficial wrapper around the same Yahoo Finance API we would call directly. It adds an abstraction layer that can break independently of the underlying API (as documented in yfinance GitHub issue #2340). By calling the API directly, we eliminate the middleman and gain full control over request format, retry logic, and response parsing.

3. **SPY vs ^GSPC.** The SPY ETF tracks the S&P 500 with negligible tracking error. It uses dividend-adjusted prices (`adjclose`), which is actually preferable for benchmarking because it reflects total return (dividends reinvested). The `^GSPC` index ticker has known access restrictions on Yahoo Finance as of 2025-2026, making SPY the more reliable target regardless of fetch method.

4. **No API key.** Yahoo Finance's chart API does not require authentication. This avoids setup friction (no registration, no settings UI for API key storage).

### Rejected Alternatives

**Option A: yfinance Python package.**
Rejected because it adds `pandas` and `numpy` as transitive dependencies, inflating the Docker image by 150-300MB. The `yfinance` package is also an unstable abstraction: it wraps the same Yahoo Finance HTTP endpoint we call directly, but adds a dependency that can break independently (e.g., when Yahoo changes cookie/crumb requirements, yfinance may lag in updating). The incremental convenience of `yf.Ticker("SPY").history(...)` does not justify the image bloat or the additional failure mode.

**Option B: FRED API (Federal Reserve Economic Data).**
Rejected for two reasons: (1) FRED requires a free API key, adding setup friction (registration, settings UI to store the key, user documentation). The project philosophy is zero-configuration data sources where possible. (2) FRED's S&P 500 series (`SP500`) only covers the last 10 years due to licensing constraints with S&P Dow Jones Indices. Users with accounts older than 10 years would see truncated benchmark data. SPY data goes back to 1993 (ETF inception).

**Option C: Hybrid with FRED fallback.**
Rejected because it doubles the code paths for data ingestion (two fetch implementations, two response parsers, fallback logic, two sets of tests) for marginal reliability gain. The requirements classify this feature as "Nice-to-have" and specify graceful degradation when data is unavailable. If Yahoo Finance becomes permanently unreliable, switching to FRED is a small, self-contained change that does not require architectural preparation now.

### Risks

- **Yahoo Finance API instability.** The endpoint is undocumented and can change without notice. Mitigation: all fetch logic is isolated in a single function (`_fetch_benchmark_prices`). If the endpoint format changes, the fix is localized. The function wraps all calls in try/except and falls back to cached data silently.
- **Rate limiting / IP blocking.** Yahoo may throttle or block requests. Mitigation: the fetch runs at most once per sync cycle (not per page load), and requests include a browser-like User-Agent header. For a single-user self-hosted app making one request per sync, this is well within reasonable usage.
- **Adjusted close accuracy.** Yahoo's `adjclose` is retroactively adjusted for splits and dividends. Historical values may change slightly over time. For personal finance benchmarking purposes, this imprecision is negligible.

---

## Decision 2: Benchmark Data Storage

### Decision

Add a `benchmark_prices` table to `DASHBOARD_DDL` in `backend/app.py`:

```sql
CREATE TABLE IF NOT EXISTS benchmark_prices (
    ticker  TEXT NOT NULL,
    date    TEXT NOT NULL,
    close   REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);
```

The table is keyed by `(ticker, date)` so additional benchmark indices can be added in the future without schema changes. For v1, only `SPY` rows are inserted.

### Rationale

Storing benchmark data locally in SQLite serves two purposes: (1) zero external API calls on page load (AC-1.6), and (2) graceful degradation when Yahoo Finance is unavailable. The schema matches the PM's suggested design and is minimal -- three columns, composite primary key. No separate metadata table is needed; the `sync_log` table's existing `(entity, last_synced_at)` pattern tracks freshness using entity name `"benchmark_prices"`.

### Rejected Alternatives

**Option A: Reuse a `security_prices` table.**
The research report noted that `security_prices` was planned in Phase 0 but never built. Creating it now with a generic name suggests it serves a broader purpose (individual security price history), which is out of scope. A dedicated `benchmark_prices` table is narrower in scope and communicates its purpose clearly. If Phase 5 or a future phase needs per-security prices, it can create `security_prices` independently without conflicting.

**Option B: Store in a settings key as JSON.**
Rejected because ~1,260 rows of daily price data (5+ years) stored as a JSON blob in the `settings` table would be awkward to query by date range and would require deserializing the entire blob on every read. A proper table with date-indexed rows enables efficient range queries.

---

## Decision 3: Benchmark Sync Integration

### Decision

Add a standalone function `_sync_benchmark_prices(conn)` in `backend/app.py` that is called **after** the entity loop in `_run_sync_worker`, not as a new entity in `ordered_entities`. The function:

1. Reads the last date from `benchmark_prices` for ticker `SPY`.
2. If no rows exist, fetches 7 years of history (covers the 5Y requirement with margin).
3. If rows exist, fetches from `last_date + 1 day` to today (incremental append).
4. Parses the Yahoo Finance JSON response, extracts `(date, adjclose)` pairs.
5. Upserts into `benchmark_prices` using `INSERT OR REPLACE`.
6. Updates `sync_log` with entity `"benchmark_prices"` and current timestamp.
7. All exceptions are caught and logged. A benchmark fetch failure does not set `any_failed = True` on the sync job -- it is strictly non-blocking.

```python
# Called at the end of _run_sync_worker, after the entity loop:
try:
    _sync_benchmark_prices(pipeline_conn)
except Exception:
    app.logger.warning("Benchmark price sync failed", exc_info=True)
```

### Rationale

The research report's staff review finding #2 explicitly recommended against adding benchmark sync as an entity in `ordered_entities`. This is correct because:
1. Benchmark data has no dependency on Monarch authentication -- it comes from a public API. Mixing it into the Monarch entity loop (which requires `mm` client) conflates two unrelated data sources.
2. An entity-level failure would mark the sync job as "partial" or "failed," which is misleading when the Monarch sync itself succeeded. Benchmark data is auxiliary.
3. The sync worker's entity loop reports per-entity results to the frontend for live progress updates. Adding a non-Monarch entity would require UI changes to explain what "benchmark_prices" means in the sync progress display.

### Risks

- **Sync timing.** The benchmark fetch runs after all Monarch entities finish, adding a few hundred milliseconds to the sync job duration. For a background job that runs on a schedule, this is negligible.
- **No sync on first install.** Benchmark data only appears after the first sync completes. If a user visits the Investments page before any sync has run, the benchmark toggle is disabled. This matches the existing pattern where all data requires at least one sync.

---

## Decision 4: Backend API Endpoints

### Decision

Three API changes: one new benchmark endpoint, two new allocation target endpoints.

#### `GET /api/investments/benchmark`

Query params:
- `start` (required): ISO date string (YYYY-MM-DD)
- `end` (required): ISO date string (YYYY-MM-DD)
- `ticker` (optional): defaults to `SPY`

Response:
```json
{
  "ticker": "SPY",
  "prices": [
    { "date": "2025-03-10", "close": 520.45 },
    { "date": "2025-03-11", "close": 518.20 }
  ],
  "last_updated": "2026-03-09T14:30:00Z"
}
```

The endpoint reads from `benchmark_prices` (local SQLite). It returns raw prices; percentage-return normalization happens client-side. `last_updated` is read from `sync_log` for entity `"benchmark_prices"`.

#### `GET /api/investments/allocation-targets`

Response:
```json
{
  "targets": [
    { "asset_class": "Stock", "target_pct": 60 },
    { "asset_class": "Bond", "target_pct": 30 },
    { "asset_class": "Cash", "target_pct": 10 }
  ]
}
```

Returns an empty `targets` array if no targets are set.

#### `POST /api/investments/allocation-targets`

Request body:
```json
{
  "targets": [
    { "asset_class": "Stock", "target_pct": 60 },
    { "asset_class": "Bond", "target_pct": 30 },
    { "asset_class": "Cash", "target_pct": 10 }
  ]
}
```

Validation:
- `target_pct` values must be integers 0-100.
- Sum must equal 100.
- Asset class values must be from the normalized set defined in Phase 3 Decision 7: `Stock`, `ETF`, `Mutual Fund`, `Bond`, `Cash`, `Other`.
- An empty `targets` array clears all targets (DELETE all rows).

The endpoint deletes all existing rows and inserts the new set atomically within a single transaction.

### Rationale

**Benchmark endpoint returns raw prices, not computed returns.** Client-side normalization is the right choice because: (a) the normalization base date depends on the user's portfolio data start date (which varies per selected range and may differ between portfolio-level and account-level views), and (b) the same raw price data can serve both portfolio and account comparison without multiple API calls with different normalization parameters. The computation is trivial: `((price / base_price) - 1) * 100`.

**Allocation targets use DELETE + INSERT instead of upsert.** Because targets must always sum to 100% and represent a coherent set, partial updates are dangerous. Replacing the entire set atomically ensures consistency. The cost is negligible (at most 6 rows).

### Rejected Alternatives

**Option A: Server-side return normalization for benchmark data.**
Rejected because the normalization base date is context-dependent: it varies by selected time range and by whether the user is viewing portfolio-level or account-level data. The server would need to know the portfolio's start date for the selected range, requiring an additional parameter and coupling the benchmark endpoint to portfolio data. Client-side normalization keeps the benchmark endpoint simple and reusable.

**Option B: Merge benchmark data into the existing `/api/investments/performance` endpoint.**
Rejected because it couples benchmark data availability to the performance endpoint. If the benchmark fetch fails or data is stale, the performance endpoint should not be affected. Separate endpoints follow the failure isolation requirement (NFR). It also keeps Phase 6 changes decoupled from Phase 3 code -- the performance endpoint is Phase 3's responsibility.

**Option C: Per-account allocation targets.**
Rejected per the requirements (section 4: "Single set of targets for the entire portfolio, not per-account"). Per-account targets add schema complexity (foreign key to accounts, what happens when an account is removed?) with limited value for retirement-focused users who think about their portfolio holistically.

---

## Decision 5: Allocation Targets Storage

### Decision

Add an `allocation_targets` table to `DASHBOARD_DDL`:

```sql
CREATE TABLE IF NOT EXISTS allocation_targets (
    asset_class TEXT PRIMARY KEY,
    target_pct  INTEGER NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100)
);
```

### Rationale

This matches the PM's suggested schema exactly. The table is simple: one row per asset class with an integer percentage. The `CHECK` constraint provides database-level validation. No foreign keys are needed because asset class names are a fixed canonical set (Phase 3 Decision 7). No `updated_at` column is needed because the targets are user-set values without staleness concerns.

### Rejected Alternatives

**Option A: Store targets as a JSON blob in the `settings` table.**
Rejected because it would require parsing JSON and re-serializing on every read/write, bypassing SQLite's type checking and constraints. A dedicated table gives us row-level constraints (`CHECK`), cleaner queries, and the ability to join with allocation data if needed in future phases.

---

## Decision 6: Frontend Architecture -- Benchmark Overlay

### Decision

Modify the Phase 3 `InvestmentPerformanceChart` component to accept an optional benchmark overlay. The changes are:

1. **New prop:** `benchmarkData` (array of `{date, close}` from the benchmark API) and `showBenchmark` / `onToggleBenchmark` for the toggle state.

2. **Percentage-return mode.** When benchmark is toggled on, the chart switches to percentage-return mode (Y-axis shows "Return %" instead of dollar values). Both the portfolio line and the benchmark line are normalized to 0% at the start of the visible range:
   ```
   return_pct = ((value / first_value) - 1) * 100
   ```
   This normalization is computed client-side in a `useMemo` within `InvestmentPerformanceChart`.

3. **Chart type.** Phase 3 Decision 4 already specifies `ComposedChart` (combining `Line` for performance and `Bar` for contributions). Adding a benchmark `<Line>` to an existing `ComposedChart` is straightforward -- no chart type migration needed.

4. **Benchmark line styling:**
   - Color: `COLOR_AMBER` (#F5A623) -- available, distinct from portfolio blue (`COLOR_ACCENT`), and not used by any existing chart series.
   - Stroke: dashed (`strokeDasharray="6 3"`) to visually distinguish from the solid portfolio line and satisfy the accessibility requirement (not color alone).
   - Width: 1.5px (thinner than the 2px portfolio line to keep the portfolio visually dominant).
   - No dots: `dot={false}`.

5. **Tooltip.** When benchmark is active, the custom tooltip shows both values:
   ```
   Mar 9, 2026
   Portfolio:  +12.3%
   S&P 500:    +8.7%
   ```

6. **Toggle UI.** A checkbox toggle following the `NetWorthChart.jsx` precedent ("Show assets / liabilities" checkbox). Label: "Compare to S&P 500". Placed adjacent to the `RangeSelector` in the chart header area.

7. **Contribution bars.** When benchmark mode is active and the chart is in percentage-return mode, contribution bars are hidden (they are dollar values that do not map to the percentage Y-axis). When benchmark is toggled off, the chart returns to dollar mode and contribution bars reappear.

### Rationale

Percentage-return normalization is the only meaningful way to compare a portfolio's performance against a benchmark when the absolute dollar values differ by orders of magnitude (AC-1.2). Both lines starting at 0% makes the relative performance instantly scannable. The chart naturally handles this by transforming the data before passing it to Recharts -- no Recharts configuration changes needed beyond the Y-axis formatter.

Hiding contribution bars in percentage mode avoids a confusing dual-axis situation where dollar-denominated bars appear alongside percentage-denominated lines. The user is either in "how am I doing vs the market" mode (benchmark on, percentages) or "what is my portfolio worth" mode (benchmark off, dollars). These are distinct analytical contexts.

### Rejected Alternatives

**Option A: Show benchmark as a separate chart below the main chart.**
Rejected because the whole point of a benchmark overlay is side-by-side visual comparison on the same axes. Separate charts force the user to scan vertically and mentally align time periods. An overlay makes outperformance/underperformance immediately obvious from the gap between lines.

**Option B: Dual Y-axis (dollars on left, return % on right) showing both simultaneously.**
Rejected because dual Y-axis charts are notoriously misleading -- the relationship between the two scales is arbitrary, and users may draw false conclusions from visual crossings. The toggle approach is simpler and avoids ambiguity: you are either looking at absolute values or relative performance, never both.

**Option C: Always show benchmark (no toggle).**
Rejected because not all users care about benchmark comparison, and a permanent second line adds visual noise to the chart. The toggle respects user preference and keeps the default chart clean. The "nice-to-have" priority of this feature also suggests it should not dominate the page.

---

## Decision 7: Frontend Architecture -- Return Delta Summary Card

### Decision

Add a summary stat card to the Investments page dashboard view showing the return delta for the selected time range. This card is conditionally rendered only when the benchmark toggle is active.

Card content:
- Label: "vs S&P 500"
- Value: `+3.6%` or `-2.1%` (portfolio return minus S&P 500 return for the selected range)
- Color: `COLOR_POSITIVE` if positive, `COLOR_NEGATIVE` if negative (matching existing design tokens)
- Subtitle: range label, e.g., "1Y"

The computation is trivial: `portfolioReturn - benchmarkReturn` where both are already computed for the chart's percentage-return normalization.

### Rationale

The delta card provides an at-a-glance answer to "am I beating the market?" without requiring the user to mentally compute the gap between two chart lines. It follows the existing stat card pattern on the Investments page (Phase 3 uses stat cards for total value, total return, CAGR, etc.).

---

## Decision 8: Frontend Architecture -- Allocation Targets

### Decision

Add three sub-features to the Phase 3 holdings drill-down view:

1. **"Set Target" button.** Appears in the asset allocation section of the holdings drill-down. Opens a modal (not inline form) for entering percentage targets per asset class.

2. **Target form modal.** Lists each asset class from Phase 3's normalized set (Stock, ETF, Mutual Fund, Bond, Cash, Other) with an integer input (0-100). Shows a running sum with validation: the form's save button is disabled unless the sum equals 100. Inline error message when sum deviates: "Targets must sum to 100% (currently X%)."

3. **Comparison view.** When targets are set:
   - The `AllocationChart` donut shows actual allocation (unchanged from Phase 3).
   - Below the donut, the allocation table gains two new columns: Target % and Delta.
   - Delta column uses drift color coding: green (within 2pp), amber (2-5pp), red (>5pp), matching `COLOR_POSITIVE`, `COLOR_AMBER`, `COLOR_NEGATIVE`.
   - A "Clear Targets" link at the bottom removes all targets and returns to the default Phase 3 view.

### Rationale

**Modal over inline form:** The allocation section in the drill-down view is already dense (donut chart + table). An inline form would push content below the fold. A modal provides a focused editing context with a clear save/cancel flow. The project does not currently use modals, but this is a contained use case that does not warrant a complex modal system -- a simple overlay with backdrop click-to-close is sufficient.

**Table-based comparison over dual donut charts:** Concentric donuts (inner = target, outer = actual) are visually appealing but difficult to read precisely, especially for small slices. Side-by-side donuts waste horizontal space. A table with Actual / Target / Delta columns is the most scannable format for the retirement-focused user who wants actionable numbers ("I need to shift 3% from stocks to bonds").

**Drift thresholds (2pp / 5pp):** These are the PM's suggested thresholds and are reasonable starting points. They can be tuned based on user feedback without architectural changes (they are just constants in the component).

### Rejected Alternatives

**Option A: Inline expanding form in the allocation section.**
Rejected because it displaces the existing allocation content, requiring the user to scroll to see the donut chart while editing. The form also has validation state (sum counter) that benefits from a focused UI context.

**Option B: Concentric donut rings for comparison.**
Rejected because reading precise percentage differences between concentric rings is difficult, especially with many small slices. The allocation table is a more precise communication medium for drift analysis.

**Option C: Portfolio-level allocation targets (on the dashboard, not drill-down).**
Rejected because the dashboard view aggregates across all accounts. Setting and displaying targets at the portfolio level while the allocation data comes from per-account holdings creates a UX inconsistency (users drill into an account but see portfolio-wide targets). The requirements specify portfolio-wide targets, but the visual display belongs on the dashboard if/when a portfolio-level allocation chart is added (deferred in Phase 3). For now, placing the target UI in the drill-down is acceptable because that is where the allocation chart currently lives.

---

## Decision 9: Data Freshness Indicator

### Decision

A small text label near the benchmark toggle: "S&P 500 data as of {date}". The date comes from `last_updated` in the benchmark API response (which reads `sync_log.last_synced_at` for entity `benchmark_prices`).

Staleness logic:
- If `last_updated` is more than 3 calendar days ago, the label text changes to amber color (`COLOR_AMBER`) and prepends a warning dot.
- The 3-day threshold accounts for weekends (market closed Saturday + Sunday + data fetched Monday = 3 days without update is normal).

### Rationale

This satisfies AC-4.1 and AC-4.2 with minimal UI footprint. The label is informational, not blocking -- stale data is still shown. The amber treatment matches the existing warning color pattern in the codebase.

---

## Design Details

### Data Model Changes

Two new tables added to `DASHBOARD_DDL` in `backend/app.py`:

```sql
CREATE TABLE IF NOT EXISTS benchmark_prices (
    ticker  TEXT NOT NULL,
    date    TEXT NOT NULL,
    close   REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS allocation_targets (
    asset_class TEXT PRIMARY KEY,
    target_pct  INTEGER NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100)
);
```

### API Contract Changes

| Endpoint | Method | New/Modified | Purpose |
|----------|--------|-------------|---------|
| `/api/investments/benchmark` | GET | New | Return cached benchmark prices for date range |
| `/api/investments/allocation-targets` | GET | New | Return current allocation targets |
| `/api/investments/allocation-targets` | POST | New | Upsert allocation targets (atomic replace) |

No changes to existing Phase 3 endpoints.

### Component Structure

New files:

| File | Purpose |
|------|---------|
| `frontend/src/components/AllocationTargetsModal.jsx` | Modal form for setting target percentages |
| `frontend/src/components/AllocationTargetsModal.module.css` | Modal styles |

Modified files:

| File | Change |
|------|--------|
| `backend/app.py` | Add `benchmark_prices` and `allocation_targets` to `DASHBOARD_DDL`. Add `_fetch_benchmark_prices()` and `_sync_benchmark_prices()` helper functions. Add 3 new API endpoints. Add benchmark sync call at end of `_run_sync_worker`. |
| `frontend/src/api.js` | Add `fetchBenchmarkPrices(start, end, ticker)`, `fetchAllocationTargets()`, `saveAllocationTargets(targets)` |
| `frontend/src/pages/InvestmentsPage.jsx` | Add benchmark state (`showBenchmark`, `benchmarkData`), fetch benchmark on mount, pass benchmark props to chart. Add allocation targets state and fetch for drill-down view. |
| `frontend/src/components/InvestmentPerformanceChart.jsx` | Add benchmark `<Line>`, toggle checkbox, percentage-return normalization logic, dual-value tooltip, contribution bar hiding in benchmark mode. |
| `frontend/src/components/AllocationChart.jsx` | No change (donut stays the same). |
| Holdings drill-down section in `InvestmentsPage.jsx` | Add "Set Target" button, render `AllocationTargetsModal`, add Target/Delta columns to allocation table, add drift color coding. |

### Integration Points

| Integration Point | How |
|---|---|
| `chartUtils.jsx` | Reuse `COLOR_AMBER` for benchmark line, `COLOR_POSITIVE`/`COLOR_NEGATIVE` for delta, `TOOLTIP_STYLE` for tooltip, `filterByRange`/`downsample` for benchmark data. No modifications to `chartUtils.jsx`. |
| `_run_sync_worker` | Add `_sync_benchmark_prices(pipeline_conn)` call after the entity loop, wrapped in try/except. |
| `sync_log` table | Track benchmark freshness with entity `"benchmark_prices"` using existing `storage.update_sync_log()`. |
| Phase 3 `InvestmentPerformanceChart` | Add new props; chart is already `ComposedChart`, so adding a `<Line>` is additive. |
| Phase 3 security type normalization | Allocation targets use the same canonical set from Phase 3 Decision 7 (Stock, ETF, Mutual Fund, Bond, Cash, Other). |

---

## Dependencies on Prior Phases

| Dependency | Phase | Status | Risk |
|---|---|---|---|
| Investments page and all its components | Phase 3 | Planned (not built) | **Blocking.** Phase 6 cannot be implemented until Phase 3 ships. All component names and API contracts are based on Phase 3's architecture document. |
| `InvestmentPerformanceChart` using `ComposedChart` | Phase 3 Decision 4 | Planned | If Phase 3 changes to `AreaChart`, Phase 6 will need to migrate it to `ComposedChart` to support mixed Line/Area/Bar types. |
| Security type normalization mapping | Phase 3 Decision 7 | Planned | Allocation target asset classes must match Phase 3's canonical set. If Phase 3 changes the set, the allocation targets form must update accordingly. |
| `AllocationChart` component | Phase 3 | Planned | Phase 6 adds comparison columns to the allocation table near this chart. |
| Account filtering criteria (Retirement + Brokerage buckets) | Phase 3 Decision 8 | Planned | Benchmark comparison inherits the same account filter. |

Phase 6 has no dependency on Phase 4 (Forecasting) or Phase 5 (Monte Carlo).

---

## Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Yahoo Finance changes the `/v8/finance/chart/` endpoint format or blocks requests | Medium | Medium | All fetch logic is in a single function. Failure is caught and logged. Benchmark feature degrades gracefully (toggle disabled, "Benchmark data unavailable" message). The rest of the Investments page is completely unaffected. |
| 2 | Phase 3 component names or API contracts change during its implementation | Medium | Low | Phase 6 architecture is designed to be additive to Phase 3's public interfaces (new props, new columns in existing tables). If names change, the engineering plan adjusts file paths accordingly. No deep coupling. |
| 3 | Yahoo Finance historical data access becomes paywalled for SPY | Low | Medium | FRED API is the documented fallback. Migration requires: add API key setting, replace `_fetch_benchmark_prices` implementation, update docs. The storage layer and frontend are unchanged. |
| 4 | `adjclose` values are retroactively adjusted by Yahoo, causing small historical changes | Low | Low | For personal finance benchmarking, small adjustments are immaterial. The `INSERT OR REPLACE` upsert naturally corrects historical values on re-fetch. |
| 5 | Sum-to-100% validation UX is frustrating when editing targets | Low | Low | Show running sum in real-time as user types. Pre-populate remaining percentage on the last field. Allow Save only when sum = 100. |
| 6 | Weekend/holiday gaps in S&P data misalign with portfolio daily data | Low | Low | Use forward-fill alignment: for each portfolio date, use the most recent benchmark price on or before that date. Standard approach in financial data alignment. |

---

## Open Questions

1. **Phase 3 implementation status.** Phase 3 is "Planned" but not built. All Phase 6 file paths and component names are based on the Phase 3 architecture document. If Phase 3's implementation deviates from its architecture (e.g., different component names, different chart type), the Phase 6 engineering plan must adjust. **Resolution:** Confirm Phase 3 is implemented before starting Phase 6 engineering plan.

2. **Allocation target form: which asset classes to show.** The form should list all asset classes from Phase 3's normalized set. But should it show all 6 classes (Stock, ETF, Mutual Fund, Bond, Cash, Other) or only those that appear in the user's actual holdings? Showing all 6 ensures the user can set a target for a class they plan to add; showing only held classes reduces clutter. **Recommendation:** Show all 6 classes, pre-populated with 0% for classes not held. The user may want to express intent ("I want 10% in bonds even though I have none yet"). **Needs human confirmation.**

3. **Benchmark toggle state persistence.** Should the benchmark toggle state persist across page navigations (e.g., via localStorage or a setting), or reset to "off" each time the page loads? **Recommendation:** Reset to off. The benchmark is a secondary visualization, and the page should load in its clean default state. If users consistently want it on, we can add persistence later. **Needs human confirmation.**

4. **SPY vs total return.** The `adjclose` from SPY includes dividend reinvestment, making it a total return proxy. The portfolio return from Phase 3 is balance-based (includes contributions). This creates a comparison asymmetry: portfolio return is inflated by contributions, while SPY total return is not. A note ("Returns include contribution effects") should be displayed when Phase 3 uses balance-based returns. **Needs confirmation from Phase 3 implementation on whether it implements TWR or balance-based returns.**
