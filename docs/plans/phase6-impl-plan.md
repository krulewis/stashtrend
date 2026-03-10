# Phase 6: Benchmark Comparison — Implementation Plan

**Date:** 2026-03-09
**Author:** Engineer Agent (Initial Plan)
**Status:** Ready for staff review
**Depends on:** Phase 3 (Investments page — must be complete before implementation begins)

---

## Overview

Phase 6 adds two additive features to the existing Phase 3 Investments page: (1) an S&P 500 benchmark overlay on the performance chart with percentage-return normalization, a return-delta summary card, and a data freshness indicator; and (2) a target vs actual asset allocation comparison with a modal form for setting targets and a drift table in the holdings drill-down.

Data source: direct HTTP calls to Yahoo Finance's unofficial chart API for the SPY ETF, using Python's standard `urllib.request`. No new Python packages. Two new SQLite tables (`benchmark_prices`, `allocation_targets`) added to `DASHBOARD_DDL`. Three new backend endpoints. Frontend changes are concentrated in `InvestmentsPage.jsx` and `InvestmentPerformanceChart.jsx`, plus a new `AllocationTargetsModal` component.

**Critical dependency:** All file paths that reference Phase 3 components (`InvestmentsPage.jsx`, `InvestmentPerformanceChart.jsx`, `AllocationChart.jsx`, `InvestmentsPage.module.css`) are based on the Phase 3 architecture document. These names must be confirmed against the actual Phase 3 implementation before any Phase 6 code is written.

---

## Changes

### Group A — Backend: Database Schema (foundation for all other backend work)

```
File: /home/user/stashtrend/backend/app.py
Lines: DASHBOARD_DDL string (locate by searching for "CREATE TABLE IF NOT EXISTS")
Parallelism: independent
Description: Add two new tables to the DASHBOARD_DDL constant so they are created on app startup.
Details:
  - Append the benchmark_prices table definition immediately after the last existing CREATE TABLE block:
      CREATE TABLE IF NOT EXISTS benchmark_prices (
          ticker  TEXT NOT NULL,
          date    TEXT NOT NULL,
          close   REAL NOT NULL,
          PRIMARY KEY (ticker, date)
      );
  - Append the allocation_targets table definition after benchmark_prices:
      CREATE TABLE IF NOT EXISTS allocation_targets (
          asset_class TEXT PRIMARY KEY,
          target_pct  INTEGER NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100)
      );
  - No existing DDL lines are removed or modified.
```

---

### Group B — Backend: Benchmark Fetch + Sync Functions (depends on Group A DDL for schema)

```
File: /home/user/stashtrend/backend/app.py
Lines: New functions — insert before _run_sync_worker definition
Parallelism: depends-on: Group A (DDL must exist before sync functions reference the table)
Description: Implement the Yahoo Finance fetch helper and the sync orchestrator.
Details:
  - Add _fetch_benchmark_prices(start_date, end_date, ticker='SPY') function:
      - Converts start_date and end_date (YYYY-MM-DD strings) to Unix timestamps via
        calendar.timegm(time.strptime(date_str, '%Y-%m-%d'))
      - Constructs URL:
        https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&period1={unix_start}&period2={unix_end}
      - Opens request with urllib.request.urlopen(req, timeout=20) where req has
        User-Agent set to 'Mozilla/5.0 (compatible; stashtrend/1.0)'
      - Reads and JSON-parses the response body
      - Navigates to result['chart']['result'][0] and extracts:
          timestamps: result_obj['timestamp']  (list of Unix timestamps)
          adjclose:   result_obj['indicators']['adjclose'][0]['adjclose']
      - Zips timestamps and adjclose, converts each timestamp to YYYY-MM-DD via
        datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d')
      - Returns list of (ticker, date, close) tuples, filtering out any rows where close is None
      - Raises on HTTP errors (urllib.error.HTTPError, urllib.error.URLError)
      - Required stdlib imports: urllib.request, urllib.error, json, calendar, time, datetime
        (add to the existing import block at top of app.py if not already present)

  - Add _sync_benchmark_prices(conn) function:
      - Queries SELECT MAX(date) FROM benchmark_prices WHERE ticker='SPY' to find last_date
      - If last_date is None: fetches 7 years of history
          start_date = (datetime.today() - timedelta(days=365*7)).strftime('%Y-%m-%d')
      - If last_date is not None: fetches from last_date + 1 day to today
          start_date = (datetime.strptime(last_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
      - end_date = datetime.today().strftime('%Y-%m-%d')
      - If start_date > end_date: returns early (already up to date)
      - Calls _fetch_benchmark_prices(start_date, end_date)
      - Upserts results with INSERT OR REPLACE INTO benchmark_prices (ticker, date, close) VALUES (?,?,?)
        using executemany for efficiency
      - Calls conn.execute("INSERT OR REPLACE INTO sync_log (entity, last_synced_at, status)
        VALUES ('benchmark_prices', ?, 'success')", (datetime.utcnow().isoformat(),))
      - conn.commit() after upsert and sync_log update
      - All exceptions caught with app.logger.warning("Benchmark price sync failed", exc_info=True)
        — does NOT re-raise
```

```
File: /home/user/stashtrend/backend/app.py
Lines: _run_sync_worker function body — after the entity loop closes
Parallelism: depends-on: Group B _sync_benchmark_prices function definition
Description: Call benchmark sync at the end of the sync worker, isolated from entity loop failures.
Details:
  - After the `for entity in ordered_entities(entities):` loop body completes, add:
      try:
          _sync_benchmark_prices(pipeline_conn)
      except Exception:
          app.logger.warning("Benchmark price sync failed (outer guard)", exc_info=True)
  - This call is placed AFTER the existing any_failed / sync result reporting logic so
    a benchmark failure cannot alter the reported sync outcome for Monarch entities.
  - pipeline_conn is the SQLite connection already open in _run_sync_worker; pass it directly.
```

---

### Group C — Backend: API Endpoints (depends on Group A DDL)

```
File: /home/user/stashtrend/backend/app.py
Lines: New route functions — insert near other /api/investments/* routes (added by Phase 3)
Parallelism: depends-on: Group A (tables must exist); can be written in parallel with Group B
Description: Implement three new API endpoints for benchmark prices and allocation targets.
Details:
  - GET /api/investments/benchmark:
      @app.route("/api/investments/benchmark")
      def get_benchmark():
          ticker = request.args.get('ticker', 'SPY')
          start  = request.args.get('start')   # required YYYY-MM-DD
          end    = request.args.get('end')     # required YYYY-MM-DD
          if not start or not end:
              return jsonify({"error": "start and end query params are required"}), 400
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

  - GET /api/investments/allocation-targets:
      @app.route("/api/investments/allocation-targets")
      def get_allocation_targets():
          conn = get_db()
          try:
              rows = conn.execute(
                  "SELECT asset_class, target_pct FROM allocation_targets ORDER BY asset_class"
              ).fetchall()
              return jsonify({"targets": [{"asset_class": r[0], "target_pct": r[1]} for r in rows]})
          finally:
              conn.close()

  - POST /api/investments/allocation-targets:
      @app.route("/api/investments/allocation-targets", methods=["POST"])
      def save_allocation_targets():
          VALID_ASSET_CLASSES = {"Stock", "ETF", "Mutual Fund", "Bond", "Cash", "Other"}
          data    = request.get_json(silent=True) or {}
          targets = data.get("targets", [])
          # Clear all targets case
          if len(targets) == 0:
              conn = get_db()
              try:
                  conn.execute("DELETE FROM allocation_targets")
                  conn.commit()
                  return jsonify({"ok": True})
              finally:
                  conn.close()
          # Validation
          for t in targets:
              if t.get("asset_class") not in VALID_ASSET_CLASSES:
                  return jsonify({"error": f"Invalid asset_class: {t.get('asset_class')}"}), 400
              pct = t.get("target_pct")
              if not isinstance(pct, int) or pct < 0 or pct > 100:
                  return jsonify({"error": "target_pct must be integer 0-100"}), 400
          total = sum(t["target_pct"] for t in targets)
          if total != 100:
              return jsonify({"error": f"Targets must sum to 100 (currently {total})"}), 400
          # Atomic replace
          conn = get_db()
          try:
              conn.execute("DELETE FROM allocation_targets")
              conn.executemany(
                  "INSERT INTO allocation_targets (asset_class, target_pct) VALUES (?,?)",
                  [(t["asset_class"], t["target_pct"]) for t in targets]
              )
              conn.commit()
              return jsonify({"ok": True})
          finally:
              conn.close()
```

---

### Group D — Frontend: API Functions (independent; can start after Phase 3 api.js exists)

```
File: /home/user/stashtrend/frontend/src/api.js
Lines: Append to end of file (new named exports)
Parallelism: independent
Description: Add three named export functions for the three new Phase 6 endpoints.
Details:
  - fetchBenchmarkPrices(start, end, ticker = 'SPY'):
      export const fetchBenchmarkPrices = (start, end, ticker = 'SPY') =>
        fetchJSON(`/api/investments/benchmark?ticker=${encodeURIComponent(ticker)}&start=${start}&end=${end}`)
      Returns: { ticker, prices: [{date, close}], last_updated }

  - fetchAllocationTargets():
      export const fetchAllocationTargets = () =>
        fetchJSON('/api/investments/allocation-targets')
      Returns: { targets: [{asset_class, target_pct}] }

  - saveAllocationTargets(targets):
      export const saveAllocationTargets = (targets) =>
        fetchJSON('/api/investments/allocation-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets }),
        })
      targets is an array of {asset_class, target_pct}; pass [] to clear all targets.
      Returns: { ok: true } on success; throws on HTTP error.
```

---

### Group E — Frontend: AllocationTargetsModal component (independent)

```
File: /home/user/stashtrend/frontend/src/components/AllocationTargetsModal.jsx
Lines: new file
Parallelism: independent
Description: New centered modal for entering allocation targets. Uses native <dialog> element
             per the GroupAssignmentSheet pattern established in Phase 3.
Details:
  Props:
    - isOpen (bool): controls whether dialog.showModal() / dialog.close() is called
    - initialTargets (array of {asset_class, target_pct}): pre-populate inputs from saved targets;
      empty array means all zeros
    - onSave(targets): async callback; receives array of {asset_class, target_pct}; parent handles
      the API call
    - onClose(): callback to close the modal

  CANONICAL_CLASSES constant (module-level):
    [
      { name: 'Stock',       color: '#4D9FFF' },
      { name: 'ETF',         color: '#2ECC8A' },
      { name: 'Mutual Fund', color: '#9B7FE8' },
      { name: 'Bond',        color: '#F5A623' },
      { name: 'Cash',        color: '#5EDDA8' },
      { name: 'Other',       color: '#4A6080' },
    ]

  Internal state:
    - values: object keyed by asset class name, integer 0-100. Initialized from initialTargets
      on each open (via useEffect on isOpen).
    - saving: bool — true while onSave() is in-flight
    - saveError: string | null — error message from failed save

  Derived:
    - sum = Object.values(values).reduce((a, b) => a + b, 0)
    - isValid = sum === 100

  Behavior:
    - useEffect on isOpen: when true, call dialogRef.current.showModal() and set values from
      initialTargets (defaulting missing classes to 0). When false, call dialogRef.current.close().
    - Body scroll lock: document.body.style.overflow = isOpen ? 'hidden' : '' in the same effect.
    - Backdrop click: attach onClick to the <dialog> element; check e.target === dialogRef.current;
      if true and !saving, call onClose().
    - Escape key: the native <dialog> cancel event fires — attach an onCancel handler to call onClose()
      and e.preventDefault() to prevent immediate close before React state updates.
    - handleSave async function:
        1. setSaving(true), setSaveError(null)
        2. Build targets array: CANONICAL_CLASSES.map(c => ({ asset_class: c.name, target_pct: values[c.name] ?? 0 }))
        3. await onSave(targets)
        4. onClose() — parent re-fetches data after onSave resolves
        5. catch: setSaveError('Failed to save targets. Please try again.')
        6. finally: setSaving(false)

  Render structure (see design-spec section 5 for exact CSS measurements):
    <dialog ref={dialogRef} aria-labelledby="modal-title" onClick={handleBackdropClick} onCancel={handleEscape}>
      <div className={styles.header}>
        <h2 id="modal-title">Set Allocation Targets</h2>
        <button aria-label="Close dialog" onClick={onClose} disabled={saving}>×</button>
      </div>
      <p className={styles.intro}>Enter a target percentage for each asset class. Targets must sum to 100%.</p>
      {CANONICAL_CLASSES.map(cls => (
        <div key={cls.name} className={styles.inputRow}>
          <span className={styles.dot} style={{ background: cls.color }} />
          <label htmlFor={`target-${cls.name}`}>{cls.name}</label>
          <div className={styles.inputGroup}>
            <input
              id={`target-${cls.name}`}
              type="number" min="0" max="100" step="1" inputMode="numeric"
              value={values[cls.name] ?? 0}
              onChange={e => setValues(prev => ({ ...prev, [cls.name]: parseInt(e.target.value, 10) || 0 }))}
              disabled={saving}
            />
            <span>%</span>
          </div>
        </div>
      ))}
      <div className={styles.sumRow}>
        <span>Total:</span>
        <span style={{ color: sum === 100 ? 'var(--color-positive)' : sum > 100 ? 'var(--color-negative)' : 'var(--color-warning)' }}>
          {sum}% {sum === 100 ? '✓' : ''}
        </span>
      </div>
      {sum !== 100 && (
        <p role="alert" className={styles.validationError}>
          Targets must sum to 100% (currently {sum}%).
        </p>
      )}
      {saveError && (
        <div role="alert" className={styles.saveError}>{saveError}</div>
      )}
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={styles.saveBtn} onClick={handleSave} disabled={!isValid || saving}>
          {saving ? <><span className={styles.spinner} /> Saving…</> : 'Save Targets'}
        </button>
      </div>
    </dialog>
```

```
File: /home/user/stashtrend/frontend/src/components/AllocationTargetsModal.module.css
Lines: new file
Parallelism: depends-on: AllocationTargetsModal.jsx (write together)
Description: CSS module styles for AllocationTargetsModal. All values taken verbatim from
             design spec section 5.
Details:
  - dialog selector: background --bg-card, border 1px solid var(--border), border-radius var(--radius-xl),
    box-shadow var(--shadow-lg), width min(480px, calc(100vw - 32px)), max-height calc(100vh - 64px),
    overflow-y auto, padding 24px (mobile 20px via media query)
  - dialog::backdrop: background rgba(0,0,0,0.6), backdrop-filter blur(2px)
  - .header: flex row, space-between, align-items center, margin-bottom var(--sp-4),
    border-bottom 1px solid var(--border-sub), padding-bottom var(--sp-4)
  - h2 in header: 16px / weight 500 / --text-primary
  - close button: transparent background, no border, --text-muted, 18px, 32x32px,
    border-radius var(--radius-md), hover --bg-hover + --text-primary
  - .intro: 13px / --text-secondary, margin-bottom var(--sp-5)
  - .inputRow: flex row, space-between, align-items center, margin-bottom var(--sp-3)
  - .dot: 8x8px, border-radius 2px (background set inline via style prop)
  - label in inputRow: 14px / --text-primary, min-width 110px, overflow hidden, text-overflow ellipsis
  - .inputGroup: flex row, align-items center, gap var(--sp-2)
  - input[type=number]: width 72px, text-align right, background --bg-inset, border 1px solid var(--border),
    border-radius var(--radius-md), padding 6px 8px, 14px / --text-primary,
    focus: border-color var(--border-focus), box-shadow 0 0 0 1px var(--accent), outline none
    -moz-appearance textfield
  - % span: 14px / --text-secondary
  - .sumRow: background --bg-inset, border 1px solid var(--border-sub), border-radius var(--radius-md),
    padding 8px 12px, 13px / weight 500, flex space-between align-center, margin-top var(--sp-4)
  - .validationError: 12px / var(--color-negative), margin-top var(--sp-2)
  - .saveError: background --bg-error-subtle, border 1px solid var(--border-error),
    border-radius var(--radius-md), padding 8px 12px, 12px / --color-negative,
    margin-top var(--sp-3)
  - .actions: flex row, justify-content flex-end, gap var(--sp-3), margin-top var(--sp-6),
    border-top 1px solid var(--border-sub), padding-top var(--sp-5)
  - .cancelBtn: transparent bg, border 1px solid var(--border), border-radius var(--radius-md),
    padding 8px 20px, 14px / --text-secondary, hover --bg-hover + --text-primary, min-height 38px
  - .saveBtn: background var(--accent) enabled / --bg-raised disabled,
    color var(--bg-deep) enabled / --text-muted disabled, border none enabled / 1px solid var(--border) disabled,
    border-radius var(--radius-md), padding 8px 20px, 14px / weight 500,
    hover (enabled) var(--accent-hover), min-height 38px, cursor not-allowed when disabled
  - .spinner: 12px circle, border 2px solid rgba(255,255,255,0.3), border-top-color white,
    animation spin 0.6s linear infinite, display inline-block, vertical-align middle, margin-right 6px
  - @keyframes spin: 0% transform rotate(0deg), 100% transform rotate(360deg)
  - @media (max-width: 599px): dialog padding 20px, input width 64px
```

---

### Group F — Frontend: InvestmentPerformanceChart modifications (depends on Phase 3 component)

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.jsx
Lines: Existing file — additive modifications throughout
Parallelism: depends-on: Group D (api.js functions), Phase 3 InvestmentPerformanceChart.jsx must exist
Description: Add benchmark toggle, benchmark Line element, percentage-return normalization,
             dual-value tooltip, freshness label, and loading/disabled states.
             The chart is already a ComposedChart per Phase 3 Decision 4 — no chart type change needed.
Details:
  New props accepted by InvestmentPerformanceChart:
    - benchmarkPrices: array of {date, close} from the API (undefined when not yet fetched)
    - benchmarkLastUpdated: ISO timestamp string or null
    - showBenchmark: bool (controlled from parent InvestmentsPage)
    - onToggleBenchmark: () => void (called when checkbox changes)
    - benchmarkLoading: bool (true while fetchBenchmarkPrices is in-flight)
    - benchmarkDisabled: bool (true when account has < 1 month of history)
    - benchmarkDisabledReason: string (tooltip text when disabled)

  Import additions at top of file:
    - COLOR_AMBER from chartUtils.jsx (verify it is not already imported)
    - COLOR_POSITIVE, COLOR_NEGATIVE from chartUtils.jsx

  --- Normalization logic (add as useMemo) ---
  When showBenchmark is true, compute normalizedData: merge portfolio daily data with
  benchmark prices using forward-fill alignment:
    1. Build a Map of benchmark price by date from benchmarkPrices.
    2. For each portfolio data point (date, portfolio_value), find the benchmark close for that
       date by walking backward through dates until a benchmark entry is found.
    3. First portfolio data point anchors both series at 0%:
         portfolioBase = first portfolio_value in visible range
         benchmarkBase = benchmark close for first portfolio date (forward-fill from benchmark map)
    4. For each subsequent point:
         portfolio_return_pct = ((portfolio_value / portfolioBase) - 1) * 100
         benchmark_return_pct = ((benchmark_close / benchmarkBase) - 1) * 100
    5. Return merged array: [{date, portfolio_return_pct, benchmark_return_pct, ...originalFields}]
  Note: benchmarkBase is computed from the already-forward-filled map; if no benchmark price
  exists for or before the first portfolio date, benchmarkBase is null and benchmark_return_pct
  is null for all points (the line does not render).

  --- Chart header additions ---
  In the chart header row (flex row with title + RangeSelector), add a new toggle group to the
  right of the RangeSelector:
    <div className={styles.benchmarkToggleGroup}>
      <label
        className={cx(styles.benchmarkToggleLabel, benchmarkDisabled && styles.disabled)}
        title={benchmarkDisabled ? benchmarkDisabledReason : undefined}
      >
        <input
          type="checkbox"
          className={styles.visuallyHidden}
          checked={showBenchmark}
          onChange={onToggleBenchmark}
          disabled={benchmarkDisabled || !benchmarkLastUpdated}
        />
        <span className={styles.checkboxBox} />
        <span>Compare to S&P 500</span>
        {showBenchmark && benchmarkLoading && <span className={styles.toggleSpinner} />}
      </label>
      {benchmarkLastUpdated && (
        <span className={cx(styles.freshnessLabel, isStale && styles.stale)}>
          {isStale ? '• ' : ''}S&P 500 data as of {fmtDate(benchmarkLastUpdated)}
        </span>
      )}
    </div>

  Staleness: isStale = benchmarkLastUpdated &&
    (new Date() - new Date(benchmarkLastUpdated)) > 3 * 24 * 60 * 60 * 1000

  --- Chart subtitle when benchmark active ---
  Below the chart title, conditionally render when showBenchmark:
    <p className={styles.chartSubtitle}>% return from period start</p>

  --- Y-axis modification when benchmark active ---
  When showBenchmark is true, override the Y-axis tickFormatter:
    tickFormatter={(n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`}
  and set width to 64 (desktop) / 52 (mobile via responsive).

  --- Benchmark Line element ---
  Inside ComposedChart, after the existing portfolio Line/Area elements:
    {showBenchmark && !benchmarkLoading && (
      <Line
        type="monotone"
        dataKey="benchmark_return_pct"
        name="S&P 500 (SPY)"
        stroke={COLOR_AMBER}
        strokeWidth={1.5}
        strokeDasharray="6 3"
        dot={false}
        activeDot={{ r: 4, fill: COLOR_AMBER, stroke: '#1C2333', strokeWidth: 2 }}
        connectNulls
      />
    )}

  --- Contribution bars: hide when benchmark active ---
  The existing showContributions state/prop controls contribution Bar visibility.
  When showBenchmark becomes true: force contribution bars hidden (do not unmount the
  "Show contributions" checkbox, but set it to disabled with title="Contributions hidden
  in comparison mode" and opacity 0.4 via CSS modifier class).
  When showBenchmark becomes false: restore prior showContributions state.
  Implementation: store prevShowContributions in a ref before the benchmark toggle is
  activated; restore it on deactivation.

  --- Y-axis mode toggle: disable when benchmark active ---
  If Phase 3 implements a Y-axis mode toggle button (% Change vs $):
  When showBenchmark is true, disable those toggle buttons (opacity 0.5, cursor not-allowed,
  title="Disabled while comparing to benchmark", pointer-events none via modifier class).

  --- Custom tooltip when benchmark active ---
  Replace the existing tooltip content renderer with a new BenchmarkTooltip component
  (defined as a local function inside InvestmentPerformanceChart.jsx, not a separate file):
    function BenchmarkTooltip({ active, payload, label }) {
      if (!active || !payload?.length) return null
      const portfolioEntry = payload.find(p => p.dataKey !== 'benchmark_return_pct')
      const benchmarkEntry = payload.find(p => p.dataKey === 'benchmark_return_pct')
      const portfolioReturn = portfolioEntry?.value
      const benchmarkReturn = benchmarkEntry?.value
      const edge = (portfolioReturn != null && benchmarkReturn != null)
        ? portfolioReturn - benchmarkReturn : null
      return (
        <div style={TOOLTIP_STYLE}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{fmtDate(label)}</div>
          <hr style={{ borderColor: '#1E2D4A', margin: '4px 0' }} />
          {portfolioReturn != null && (
            <div>
              <span style={{ color: portfolioReturn >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE }}>
                ● Portfolio &nbsp; {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
              </span>
            </div>
          )}
          {benchmarkReturn != null && (
            <div style={{ color: '#F0F6FF' }}>
              ─ ─ S&P 500 (SPY) &nbsp; {benchmarkReturn.toFixed(2)}%
            </div>
          )}
          {edge != null && (
            <>
              <hr style={{ borderColor: '#1E2D4A', margin: '4px 0' }} />
              <div style={{ fontWeight: 500, color: edge >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE }}>
                Your edge: &nbsp; {edge >= 0 ? '+' : ''}{edge.toFixed(2)}%
              </div>
            </>
          )}
        </div>
      )
    }
  Pass <Tooltip content={showBenchmark ? <BenchmarkTooltip /> : <ExistingTooltip />} /> in the chart.

  --- Benchmark data unavailable inline message ---
  When showBenchmark is true and benchmarkPrices is empty/null after loading completes:
    <p className={styles.benchmarkUnavailable}>Benchmark data unavailable.</p>
  Positioned below the chart area, inside the chart card, above the card bottom edge.
  Style: 12px / --text-muted / italic / text-align center.

  --- Legend: add benchmark entry ---
  When showBenchmark is true and there is a custom legend (check Phase 3 implementation),
  add an entry: dashed amber line swatch (20×3px) + "S&P 500 (SPY)" label in --text-secondary.
```

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.module.css
Lines: Existing file — additions only
Parallelism: depends-on: Group F InvestmentPerformanceChart.jsx modifications
Description: Add CSS classes for all new benchmark-related UI elements.
Details:
  - .benchmarkToggleGroup: flex column, gap 2px, align-items flex-end; on mobile (< 600px) align-items flex-start
  - .benchmarkToggleLabel: display flex, align-items center, gap 6px, cursor pointer,
    min-height 36px, font-size 13px, color --text-secondary,
    hover color --text-primary, transition var(--ease-quick)
  - .benchmarkToggleLabel.disabled: opacity 0.4, cursor not-allowed
  - .visuallyHidden: position absolute, clip rect(0,0,0,0), width 1px, height 1px, overflow hidden
  - .checkboxBox: 14px × 14px, border-radius var(--radius-sm), border 1px solid var(--border),
    background --bg-inset, flex-shrink 0;
    input:checked + .checkboxBox: background var(--accent), border-color var(--accent)
    (use CSS adjacent sibling selector: the hidden input is immediately followed by .checkboxBox)
  - .toggleSpinner: same keyframes as modal spinner — 12px, border 2px solid rgba(255,255,255,0.3),
    border-top white, animation spin 0.6s linear infinite, display inline-block, margin-left 4px
  - .freshnessLabel: 11px, color --text-muted, font-weight 400
  - .freshnessLabel.stale: color var(--color-warning), font-weight 500
  - @media (max-width: 479px): .freshnessLabel { display: none } (hidden on small mobile per design spec)
  - .chartSubtitle: 12px / --text-muted / margin-top 2px / margin-bottom 0
  - .benchmarkUnavailable: 12px / --text-muted / font-style italic / text-align center / margin-top 8px
```

---

### Group G — Frontend: InvestmentsPage modifications (depends on Phase 3 page, Groups D, E, F)

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.jsx
Lines: Existing file — additive changes throughout
Parallelism: depends-on: Group D (api functions), Group E (AllocationTargetsModal), Group F (chart props)
             Phase 3 InvestmentsPage.jsx must exist
Description: Wire up benchmark state, benchmark data fetching, allocation targets state and CRUD,
             BenchmarkDeltaCard rendering, and AllocationTargetsModal rendering.
Details:
  --- New state variables (add to existing useState declarations) ---
    const [showBenchmark,      setShowBenchmark]      = useState(false)
    const [benchmarkData,      setBenchmarkData]       = useState(null)  // {ticker, prices, last_updated}
    const [benchmarkLoading,   setBenchmarkLoading]    = useState(false)
    const [allocationTargets,  setAllocationTargets]   = useState([])    // [{asset_class, target_pct}]
    const [targetsLoading,     setTargetsLoading]      = useState(true)
    const [showTargetsModal,   setShowTargetsModal]    = useState(false)
    const [clearConfirm,       setClearConfirm]        = useState(false)  // inline confirm step
    const prevShowContribRef = useRef(false)  // for restoring contributions toggle on benchmark off

  --- New imports ---
    import AllocationTargetsModal from '../components/AllocationTargetsModal.jsx'
    import { fetchBenchmarkPrices, fetchAllocationTargets, saveAllocationTargets } from '../api.js'

  --- Allocation targets: fetch on mount ---
  Add a second useEffect (alongside the existing data-loading useEffect):
    useEffect(() => {
      fetchAllocationTargets()
        .then(d => setAllocationTargets(d.targets))
        .catch(() => setAllocationTargets([]))
        .finally(() => setTargetsLoading(false))
    }, [])

  --- Benchmark toggle handler ---
  const handleToggleBenchmark = useCallback(async () => {
    const next = !showBenchmark
    setShowBenchmark(next)
    if (next && !benchmarkData) {
      setBenchmarkLoading(true)
      // Determine start date from the currently selected range (use COMMON_RANGES logic)
      // Phase 3's selectedRange state provides the active range label (e.g., '1Y')
      // Compute start = today minus range months; end = today
      const end = new Date().toISOString().slice(0, 10)
      const months = getRangeMonths(selectedRange)  // helper: null means 'All' → use 7 years
      const startDate = months
        ? new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      try {
        const data = await fetchBenchmarkPrices(startDate, end)
        setBenchmarkData(data)
      } catch {
        setBenchmarkData({ ticker: 'SPY', prices: [], last_updated: null })
      } finally {
        setBenchmarkLoading(false)
      }
    }
  }, [showBenchmark, benchmarkData, selectedRange])
  Note: getRangeMonths is a small helper function (or reuse COMMON_RANGES from chartUtils)
  that maps range label strings to month counts.

  --- Re-fetch benchmark when range changes while benchmark is active ---
  useEffect(() => {
    if (!showBenchmark) return
    // Refetch with new range
    setBenchmarkLoading(true)
    const end = new Date().toISOString().slice(0, 10)
    const months = getRangeMonths(selectedRange)
    const startDate = months
      ? new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    fetchBenchmarkPrices(startDate, end)
      .then(d => setBenchmarkData(d))
      .catch(() => setBenchmarkData({ ticker: 'SPY', prices: [], last_updated: null }))
      .finally(() => setBenchmarkLoading(false))
  }, [selectedRange])
  Note: dependency array includes selectedRange; showBenchmark is checked at top — if false, returns early.

  --- BenchmarkDeltaCard: derive return delta from benchmarkData and portfolio data ---
  Compute in useMemo when showBenchmark && benchmarkData?.prices?.length > 0 and portfolio data exists:
    - Get portfolioReturn: ((lastPortfolioValue / firstPortfolioValue) - 1) * 100
      using the same filtered portfolio data that the chart uses for the current range.
    - Get benchmarkReturn: normalize SPY prices to 0% at the first portfolio date (forward-fill).
    - delta = portfolioReturn - benchmarkReturn
  Render the BenchmarkDeltaCard inline in the stats card row (not a separate component file):
    {showBenchmark && (
      <div className={cx(styles.statCard, benchmarkLoading && styles.shimmer)}>
        {!benchmarkLoading && (
          <>
            <div className={styles.statLabel}>VS S&P 500</div>
            <div className={styles.statValue} style={{ color: delta >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
              {delta != null ? `${delta >= 0 ? '▲ +' : '▼ '}${delta.toFixed(1)}%` : '—'}
            </div>
            <div className={styles.statSub}>{selectedRange}</div>
          </>
        )}
      </div>
    )}
  The stats container gets a modifier class when 4 cards are shown (for responsive grid override).

  --- Stats card container responsive grid ---
  In InvestmentsPage.module.css (see Group H), the stats card grid switches from 3 to 4
  columns when .hasBenchmarkCard class is applied to the container.
  Apply: <div className={cx(styles.statsRow, showBenchmark && styles.hasBenchmarkCard)}>

  --- benchmarkDisabled determination ---
  When viewing a single account (selectedAccountId is not 'all'):
    - Compute account history start date from the performance data for that account
    - If the account has fewer than 30 days of history: benchmarkDisabled = true,
      benchmarkDisabledReason = "Need at least 1 month of history to compare"
  When viewing portfolio-level:
    - If benchmarkData exists but prices is empty: benchmarkDisabled = false (show unavailable state in chart)
    - If benchmarkData is null (never fetched): benchmarkDisabled = false (allow toggle to attempt fetch)

  --- Pass props to InvestmentPerformanceChart ---
  <InvestmentPerformanceChart
    {/* existing Phase 3 props */}
    benchmarkPrices={benchmarkData?.prices ?? []}
    benchmarkLastUpdated={benchmarkData?.last_updated ?? null}
    showBenchmark={showBenchmark}
    onToggleBenchmark={handleToggleBenchmark}
    benchmarkLoading={benchmarkLoading}
    benchmarkDisabled={benchmarkDisabled}
    benchmarkDisabledReason={benchmarkDisabledReason}
  />

  --- AllocationTargetsModal: render in holdings drill-down section ---
  The holdings drill-down section (rendered when selectedAccountId is set) gains:
  1. After the AllocationChart and its legend:
       {holdings?.length > 0 && (
         <div className={styles.allocationActions}>
           <button
             className={styles.setTargetBtn}
             onClick={() => setShowTargetsModal(true)}
           >
             Set Target
           </button>
           {allocationTargets.length > 0 && (
             clearConfirm
               ? (
                 <span className={styles.clearConfirmRow}>
                   Confirm clear?&nbsp;
                   <button onClick={handleClearTargets}>Yes</button>
                   &nbsp;
                   <button onClick={() => setClearConfirm(false)}>No</button>
                 </span>
               )
               : (
                 <button
                   className={styles.clearTargetsBtn}
                   onClick={() => { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 4000) }}
                 >
                   Clear Targets
                 </button>
               )
           )}
         </div>
       )}
  2. AllocationTargetsModal instance:
       <AllocationTargetsModal
         isOpen={showTargetsModal}
         initialTargets={allocationTargets}
         onSave={handleSaveTargets}
         onClose={() => setShowTargetsModal(false)}
       />

  --- handleSaveTargets ---
  const handleSaveTargets = useCallback(async (targets) => {
    await saveAllocationTargets(targets)
    const updated = await fetchAllocationTargets()
    setAllocationTargets(updated.targets)
  }, [])

  --- handleClearTargets ---
  const handleClearTargets = useCallback(async () => {
    await saveAllocationTargets([])
    setAllocationTargets([])
    setClearConfirm(false)
  }, [])

  --- Allocation comparison table (when allocationTargets is non-empty) ---
  Replace the Phase 3 allocation legend list with a <table> in the holdings drill-down:
    <table aria-label="Asset allocation actual vs target" className={styles.allocationTable}>
      <caption className={styles.visuallyHidden}>
        Showing actual allocation compared to targets. Delta column shows drift from target.
      </caption>
      <thead>
        <tr>
          <th scope="col">Asset Class</th>
          <th scope="col">Actual %</th>
          <th scope="col">Target %</th>
          <th scope="col">Delta</th>
        </tr>
      </thead>
      <tbody>
        {/* For each asset class that has actual > 0 OR target > 0: */}
        {rows.map(row => (
          <tr key={row.assetClass}>
            <th scope="row">
              <span className={styles.dot} style={{ background: ALLOCATION_COLORS[row.assetClass] }} />
              {row.assetClass}
            </th>
            <td>{row.actualPct.toFixed(1)}%</td>
            <td>{row.targetPct}%</td>
            <td style={{ color: getDriftColor(row.delta), fontWeight: 500 }}>
              {row.delta === 0 ? '—' : `${row.delta > 0 ? '▲ +' : '▼ '}${Math.abs(row.delta).toFixed(1)}pp`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className={styles.driftLegend}>
      Green ≤ 2pp from target &nbsp;·&nbsp; Amber ≤ 5pp &nbsp;·&nbsp; Red &gt; 5pp
    </p>
  Note: getDriftColor(delta): |delta| <= 2 → var(--color-positive); <= 5 → var(--color-warning); > 5 → var(--color-negative)
  Note: ALLOCATION_COLORS is the same map as in AllocationTargetsModal (color per asset class) —
  define once in a shared location or duplicate; the colors must match the AllocationChart donut palette.
  Note: rows computation: merge actual allocation (from Phase 3 holdings data) with allocationTargets;
  only show rows where actual > 0 OR target > 0.
  Note: If allocationTargets is empty, render Phase 3's original legend list unchanged.
```

---

### Group H — Frontend: InvestmentsPage CSS additions (depends on Group G)

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.module.css
Lines: Existing file — additions only
Parallelism: depends-on: Group G InvestmentsPage.jsx changes
Description: Add CSS for BenchmarkDeltaCard responsive grid, allocation action buttons,
             clear-confirm inline row, allocation comparison table, and drift legend.
Details:
  - .statsRow (existing class): ensure current rule is grid with auto-columns or repeat(3,1fr)
  - .hasBenchmarkCard .statsRow override (or apply to .statsRow.hasBenchmarkCard directly):
      @media (min-width: 768px): grid-template-columns: repeat(4, 1fr)
      @media (480px–767px): grid-template-columns: repeat(2, 1fr)
      @media (< 480px): grid-template-columns: 1fr (already stacked — no change needed)
  - .shimmer: shimmer skeleton animation (same pattern as Phase 3 skeleton cards):
      background: linear-gradient(90deg, --bg-card 25%, --bg-raised 50%, --bg-card 75%)
      background-size: 200% 100%
      animation: shimmer 1.5s infinite
      min-height: 100px
      border-radius: var(--radius-lg)
  - @keyframes shimmer: 0% background-position 200% 0; 100% background-position -200% 0
  - .statLabel: 10px / uppercase / letter-spacing 2px / weight 500 / --text-muted / margin-bottom 8px
  - .statValue: 24px mobile / 28px at 768px+ / weight 400
  - .statSub: 12px / --text-muted / margin-top 4px
  - .allocationActions: flex row, align-items center, gap var(--sp-3), margin-top var(--sp-4)
  - .setTargetBtn: transparent bg, border 1px solid var(--border), border-radius var(--radius-md),
    padding 6px 16px, 13px / --text-secondary, hover --bg-hover + --text-primary, min-height 36px
  - .clearTargetsBtn: transparent bg, no border, 13px / var(--color-negative), cursor pointer,
    hover text-decoration underline
  - .clearConfirmRow: 12px / --text-secondary; child buttons: same 12px link style
  - .allocationTable: width 100%, border-collapse collapse, margin-top var(--sp-4)
  - .allocationTable th, .allocationTable td: padding 8px 8px, text-align right (td);
    th[scope=row]: text-align left, flex, align-items center, gap 8px
  - .allocationTable thead th: 10px / uppercase / letter-spacing 2px / weight 500 / --text-muted,
    border-bottom 1px solid var(--border)
  - .allocationTable tbody tr: border-bottom 1px solid var(--border-sub),
    hover background var(--bg-hover)
  - .allocationTable tbody tr:last-child: no border-bottom
  - .driftLegend: 11px / --text-muted, margin-top var(--sp-2)
  - .visuallyHidden: position absolute, clip rect(0,0,0,0), width 1px, height 1px, overflow hidden
```

---

## Dependency Order

The following serialization constraints apply. Within each group, files can be worked in parallel.

```
Phase 3 must be complete (all components exist) before any Phase 6 work begins.

Round 1 (parallel):
  - Group A: backend/app.py — DDL additions
  - Group D: frontend/src/api.js — new API functions
  - Group E: AllocationTargetsModal.jsx + AllocationTargetsModal.module.css

Round 2 (after Round 1):
  - Group B: backend/app.py — fetch/sync functions (needs Group A DDL)
  - Group C: backend/app.py — API endpoints (needs Group A DDL)
  - Group F: InvestmentPerformanceChart.jsx + .module.css (needs Group D api functions;
             can draft in parallel with B/C since frontend does not depend on backend)

Round 3 (after Round 2):
  - Group G: InvestmentsPage.jsx (needs Groups D, E, F — all must be done)
  - Group H: InvestmentsPage.module.css (needs Group G to know which classes are needed;
             can be drafted before G is finalized but must be reconciled after)
```

---

## Test Strategy

### Backend Tests

```
File: /home/user/stashtrend/backend/tests/test_phase6_benchmark.py
Parallelism: independent (can be written before implementation using the API contract)
Test cases:
  - test_benchmark_prices_table_created:
      Call get_db() on a fresh test DB; assert benchmark_prices table exists with correct columns.
  - test_allocation_targets_table_created:
      Same for allocation_targets; assert CHECK constraint rejects target_pct > 100 and < 0.
  - test_fetch_benchmark_prices_parses_response:
      Mock urllib.request.urlopen to return a synthetic Yahoo Finance JSON response with 3 price
      points. Call _fetch_benchmark_prices('2025-01-01', '2025-01-05'). Assert returns list of
      3 (ticker, date, close) tuples with correct date format and close values.
  - test_fetch_benchmark_prices_handles_http_error:
      Mock urlopen to raise urllib.error.HTTPError(404). Assert _fetch_benchmark_prices raises
      (does not swallow — the caller _sync_benchmark_prices handles it).
  - test_sync_benchmark_prices_initial_backfill:
      Empty DB. Mock _fetch_benchmark_prices to return 5 rows. Call _sync_benchmark_prices(conn).
      Assert all 5 rows inserted in benchmark_prices. Assert sync_log updated for entity
      'benchmark_prices'. Assert start_date arg to mock was approximately 7 years ago.
  - test_sync_benchmark_prices_incremental:
      Pre-populate benchmark_prices with rows through '2026-03-01'. Mock _fetch_benchmark_prices.
      Call _sync_benchmark_prices(conn). Assert start_date arg to mock is '2026-03-02'.
  - test_sync_benchmark_prices_already_current:
      Pre-populate with row for today. Call _sync_benchmark_prices(conn). Assert _fetch_benchmark_prices
      is NOT called (returns early because start_date > end_date).
  - test_sync_benchmark_prices_fetch_failure_does_not_raise:
      Mock _fetch_benchmark_prices to raise Exception('network error'). Call _sync_benchmark_prices(conn).
      Assert no exception propagates. Assert sync_log is NOT updated (failure case).
  - test_get_benchmark_endpoint_returns_prices:
      Seed benchmark_prices with 3 rows for SPY. GET /api/investments/benchmark?start=2025-01-01&end=2025-12-31.
      Assert 200, response has 'ticker', 'prices' (3 items), 'last_updated'.
  - test_get_benchmark_endpoint_missing_params:
      GET /api/investments/benchmark (no start/end). Assert 400.
  - test_get_benchmark_endpoint_empty_when_no_data:
      GET /api/investments/benchmark with valid date range but no seeded rows.
      Assert 200, prices = [].
  - test_get_allocation_targets_empty:
      GET /api/investments/allocation-targets on fresh DB. Assert 200, targets = [].
  - test_get_allocation_targets_returns_saved:
      Seed 3 rows in allocation_targets. GET endpoint. Assert 3 items returned with correct values.
  - test_post_allocation_targets_saves_and_replaces:
      POST with 3 asset classes summing to 100. Assert 200 + ok. GET confirms 3 rows.
      POST again with 2 different classes summing to 100. Assert only 2 rows remain (old rows deleted).
  - test_post_allocation_targets_rejects_bad_sum:
      POST with sum = 95. Assert 400 with error mentioning "sum to 100".
  - test_post_allocation_targets_rejects_invalid_asset_class:
      POST with asset_class = "Cryptocurrency". Assert 400.
  - test_post_allocation_targets_rejects_out_of_range_pct:
      POST with target_pct = 110. Assert 400.
  - test_post_allocation_targets_clear_with_empty_array:
      Seed 3 rows. POST with targets = []. Assert 200 + ok. GET confirms targets = [].
  - test_post_allocation_targets_check_constraint_enforced_at_db:
      Directly attempt to INSERT a row with target_pct = -1. Assert sqlite3.IntegrityError.
```

### Frontend Tests

```
File: /home/user/stashtrend/frontend/src/components/AllocationTargetsModal.test.jsx
Parallelism: independent (interfaces known)
Test cases:
  - renders when isOpen is true:
      Render with isOpen=true, initialTargets=[], onSave=jest.fn(), onClose=jest.fn().
      Assert dialog is visible. Assert all 6 asset class labels present.
  - does not render content when isOpen is false:
      Render with isOpen=false. Assert dialog element is not shown (closed state).
  - displays initial target values:
      Render with initialTargets=[{asset_class:'Stock', target_pct:60}, {asset_class:'Bond', target_pct:40}].
      Assert Stock input value is 60, Bond is 40, others are 0.
  - sum indicator shows running total:
      Render with all zeros. Assert sum shows "0%". Type 50 in Stock. Assert sum shows "50%".
  - sum indicator shows green check at 100:
      Set inputs to sum exactly 100. Assert "100% ✓" in positive color.
  - save button disabled when sum != 100:
      All zeros (sum=0). Assert Save button is disabled.
  - save button enabled when sum == 100:
      Set inputs to sum 100. Assert Save button is enabled.
  - validation error shown when sum != 100:
      Sum = 90. Assert error message contains "currently 90%".
  - validation error hidden when sum == 100:
      Sum = 100. Assert error message not present.
  - calls onSave with correct data on submit:
      Set Stock=60, Bond=40. Click Save. Assert onSave called with array including
      {asset_class:'Stock', target_pct:60} and {asset_class:'Bond', target_pct:40}
      and all other classes at 0.
  - calls onClose after successful save:
      onSave resolves. Assert onClose is called.
  - shows saving state during in-flight POST:
      onSave returns a never-resolving promise. Assert button shows "Saving…" and is disabled.
  - shows save error on failure:
      onSave rejects. Assert error banner is visible with retry message.
  - calls onClose when Cancel is clicked:
      Click Cancel. Assert onClose called.
  - calls onClose when X button clicked:
      Click × button. Assert onClose called.
  - input accepts only integer values 0-100:
      Assert input type="number", min="0", max="100", step="1".
  - color dots match canonical palette:
      For each asset class, assert a dot element with the correct hex color is rendered.
```

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.benchmark.test.jsx
Parallelism: independent
Test cases:
  - renders benchmark toggle when benchmarkLastUpdated is provided:
      Render chart with benchmarkLastUpdated set. Assert checkbox with label "Compare to S&P 500" is present.
  - benchmark toggle is disabled when benchmarkDisabled is true:
      Render with benchmarkDisabled=true, benchmarkDisabledReason="Need at least 1 month...".
      Assert input is disabled. Assert label has title attribute with the reason string.
  - benchmark toggle is disabled when benchmarkLastUpdated is null:
      Render with benchmarkLastUpdated=null. Assert input is disabled.
  - calls onToggleBenchmark when checkbox is clicked:
      Render enabled toggle. Click checkbox. Assert onToggleBenchmark called.
  - freshness label shows date when data is fresh:
      benchmarkLastUpdated = yesterday's ISO string. Assert label shows "S&P 500 data as of [date]".
      Assert label does not have stale class.
  - freshness label shows stale warning when data is old:
      benchmarkLastUpdated = 5 days ago. Assert label starts with "•" and has stale styling.
  - freshness label hidden when benchmarkLastUpdated is null:
      Assert no freshness label in the DOM.
  - normalization: both series start at 0% at the first data point:
      Provide 3 portfolio data points and 3 benchmark prices. Compute normalizedData.
      Assert first portfolio_return_pct === 0 and first benchmark_return_pct === 0.
  - normalization: computes correct return percent for subsequent points:
      Portfolio values [100, 110]. Benchmark close [500, 550].
      Assert portfolio_return_pct[1] = 10, benchmark_return_pct[1] = 10.
  - forward-fill: weekend gaps in benchmark data are filled with last available price:
      Portfolio dates include Saturday. Benchmark has Friday price but not Saturday.
      Assert Saturday portfolio row gets Friday's benchmark price.
  - benchmark line not rendered when showBenchmark is false:
      Assert no element with name "S&P 500 (SPY)" in the chart.
  - benchmark line rendered when showBenchmark is true and data exists:
      Assert a Line element with dataKey="benchmark_return_pct" is in the chart.
  - "Benchmark data unavailable" message shown when prices array is empty and showBenchmark:
      Render with showBenchmark=true, benchmarkPrices=[], benchmarkLoading=false.
      Assert message element is visible.
  - spinner shown on toggle label while loading:
      showBenchmark=true, benchmarkLoading=true. Assert spinner element is in the DOM.
  - chart subtitle shown when benchmark active:
      showBenchmark=true. Assert "% return from period start" text is rendered.
  - benchmark tooltip shows both values and delta:
      Simulate hover with portfolioReturn=12.3 and benchmarkReturn=8.7.
      Assert tooltip contains "+12.3%", "8.7%", and "+3.6%".
```

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.benchmark.test.jsx
Parallelism: independent
Test cases:
  - benchmark toggle not shown before benchmark data exists (no last_updated):
      Mock fetchBenchmarkPrices to return empty. Assert toggle is disabled.
  - handleToggleBenchmark calls fetchBenchmarkPrices and sets benchmarkData state:
      Click toggle. Assert fetchBenchmarkPrices was called. Assert benchmarkData is set.
  - benchmark delta card not rendered when showBenchmark is false:
      Assert no "VS S&P 500" card in the DOM.
  - benchmark delta card renders with correct delta color (positive):
      showBenchmark=true, portfolio outperforming. Assert delta card value has positive color class.
  - benchmark delta card renders with correct delta color (negative):
      showBenchmark=true, portfolio underperforming. Assert negative color class.
  - benchmark delta card shows dash when prices array is empty:
      showBenchmark=true, benchmarkData.prices=[]. Assert "—" is displayed in the card.
  - allocation targets fetched on mount:
      Assert fetchAllocationTargets called on mount. With non-empty response, state is populated.
  - Set Target button opens modal:
      Render drill-down view with holdings. Click "Set Target". Assert modal isOpen=true.
  - Clear Targets button shows confirm step:
      allocationTargets is non-empty. Click "Clear Targets". Assert "Confirm clear?" text appears.
  - Confirm clear calls saveAllocationTargets with empty array:
      Click "Yes" on confirm. Assert saveAllocationTargets called with [].
  - No button auto-reverts clear confirmation:
      Click "No". Assert "Confirm clear?" disappears.
  - allocation table with Target/Delta columns shown when targets are set:
      allocationTargets = [{asset_class:'Stock', target_pct:60}].
      Assert table with "Target %" and "Delta" column headers is rendered.
  - allocation table not shown (original Phase 3 legend) when no targets:
      allocationTargets = []. Assert comparison table is absent.
  - handleSaveTargets refetches allocation targets after save:
      Call handleSaveTargets. Assert fetchAllocationTargets called a second time.
  - Set Target button hidden when holdings is empty:
      holdings = []. Assert "Set Target" button not in DOM.
  - benchmarkDisabled is true when account has < 30 days of history:
      Mock performance data with only 20 data points. Assert benchmarkDisabled prop passed to chart is true.
  - refetches benchmark data when selectedRange changes while showBenchmark is true:
      showBenchmark=true. Change range selector. Assert fetchBenchmarkPrices called again.
  - stats grid has hasBenchmarkCard class when benchmark is active:
      showBenchmark=true. Assert stats container has the hasBenchmarkCard CSS class.
```

### Edge Cases to Cover

- Benchmark fetch race condition: user clicks toggle rapidly — only one fetch should be in-flight;
  ignore stale responses. Implement with a cancellation ref or by checking that showBenchmark is still
  true when the fetch resolves before calling setBenchmarkData.
- allocation_targets CHECK constraint: test that the DB constraint fires correctly for invalid values.
- Forward-fill alignment when benchmark has no data before the portfolio's earliest date: benchmark
  line should not render (benchmarkBase is null → benchmark_return_pct is null for all points).
- Range change with benchmark active: start date changes → old benchmark data is stale → refetch.
  The refetch effect fires with the new selectedRange value.
- Portfolio history starts mid-range: normalization uses the first available portfolio point as base,
  not the range's theoretical start date.

---

## Phase 3 Dependencies — Specific Integration Points

The following Phase 3 implementation decisions directly affect Phase 6 code. Confirm each before
writing Phase 6 code:

| Phase 3 Decision | What Phase 6 Needs | Risk if Changed |
|---|---|---|
| `InvestmentPerformanceChart.jsx` uses `ComposedChart` (Phase 3 Decision 4) | Phase 6 adds a `<Line>` element — requires ComposedChart | If Phase 3 used AreaChart, must migrate to ComposedChart first |
| `InvestmentPerformanceChart.jsx` accepts `selectedRange` as prop or manages it internally | Phase 6 parent needs to re-fetch benchmark on range change; range value must be accessible in InvestmentsPage | If range state is fully internal to the chart, it must be lifted |
| Phase 3's performance data shape: `[{date, balance}]` or similar | Normalization logic in useMemo needs the field name for balance/value | Update `portfolioBase` computation to use correct field name |
| Phase 3 canonical asset classes (Decision 7): Stock, ETF, Mutual Fund, Bond, Cash, Other | CANONICAL_CLASSES in AllocationTargetsModal and POST validation in backend | If set changes, update VALID_ASSET_CLASSES in app.py and CANONICAL_CLASSES in modal |
| Phase 3 AllocationChart donut color palette | Dot colors in AllocationTargetsModal and comparison table must match | Update ALLOCATION_COLORS map if Phase 3 uses different hex values |
| Phase 3 allocation legend structure (`<ul>` or similar) | Group G replaces it with `<table>` when targets are set | If Phase 3 already uses a table, adjust the replacement logic |
| Phase 3 performance data prop name passed to chart | Phase 6 chart modifications reference the existing data prop | Update dataKey and normalization base variable accordingly |
| Phase 3 holdings data shape: includes `security_type` field | Allocation actual percentages computed from holdings `security_type` or a pre-computed field | If Phase 3 returns pre-aggregated allocation, use that directly |

---

## Rollback Notes

- Database: `benchmark_prices` and `allocation_targets` are new tables created by `DASHBOARD_DDL`
  with `CREATE TABLE IF NOT EXISTS`. Rolling back requires dropping both tables:
    `DROP TABLE IF EXISTS benchmark_prices;`
    `DROP TABLE IF EXISTS allocation_targets;`
  No existing tables are modified. No data migration is required.
- Backend: All new functions (`_fetch_benchmark_prices`, `_sync_benchmark_prices`) and all new
  route handlers are additive. Removing them restores the prior state with no side effects.
  The `_run_sync_worker` addition (the try/except benchmark sync call) can be reverted by removing
  those 4 lines.
- Frontend: All new files (`AllocationTargetsModal.jsx`, `.module.css`) can be deleted. Changes to
  `InvestmentPerformanceChart.jsx`, `InvestmentsPage.jsx`, and their CSS modules are additive
  (new props, new conditional rendering blocks). Reverting means removing those additions plus
  the three new exports from `api.js`.
- No data migrations. No changes to existing tables. `sync_log` gains a new row for entity
  `'benchmark_prices'` which is harmless to existing queries.
- Git: tag the commit before Phase 6 work begins as `phase6-start`. To roll back: `git revert`
  the Phase 6 commits or `git reset --hard phase6-start` on the feature branch.
