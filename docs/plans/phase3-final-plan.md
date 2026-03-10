# Phase 3: Investments Page — Final Plan (Delta)

**Date:** 2026-03-10
**Author:** Engineer Agent (Final Pass)
**Status:** Ready for implementation
**Input documents:** phase3-impl-plan.md, phase3-review.md

---

## Review Response Table

| # | Finding | Severity | Response | Plan Change |
|---|---------|----------|----------|-------------|
| 1 | Range label/API param case mismatch — `INVEST_RANGES` uses uppercase labels (`'3M'`) but backend expects lowercase (`'3m'`); `perfRange` initialized as `'1y'` (works once) then breaks after first selection | Critical | Accept | Add a separate `value` field to each `INVEST_RANGES` entry. `RangeSelector` calls `onSelect(r.value)` (not `r.label`). `perfRange` state stores the lowercase value. Initial state changes to `'1y'` (already correct). `activeRange` comparison in `RangeSelector` uses `r.value`. See corrected `InvestmentPerformanceChart.jsx` and `InvestmentsPage.jsx` sections below. |
| 2 | Recharts `Bar` with separate `data` prop inside `ComposedChart` will not render | Critical | Accept | Remove the standalone `contribData` array. Merge contribution data into `chartData` during the `useMemo` transformation: for each daily point, look up whether its `YYYY-MM` month key exists in a contributions map, and if so add a `contribution` field. `<Bar>` uses `dataKey="contribution"` with no separate `data` prop. See corrected `InvestmentPerformanceChart.jsx` section below. |
| 3 | `_compute_account_cagr` called per-account in loop — N+1 query pattern | High | Accept | Replace per-call helper with a batch helper `_compute_all_cagrs(account_ids, conn)`. Query `account_history` once with `WHERE account_id IN (?, ...)`. Group rows by `account_id` in Python. Compute CAGR per account from the grouped rows using the same logic as the old single-account helper. See corrected `backend/app.py` section below. |
| 4 | Inconsistent field name: backend SQL alias `total_basis` vs. frontend `totals.total_cost_basis` | High | Accept | Standardize on `total_cost_basis` throughout. The summary endpoint SQL alias changes to `SUM(basis) AS total_cost_basis`. All references in `InvestmentsPage.jsx` inline SummaryCards and `AccountDetailHeader` already use `total_cost_basis` and require no change. See corrected `backend/app.py` section. |
| 5 | `HoldingsTable` references `holding.cost_basis` and `holding.current_value` but DB columns are `basis` and `total_value` | High | Accept | The holdings endpoint must explicitly rename columns in its response. Add mapping: `basis` → `cost_basis`, `total_value` → `current_value`. Specify this in the backend endpoint description. See corrected `backend/app.py` section. |
| 6 | Mount effect and range-change effect both fire on initial mount — duplicate performance fetch | High | Accept | Remove the performance fetch from `loadDashboardData`. The range-change `useEffect([perfRange])` handles all performance fetches including initial load. `loadDashboardData` fetches summary only. See corrected `InvestmentsPage.jsx` section. |
| 7 | `AccountDetailHeader` receives `last_synced_at` as prop but parent never passes it | High | Accept | Move `last_synced_at` into the `account` object returned by the holdings endpoint (as `MAX(last_synced_at)` from the holdings table). `AccountDetailHeader` reads `account.last_synced_at` instead of a separate prop. Parent render stays as `<AccountDetailHeader account={holdings.account} totals={holdings.totals} />`. See corrected backend and component sections. |
| 8 | Leap-year crash in date arithmetic fallback (`date(year-1, 2, 29)` does not exist in non-leap years) | High | Accept | Drop the manual fallback entirely. Require `python-dateutil` (`relativedelta`) unconditionally. Add `python-dateutil` to `requirements.txt` if not already present (it is a transitive dep of many packages, but make it explicit). If `relativedelta` is unavailable, raise `ImportError` at startup rather than silently using broken arithmetic. See corrected `backend/app.py` and new `requirements.txt` section. |
| 9 | `_get_investment_account_ids` queries all accounts and filters in Python — O(all accounts) | Medium | Accept (doc only) | Add an inline comment in the plan: "This is O(all accounts) in Python. Acceptable given typical user account counts (< 20). No code change required." No code change. |
| 10 | Allocation "Other" merging: if all types are < 2%, chart shows 100% Other | Medium | Accept | Add a guard: after computing the `pct < 2.0` merge, if the result contains only the "Other" bucket (i.e., no non-Other entries remain), keep the top 5 types by value and merge the remainder into Other. Document this behavior in the backend endpoint description. See corrected `backend/app.py` section. |
| 11 | Bare `except Exception` leaks internal error details (`str(e)`) to client | Medium | Accept | All three endpoints: log with `app.logger.exception("...")` then return `jsonify({"error": "Internal server error"}), 500`. See corrected `backend/app.py` section. |
| 12 | Contribution detection query joins on `c.group_type = 'transfer'` — column name must be verified | Medium | Accept (plan note) | Add a note in the plan: "Implementer must verify the column name on the `categories` table before writing the contribution query. Run `PRAGMA table_info(categories)` or inspect `pipeline/monarch_pipeline/schema.py`. If the column is named `group` or `category_group`, update the WHERE clause accordingly. The plan uses `group_type` as the expected name based on architecture doc; confirm before coding." |
| 13 | Navigating back from drill-down shows stale dashboard data — mount effect has `[]` deps | Medium | Accept | Change the dashboard mount effect deps from `[]` to `[isDrillDown]` and guard with `if (!isDrillDown)`. This re-fires `loadDashboardData` whenever `isDrillDown` transitions from `true` to `false`. See corrected `InvestmentsPage.jsx` section. |
| 14 | Drill-down catch block checks `err.status === 404` but `fetchJSON` throws a generic `Error` without a `status` property | Medium | Accept (option a) | Modify `fetchJSON` in `api.js` to attach the HTTP status code to thrown errors: `const err = new Error(msg); err.status = response.status; throw err;`. See corrected `api.js` section. |
| 15 | Stale badge shows for `stale_days < 7` but stale banner shows for `stale_days >= 7` — gap undocumented | Medium | Accept (document) | Add a comment in the plan: "Accounts with `stale_days >= 7` show the page-level banner but no per-row badge. This is intentional: the banner is the primary alert for severely stale data; individual badges are for moderate staleness (1-6 days) where the user should notice which specific account needs attention without full-page alarming. Per-row badge condition `is_stale && stale_days < 7` is correct." |
| 16 | Skeleton state description is contradictory — "not a valid state" then "treat loading=true as the skeleton trigger" | Medium | Accept | Remove the contradictory paragraph entirely. Decision: show the loading spinner (existing `{loading && <div className={styles.loading}>Loading…</div>}`) while loading is true. No skeleton cards. The `.skeletonCard` CSS class is retained for future use if needed, but the JSX renders only the spinner during load. See corrected `InvestmentsPage.jsx` section. |
| 17 | `figcaption` in `AllocationChart` is outside conditional blocks — renders "undefined" when `allocation` is null | Medium | Accept | Move the `<figcaption>` inside the `{!loading && allocation?.length > 0 && (...)}` block. See corrected `AllocationChart.jsx` section. |
| 18 | `InvestmentsPage.jsx` dependency tag incorrectly lists `nav.js` and `App.jsx` as dependencies | Low | Accept | Change the parallelism tag to `depends-on: api.js, child components`. The dependency order section (Group B/C) is already correct and needs no change. |
| 19 | `InvestmentsPage.jsx` could move to Group A for more parallelism | Low | Accept | Move `InvestmentsPage.jsx` and `InvestmentsPage.module.css` from Group B to Group A. Modern bundlers do not require imported files to exist at write time; the dependency is only relevant at build/test time. Corrected Dependency Order section below. |
| 20 | Plan notes existing tests "may break" without specifying changes | Low | Accept | Add specific test update instructions for `App.test.jsx` and navigation snapshot tests. See corrected Test Strategy section. |
| — | Missing: `@keyframes shimmer` not defined in CSS modules that use it | Supplemental | Accept | Add `@keyframes shimmer` definition to each CSS module that uses `animation: shimmer`. Specifically: `InvestmentsPage.module.css`, `InvestmentAccountsTable.module.css`, `InvestmentPerformanceChart.module.css`, `AllocationChart.module.css`. See corrected CSS sections. |
| — | Missing: memory/docs updates not in plan | Supplemental | Accept | Add plan entries for `MEMORY.md`, `docs/architecture.md`, and `docs/plans/index.md` as required by CLAUDE.md Memory Rules. See new section below. |
| — | Missing: `python-dateutil` in `requirements.txt` | Supplemental | Accept | Add explicit `requirements.txt` change entry. |

---

## Corrected Sections

### backend/app.py — Three Endpoint Helpers (replaces original Details block)

```
File: /home/user/stashtrend/backend/app.py
Lines: new block appended after the existing endpoints (approximately after line 2400)
Parallelism: independent
Description: Add three new Flask endpoint handlers and three private helper functions.
Details:

  - REMOVE helper _compute_account_cagr(account_id, conn). Replace with:

  - Add helper: _compute_all_cagrs(account_ids, conn)
      * If account_ids is empty, return {}.
      * Query account_history in a single call:
          SELECT account_id, date, balance
          FROM account_history
          WHERE account_id IN (?, ?, ...)
          ORDER BY account_id ASC, date ASC
      * Group rows by account_id in Python (dict of lists).
      * For each account_id, apply the same CAGR logic as the old per-account helper:
          - Strip leading rows where balance IS NULL or balance <= 0.
          - If fewer than 30 non-zero-balance rows remain, result = None.
          - Compute years = (latest_date - earliest_date).days / 365.25.
          - If years <= 0, result = None.
          - Else result = round((latest / earliest) ** (1.0 / years) - 1, 4) * 100.
          - All dates parsed with datetime.strptime(row['date'], '%Y-%m-%d').date().
      * Return dict: { account_id: cagr_pct_or_None, ... }.
      * Comment in code: "Batch query — O(all investment accounts). Typical count < 20."

  - Add helper: _normalize_security_type(raw_type)
      (unchanged from original plan)

  - Add helper: _get_investment_account_ids(conn)
      (unchanged from original plan)
      * Add comment: "Filters all accounts in Python — O(all accounts). Acceptable for
        typical user account counts (< 20)."

  - Add endpoint: GET /api/investments/summary
      * Call _get_investment_account_ids(conn) to get the account list.
      * In a single SQL query, batch-aggregate holdings per account:
          SELECT account_id,
                 SUM(total_value) AS total_value,
                 SUM(basis) AS total_cost_basis,   ← alias is total_cost_basis (not total_basis)
                 COUNT(*) AS holdings_count,
                 MAX(last_synced_at) AS last_synced_at
          FROM holdings
          WHERE account_id IN (?, ?, ...)
          GROUP BY account_id
      * Call _compute_all_cagrs(account_ids, conn) once (not per account).
      * For each account, merge the aggregated holdings row (or use current_balance fallback
        when holdings_count = 0 or total_value is NULL).
      * Compute per-account:
          total_return_dollars = total_value - total_cost_basis (None if total_cost_basis IS NULL)
          total_return_pct = total_return_dollars / total_cost_basis * 100 (None if basis 0 or NULL)
          cagr_pct = cagr_dict.get(account_id)  ← from batch result
      * Compute allocation_weight_pct for each account:
          portfolio_total = sum of all account current_values
          weight = (account_value / portfolio_total) * 100
      * Compute staleness:
          is_stale = last_synced_at > 24 hours ago (compare against UTC now)
          stale_days = (now - last_synced_at).days
      * Compute portfolio-level totals: sum current_value, total_cost_basis,
        total_return_dollars; total_return_pct from totals; cagr_pct as
        weighted average of per-account CAGR (weight by current_value, skip None).
      * Return JSON: { "accounts": [...], "totals": {...} }
      * Sort accounts by current_value DESC in the response.
      * On any unhandled exception:
          app.logger.exception("Error in /api/investments/summary")
          return jsonify({"error": "Internal server error"}), 500

  - Add endpoint: GET /api/investments/accounts/<account_id>/holdings
      * Validate account_id is an investment account: call _get_investment_account_ids,
        check id in result. Return 404 with {"error": "Account not found"} if not.
      * Query all holdings WHERE account_id = ? ORDER BY total_value DESC NULLS LAST.
      * For each holding, explicitly rename DB columns in the response dict:
          "cost_basis": row["basis"],          ← rename basis → cost_basis
          "current_value": row["total_value"],  ← rename total_value → current_value
          "ticker": row["ticker"],
          "security_name": row["security_name"],
          "quantity": row["quantity"],
          "is_manual": row["is_manual"],
          "security_type": _normalize_security_type(row["security_type"]),
          "unrealized_gain_loss_dollars": row["total_value"] - row["basis"]
              if row["basis"] is not None else None,
          "unrealized_gain_loss_pct": (row["total_value"] - row["basis"]) / row["basis"] * 100
              if row["basis"] is not None and row["basis"] != 0 else None
      * Include last_synced_at in the account metadata object:
          Query: SELECT MAX(last_synced_at) AS last_synced_at FROM holdings WHERE account_id = ?
          Include as account["last_synced_at"] in the response.
          (AccountDetailHeader reads account.last_synced_at, not a separate prop.)
      * Compute allocation array:
          Group holdings by normalized_type, sum total_value per type.
          Compute pct = type_value / total_portfolio_value * 100.
          Merge types where pct < 2.0 into a single "Other" bucket.
          GUARD: if after merging, only the "Other" bucket remains (all types were < 2%),
          keep the top 5 types by value and merge only the remaining types into Other.
          Sort by value DESC.
      * Compute totals: SUM(total_value) as current_value, SUM(basis) as total_cost_basis,
        SUM(unrealized_gain_loss_dollars) skipping nulls, gain_loss_pct from totals.
      * Return JSON: { "account": {..., "last_synced_at": "..."}, "holdings": [...],
          "allocation": [...], "totals": {...} }
      * On any unhandled exception:
          app.logger.exception("Error in /api/investments/holdings")
          return jsonify({"error": "Internal server error"}), 500

  - Add endpoint: GET /api/investments/performance
      * Query params: accounts (comma-sep IDs, optional), range (default '1y').
      * Parse range to date cutoff using python-dateutil relativedelta (no manual fallback):
          '3m'  -> relativedelta(months=3)
          '6m'  -> relativedelta(months=6)
          '1y'  -> relativedelta(months=12)
          '3y'  -> relativedelta(months=36)
          '5y'  -> relativedelta(months=60)
          'all' -> cutoff = None (no date filter)
          If range value is unrecognized, default to '1y' behavior.
      * NOTE TO IMPLEMENTER: The contribution query joins on categories.group_type = 'transfer'.
        Before writing this query, verify the column name by running:
          PRAGMA table_info(categories)
        or inspecting pipeline/monarch_pipeline/schema.py. If the column is named differently
        (e.g., `group` or `category_group`), update the WHERE clause accordingly.
      * Determine account_ids: parse accounts param (split on ',', strip),
        then intersect with _get_investment_account_ids to prevent unauthorized access.
        If no accounts param, use all investment account IDs.
      * Query account_history (unchanged from original plan).
      * Pivot into date-keyed series (unchanged from original plan).
      * Query contributions (with verified column name for group_type).
      * Pivot contributions into month-keyed map: { "YYYY-MM": total_amount }.
      * Return JSON: { "series": [...], "contributions": [...], "account_names": {...} }
        where contributions is a list of { month, total } objects (not merged into series —
        merging happens client-side in useMemo).
      * On any unhandled exception:
          app.logger.exception("Error in /api/investments/performance")
          return jsonify({"error": "Internal server error"}), 500
```

---

### requirements.txt (new entry)

```
File: /home/user/stashtrend/backend/requirements.txt
Lines: append or confirm existing entry
Parallelism: independent
Description: Ensure python-dateutil is an explicit dependency (not just a transitive one).
Details:
  - Add: python-dateutil>=2.8
  - If already present with a compatible version spec, no change needed.
  - The performance endpoint requires relativedelta and will raise ImportError at startup
    if dateutil is not installed. The fragile manual date-arithmetic fallback is removed.
```

---

### api.js — fetchJSON status attachment (replaces original api.js Details block)

```
File: /home/user/stashtrend/frontend/src/api.js
Lines: modify existing fetchJSON function + append three new exports
Parallelism: independent
Description: Attach HTTP status code to thrown errors in fetchJSON; add three investment API functions.
Details:
  - Locate the existing fetchJSON function (currently used by all other API calls).
  - In the error-throw path (when response.ok is false), change from:
        throw new Error(message)
    to:
        const err = new Error(message)
        err.status = response.status
        throw err
    This change is backward-compatible — callers that only check err.message continue
    to work; the new .status property is available for callers that need it.
  - Export fetchInvestmentsSummary = () => fetchJSON('/api/investments/summary')
  - Export fetchInvestmentsHoldings = (accountId) =>
        fetchJSON(`/api/investments/accounts/${accountId}/holdings`)
  - Export fetchInvestmentsPerformance = (range = '1y', accounts = '') =>
        fetchJSON(`/api/investments/performance?range=${range}${accounts ? `&accounts=${accounts}` : ''}`)
  - Follow the exact pattern of existing named exports in the file (no default export).
```

---

### InvestmentsPage.jsx (replaces original Details block)

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.jsx
Lines: new file
Parallelism: independent (moved from Group B to Group A — see Dependency Order)
Description: Page component that owns all state and dispatches to dashboard or drill-down view.
Details:
  - Imports: (unchanged from original plan)

  - State:
      const { accountId } = useParams()
      const isDrillDown = Boolean(accountId)
      const [summary, setSummary] = useState(null)
      const [performance, setPerformance] = useState(null)
      const [holdings, setHoldings] = useState(null)
      const [perfRange, setPerfRange] = useState('1y')   ← lowercase value, matches INVEST_RANGES value field
      const [loading, setLoading] = useState(true)
      const [perfLoading, setPerfLoading] = useState(false)
      const [holdingsLoading, setHoldingsLoading] = useState(false)
      const [error, setError] = useState(null)
      const [perfError, setPerfError] = useState(null)
      const [holdingsError, setHoldingsError] = useState(null)
      const [lastUpdated, setLastUpdated] = useState(null)

  - Dashboard data loader (summary ONLY — performance is handled by range-change effect):
      function loadDashboardData() {
        setError(null)
        setLoading(true)
        fetchInvestmentsSummary()
          .then((s) => { setSummary(s); setLastUpdated(new Date().toLocaleTimeString()) })
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false))
        // Performance is NOT fetched here. The [perfRange] effect handles all perf fetches.
      }

  - Performance re-fetch effect (handles initial load AND range changes):
      useEffect(() => {
        if (isDrillDown) return
        setPerfError(null)
        setPerfLoading(true)
        fetchInvestmentsPerformance(perfRange)
          .then((p) => setPerformance(p))
          .catch((err) => setPerfError(err.message))
          .finally(() => setPerfLoading(false))
      }, [perfRange])
      // Fires on mount (perfRange = '1y') AND on every range selection.
      // No separate initial-load fetch needed.

  - Dashboard mount effect (summary only, re-fires when isDrillDown becomes false):
      useEffect(() => {
        if (!isDrillDown) loadDashboardData()
      }, [isDrillDown])
      // isDrillDown dep ensures re-fetch when navigating back from drill-down.

  - Drill-down fetch effect (unchanged from original plan):
      useEffect(() => {
        if (!isDrillDown) return
        setHoldingsError(null)
        setHoldingsLoading(true)
        setHoldings(null)
        fetchInvestmentsHoldings(accountId)
          .then((h) => setHoldings(h))
          .catch((err) => {
            if (err.status === 404) setHoldingsError('not_found')  ← .status works now (api.js fix)
            else setHoldingsError(err.message)
          })
          .finally(() => setHoldingsLoading(false))
      }, [accountId])

  - Stale data: compute maxStaleDays from summary?.accounts as Math.max of stale_days values.
    showStaleBanner = maxStaleDays >= 7. (unchanged)

  - Stale badge intent (comment): "Per-row badge shows for is_stale && stale_days < 7 (moderate
    staleness). Page banner shows for maxStaleDays >= 7 (severe staleness). This is intentional."

  - Loading state: show spinner only when loading=true. No skeleton cards in JSX.
    The .skeletonCard CSS class is defined but not used in JSX at this time.

  - AccountDetailHeader render (last_synced_at comes from account object, not a separate prop):
      <AccountDetailHeader account={holdings.account} totals={holdings.totals} />
      // holdings.account.last_synced_at is included by the backend endpoint.

  - All other render structure: unchanged from original plan.
```

---

### InvestmentsPage.module.css — shimmer keyframe

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.module.css
Lines: new file
Parallelism: independent
Description: CSS module for page shell. Adds @keyframes shimmer definition.
Details:
  - All CSS tokens and class definitions: unchanged from original plan.
  - ADD at the end of the file:
      @keyframes shimmer {
        0%   { background-position: -800px 0; }
        100% { background-position: 800px 0; }
      }
  - This is required because .skeletonCard uses animation: shimmer 1.5s infinite.
    The keyframe must be defined in the same module (CSS Modules do not share @keyframes
    across files unless they are in a global stylesheet).
```

---

### InvestmentPerformanceChart.jsx (replaces original Details block)

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.jsx
Lines: new file
Parallelism: independent
Description: Multi-account line chart with contribution bar overlay and Y-axis mode toggle.
Details:
  - Props: (unchanged from original plan)
  - Imports: (unchanged from original plan)

  - Local constants:
      const INVEST_RANGES = [
        { label: '3M', value: '3m', months: 3 },
        { label: '6M', value: '6m', months: 6 },
        { label: '1Y', value: '1y', months: 12 },
        { label: '3Y', value: '3y', months: 36 },
        { label: '5Y', value: '5y', months: 60 },
        { label: 'All', value: 'all', months: null },
      ]
      // label = display string; value = lowercase API param passed to onRangeChange.
      // All other local constants unchanged from original plan.

  - RangeSelector integration:
      <RangeSelector ranges={INVEST_RANGES} activeRange={range} onSelect={onRangeChange} />
      // RangeSelector must call onSelect(r.value) not onSelect(r.label).
      // activeRange comparison in RangeSelector uses r.value === activeRange.
      // The parent (InvestmentsPage) stores the lowercase value in perfRange state.

  - Internal state: (unchanged from original plan)

  - Derived data (useMemo) — CORRECTED contribution merging:
      // 1. Build a contributions lookup map: { "YYYY-MM": totalContributionAmount }
      const contribMap = useMemo(() => {
        const map = {}
        performance?.contributions?.forEach(c => { map[c.month] = (map[c.month] || 0) + c.total })
        return map
      }, [performance])

      // 2. Build chartData by merging contribution into each daily point:
      const chartData = useMemo(() => {
        if (!performance?.series) return []
        let firstValues = {}
        return performance.series.map((pt, idx) => {
          const month = pt.date.slice(0, 7)  // "YYYY-MM"
          const entry = { date: pt.date }
          // Populate total and per-account keys
          const keys = ['total', ...accountIds]
          keys.forEach(k => {
            const raw = k === 'total' ? pt.total : pt.accounts?.[k]
            if (yMode === 'pct') {
              if (firstValues[k] == null && raw != null) firstValues[k] = raw
              entry[k] = firstValues[k] ? ((raw - firstValues[k]) / firstValues[k]) * 100 : null
            } else {
              entry[k] = raw ?? null
            }
          })
          // Attach contribution for this month only on the first occurrence of that month
          // to avoid summing contributions multiple times across days in the same month.
          // Use a Set (monthsSeen) tracked outside the map to mark first day per month.
          entry.contribution = monthsSeen.has(month) ? undefined : (contribMap[month] ?? undefined)
          monthsSeen.add(month)
          return entry
        })
      }, [performance, yMode, accountIds])
      // monthsSeen is a Set initialized before the map call (use a let variable inside useMemo scope).

      hasContribs = performance?.contributions?.length > 0
      // contribData array is REMOVED — contributions are merged into chartData.

  - Bar element (CORRECTED — no separate data prop):
      {showContribs && hasContribs && (
        <Bar yAxisId="contributions" dataKey="contribution"
          fill={COLOR_AMBER} opacity={0.4} radius={[2,2,0,0]} name="Est. Contributions" />
      )}
      // dataKey="contribution" reads the merged field from chartData.
      // No data prop on Bar. Parent ComposedChart data={chartData} provides the data.

  - All other render structure: unchanged from original plan.
```

---

### InvestmentPerformanceChart.module.css — shimmer keyframe

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.module.css
Lines: new file
Parallelism: independent
Description: Styles for performance chart. Adds @keyframes shimmer.
Details:
  - All CSS class definitions: unchanged from original plan.
  - ADD at the end of the file:
      @keyframes shimmer {
        0%   { background-position: -800px 0; }
        100% { background-position: 800px 0; }
      }
  - .skeleton uses animation: shimmer 1.5s infinite — keyframe must be in same module.
```

---

### AccountDetailHeader.jsx — remove last_synced_at prop, read from account object

```
File: /home/user/stashtrend/frontend/src/components/AccountDetailHeader.jsx
Lines: new file
Parallelism: independent
Description: Header card for the drill-down view. Reads last_synced_at from account object.
Details:
  - Props: account ({ id, name, institution, bucket, last_synced_at }), totals ({ current_value,
    total_cost_basis, unrealized_gain_loss_dollars, unrealized_gain_loss_pct, holdings_count }).
    ← last_synced_at is REMOVED as a top-level prop. It lives in account.last_synced_at.
  - Staleness computed:
      const isStale = (Date.now() - Date.parse(account.last_synced_at)) / (1000*60*60*24) > 1
  - relativeTime called with account.last_synced_at:
      {relativeTime(account.last_synced_at)}
  - All other render structure, MetricItem, and relativeTime helper: unchanged from original plan.
```

---

### InvestmentAccountsTable.module.css — shimmer keyframe

```
File: /home/user/stashtrend/frontend/src/components/InvestmentAccountsTable.module.css
Lines: new file
Parallelism: independent
Description: Styles for accounts table. Adds @keyframes shimmer.
Details:
  - All CSS class definitions: unchanged from original plan.
  - ADD at the end of the file:
      @keyframes shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position: 600px 0; }
      }
  - .shimmerCell uses animation: shimmer 1.5s infinite — keyframe must be in same module.
```

---

### AllocationChart.jsx — move figcaption inside conditional block

```
File: /home/user/stashtrend/frontend/src/components/AllocationChart.jsx
Lines: new file
Parallelism: independent
Description: Donut chart. Moves figcaption inside conditional to prevent "undefined" render.
Details:
  - All imports, constants, state, and chart markup: unchanged from original plan.
  - CORRECTED render structure — move figcaption inside the allocation conditional:
      <figure aria-label={`Asset allocation donut chart for ${accountName}`} className={styles.container}>
        <h3 className={styles.title}>Asset Allocation</h3>
        {loading && <div className={styles.skeletonCircle} />}
        {!loading && (!allocation || allocation.length === 0) && (
          <div className={styles.emptyState}>No allocation data available.</div>
        )}
        {!loading && allocation?.length > 0 && (
          <>
            <div className={styles.chartWrap}>
              ... (PieChart, center label — unchanged)
            </div>
            <ul role="list" className={styles.legend}>
              ... (legend rows — unchanged)
            </ul>
            <figcaption className={styles.visuallyHidden}>
              Asset allocation: {allocation.map(a=>`${a.type} ${a.pct.toFixed(1)}%`).join(', ')}
            </figcaption>
          </>
        )}
      </figure>
  - figcaption is now inside the `allocation?.length > 0` guard.
    When allocation is null or empty, figcaption does not render at all.
    The `?.map(...)` optional chain is no longer needed and is removed.
```

---

### AllocationChart.module.css — shimmer keyframe

```
File: /home/user/stashtrend/frontend/src/components/AllocationChart.module.css
Lines: new file
Parallelism: independent
Description: Styles for allocation chart. Adds @keyframes shimmer.
Details:
  - All CSS class definitions: unchanged from original plan.
  - ADD at the end of the file:
      @keyframes shimmer {
        0%   { background-position: -800px 0; }
        100% { background-position: 800px 0; }
      }
  - .skeletonCircle uses animation: shimmer 1.5s infinite — keyframe must be in same module.
```

---

### RangeSelector.jsx — onSelect passes value, not label

```
File: /home/user/stashtrend/frontend/src/components/RangeSelector.jsx
Lines: existing file (verify current implementation; if it calls onSelect(r.label), change to onSelect(r.value))
Parallelism: independent
Description: RangeSelector must pass r.value to onSelect and compare r.value for activeRange highlighting.
Details:
  - If RangeSelector currently calls onSelect(r.label): change to onSelect(r.value).
  - The activeRange comparison: r.value === activeRange (not r.label === activeRange).
  - If RangeSelector is already value-agnostic (passes the range object or a caller-supplied key),
    verify the InvestmentPerformanceChart integration above is consistent.
  - Note: RangeSelector is used by other charts in the codebase. If those callers pass label
    strings today, this change may require updating them too — or add the value field only to
    INVEST_RANGES and leave other range arrays unchanged. Implementer must check all callers.
```

---

### Memory and Docs Updates (new — required by CLAUDE.md)

```
File: /home/user/stashtrend/docs/architecture.md
Lines: append to investments section or create investments section
Parallelism: independent (can run after implementation)
Description: Record Phase 3 investments feature architecture.
Details:
  - Add section: "Investments Page (Phase 3)" describing the three endpoints, five components,
    routing structure, and the batch CAGR query pattern.
```

```
File: /home/user/stashtrend/MEMORY.md (or monarch-dashboard/MEMORY.md per project conventions)
Lines: update Project section
Parallelism: independent (can run after implementation)
Description: Update test counts and feature list.
Details:
  - Add investments page to feature list.
  - Update test count to reflect ~40 new tests (5 backend test functions + 5 frontend test files).
```

```
File: /home/user/stashtrend/docs/plans/index.md
Lines: append entry
Parallelism: independent (can run after implementation)
Description: Record Phase 3 plan as active/completed.
Details:
  - Add entry: "Phase 3 — Investments Page | final plan: phase3-final-plan.md | status: in-progress"
```

---

### Corrected Dependency Order (replaces original Dependency Order section)

**Group A — Independent (run all in parallel):**
- `backend/app.py` additions
- `backend/requirements.txt` edit
- `frontend/src/api.js` additions + fetchJSON fix
- `frontend/src/nav.js` edit
- `frontend/src/components/RangeSelector.jsx` fix (if needed)
- `frontend/src/components/InvestmentAccountsTable.jsx` + `.module.css`
- `frontend/src/components/InvestmentPerformanceChart.jsx` + `.module.css`
- `frontend/src/components/AccountDetailHeader.jsx` + `.module.css`
- `frontend/src/components/HoldingsTable.jsx` + `.module.css`
- `frontend/src/components/AllocationChart.jsx` + `.module.css`
- `frontend/src/pages/InvestmentsPage.jsx` + `InvestmentsPage.module.css`
  ← moved from Group B; write-time dependency on imports is a build-time concern only

**Group C — Depends on InvestmentsPage.jsx existing (for import resolution at build time):**
- `frontend/src/App.jsx` edit — add import and Route entries

All test files can be written in parallel with their target implementation files.

Memory/docs updates (`architecture.md`, `MEMORY.md`, `docs/plans/index.md`) can run in parallel after implementation completes.

---

### Corrected Test Strategy — Existing Tests (replaces "Existing Tests That May Break" section)

**`frontend/src/App.test.jsx`** (if it exists):
- Find any test that renders `<App />` and checks rendered routes or navigation links.
- Add assertions for `/investments` and `/investments/:accountId` routes.
- If the test snapshots the route list, update the snapshot to include the two new routes.

**Navigation snapshot tests** (any test that renders `Sidebar`, `BottomTabBar`, or imports `NAV_ITEMS` from `nav.js`):
- `NAV_ITEMS` grows from 5 to 6 entries.
- Update snapshot or length assertion to expect 6 items.
- The new item is `{ path: '/investments', label: 'Investments', icon: '💼' }` at index 1.
- If tests check specific nav item labels by index, update index-based assertions accordingly.

**`frontend/src/components/InvestmentPerformanceChart.test.jsx`** — range selector test:
- Add test: clicking a range button calls `onRangeChange` with the lowercase value (e.g., `'3m'`),
  not the display label (`'3M'`).

---

## Unchanged Sections

The following sections from `/home/user/stashtrend/docs/plans/phase3-impl-plan.md` require no changes and are not reproduced here:

- **Overview** paragraph
- **nav.js** change entry
- **App.jsx** change entry
- **InvestmentsPage.module.css** class definitions (shimmer keyframe is additive)
- **InvestmentAccountsTable.jsx** full Details block
- **InvestmentAccountsTable.module.css** class definitions (shimmer keyframe is additive)
- **HoldingsTable.jsx** full Details block (field names `cost_basis` and `current_value` are correct — backend now renames them to match)
- **HoldingsTable.module.css** full Details block
- **AccountDetailHeader.module.css** full Details block
- **Backend test file** (`test_investments.py`) — all test cases remain valid; add one test to `test_investments_holdings_endpoint` verifying that `account.last_synced_at` is present in the response
- **Frontend test files** for `InvestmentsPage`, `InvestmentAccountsTable`, `HoldingsTable`, `AllocationChart` — test list unchanged; add one `InvestmentPerformanceChart` test per the range selector finding above
- **Edge Cases** section
- **Rollback Notes** section (add: `requirements.txt` revert removes `python-dateutil` explicit pin; no runtime impact if it remains as transitive dep)
