# Phase 5: Monte Carlo Simulation — Final Plan (Delta)

**Date:** 2026-03-10
**Author:** Engineer Agent (Final Plan)
**Based on:** `docs/plans/phase5-impl-plan.md` (initial) + `docs/plans/phase5-review.md` (staff review)

---

## Review Response Table

| # | Finding | Severity | Response | Plan Change |
|---|---------|----------|----------|-------------|
| 1 | Contribution adjustment in `_compute_portfolio_volatility()` subtracts from cumulative balance, creating growing bias | Critical | Accept | Replace pseudocode with correct formula: `log(balance[t] / (balance[t-1] + daily_contribution_approx))`. Skip adjustment when `monthly_contribution` is 0. |
| 2 | `forecast_montecarlo()` and `forecast_ai_analysis()` call `conn.close()` in `finally`, contradicting the `get_db()` lifecycle pattern | Critical | Accept | Remove both `try/finally: conn.close()` blocks. Let Flask teardown manage connection lifecycle, matching existing route patterns. |
| 3 | Zero-balance filtering with `nonzero_mask` removes entries and creates time-series gaps, making subsequent log-return calculations incorrect | Critical | Accept | Replace zero-balance removal with forward-fill (replace zeros with the previous day's balance) before computing log returns. |
| 4 | Cache key rounds `portfolio_value` to nearest 1,000, allowing collisions within a $999 window | High | Accept | Remove rounding from `portfolio_value` in the cache key. Use exact value. Update key repr accordingly. |
| 5 | GBM simulation adds monthly contribution before growth factor, overstating returns | High | Accept | Change simulation step to `paths[:, t] * growth_factors[:, t] + monthly_contribution`. Document end-of-month contribution assumption. |
| 6 | 422 error detection in frontend parses `err.message` string, creating fragile coupling to backend error string | High | Accept (option b) | Option (a) — modifying `mutateJSON` — touches a shared file outside this plan's scope and risks breaking other callers. Accept option (b): extract the error string `'insufficient_history'` into a named constant at the top of `ForecastingPage.jsx` and add a comment documenting the coupling. |
| 7 | `_compute_portfolio_volatility()` queries ALL account history without a date range filter | High | Accept | Add `AND date >= date('now', '-2 years')` to the account_history query. |
| 8 | `monte_carlo` dict from request body is not validated as a dict; numeric values not type-coerced before use in prompt | High | Accept | Validate `monte_carlo` is a dict or None. Cast all extracted float fields with `float()` inside `try/except`, defaulting to 0.0 on failure. |
| 9 | CSS Modules explanation is incorrect — class names are scoped per file, not per import site | Medium | Accept | Correct the explanation in the plan and add a code comment in `ForecastAIPanel.jsx` noting the shared dependency. |
| 10 | Insertion location for cache infrastructure is contradictory (plan lines 46-47 vs line 164 reference straddling the AI Config section) | Medium | Accept | Consolidate all new backend additions into a single `# Forecast — Monte Carlo + AI Narrative` section inserted after the existing AI endpoints section (after the last AI route, before the Boot/startup section). All line references updated accordingly. |
| 11 | `_run_monte_carlo()` uses unseeded RNG, making tests non-deterministic | Medium | Accept | Add optional `seed` parameter (default `None`) to `_run_monte_carlo()`. Tests pass `seed=42`. Production calls omit it. |
| 12 | `runSimulation()` does not guard against concurrent calls; fast double-click can enqueue two calls before `setMcLoading(true)` renders | Medium | Accept | Add `if (mcLoading) return;` at the top of `runSimulation()`. |
| 13 | Month addition in `_run_monte_carlo()` uses unspecified method; implementer may use `timedelta(days=30*i)` which drifts | Medium | Accept | Specify month arithmetic explicitly using tuple construction: `date(start_date.year + (start_date.month - 1 + i) // 12, (start_date.month - 1 + i) % 12 + 1, 1)`. No new dependency needed. |
| 14 | Test helper `_make_investment_db_with_history()` uses unseeded `random.gauss()`, causing potential intermittent failures | Medium | Accept | Add `random.seed(42)` at the start of the helper function body. |
| 15 | `ForecastAIPanel.jsx` duplicates the full state machine from `AIAnalysisPanel.jsx`, creating maintenance burden | Medium | Accept (partial) | Extracting a `useAIPanel` hook is the right long-term move but is out of scope for this phase. Add cross-reference comments in both `ForecastAIPanel.jsx` and `AIAnalysisPanel.jsx` noting the duplication and pointing to each other. Track as a follow-up refactor. |
| 16 | Legend shows 4 individual band `<Area>` entries; visually indistinguishable at small sizes | Low | Accept | Add `legendType="none"` to all four band `<Area>` components. The `<Line>` for the median keeps its legend entry. No custom legend annotation needed — the chart title provides sufficient context. |
| 17 | 422 error response includes `volatility_used` and `volatility_source` which the frontend does not use | Low | Accept | Remove `volatility_used` and `volatility_source` from the 422 error response body. Return only `{"error": "insufficient_history"}`. |
| 18 | `fmtFull` import in `ProbabilityBadge.jsx` from `chartUtils.jsx` creates non-chart-to-chart coupling | Low | Accept (note only) | Acceptable for now. Add inline comment in `ProbabilityBadge.jsx` explaining the import: `// fmtFull is a general currency formatter; lives in chartUtils pending a future formatUtils extraction`. |
| 19 | `forecastAiPayload` object is rebuilt on every render, causing ForecastAIPanel to receive a new object reference each time | Low | Accept | Wrap `forecastAiPayload` in `useMemo` with dependencies `[investableCapital, effectiveContribution, effectiveReturnRate, yearsToRetirement, nestEgg, mcResult]`. |

---

## Corrected Sections

### Group A: Backend Infrastructure — `_compute_portfolio_volatility()` helper (Finding #1, #3, #7, #11)

Replace the `_compute_portfolio_volatility()` details block in Group A with the following:

```
File: /home/user/stashtrend/backend/app.py
Lines: new function, inside new Forecast section (see Finding #10 — consolidated insertion point)
Parallelism: depends-on: cache infrastructure block
Description: Corrected _compute_portfolio_volatility() with forward-fill for zeros, 2-year date filter,
             and correct contribution-adjusted log-return formula.
Details:
  - Query investment accounts (Retirement + Brokerage buckets via _get_bucket()):
      SELECT id, type, subtype FROM accounts WHERE include_in_net_worth = 1

  - Query account_history with 2-year date range filter:
      SELECT account_id, date, balance FROM account_history
      WHERE account_id IN (...) AND date >= date('now', '-2 years')
      ORDER BY date ASC

  - Aggregate: sum daily balances across accounts into {date: total_balance} dict.

  - Count calendar days span (max_date - min_date). If span < MC_MIN_CALENDAR_DAYS,
    return {"volatility": MC_FALLBACK_VOLATILITY, "source": "fallback", "insufficient_data": True}

  - Build sorted dates and balances numpy array:
      dates = sorted(portfolio_series.keys())
      balances = np.array([portfolio_series[d] for d in dates], dtype=float)

  - Forward-fill zero balances (do NOT remove — removing creates time-series gaps):
      for i in range(1, len(balances)):
          if balances[i] == 0.0 and balances[i-1] > 0.0:
              balances[i] = balances[i-1]
      # Drop any leading zeros (before the account had any value)
      first_nonzero = np.argmax(balances > 0)
      balances = balances[first_nonzero:]
      dates = dates[first_nonzero:]

  - If len(balances) < 2: return fallback dict.

  - Contribution-adjusted log returns (correct formula):
      Read monthly_contribution from retirement_settings (default 0 if not set).
      daily_contribution_approx = monthly_contribution / MC_CONTRIBUTION_TRADING_DAYS
      if daily_contribution_approx > 0:
          # Treat contribution as added at start of each day before market move.
          # adjusted_return[t] = log(balance[t] / (balance[t-1] + daily_contribution_approx))
          # This isolates market return from contribution effect.
          denominators = balances[:-1] + daily_contribution_approx
          # Guard against zero denominators (should not occur after forward-fill, but be safe)
          denominators = np.where(denominators <= 0, balances[:-1], denominators)
          log_returns = np.log(balances[1:] / denominators)
      else:
          # No contribution adjustment needed
          log_returns = np.diff(np.log(balances))

  - Outlier filter (unchanged from original):
      mask = (np.abs(log_returns - log_returns.mean()) < MC_OUTLIER_STD_THRESHOLD * log_returns.std()) \
             & (np.abs(log_returns) < MC_OUTLIER_ABS_THRESHOLD)
      clean_returns = log_returns[mask]

  - If len(clean_returns) < MC_MIN_DATA_POINTS: return fallback dict.

  - Annualize: sigma = float(clean_returns.std() * np.sqrt(MC_TRADING_DAYS_PER_YEAR))
  - Floor: if sigma < MC_MIN_VOLATILITY_FLOOR: sigma = MC_MIN_VOLATILITY_FLOOR

  - Cache result (unchanged from original).
  - Return {"volatility": sigma, "source": "account_history", "insufficient_data": False}
```

### Group A: Backend Infrastructure — `_run_monte_carlo()` helper (Findings #4, #5, #11, #13)

Replace the `_run_monte_carlo()` details block with the following corrected version:

```
File: /home/user/stashtrend/backend/app.py
Lines: new function, inside new Forecast section (after _compute_portfolio_volatility)
Parallelism: depends-on: cache infrastructure block
Description: Corrected GBM simulation with exact cache key, end-of-month contribution order,
             deterministic seed parameter, and explicit month-date arithmetic.
Details:
  - Signature: _run_monte_carlo(portfolio_value, monthly_contribution, annual_return_pct,
                                years, nest_egg_target, volatility, seed=None)
    The seed parameter defaults to None (production). Tests pass seed=42 for determinism.

  - Cache key — use EXACT portfolio_value (no rounding):
      hashlib.sha256(
          repr((portfolio_value, monthly_contribution, annual_return_pct,
                years, nest_egg_target, round(volatility, 4))).encode()
      ).hexdigest()
    Rationale: rounding to -3 creates a $999 collision window; exact value prevents stale results.

  - RNG initialization:
      rng = np.random.default_rng(seed)   # seed=None gives fresh entropy in production

  - GBM growth factors (unchanged):
      mu = annual_return_pct / 100.0
      sigma = volatility
      dt = 1.0 / 12
      months = int(years * 12)
      Z = rng.standard_normal((MC_NUM_SIMULATIONS, months))
      growth_factors = np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z)

  - Path simulation — contribution AFTER growth (correct end-of-month convention):
      paths = np.empty((MC_NUM_SIMULATIONS, months + 1))
      paths[:, 0] = portfolio_value
      for t in range(months):
          # Contribution arrives at end of month after market growth
          paths[:, t+1] = paths[:, t] * growth_factors[:, t] + monthly_contribution
    # Document: contributions are modeled as arriving at end of each month.
    # This slightly understates returns vs. beginning-of-month, but is the standard convention.

  - Date arithmetic for band labels — explicit tuple construction (no dateutil needed):
      from datetime import date as _date
      start_date = datetime.now(timezone.utc).date().replace(day=1)
      def _add_months(d, n):
          m = d.month - 1 + n
          return _date(d.year + m // 12, m % 12 + 1, 1)
      bands = [
          {
              "month": i,
              "date": _add_months(start_date, i).isoformat(),
              "p10": float(pcts[0, i]),
              "p25": float(pcts[1, i]),
              "p50": float(pcts[2, i]),
              "p75": float(pcts[3, i]),
              "p90": float(pcts[4, i]),
          }
          for i in range(months + 1)
      ]
    This avoids timedelta(days=30*i) drift and requires no new dependencies.

  - All other logic (percentile extraction, probability of target, LRU eviction, cache storage)
    unchanged from original plan.
```

### Group A: Route Handlers — `forecast_montecarlo()` and `forecast_ai_analysis()` (Findings #2, #8, #10, #17)

Replace the route handler details block with the following:

```
File: /home/user/stashtrend/backend/app.py
Lines: new route handlers, inside new Forecast section (after helper functions)
Parallelism: depends-on: helper functions above
Description: Route handlers with conn.close() removed, monte_carlo input validation added,
             and 422 response body simplified.

  - POST /api/forecast/montecarlo:
    @app.route("/api/forecast/montecarlo", methods=["POST"])
    def forecast_montecarlo():
        body = request.get_json() or {}
        # [Input validation unchanged from original plan]
        conn = get_db()
        # DO NOT call conn.close() — get_db() uses Flask's g object;
        # connection is torn down by Flask's teardown_appcontext handler.
        # This matches the pattern used by all other routes in this file.
        vol_result = _compute_portfolio_volatility(conn)
        if vol_result.get("insufficient_data"):
            # Return only the error key — frontend only uses this field from 422 responses
            return jsonify({"error": "insufficient_history"}), 422
        volatility = vol_result["volatility"]
        try:
            result = _run_monte_carlo(portfolio_value, monthly_contribution,
                                      annual_return_pct, years, nest_egg_target, volatility)
            result["volatility_source"] = vol_result["source"]
            return jsonify(result)
        except Exception:
            app.logger.exception("Monte Carlo simulation failed")
            return jsonify({"error": "Simulation failed. Check server logs."}), 500

  - POST /api/forecast/ai-analysis:
    @app.route("/api/forecast/ai-analysis", methods=["POST"])
    def forecast_ai_analysis():
        blocked = _check_ai_rate_limit("forecast_ai_analysis")
        if blocked:
            return blocked
        body = request.get_json() or {}
        # [Extract scalar fields unchanged from original plan]

        # Validate and sanitize monte_carlo dict (Finding #8)
        monte_carlo_raw = body.get("monte_carlo")
        if monte_carlo_raw is not None and not isinstance(monte_carlo_raw, dict):
            return jsonify({"error": "monte_carlo must be an object or null"}), 400
        monte_carlo = None
        if monte_carlo_raw:
            # Type-coerce all numeric fields to float; default to 0.0 on failure.
            # This prevents non-numeric values (including XSS payloads) from reaching the prompt.
            def _safe_float(v, default=0.0):
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return default
            monte_carlo = {
                "p10_final":            _safe_float(monte_carlo_raw.get("p10_final")),
                "p25_final":            _safe_float(monte_carlo_raw.get("p25_final")),
                "p50_final":            _safe_float(monte_carlo_raw.get("p50_final")),
                "p75_final":            _safe_float(monte_carlo_raw.get("p75_final")),
                "p90_final":            _safe_float(monte_carlo_raw.get("p90_final")),
                "probability_of_target": _safe_float(monte_carlo_raw.get("probability_of_target")),
                "volatility_used":      _safe_float(monte_carlo_raw.get("volatility_used")),
            }

        # Build prompt using sanitized/coerced monte_carlo dict (same structure as original plan)
        # prompt construction logic unchanged; monte_carlo values are now guaranteed floats
        conn = get_db()
        # DO NOT call conn.close() — see note above in forecast_montecarlo()
        try:
            analysis, stop_reason, provider = _call_ai(prompt, conn, max_tokens=1500)
            if analysis is None:
                return jsonify({"error": "AI not configured. Save config via /api/ai/config first."}), 400
            model = get_setting(conn, "ai_model")
            truncated = stop_reason in ("max_tokens", "length")
            return jsonify({"analysis": analysis, "model": model, "provider": provider, "truncated": truncated})
        except Exception:
            app.logger.exception("Forecast AI analysis failed")
            return jsonify({"error": "AI analysis failed. Check server logs."}), 500
```

### Group A: Consolidated Insertion Point (Finding #10)

Remove the contradictory line references from the original plan. The canonical insertion point is:

All new backend additions (cache constants, `_clear_forecast_caches()`, `_compute_portfolio_volatility()`, `_run_monte_carlo()`, route handlers, and prompt template constants) are inserted together as a single new section, placed **after the last existing AI endpoint** (after the budget builder AI route, before the Boot/startup section of `app.py`). The section header is:

```python
# ===========================================================================
# Forecast — Monte Carlo + AI Narrative
# ===========================================================================
```

Within that section, the insertion order (top to bottom) is:
1. Cache constants (`MC_MIN_CALENDAR_DAYS`, `MC_NUM_SIMULATIONS`, etc.)
2. Module-level cache dicts (`_volatility_cache`, `_montecarlo_cache`, `_forecast_cache_lock`)
3. `_clear_forecast_caches()` helper
4. `_compute_portfolio_volatility(conn)` helper
5. `_run_monte_carlo(...)` helper
6. Prompt template constants (`FORECAST_PROMPT_SIMPLE`, `FORECAST_PROMPT_WITH_MC`)
7. `POST /api/forecast/montecarlo` route
8. `POST /api/forecast/ai-analysis` route

The cache invalidation hooks in `_run_sync_worker()` and `save_retirement()` are still inserted at their respective existing locations (those are separate edit points in the file, unchanged).

### Group C: MonteCarloChart.jsx — Legend (Finding #16)

In the `MonteCarloChart.jsx` details block, change all four band `<Area>` components to include `legendType="none"`. The corrected Area declarations:

```jsx
<Area type="monotone" dataKey="band_10_25" stackId="mc" fill={COLOR_ACCENT}
      fillOpacity={0.12} stroke="none" dot={false} legendType="none" />
<Area type="monotone" dataKey="band_25_50" stackId="mc" fill={COLOR_ACCENT}
      fillOpacity={0.20} stroke="none" dot={false} legendType="none" />
<Area type="monotone" dataKey="band_50_75" stackId="mc" fill={COLOR_ACCENT}
      fillOpacity={0.20} stroke="none" dot={false} legendType="none" />
<Area type="monotone" dataKey="band_75_90" stackId="mc" fill={COLOR_ACCENT}
      fillOpacity={0.12} stroke="none" dot={false} legendType="none" />
```

The `<Line>` for the median (`dataKey="p50"`, `name="Median (50th)"`) retains its default legend entry. The legend now shows only one entry: the median line.

### Group C: ForecastAIPanel.jsx — CSS Modules explanation and cross-reference comments (Findings #9, #15)

Replace the CSS sharing note in the original plan's `ForecastAIPanel.jsx` details block (plan line 504) with:

```
  - Note on CSS sharing: ForecastAIPanel imports './AIAnalysisPanel.module.css' directly.
    CSS Modules scopes class names per *file*, not per import site. Both components importing
    the same file receive the same compiled class names — this is intentional and is how
    style sharing works in CSS Modules. If these components ever need to diverge visually,
    they must each have their own module file.

  - Add this comment at the top of ForecastAIPanel.jsx, below the imports:
    // NOTE: This component shares AIAnalysisPanel.module.css intentionally.
    // Style changes in that file affect both AIAnalysisPanel and ForecastAIPanel.
    // The state machine and structure duplicate AIAnalysisPanel.jsx — tracked for
    // future refactor into a shared useAIPanel hook. See AIAnalysisPanel.jsx.

  - Add matching comment at the top of AIAnalysisPanel.jsx (after imports):
    // NOTE: ForecastAIPanel.jsx duplicates this component's state machine and shares
    // this CSS module. Future refactor target: extract useAIPanel hook.
    // See ForecastAIPanel.jsx.
```

### Group C: ProbabilityBadge.jsx — fmtFull import comment (Finding #18)

Add the following inline comment to the `fmtFull` import line in `ProbabilityBadge.jsx`:

```jsx
// fmtFull is a general currency formatter; lives in chartUtils pending a future formatUtils extraction
import { fmtFull } from './chartUtils.jsx'
```

### Group D: ForecastingPage.jsx — runSimulation guard, forecastAiPayload memoization, error constant (Findings #6, #12, #19)

Replace the relevant sections of the `ForecastingPage.jsx` details block:

```
  - Add named constant at the top of the component file (or in a constants block near imports):
    // Coupling note: this string must match the backend's JSON "error" field in the 422 response.
    // See POST /api/forecast/montecarlo in app.py.
    const MC_INSUFFICIENT_HISTORY_ERROR = 'insufficient_history'

  - runSimulation — add early-return guard as the first statement:
    async function runSimulation() {
      if (mcLoading) return   // Guard: prevent concurrent calls on fast double-click
      setMcLoading(true)
      setMcError(null)
      try {
        // ... body unchanged ...
      } catch (err) {
        // Use named constant instead of inline string for coupling documentation
        if (err.message && err.message.includes(MC_INSUFFICIENT_HISTORY_ERROR)) {
          setMcError('insufficient_data')
        } else {
          setMcError(err.message || 'Simulation failed')
        }
      } finally {
        setMcLoading(false)
      }
    }

  - forecastAiPayload — wrap in useMemo:
    const forecastAiPayload = useMemo(() => ({
      portfolio_value: investableCapital,
      monthly_contribution: effectiveContribution,
      annual_return_pct: effectiveReturnRate,
      years_to_retirement: yearsToRetirement,
      nest_egg_target: nestEgg ?? null,
      cagr_1y: typeData?.cagr?.Retirement?.['1y'] ?? null,
      on_track: /* Phase 4 computed value */ null,
      monte_carlo: mcResult ? {
        p10_final: mcResult.bands?.[mcResult.bands.length - 1]?.p10 ?? null,
        p25_final: mcResult.bands?.[mcResult.bands.length - 1]?.p25 ?? null,
        p50_final: mcResult.bands?.[mcResult.bands.length - 1]?.p50 ?? null,
        p75_final: mcResult.bands?.[mcResult.bands.length - 1]?.p75 ?? null,
        p90_final: mcResult.bands?.[mcResult.bands.length - 1]?.p90 ?? null,
        probability_of_target: mcResult.probability_of_target ?? null,
        volatility_used: mcResult.volatility_used ?? null,
      } : null,
    }), [investableCapital, effectiveContribution, effectiveReturnRate,
         yearsToRetirement, nestEgg, mcResult])

  - Add useMemo to the React import line (it is likely already imported for Phase 4, but confirm).
```

### Group E: Test Files — `_make_investment_db_with_history()` and `_run_monte_carlo` seed (Findings #11, #14)

Replace the test helper and affected test details:

```
File: /home/user/stashtrend/backend/tests/test_forecast.py
Description: Seeded test helper and seed parameter passed to _run_monte_carlo in all tests.

  - _make_investment_db_with_history() — add fixed seed at the start:
    def _make_investment_db_with_history(days=120):
        """Seed an account + account_history rows for volatility testing."""
        random.seed(42)   # Fixed seed for test determinism; restore not needed (test isolation)
        db = make_test_db()
        # ... rest of helper unchanged ...

  - All TestRunMonteCarlo tests that call _run_monte_carlo() directly must pass seed=42:
    - test_montecarlo_returns_correct_bands_shape: _run_monte_carlo(..., seed=42)
    - test_montecarlo_p10_less_than_p50_less_than_p90: _run_monte_carlo(..., seed=42)
    - test_montecarlo_starting_value_correct: _run_monte_carlo(..., seed=42)
    - test_montecarlo_probability_0_when_target_huge: _run_monte_carlo(..., seed=42)
    - test_montecarlo_probability_100_when_target_trivial: _run_monte_carlo(..., seed=42)
    - test_montecarlo_negative_return_allowed: _run_monte_carlo(..., seed=42)
    - test_montecarlo_cache_miss_different_params: both calls pass different seeds to avoid
      the cache check interfering (call with seed=42 then seed=43, or clear cache between calls)

  - test_montecarlo_cache_hit: call twice with identical args including seed=42.
    The cache key does NOT include seed (seed is not in the repr tuple), so the second call
    is a cache hit regardless of seed — this is correct behavior.

  - HTTP endpoint tests (TestForecastMontecarlo) call the endpoint via the Flask test client,
    so they do not pass seed directly. The non-determinism in these tests is acceptable because
    the assertions check structural properties (response shape, status codes) not specific values.

  - Add test for new seed parameter:
    test_montecarlo_seed_produces_deterministic_output:
      r1 = _run_monte_carlo(500000, 2000, 7.0, 10, None, 0.15, seed=42)
      r2 = _run_monte_carlo(500000, 2000, 7.0, 10, None, 0.15, seed=42)
      # Must clear cache between calls to force recomputation
      _clear_forecast_caches()
      r3 = _run_monte_carlo(500000, 2000, 7.0, 10, None, 0.15, seed=42)
      assert r1["bands"] == r3["bands"]   # same seed → same result after cache clear
```

---

## Unchanged Sections

The following sections from the original plan require no changes and should be carried forward as-is:

- **Overview** (summary paragraph)
- **Group A — `requirements.txt`** (add `numpy>=1.24.0`)
- **Group A — Cache infrastructure constants and module-level dicts** (the constants block and `_clear_forecast_caches()` function body are unchanged; only the insertion point is clarified per Finding #10)
- **Group A — Cache invalidation in `_run_sync_worker()` (line 537)**
- **Group A — Cache invalidation in `save_retirement()` (line 2411)**
- **Group B — `api.js`** (add `runMonteCarlo` and `runForecastAiAnalysis` exports)
- **Group C — `ViewToggle.jsx`** (segmented control component)
- **Group C — `ViewToggle.module.css`**
- **Group C — `ProbabilityBadge.module.css`**
- **Group C — `MonteCarloChart.module.css`**
- **Group D — `ForecastingPage.module.css`** (CSS classes for simulation controls)
- **Group D — `ForecastingPage.jsx` JSX layout** (ViewToggle placement, advanced section structure, `ProbabilityBadge`, `MonteCarloChart`, `ForecastAIPanel` wiring — unchanged except for the `runSimulation` guard and `useMemo` from Finding #12/#19)
- **Group E — `ViewToggle.test.jsx`**
- **Group E — `ProbabilityBadge.test.jsx`**
- **Group E — `MonteCarloChart.test.jsx`**
- **Group E — `ForecastAIPanel.test.jsx`**
- **Group E — `frontend/src/test/fixtures.js`**
- **Dependency Order** (Level 0/1/2/3 grouping is unchanged; insertion point clarification in Finding #10 does not affect dependency topology)
- **Test Strategy** (overall strategy unchanged; individual test adjustments are captured in the corrected sections above)
- **Rollback Notes**
- **Key Implementation Notes** (notes 1, 2, 4, 6, 7, 8 — note 3 is superseded by Finding #9 correction; note 5 is superseded by Finding #2 correction)

---

## Key Implementation Notes — Corrections

The following notes from the original plan's "Key Implementation Notes" section are corrected or superseded:

**Note 3 (AI panel CSS sharing) — corrected per Finding #9:**
CSS Modules scopes class names per *file*, not per import site. Two components importing the same module file get the exact same compiled class names — there is no scope isolation between them. `ForecastAIPanel.jsx` and `AIAnalysisPanel.jsx` both import `AIAnalysisPanel.module.css` and render with the same compiled selectors. This is correct for the shared-style goal. A cross-reference comment must be added in both files (see corrected section above).

**Note 5 (422 vs 400 for insufficient data) — corrected per Finding #2 and #17:**
The 422 response body is simplified to `{"error": "insufficient_history"}` only. The `volatility_used` and `volatility_source` fields are removed from the error response — they were redundant and the frontend does not consume them from the error path. The `conn.close()` calls in both route handlers are removed; `get_db()` connections are managed by Flask's teardown context.
