# Phase 5 Implementation Plan — Staff Review

**Date:** 2026-03-09
**Reviewer:** Staff Engineer Agent
**Status:** Changes required before final plan

---

## Findings

### Critical

1. [Critical] `/home/user/stashtrend/backend/app.py` — `_compute_portfolio_volatility()` contribution adjustment logic is mathematically incorrect (plan lines 111-117)

   The plan describes subtracting a flat daily contribution approximation from balances before computing log returns, but the pseudocode is vague ("subtract contribution from balance before log-return if balance increased") and the approach is flawed. Subtracting `daily_contribution_approx * days_elapsed` from the raw balance creates a cumulative bias that grows over time and does not correctly isolate market returns from contribution effects. Additionally, the plan assumes contributions happen every trading day, but real contributions are typically monthly or per-paycheck.

   A more correct approach: compute the daily balance change, subtract the daily contribution estimate from the *change* (not from the cumulative balance), then compute log returns on the adjusted series. Specifically:
   ```
   adjusted_returns[t] = log(balance[t] / (balance[t-1] + daily_contribution_approx))
   ```
   This treats each day's contribution as being added at the start of the day before the market moves.

   Required action: Replace the contribution adjustment pseudocode with the formula above. Document the simplifying assumption (uniform daily contribution) and its limitations. If `monthly_contribution` is 0 or not set, skip the adjustment entirely.

2. [Critical] `/home/user/stashtrend/backend/app.py` — `forecast_montecarlo()` route calls `conn.close()` on a `get_db()` connection (plan line 212)

   Looking at the existing codebase, `get_db()` at line 183 returns a connection that is used across the request lifecycle. The existing pattern in Flask routes throughout `app.py` does NOT call `conn.close()` on connections obtained via `get_db()` -- only background workers (like `_run_sync_worker`) that obtain their own connections call `close()`. The plan's `try/finally: conn.close()` pattern contradicts the existing codebase convention and could close the connection prematurely if Flask reuses it.

   The same issue applies to `forecast_ai_analysis()` at plan line 272.

   Required action: Check whether `get_db()` uses Flask's `g` object for connection lifecycle management. If it does, remove the `conn.close()` calls from both route handlers and let Flask's teardown handle it. Match the pattern used by existing routes (e.g., the AI endpoints at lines 1586+).

3. [Critical] `/home/user/stashtrend/backend/app.py` — `_compute_portfolio_volatility()` has a data leak between `nonzero_mask` filtering and subsequent `dates_clean` usage (plan lines 106-108)

   The plan filters `balances` with `nonzero_mask` and creates `dates_clean`, but then the contribution adjustment section references `balance[t]` and `balance[t-1]` without clarifying whether these are the filtered or unfiltered arrays. If a zero-balance day exists in the middle of the series (e.g., an account temporarily zeroed during a transfer), removing it silently creates a gap that makes the subsequent log-return calculation incorrect -- the return between day 5 and day 8 (with day 6-7 removed) would be attributed to a single-day return.

   Required action: Instead of removing zero-balance entries, replace zero balances with the previous day's balance (forward-fill). This preserves the time series continuity. Alternatively, compute returns only between consecutive non-zero days and weight them by the actual number of days elapsed.

---

### High

4. [High] `/home/user/stashtrend/backend/app.py` — Monte Carlo cache key rounds `portfolio_value` to nearest 1000, creating cache collisions (plan line 130)

   The cache key uses `round(portfolio_value, -3)`, so $450,000 and $450,499 produce the same cache key despite different inputs. This means a user whose portfolio is $450,100 could get cached results computed for $450,000 -- a $100 difference that compounds over a 30-year simulation. More importantly, if the portfolio value changes by less than $500 (e.g., after a small market move and re-sync), the stale cached result will be served.

   Required action: Either use the exact `portfolio_value` in the cache key (with no rounding) or document the acceptable rounding tolerance explicitly. If rounding is kept for cache efficiency, round to nearest 100 at most, and add a note in the response indicating the cached-key value differs from the requested value.

5. [High] `/home/user/stashtrend/backend/app.py` — `_run_monte_carlo()` applies monthly contribution BEFORE the growth factor, overstating returns (plan line 144)

   The simulation step is:
   ```python
   paths[:, t+1] = (paths[:, t] + monthly_contribution) * growth_factors[:, t]
   ```
   This means the contribution earns a full month of returns in the month it is added. The standard GBM convention is to add contributions AFTER growth:
   ```python
   paths[:, t+1] = paths[:, t] * growth_factors[:, t] + monthly_contribution
   ```
   The first formula systematically overstates ending values, especially for large contributions relative to portfolio size. For a $2,000/month contribution on a $50,000 portfolio with 7% return, the difference is meaningful.

   Required action: Change to `paths[:, t] * growth_factors[:, t] + monthly_contribution`. Document the assumption that contributions arrive at end-of-month.

6. [High] `/home/user/stashtrend/frontend/src/pages/ForecastingPage.jsx` — 422 error detection relies on parsing error message string (plan lines 551-552)

   The plan checks `err.message.includes('insufficient_history')` to detect a 422 response. Looking at `mutateJSON` in `api.js` (line 17), errors are thrown as `new Error(json.error || "HTTP ${res.status}")`. This means the `err.message` will be the string `"insufficient_history"` from the JSON error field. While this works, it is fragile -- any change to the backend error string silently breaks the frontend detection.

   Required action: Either (a) check the HTTP status code instead of the error message (requires modifying `mutateJSON` to include status in the thrown error, or adding a custom error class), or (b) at minimum, extract the error string into a shared constant or add a comment documenting the coupling. Option (a) is strongly preferred.

7. [High] `/home/user/stashtrend/backend/app.py` — `_compute_portfolio_volatility()` queries ALL account history without a date range filter (plan line 98)

   The query `SELECT account_id, date, balance FROM account_history WHERE account_id IN (...) ORDER BY date ASC` fetches the entire history for all investment accounts. For a user with 5 years of daily data across 10 accounts, this could be 18,000+ rows loaded into memory and processed with numpy. While this works, it is wasteful. More importantly, very old data (e.g., 5 years ago) may not be relevant for current volatility estimation -- market regimes change.

   Required action: Add a date range filter to the query, e.g., `WHERE date >= date('now', '-2 years')`. This bounds memory usage, improves query performance, and produces a more relevant volatility estimate. The `MC_MIN_CALENDAR_DAYS` check already handles the case where there is too little recent data.

8. [High] `/home/user/stashtrend/backend/app.py` — `_sanitize_prompt_field` is called on numeric values formatted as strings, but `monte_carlo` dict values from the request body are not validated (plan lines 242-248)

   The `forecast_ai_analysis` route reads `monte_carlo = body.get("monte_carlo")` and directly accesses `.get('p10_final', 0)` etc. without validating that `monte_carlo` is actually a dict. If an attacker sends `monte_carlo: "malicious string"`, the `.get()` call on a string will raise `AttributeError`. More importantly, if they send `monte_carlo: {"p10_final": "<script>alert(1)</script>"}`, the value passes through `_sanitize_prompt_field` (which only strips control chars) and into the AI prompt.

   Required action: (a) Validate that `monte_carlo` is a dict or None. (b) Cast all extracted values to `float()` with a try/except before formatting. The `_sanitize_prompt_field` call already handles the string-safety aspect, but the type coercion prevents non-numeric data from reaching the prompt.

---

### Medium

9. [Medium] `/home/user/stashtrend/docs/plans/phase5-impl-plan.md` — CSS Modules sharing claim is incorrect (plan lines 504, 970-971)

   The plan states: "CSS Modules generates unique class names per import site, so both components will render with the same visual styling but isolated scopes." This is wrong. CSS Modules generates class names per *file*, not per import site. Two components importing the same `.module.css` file get the *exact same* class names -- there is no isolation between them. This is actually fine for the stated goal (sharing styles), but the plan's rationale is misleading. If the components ever need divergent styles, they will need separate CSS module files.

   Required action: Correct the explanation. State that both components intentionally share the same compiled class names from `AIAnalysisPanel.module.css`. Add a comment in `ForecastAIPanel.jsx` noting the shared CSS dependency so future maintainers know style changes affect both panels.

10. [Medium] `/home/user/stashtrend/backend/app.py` — Cache infrastructure insertion location is contradictory (plan lines 46-47 vs line 164)

    The plan says to insert after line 1509 (after `_ai_cooldowns_lock` at ~1514), but also says the route handlers should be inserted "before the existing AI Config section (before line ~1506)" (plan line 164). The cache infrastructure must come before the routes, and both must come before or after the AI Config section -- not straddling it. The plan's line references are inconsistent.

    Required action: Clarify the exact insertion point. The most logical placement is: cache infrastructure + helpers + routes all together in a new `# Forecast` section, inserted either (a) after the AI endpoints section (after the budget builder routes, before Boot) or (b) just before the retirement settings section. Pick one location and update all line references consistently.

11. [Medium] `/home/user/stashtrend/backend/app.py` — `_run_monte_carlo()` is not seeded, making tests non-deterministic (plan line 137)

    The plan uses `np.random.default_rng()` without a seed, which is correct for production randomness but makes tests like `test_montecarlo_probability_0_when_target_huge` and `test_montecarlo_probability_100_when_target_trivial` potentially flaky. While the 5000-simulation count makes extreme-target tests robust, tests like `test_montecarlo_p10_less_than_p50_less_than_p90` could theoretically fail with very short horizons or extreme parameters.

    Required action: Add an optional `seed` parameter to `_run_monte_carlo()` (default `None`). When provided, use `np.random.default_rng(seed)`. Tests pass a fixed seed for determinism. Production calls omit it.

12. [Medium] `/home/user/stashtrend/frontend/src/pages/ForecastingPage.jsx` — `runSimulation` does not debounce or prevent concurrent calls (plan lines 536-559)

    If a user clicks "Run Simulation" rapidly, multiple concurrent API calls will fire. The `mcLoading` flag disables the button, but React state updates are asynchronous -- a fast double-click can enqueue two calls before the first `setMcLoading(true)` renders.

    Required action: Add a guard at the top of `runSimulation`: `if (mcLoading) return;`. This is the pattern used elsewhere in the codebase for preventing double-submission.

13. [Medium] `/home/user/stashtrend/backend/app.py` — `_run_monte_carlo()` date calculation uses naive month addition (plan lines 147-149)

    The plan says `start_date + i months` but does not specify how to add months. Python's `datetime` does not support adding months directly. The plan needs to specify using `dateutil.relativedelta` or manual month arithmetic. Without this, the implementer may use `timedelta(days=30*i)`, which drifts from actual calendar months.

    Required action: Specify the month-addition method. Recommend: `(start_date.year + (start_date.month - 1 + i) // 12, (start_date.month - 1 + i) % 12 + 1, 1)` or use `dateutil.relativedelta(months=i)`. If using `dateutil`, add it to `requirements.txt` (it is part of `python-dateutil` which is likely already installed as a transitive dependency, but should be explicit).

14. [Medium] `/home/user/stashtrend/backend/tests/test_forecast.py` — Test helper uses `random.gauss()` without a seed (plan lines 873-877)

    The `_make_investment_db_with_history()` helper generates random portfolio data. Without a fixed seed, different test runs produce different data, potentially causing intermittent test failures (e.g., the generated data might have too few non-outlier points in some runs).

    Required action: Add `random.seed(42)` at the start of the helper, or use a fixed sequence. Restore the random state afterward if needed.

15. [Medium] `/home/user/stashtrend/frontend/src/components/ForecastAIPanel.jsx` — Component duplicates significant logic from `AIAnalysisPanel.jsx` (plan lines 484-505)

    The plan acknowledges the two components are "identical visual structure" with only header text, spinner text, and the API call differing. Duplicating the entire state machine (expanded, config, status, analysis, error, config form, useEffect, handlers) creates a maintenance burden -- any bug fix or feature change to the AI panel pattern must be applied to both files.

    Required action: Extract the shared logic into a custom hook (e.g., `useAIPanel({ fetchFn, loadingText })`) or a higher-order component. The two panels would then only define their unique props/text. This is not a blocker but should be addressed to avoid divergence. At minimum, add a comment in both files cross-referencing each other.

---

### Low

16. [Low] `/home/user/stashtrend/frontend/src/components/MonteCarloChart.jsx` — Legend entries for individual band areas will clutter the chart legend (plan lines 446-455)

    The chart renders 4 `<Area>` components plus 1 `<Line>`, each with a `name` prop. Recharts will display all 5 in the legend, but the band areas (10th-25th, 25th-50th, etc.) are visually indistinguishable at small sizes. The transparent base area has `legendType="none"` (correct), but the 4 visible bands should probably be consolidated into a single legend entry like "Probability Range (10th-90th)".

    Required action: Add `legendType="none"` to all four `<Area>` components. Add a single custom legend entry or annotation for the band range. Alternatively, keep the current approach if the design spec explicitly calls for individual band labels.

17. [Low] `/home/user/stashtrend/backend/app.py` — `forecast_montecarlo` returns 422 for insufficient data but also returns `volatility_used` in the error response (plan line 203)

    Returning the fallback volatility value in an error response is unusual. The frontend does not appear to use this value from the 422 response (the error handler only checks for `insufficient_history` string). Including it adds noise to the error contract.

    Required action: Either remove `volatility_used` and `volatility_source` from the 422 response, or document that the frontend should display them in the warning banner.

18. [Low] `/home/user/stashtrend/frontend/src/components/ProbabilityBadge.jsx` — `fmtFull` import from `chartUtils.jsx` creates a coupling between a non-chart component and chart utilities (plan line 381)

    Required action: Acceptable for now since `fmtFull` is a general number formatter. Add a comment noting the import reason, or consider extracting `fmtFull` into a general `formatUtils.js` in a future refactor.

19. [Low] `/home/user/stashtrend/frontend/src/pages/ForecastingPage.jsx` — `forecastAiPayload` is recomputed on every render (plan lines 562-579)

    The payload object is rebuilt on every render, which will cause `ForecastAIPanel` to receive a new object reference each time, potentially triggering unnecessary re-renders.

    Required action: Wrap in `useMemo` with appropriate dependencies (`investableCapital`, `effectiveContribution`, `effectiveReturnRate`, `yearsToRetirement`, `nestEgg`, `mcResult`).

---

## Checklist

- [x] Correctness: 5 findings (contribution adjustment math, conn.close pattern, zero-balance gaps, contribution timing in GBM, month arithmetic)
- [x] Edge cases: 3 findings (cache key rounding, zero-balance forward-fill, double-click race)
- [x] Security: 1 finding (monte_carlo dict validation / type coercion)
- [x] Missing tests: 1 finding (non-deterministic RNG in tests)
- [x] Performance: 1 finding (unbounded history query)
- [x] Conventions: 2 findings (conn.close pattern, CSS modules explanation)
- [x] Completeness: 2 findings (insertion location ambiguity, date arithmetic method)
- [x] Anti-patterns: 1 finding (duplicated AI panel logic)
- [x] Parallelism tags: Correct. Backend and frontend groups are properly independent. Intra-group dependencies are correctly ordered.

---

## Summary

19 findings total: 3 Critical, 5 High, 7 Medium, 4 Low.

The plan is thorough and well-structured. The parallelism decomposition is sound and the test coverage is comprehensive. The critical issues center on mathematical correctness in the volatility computation and GBM simulation, plus a connection lifecycle pattern mismatch. These must be addressed before the final plan. The high-severity items around error handling coupling, input validation, and unbounded queries should also be resolved.
