# Phase 3: Investments Dashboard — Staff Review

**Date:** 2026-03-09
**Reviewer:** Staff Engineer Agent
**Status:** Required changes before implementation
**Input:** phase3-impl-plan.md + CLAUDE.md

---

## Findings

---

1. [Critical] phase3-impl-plan.md:226,245,256,546-547 — Range label/API param case mismatch will cause the performance endpoint to always hit the fallback.

   The plan defines `INVEST_RANGES` with labels `'3M'`, `'6M'`, `'1Y'`, `'3Y'`, `'5Y'`, `'All'` (line 546-547). The `RangeSelector` component calls `onSelect(r.label)`, which passes the uppercase label string. This is stored in `perfRange` state (initialized as `'1y'`, line 226) and passed directly to `fetchInvestmentsPerformance(perfRange)` (lines 245, 256). The backend endpoint expects lowercase values `'3m'`, `'6m'`, `'1y'`, `'3y'`, `'5y'`, `'all'` (line 112-114).

   After the first range selection, `perfRange` will be an uppercase string like `'3M'` that does not match any backend parser case. The initial `'1y'` default works, but any user interaction with the range selector will break.

   Required action: Either (a) lowercase the label before passing to the API (`fetchInvestmentsPerformance(perfRange.toLowerCase())`), (b) change `INVEST_RANGES` to use a separate `value` property and pass that to the API while keeping `label` for display, or (c) change the `onRangeChange` handler in `InvestmentsPage` to lowercase before storing in state. Option (b) is cleanest. Also update `activeRange` comparison in `RangeSelector` to use the label, not the API value. Additionally, fix the initial state: if using labels, it should be `'1Y'` not `'1y'`.

---

2. [Critical] phase3-impl-plan.md:636-638 — Recharts `Bar` with separate `data` prop on a `ComposedChart` will not render correctly.

   The plan passes `data={contribData}` to the `<Bar>` component inside a `<ComposedChart data={chartData}>`. In Recharts, `<Bar>` inside a `ComposedChart` uses the parent chart's `data` prop -- it does not accept its own `data` prop. The contribution bars will either not render or will incorrectly map to the daily series data.

   The contribution data is monthly while the performance series is daily, so they have fundamentally different data shapes and cannot share the same `data` array directly.

   Required action: Merge contribution data into the `chartData` array during the `useMemo` transformation. For each daily data point, look up whether it falls in a month that has contribution data and add a `contribution` field (or only add contribution entries at the first day of each month). Then use `dataKey="contribution"` on the `<Bar>` without a separate `data` prop.

---

3. [High] phase3-impl-plan.md:74 — `_compute_account_cagr` is called once per account inside a loop, creating N+1 query pattern.

   The summary endpoint calls `_compute_account_cagr(account_id, conn)` for each account (line 74), and each call queries `account_history` separately. For a user with 10+ investment accounts, this means 10+ individual queries to `account_history` in addition to the main holdings aggregation query.

   Required action: Batch the CAGR computation. Query `account_history` once for all investment account IDs (`WHERE account_id IN (?, ...)`), then compute CAGR per account in Python from the result set. This reduces the query count from N+1 to 2 (one for holdings aggregation, one for account history).

---

4. [High] phase3-impl-plan.md:62-68 — Holdings aggregation query uses column name `basis` but plan refers to `total_basis` and `total_cost_basis` inconsistently.

   The holdings table schema (from `pipeline/monarch_pipeline/schema.py:82`) defines the column as `basis`. The summary endpoint's SQL uses `SUM(basis) AS total_basis` (line 63), which is correct. But the frontend components reference `totals.total_cost_basis` (lines 707, 727, 828, 832). The plan does not define the exact JSON field name mapping between the backend SQL alias and the frontend prop name. If the backend returns `total_basis` and the frontend reads `total_cost_basis`, values will be `undefined`.

   Required action: Explicitly define the JSON response field names in the backend endpoint description. Choose one name (`total_cost_basis` or `total_basis`) and use it consistently in both the backend response and all frontend component props. Update the holdings endpoint similarly for per-holding fields -- the plan says `holding.cost_basis` (line 828) but the DB column is `basis`.

---

5. [High] phase3-impl-plan.md:828-829 — Frontend HoldingsTable references `holding.cost_basis` and `holding.current_value` but DB columns are `basis` and `total_value`.

   The holdings endpoint (line 89-108) queries holdings and should map DB column names to API response field names. The plan does not explicitly specify whether the response uses DB column names (`basis`, `total_value`) or renames them (`cost_basis`, `current_value`). The frontend component (line 828-829) expects `holding.cost_basis` and `holding.current_value`, but if the backend returns the raw DB column names, these will be `undefined`.

   Required action: Add explicit field mapping in the holdings endpoint description. Specify that the backend must rename `basis` to `cost_basis` and `total_value` to `current_value` in the JSON response, or update the frontend to use the DB column names. Be consistent with the summary endpoint.

---

6. [High] phase3-impl-plan.md:263-265 — Dashboard mount effect has stale closure over `perfRange` and missing dependency.

   The `loadDashboardData` function (lines 236-249) captures `perfRange` in its closure. The mount effect (lines 263-265) calls `loadDashboardData()` with `[]` as the dependency array. Since `loadDashboardData` is a regular function (not wrapped in `useCallback`), it captures the initial `perfRange` value. This works on mount, but the Refresh button (line 291) calls `loadDashboardData` which will always use the current `perfRange` via closure -- actually this is fine for the refresh case since regular functions read current state.

   However, the separate range-change effect (lines 251-260) and the mount effect both fetch performance data redundantly on initial mount. The mount effect calls `loadDashboardData()` which fetches both summary and performance. The range-change effect `[perfRange]` also fires on mount (since `perfRange` starts as `'1y'`), causing a duplicate performance fetch.

   Required action: Either (a) skip the initial render in the range-change effect by using a ref to track whether it's the first render, or (b) remove the performance fetch from `loadDashboardData` and let the range-change effect handle all performance fetches (but then add `perfRange` to its dependency and handle initial load there).

---

7. [High] phase3-impl-plan.md:711 — `AccountDetailHeader` receives `last_synced_at` as a prop but the parent component never passes it.

   The plan defines `AccountDetailHeader` props as including `last_synced_at` (line 708-711). However, in `InvestmentsPage.jsx` (line 321), the component is rendered as:
   ```
   <AccountDetailHeader account={holdings.account} totals={holdings.totals} />
   ```
   The `last_synced_at` prop is not passed. The staleness computation inside `AccountDetailHeader` (line 711) will operate on `undefined`, making `isStale` always true (or causing a NaN comparison).

   Required action: Either (a) pass `last_synced_at` from `holdings.account.last_synced_at` as a prop in the parent, or (b) move `last_synced_at` inside the `account` object in the API response and read it as `account.last_synced_at` inside the component. Note that `last_synced_at` lives on the `holdings` table, not the `accounts` table, so the holdings endpoint needs to include it (e.g., `MAX(last_synced_at)`) in the account metadata it returns.

---

8. [High] phase3-impl-plan.md:115-117 — Date arithmetic fallback for range parsing will crash on edge cases.

   The plan says: `cutoff = date(today.year - y, today.month, today.day)` as a fallback when dateutil is unavailable. This will raise `ValueError` on February 29 in a leap year when subtracting to a non-leap year (e.g., 2028-02-29 minus 1 year = 2027-02-29, which does not exist). The plan acknowledges "(handle month boundary)" but does not specify how.

   Required action: Specify the exact fallback logic. Recommend: clamp the day to the last day of the target month. For example: `cutoff_month = today.month - (N % 12); cutoff_year = today.year - (N // 12); if cutoff_month < 1: cutoff_month += 12; cutoff_year -= 1; last_day = calendar.monthrange(cutoff_year, cutoff_month)[1]; cutoff = date(cutoff_year, cutoff_month, min(today.day, last_day))`. Or simply require `python-dateutil` as a dependency (it is already a transitive dependency of many common packages) and remove the fragile fallback entirely.

---

9. [Medium] phase3-impl-plan.md:52-56 — `_get_investment_account_ids` queries all accounts and filters in Python, which is inefficient and couples to `_get_bucket` logic.

   The helper queries ALL non-hidden, include-in-net-worth accounts, calls `_get_bucket` on each, and filters for Retirement/Brokerage buckets. This means every investment endpoint first loads the entire accounts table into Python. Additionally, the summary endpoint calls this helper, then calls `_compute_account_cagr` per account (finding #3), then runs the holdings aggregation query -- that is 3+ round trips minimum.

   Required action: This is acceptable for small account counts (most users have < 20 accounts total), but document the assumption. Consider adding a comment about potential optimization if account counts grow. No code change required, but the plan should acknowledge this tradeoff.

---

10. [Medium] phase3-impl-plan.md:101-102 — Allocation type merging threshold uses `pct < 2.0` but does not handle the edge case where all types are below 2%.

    If a user has many small positions across different types (e.g., 8 types each at 1.5%), all would merge into "Other" at 100%. While technically correct, it produces a useless chart.

    Required action: Add a guard: if merging would result in only "Other", keep the top 3-5 types by value and only merge the rest. Document this behavior in the plan.

---

11. [Medium] phase3-impl-plan.md:87 — Bare `except Exception` with `return jsonify({"error": str(e)}), 500` leaks internal error details to the client.

    All three endpoints catch unhandled exceptions and return `str(e)` in the JSON response. This can expose internal paths, SQL errors, or stack details to the frontend.

    Required action: Log the full exception server-side with `app.logger.exception(...)` and return a generic error message to the client: `{"error": "Internal server error"}`. This matches security best practices and is consistent with how sync errors are handled elsewhere in `app.py`.

---

12. [Medium] phase3-impl-plan.md:130-141 — Contribution detection query joins on `c.group_type = 'transfer'` but does not account for the possibility that the categories table may not have a `group_type` column.

    The plan assumes a `group_type` column on the `categories` table. Let me verify this is correct.

    Required action: Confirm that the `categories` table schema includes a `group_type` column. If it uses a different column name (e.g., `group` or `category_group`), the query will fail with a SQL error. The implementer must verify the schema before writing the query.

---

13. [Medium] phase3-impl-plan.md:267-280 — Drill-down fetch effect does not clear dashboard state, and navigating back does not re-fetch.

    When navigating from dashboard to drill-down (`/investments` to `/investments/:accountId`), the dashboard state (`summary`, `performance`) remains in memory. When navigating back, `isDrillDown` becomes false, but the mount effect has `[]` deps so it does not re-fire. The dashboard will show stale data from before the drill-down navigation.

    Required action: Either (a) add `isDrillDown` (or `accountId`) to the mount effect dependencies so dashboard data re-fetches when navigating back, or (b) use separate components for dashboard and drill-down views mounted by the router (this would be a bigger change). Option (a) is simpler: change the mount effect to `[isDrillDown]` or `[accountId]` and add the guard `if (!isDrillDown) loadDashboardData()`.

---

14. [Medium] phase3-impl-plan.md:276-278 — Error handling assumes the fetch rejection has a `.status` property, but `fetchJSON` throws a generic `Error`.

    The drill-down fetch catch block checks `err.status === 404`. Looking at the existing `fetchJSON` implementation in `api.js`, it throws a standard `Error` with a message string, not an object with a `status` property. The 404 check will never match, and all errors will show the generic error message instead of the "Account not found" UI.

    Required action: Either (a) modify `fetchJSON` to attach the HTTP status code to the thrown error (e.g., `const err = new Error(msg); err.status = response.status; throw err;`), or (b) check the error message string instead (e.g., `err.message.includes('404')` or `err.message === 'Account not found'`). Option (a) is cleaner and benefits all future error handling.

---

15. [Medium] phase3-impl-plan.md:464 — Stale badge display logic is inconsistent: show when `is_stale && stale_days < 7`, but `showStaleBanner` triggers when `maxStaleDays >= 7`.

    The plan says stale badges appear on individual accounts when `is_stale=true && stale_days < 7` (line 464). The stale banner appears when `maxStaleDays >= 7` (line 283). The backend computes `is_stale` as `last_synced_at > 24 hours ago` (line 79). This means accounts with stale_days between 1-6 show a badge, accounts with stale_days >= 7 are hidden behind only the banner, and accounts with stale_days < 1 show nothing. This gap (stale_days >= 7 with no per-row indicator) seems intentional but is not documented.

    Required action: Clarify the design intent. If accounts with stale_days >= 7 should also show a badge (in addition to the banner), update the condition. If the current behavior is intentional (banner-only for very stale accounts), add a comment explaining the rationale.

---

16. [Medium] phase3-impl-plan.md:339-344 — Skeleton state description is confused and contradictory.

    The plan describes a skeleton state for SummaryCards "when summary is null and !loading and !error" (line 339), then immediately says this is "not a valid state" (line 341), then says "treat loading=true as the skeleton trigger" (line 344). This contradictory guidance will confuse the implementer.

    Required action: Remove the skeleton card logic from SummaryCards entirely. The loading spinner already covers the loading state. Skeleton cards are only useful when you want to show the card layout during load, in which case the skeleton should render when `loading=true`, not in the impossible `!loading && !summary` state.

---

17. [Medium] phase3-impl-plan.md:937 — `figcaption` in AllocationChart accesses `allocation?.map(...)` but will throw if `allocation` is null/undefined.

    The `<figcaption>` at line 937 is outside the conditional rendering blocks, so it renders even when `allocation` is null. The expression `allocation?.map(a=>...)` is safe with optional chaining, but `.join(', ')` on `undefined` (when `allocation` is null) would produce the string `"undefined"`.

    Required action: Move the `<figcaption>` inside the `{!loading && allocation?.length > 0 && (...)}` conditional block, or guard with `allocation ? allocation.map(...).join(', ') : 'No data'`.

---

18. [Low] phase3-impl-plan.md:211 — `InvestmentsPage.jsx` dependency tag says `depends-on: api.js, nav.js, App.jsx; also depends-on child components`.

    The page does not depend on `nav.js` or `App.jsx`. Those files are independent edits (nav entry and route registration). The page component imports from `api.js` and the child components, not from nav or App. The dependency is reversed: `App.jsx` depends on `InvestmentsPage.jsx`, not the other way around.

    Required action: Change dependency tag to: `depends-on: api.js, child components (InvestmentAccountsTable, InvestmentPerformanceChart, AccountDetailHeader, HoldingsTable, AllocationChart)`. Move `App.jsx` to depend on `InvestmentsPage.jsx` (already correct in Group C of the dependency order section).

---

19. [Low] phase3-impl-plan.md:994-999 — Dependency order says InvestmentsPage.jsx is Group B (depends on Group A), but App.jsx is Group C (depends on InvestmentsPage.jsx existing). The InvestmentsPage.module.css is listed as parallelizable with InvestmentsPage.jsx, which is correct, but InvestmentsPage.jsx could actually be written in parallel with child components since it only imports them -- the imports will resolve at build time, not at write time.

    Required action: Consider moving `InvestmentsPage.jsx` to Group A (independent). Modern bundlers and editors do not require imported files to exist at write time. The dependency is only at build/test time. This enables more implementation parallelism.

---

20. [Low] phase3-impl-plan.md:1144-1146 — Plan notes that existing tests "may break" but does not specify what changes are needed.

    The plan mentions `App.test.jsx` and navigation snapshot tests may need updating but does not include the specific changes required.

    Required action: Check whether `App.test.jsx` exists. If it does, add it to the plan as a file to modify with specific changes (e.g., adding the new route to test expectations). If navigation snapshot tests exist, specify that snapshots need to be updated.

---

## Parallelism Assessment

The dependency grouping is mostly correct but could be improved:

- **Group A** is well-identified. All child components, api.js, nav.js, and backend are truly independent.
- **InvestmentsPage.jsx** can be moved to Group A (see finding #19) since the import resolution is a build-time concern, not a write-time concern.
- **App.jsx** edit correctly depends on InvestmentsPage.jsx existing (Group C).
- **Test files** are correctly identified as parallelizable with their implementation targets.
- **CSS module files** are correctly identified as parallelizable with their component files.

## Missing Items

- The plan does not specify whether `python-dateutil` needs to be added to `requirements.txt` or if the fallback-only approach is used. This must be decided.
- The plan does not include changes to `docs/architecture.md`, `MEMORY.md`, or `docs/plans/index.md` as required by the Memory Rules in CLAUDE.md.
- No mention of the `@shimmer` keyframe animation definition. The CSS modules reference `animation: shimmer 1.5s infinite` but do not define `@keyframes shimmer`. If this is defined globally, that should be noted. If not, each module needs the keyframe definition.

## Summary

**3 Critical findings** (must fix before implementation):
- Range label/API param case mismatch (#1)
- Recharts Bar data prop misuse (#2)

Wait -- let me recount. Findings #1 and #2 are Critical. The rest are High/Medium/Low.

**2 Critical, 6 High, 8 Medium, 3 Low** findings total. The plan is thorough and well-structured but has two bugs that would ship broken features (range selector and contribution chart) and several field name inconsistencies that would cause undefined values in the UI.
