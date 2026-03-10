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

6. [High] phase3-impl-plan.md:263-265 — Dashboard mount effect and range-change effect both fire on initial mount, causing duplicate performance fetch.

   The mount effect (lines 263-265) calls `loadDashboardData()` which fetches both summary and performance. The range-change effect (lines 251-260) with dependency `[perfRange]` also fires on mount (since `perfRange` starts as `'1y'`), causing a duplicate performance fetch on every page load.

   Required action: Either (a) skip the initial render in the range-change effect by using a ref to track whether it is the first render, or (b) remove the performance fetch from `loadDashboardData` and let the range-change effect handle all performance fetches (including initial load).

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

   Required action: Specify the exact fallback logic. Recommend: clamp the day to the last day of the target month using `calendar.monthrange`. Or simply require `python-dateutil` as a dependency (it is already a transitive dependency of many common packages) and remove the fragile fallback entirely.

---

9. [Medium] phase3-impl-plan.md:52-56 — `_get_investment_account_ids` queries all accounts and filters in Python, coupling to `_get_bucket` logic.

   The helper queries ALL non-hidden, include-in-net-worth accounts, calls `_get_bucket` on each, and filters for Retirement/Brokerage buckets. This is acceptable for small account counts but should be documented.

   Required action: Add a comment in the plan acknowledging this is O(all accounts) and is acceptable given typical user account counts (< 20). No code change required.

---

10. [Medium] phase3-impl-plan.md:101-102 — Allocation type merging threshold uses `pct < 2.0` but does not handle the edge case where all types are below 2%.

    If a user has many small positions across different types (e.g., 8 types each at 1.5%), all would merge into "Other" at 100%. While technically correct, it produces a useless chart.

    Required action: Add a guard: if merging would result in only "Other", keep the top 3-5 types by value and only merge the rest. Document this behavior in the plan.

---

11. [Medium] phase3-impl-plan.md:87 — Bare `except Exception` with `return jsonify({"error": str(e)}), 500` leaks internal error details to the client.

    All three endpoints catch unhandled exceptions and return `str(e)` in the JSON response. This can expose internal paths, SQL errors, or stack details to the frontend.

    Required action: Log the full exception server-side with `app.logger.exception(...)` and return a generic error message to the client: `{"error": "Internal server error"}`. This matches security best practices.

---

12. [Medium] phase3-impl-plan.md:130-141 — Contribution detection query joins on `c.group_type = 'transfer'` but the categories table schema must be verified.

    The plan assumes a `group_type` column on the `categories` table. If the column uses a different name (e.g., `group` or `category_group`), the query will fail with a SQL error at runtime.

    Required action: Verify the `categories` table schema column name before implementation. Add the verified column name to the plan.

---

13. [Medium] phase3-impl-plan.md:267-280 — Navigating back from drill-down will show stale dashboard data.

    When navigating from dashboard to drill-down (`/investments` to `/investments/:accountId`), the dashboard state (`summary`, `performance`) remains in memory. When navigating back, `isDrillDown` becomes false, but the mount effect has `[]` deps so it does not re-fire. The dashboard will show data from before the drill-down navigation without re-fetching.

    Required action: Change the mount effect dependencies to `[accountId]` (or `[isDrillDown]`) and guard with `if (!isDrillDown) loadDashboardData()`. This ensures dashboard data re-fetches when navigating back.

---

14. [Medium] phase3-impl-plan.md:276-278 — Error handling assumes the fetch rejection has a `.status` property, but `fetchJSON` throws a generic `Error`.

    The drill-down fetch catch block checks `err.status === 404`. The existing `fetchJSON` in `api.js` throws a standard `Error` with a message string, not an object with a `status` property. The 404 check will never match, and the "Account not found" UI will never display.

    Required action: Either (a) modify `fetchJSON` to attach the HTTP status code to the thrown error (e.g., `const err = new Error(msg); err.status = response.status; throw err;`), or (b) check the error message string instead. Option (a) is cleaner and benefits all future error handling.

---

15. [Medium] phase3-impl-plan.md:464 — Stale badge display logic has an undocumented gap for accounts with stale_days >= 7.

    Stale badges show on accounts when `is_stale=true && stale_days < 7` (line 464). The stale banner shows when `maxStaleDays >= 7` (line 283). Accounts with stale_days >= 7 get the banner but no per-row indicator. This gap is not documented.

    Required action: Clarify the design intent. If accounts with stale_days >= 7 should also show a badge (in addition to the banner), update the condition. If intentional, add a comment explaining the rationale.

---

16. [Medium] phase3-impl-plan.md:339-344 — Skeleton state description is confused and contradictory.

    The plan describes a skeleton state for SummaryCards "when summary is null and !loading and !error" (line 339), then immediately says this is "not a valid state" (line 341), then says "treat loading=true as the skeleton trigger" (line 344). This contradictory guidance will confuse the implementer.

    Required action: Remove the contradictory skeleton paragraph. Either (a) show skeleton cards when `loading=true` (replace the "Loading..." text with skeleton cards), or (b) keep the loading spinner and remove skeleton card logic entirely. Pick one approach and state it clearly.

---

17. [Medium] phase3-impl-plan.md:937 — `figcaption` in AllocationChart will render "undefined" when allocation is null.

    The `<figcaption>` at line 937 is outside the conditional rendering blocks, so it renders even when `allocation` is null. The expression `allocation?.map(a=>...).join(', ')` evaluates to `undefined` when `allocation` is null, and React will render the string "undefined".

    Required action: Move the `<figcaption>` inside the `{!loading && allocation?.length > 0 && (...)}` conditional block, or guard with `allocation ? allocation.map(...).join(', ') : 'No data'`.

---

18. [Low] phase3-impl-plan.md:211 — `InvestmentsPage.jsx` dependency tag incorrectly lists `nav.js` and `App.jsx` as dependencies.

    The page does not import from `nav.js` or `App.jsx`. The dependency is reversed: `App.jsx` depends on `InvestmentsPage.jsx`.

    Required action: Change dependency tag to: `depends-on: api.js, child components`. The dependency order section (Group B/C) is already correct.

---

19. [Low] phase3-impl-plan.md:994-999 — `InvestmentsPage.jsx` could be moved to Group A for more parallelism.

    The page is in Group B (depends on Group A completing), but modern bundlers do not require imported files to exist at write time. The page could be written in parallel with its child components.

    Required action: Consider moving `InvestmentsPage.jsx` to Group A (independent) to enable more implementation parallelism. The dependency is only relevant at build/test time.

---

20. [Low] phase3-impl-plan.md:1144-1146 — Plan notes existing tests "may break" but does not specify changes.

    The plan mentions `App.test.jsx` and navigation snapshot tests may need updating but does not include specific changes.

    Required action: Check whether `App.test.jsx` and navigation snapshot tests exist. If so, add them to the plan with specific changes required (new route expectations, updated NAV_ITEMS length).

---

## Parallelism Assessment

The dependency grouping is mostly correct:

- **Group A** is well-identified. All child components, api.js, nav.js, and backend are truly independent.
- **InvestmentsPage.jsx** can be moved to Group A (see finding #19) since import resolution is a build-time concern.
- **App.jsx** edit correctly depends on InvestmentsPage.jsx existing (Group C).
- **Test files** are correctly identified as parallelizable with their implementation targets.
- **CSS module files** are correctly identified as parallelizable with their component files.

## Missing Items

- The plan does not specify whether `python-dateutil` needs to be added to `requirements.txt` or if a fallback-only approach is used. This must be decided (see finding #8).
- The plan does not include changes to `docs/architecture.md`, `MEMORY.md`, or `docs/plans/index.md` as required by the Memory Rules in CLAUDE.md.
- The CSS modules reference `animation: shimmer 1.5s infinite` but do not define `@keyframes shimmer`. If this keyframe is defined globally, that should be noted. If not, each module that uses it needs the keyframe definition.

## Summary

**2 Critical, 6 High, 8 Medium, 3 Low** -- 19 findings total.

The plan is thorough and well-structured with good parallelism tagging and comprehensive test coverage. However, two critical bugs would ship broken features:

1. The range selector will stop working after the first user interaction due to a case mismatch between UI labels and API params (#1).
2. The contribution bar overlay will not render because Recharts `Bar` does not accept a separate `data` prop inside `ComposedChart` (#2).

Additionally, inconsistent field naming between the backend DB schema (`basis`, `total_value`) and frontend prop expectations (`cost_basis`, `current_value`) will cause `undefined` values throughout the holdings UI (#4, #5). The `AccountDetailHeader` has an unpassed prop (#7), the drill-down error handling assumes an error shape that `fetchJSON` does not produce (#14), and navigating back from drill-down will show stale dashboard data (#13).

All Critical and High findings must be resolved in the final plan before implementation begins.
