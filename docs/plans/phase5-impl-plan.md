# Phase 5 Implementation Plan — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Author:** Engineer Agent (Initial Plan)
**Status:** Ready for staff review
**Depends on:** Phase 4 (ForecastingPage, ForecastingChart) — Phase 5 code must be integrated after Phase 4 merges

---

## Overview

Phase 5 adds two analytical depth layers to the Phase 4 Forecasting page:

1. **Backend Monte Carlo engine** — a new `POST /api/forecast/montecarlo` Flask route that runs 5,000 GBM simulations using numpy-vectorized math. Volatility is computed internally from `account_history` with contribution adjustment and cached separately from simulation results. Both caches live in module-level Python dicts with a shared threading lock.

2. **Backend AI narrative endpoint** — a new `POST /api/forecast/ai-analysis` Flask route that calls `_call_ai()` with a context-adaptive prompt (Variant A: simple projection; Variant B: with Monte Carlo data). Rate-limited via the existing `_check_ai_rate_limit` pattern.

3. **Frontend additions** — four new components (`ViewToggle`, `MonteCarloChart`, `ProbabilityBadge`, `ForecastAIPanel`) and modifications to `ForecastingPage.jsx` and `api.js`. The `MonteCarloChart` uses a stacked-delta `ComposedChart` pattern matching `TypeStackedChart.jsx`. `ForecastAIPanel` follows `AIAnalysisPanel.jsx` structure with a shared CSS module.

4. **No new database tables.** Cache invalidation hooks are added to `_run_sync_worker()` (line 537) and `save_retirement()` (line 2411).

Implementation is organized so that all backend changes are independent of all frontend changes, enabling parallel implementation. Within the backend, the cache infrastructure and helper functions must exist before the route handlers. Within the frontend, leaf components are independent of each other, while `ForecastingPage.jsx` depends on all new components.

---

## Changes

### Group A: Backend Infrastructure (no dependencies outside this group)

---

```
File: /home/user/stashtrend/backend/requirements.txt
Lines: append after line 8 (after `openai>=1.30.0`)
Parallelism: independent
Description: Add numpy as a new dependency for vectorized GBM simulation.
Details:
  - Append `numpy>=1.24.0` as a new line
  - No other changes to this file
```

---

```
File: /home/user/stashtrend/backend/app.py
Lines: new block, insert after line 1509 (after the `_ai_cooldowns_lock` declaration at ~line 1514, before the `_check_ai_rate_limit` function)
Parallelism: independent (backend-only, does not affect frontend)
Description: Add Monte Carlo cache infrastructure — module-level dicts, threading lock, and clear helper. These declarations must precede all forecast route handlers.
Details:
  - Add import `import hashlib` at the top of app.py (alongside existing stdlib imports)
  - Add module-level constants block after the AI cooldown declarations (around line 1514):

    # ---------------------------------------------------------------------------
    # Forecast / Monte Carlo cache
    # ---------------------------------------------------------------------------
    # Volatility computation constants
    MC_MIN_CALENDAR_DAYS    = 90
    MC_MIN_DATA_POINTS      = 60
    MC_OUTLIER_STD_THRESHOLD = 3.0
    MC_OUTLIER_ABS_THRESHOLD = 0.10   # 10% single-day absolute return
    MC_FALLBACK_VOLATILITY  = 0.15
    MC_MIN_VOLATILITY_FLOOR = 0.01
    MC_TRADING_DAYS_PER_YEAR = 252
    MC_CONTRIBUTION_TRADING_DAYS = 21
    MC_NUM_SIMULATIONS      = 5000
    MC_MAX_CACHE_ENTRIES    = 10

    # Module-level cache state (single-user app; protected by _forecast_cache_lock)
    _volatility_cache = {}   # {"key": str, "result": dict}  — single entry
    _montecarlo_cache = {}   # {param_hash: result_dict}     — up to MC_MAX_CACHE_ENTRIES
    _forecast_cache_lock = threading.Lock()

  - Add `_clear_forecast_caches()` helper function immediately after the cache declarations:

    def _clear_forecast_caches():
        """Clear both forecast caches. Thread-safe. Called on sync complete and settings save."""
        with _forecast_cache_lock:
            _volatility_cache.clear()
            _montecarlo_cache.clear()
```

---

```
File: /home/user/stashtrend/backend/app.py
Lines: new functions, insert after _clear_forecast_caches() and before the forecast route handlers
Parallelism: depends-on: cache infrastructure block above
Description: Add _compute_portfolio_volatility() and _run_monte_carlo() helper functions.
Details:
  - Add `_compute_portfolio_volatility(conn)` function:
    - Query accounts table for investment bucket accounts (Retirement + Brokerage only):
      SELECT id, type, subtype FROM accounts WHERE include_in_net_worth = 1
    - Filter using _get_bucket() to only accounts where bucket in ('Retirement', 'Brokerage')
    - Check volatility cache: compute key as hash of sorted account IDs + date range
    - If cache hit (key matches), return cached result dict
    - Query account_history for matching account IDs:
      SELECT account_id, date, balance FROM account_history
      WHERE account_id IN (...) ORDER BY date ASC
    - Aggregate: sum daily balances across accounts into a single portfolio series dict {date: total_balance}
    - Count calendar days span (max_date - min_date). If span < MC_MIN_CALENDAR_DAYS, return {"volatility": MC_FALLBACK_VOLATILITY, "source": "fallback", "insufficient_data": True}
    - Compute daily log returns using numpy:
      import numpy as np
      dates = sorted(portfolio_series.keys())
      balances = np.array([portfolio_series[d] for d in dates])
      # Remove zero-balance entries
      nonzero_mask = balances > 0
      balances = balances[nonzero_mask]
      dates_clean = [d for d, m in zip(dates, nonzero_mask) if m]
      if len(balances) < 2: return fallback
      log_returns = np.diff(np.log(balances))
    - Contribution noise adjustment (subtract estimated daily contribution from balance change):
      Read monthly_contribution from retirement_settings table (default 0 if not set)
      daily_contribution_approx = monthly_contribution / MC_CONTRIBUTION_TRADING_DAYS
      # Adjust log returns by removing contribution effect:
      # adjusted_balance[t] = balance[t] - daily_contribution_approx * days_elapsed
      # Recompute log returns on adjusted balances
      # (Simple approach: subtract contribution from balance before log-return if balance increased)
    - Outlier filter: compute mean and std of log_returns
      mask = (np.abs(log_returns - log_returns.mean()) < MC_OUTLIER_STD_THRESHOLD * log_returns.std()) & (np.abs(log_returns) < MC_OUTLIER_ABS_THRESHOLD)
      clean_returns = log_returns[mask]
    - If len(clean_returns) < MC_MIN_DATA_POINTS: return fallback dict
    - Annualize: sigma = float(clean_returns.std() * np.sqrt(MC_TRADING_DAYS_PER_YEAR))
    - Floor: if sigma < MC_MIN_VOLATILITY_FLOOR: sigma = MC_MIN_VOLATILITY_FLOOR; log warning
    - Cache result with computed key (overwrite single-entry cache)
    - Return {"volatility": sigma, "source": "account_history", "insufficient_data": False}

  - Add `_run_monte_carlo(portfolio_value, monthly_contribution, annual_return_pct, years, nest_egg_target, volatility)` function:
    - import numpy as np at function level (or top of module)
    - Parameters: all numeric scalars
    - Build cache key: hashlib.sha256(repr((round(portfolio_value, -3), monthly_contribution, annual_return_pct, years, nest_egg_target, round(volatility, 4))).encode()).hexdigest()
    - Check _montecarlo_cache. If hit, return cached result with "cached": True
    - Simulation:
      mu = annual_return_pct / 100.0
      sigma = volatility
      dt = 1.0 / 12  # monthly
      months = int(years * 12)
      rng = np.random.default_rng()  # non-seeded for each run
      Z = rng.standard_normal((MC_NUM_SIMULATIONS, months))
      growth_factors = np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z)
      # Build path matrix: shape (MC_NUM_SIMULATIONS, months+1)
      paths = np.empty((MC_NUM_SIMULATIONS, months + 1))
      paths[:, 0] = portfolio_value
      for t in range(months):
          paths[:, t+1] = (paths[:, t] + monthly_contribution) * growth_factors[:, t]
    - Extract percentiles at each month:
      pcts = np.percentile(paths, [10, 25, 50, 75, 90], axis=0)  # shape (5, months+1)
    - Build bands list: for i in range(months+1), compute date = start_date + i months
      start_date = datetime.now(timezone.utc).replace(day=1)
      bands = [{"month": i, "date": date_str, "p10": float(pcts[0,i]), "p25": float(pcts[1,i]), "p50": float(pcts[2,i]), "p75": float(pcts[3,i]), "p90": float(pcts[4,i])} for i in range(months+1)]
    - Probability of target: if nest_egg_target is not None and nest_egg_target > 0:
      prob = float(np.mean(paths[:, -1] >= nest_egg_target) * 100)
      else prob = None
    - Build result dict:
      result = {"bands": bands, "probability_of_target": prob, "volatility_used": volatility, "volatility_source": ..., "num_simulations": MC_NUM_SIMULATIONS, "cached": False}
    - LRU eviction: if len(_montecarlo_cache) >= MC_MAX_CACHE_ENTRIES, pop oldest key (dict insertion order)
    - Store in _montecarlo_cache[cache_key] = result (under _forecast_cache_lock)
    - Return result
```

---

```
File: /home/user/stashtrend/backend/app.py
Lines: new route handlers, insert after _run_monte_carlo() function and before the existing AI Config section (before line ~1506)
Parallelism: depends-on: helper functions above
Description: Add POST /api/forecast/montecarlo and POST /api/forecast/ai-analysis route handlers.
Details:
  - Add section header comment:
    # ===========================================================================
    # Forecast — Monte Carlo + AI Narrative
    # ===========================================================================

  - Add prompt template constants immediately before the routes:
    FORECAST_PROMPT_SIMPLE = """You are a personal finance advisor..."""  (exact text from requirements §4.2 Variant A)
    FORECAST_PROMPT_WITH_MC = """You are a personal finance advisor...""" (exact text from requirements §4.2 Variant B)
    Both templates use Python str.format() placeholders: {portfolio_value}, {monthly_contribution}, etc.

  - Add `POST /api/forecast/montecarlo` route:
    @app.route("/api/forecast/montecarlo", methods=["POST"])
    def forecast_montecarlo():
        body = request.get_json() or {}
        # Validate inputs:
        portfolio_value = body.get("portfolio_value")
        if portfolio_value is None or not isinstance(portfolio_value, (int, float)) or portfolio_value < 0:
            return jsonify({"error": "portfolio_value is required and must be >= 0"}), 400
        years = body.get("years")
        if years is None or not isinstance(years, (int, float)) or years < 1 or years > 50:
            return jsonify({"error": "years is required and must be between 1 and 50"}), 400
        monthly_contribution = body.get("monthly_contribution", 0)
        if not isinstance(monthly_contribution, (int, float)) or monthly_contribution < 0:
            return jsonify({"error": "monthly_contribution must be >= 0"}), 400
        annual_return_pct = body.get("annual_return_pct", 7.0)
        if not isinstance(annual_return_pct, (int, float)) or annual_return_pct < -5.0 or annual_return_pct > 30.0:
            return jsonify({"error": "annual_return_pct must be between -5.0 and 30.0"}), 400
        nest_egg_target = body.get("nest_egg_target")  # optional
        if nest_egg_target is not None and (not isinstance(nest_egg_target, (int, float)) or nest_egg_target < 0):
            return jsonify({"error": "nest_egg_target must be >= 0"}), 400
        conn = get_db()
        try:
            vol_result = _compute_portfolio_volatility(conn)
            if vol_result.get("insufficient_data"):
                # Return 422 to let frontend show the insufficient data warning
                return jsonify({"error": "insufficient_history", "volatility_source": "fallback", "volatility_used": MC_FALLBACK_VOLATILITY}), 422
            volatility = vol_result["volatility"]
            result = _run_monte_carlo(portfolio_value, monthly_contribution, annual_return_pct, years, nest_egg_target, volatility)
            result["volatility_source"] = vol_result["source"]
            return jsonify(result)
        except Exception:
            app.logger.exception("Monte Carlo simulation failed")
            return jsonify({"error": "Simulation failed. Check server logs."}), 500
        finally:
            conn.close()

    NOTE on the 422 response: The architecture says to return a 422 when data is insufficient. The frontend checks for this status code and shows the warning banner with a disabled button. This differs from the architecture doc which mentions `volatility_unavailable` flag — the 422 with an explicit `error` key is more consistent with the REST pattern used throughout this codebase and easier to distinguish from a 400 validation error.

  - Add `POST /api/forecast/ai-analysis` route:
    @app.route("/api/forecast/ai-analysis", methods=["POST"])
    def forecast_ai_analysis():
        blocked = _check_ai_rate_limit("forecast_ai_analysis")
        if blocked:
            return blocked
        body = request.get_json() or {}
        # Extract and sanitize fields (all numeric — sanitize as strings for prompt safety)
        portfolio_value = body.get("portfolio_value", 0)
        monthly_contribution = body.get("monthly_contribution", 0)
        annual_return_pct = body.get("annual_return_pct", 7.0)
        years_to_retirement = body.get("years_to_retirement", 0)
        nest_egg_target = body.get("nest_egg_target")
        cagr_1y = body.get("cagr_1y")
        on_track = body.get("on_track")
        monte_carlo = body.get("monte_carlo")  # optional dict or None
        # Build prompt (Variant A or B)
        if monte_carlo:
            prompt = FORECAST_PROMPT_WITH_MC.format(
                portfolio_value=_sanitize_prompt_field(f"${portfolio_value:,.0f}"),
                monthly_contribution=_sanitize_prompt_field(f"${monthly_contribution:,.0f}"),
                cagr_1y=_sanitize_prompt_field(str(cagr_1y) if cagr_1y is not None else "N/A"),
                annual_return_pct=_sanitize_prompt_field(str(annual_return_pct)),
                years_to_retirement=_sanitize_prompt_field(str(years_to_retirement)),
                nest_egg_target=_sanitize_prompt_field(f"${nest_egg_target:,.0f}" if nest_egg_target else "Not set"),
                on_track=_sanitize_prompt_field("Yes" if on_track else "No"),
                p10_final=_sanitize_prompt_field(f"${monte_carlo.get('p10_final',0):,.0f}"),
                p25_final=_sanitize_prompt_field(f"${monte_carlo.get('p25_final',0):,.0f}"),
                p50_final=_sanitize_prompt_field(f"${monte_carlo.get('p50_final',0):,.0f}"),
                p75_final=_sanitize_prompt_field(f"${monte_carlo.get('p75_final',0):,.0f}"),
                p90_final=_sanitize_prompt_field(f"${monte_carlo.get('p90_final',0):,.0f}"),
                probability_of_target=_sanitize_prompt_field(str(monte_carlo.get('probability_of_target', 'N/A'))),
                volatility_used=_sanitize_prompt_field(str(monte_carlo.get('volatility_used', 'N/A'))),
            )
        else:
            prompt = FORECAST_PROMPT_SIMPLE.format(
                portfolio_value=_sanitize_prompt_field(f"${portfolio_value:,.0f}"),
                monthly_contribution=_sanitize_prompt_field(f"${monthly_contribution:,.0f}"),
                cagr_1y=_sanitize_prompt_field(str(cagr_1y) if cagr_1y is not None else "N/A"),
                annual_return_pct=_sanitize_prompt_field(str(annual_return_pct)),
                years_to_retirement=_sanitize_prompt_field(str(years_to_retirement)),
                nest_egg_target=_sanitize_prompt_field(f"${nest_egg_target:,.0f}" if nest_egg_target else "Not set"),
                on_track=_sanitize_prompt_field("Yes" if on_track else "No"),
            )
        conn = get_db()
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
        finally:
            conn.close()
```

---

```
File: /home/user/stashtrend/backend/app.py
Lines: line 537 (inside _run_sync_worker, after update_sync_job call)
Parallelism: depends-on: cache infrastructure block above
Description: Invalidate both forecast caches when a sync completes (new account_history data may change volatility).
Details:
  - After line 537 (the `update_sync_job(conn, job_id, ...)` call), add:
    _clear_forecast_caches()
  - This is inside _run_sync_worker(), which runs in a background thread — the lock in _clear_forecast_caches() makes this safe
```

---

```
File: /home/user/stashtrend/backend/app.py
Lines: line 2411 (inside save_retirement, after conn.commit() on successful save)
Parallelism: depends-on: cache infrastructure block above
Description: Invalidate Monte Carlo cache when retirement settings change (simulation inputs changed; volatility unchanged).
Details:
  - After `conn.commit()` at line 2411 and before `return jsonify({"ok": True})`, add:
    with _forecast_cache_lock:
        _montecarlo_cache.clear()
  - Do NOT clear _volatility_cache here — volatility only changes when account_history changes (on sync)
  - This avoids calling _clear_forecast_caches() which would also wipe the volatility cache unnecessarily
```

---

### Group B: Frontend API Layer (independent of Group A)

```
File: /home/user/stashtrend/frontend/src/api.js
Lines: append after line 81 (after the existing `saveRetirement` export)
Parallelism: independent
Description: Add two new API call exports for Monte Carlo simulation and forecast AI analysis.
Details:
  - Append after the Retirement section:

    // ── Forecast (Phase 5) ────────────────────────────────────────────────────
    export const runMonteCarlo = (body) => postJSON('/api/forecast/montecarlo', body)
    export const runForecastAiAnalysis = (body) => postJSON('/api/forecast/ai-analysis', body)

  - `postJSON` is already exported (line 21). Both functions follow the exact pattern of `generateBudgetPlan` (line 71).
  - No changes to any existing exports.
```

---

### Group C: New Frontend Components (independent of each other; depend on Group B for imports)

---

```
File: /home/user/stashtrend/frontend/src/components/ViewToggle.jsx
Lines: new file
Parallelism: independent
Description: Segmented control for Simple/Advanced view switching. Follows RangeSelector pattern.
Details:
  - Props: { view: 'simple'|'advanced', onChange: fn }
  - Render a <div role="group" aria-label="Projection view"> containing two <button> elements
  - Each button uses role="radio" and aria-checked={view === buttonValue}
  - onClick calls onChange(buttonValue)
  - Apply styles.active CSS class to the matching button
  - Import styles from './ViewToggle.module.css'
  - Add PropTypes validation: view PropTypes.oneOf(['simple','advanced']).isRequired, onChange PropTypes.func.isRequired
  - data-testid="view-toggle" on the outer div
  - Each button: data-testid="view-toggle-simple" and data-testid="view-toggle-advanced"
```

---

```
File: /home/user/stashtrend/frontend/src/components/ViewToggle.module.css
Lines: new file
Parallelism: depends-on: ViewToggle.jsx (CSS for that component)
Description: Styles for the segmented control, taken from design spec exactly.
Details:
  - .group: inline-flex, background var(--bg-card), border 1px solid var(--border), border-radius var(--radius-pill), padding 3px, gap 2px
  - .btn: padding 8px 16px, border-radius var(--radius-pill), border 1px solid transparent, background transparent, color var(--text-secondary), font-size 13px, cursor pointer, transition for background/color/border-color at 200ms ease (var(--ease-default))
  - .btn:hover:not(.active): background var(--bg-hover), color var(--text-primary)
  - .btn.active: background var(--accent-tint), color var(--accent), border-color var(--accent-border-hover), font-weight 500
  - .btn:focus-visible: outline 2px solid var(--border-focus), outline-offset 2px
  - @media (max-width: 767px): .group { width: 100% }, .btn { flex: 1; text-align: center }
```

---

```
File: /home/user/stashtrend/frontend/src/components/ProbabilityBadge.jsx
Lines: new file
Parallelism: independent
Description: Color-coded probability display. "73.2% chance of reaching your $2,000,000 target". Hidden when probability or nestEgg is null.
Details:
  - Props: { probability: number|null, nestEgg: number|null }
  - If probability is null or nestEgg is null, return null (render nothing)
  - Color logic:
    - probability >= 70: styles.green (COLOR_POSITIVE: #2ECC8A)
    - probability >= 40: styles.amber (COLOR_AMBER: #F5A623)
    - below 40: styles.red (COLOR_NEGATIVE: #FF5A7A)
  - Render:
    <div className={`${styles.badge} ${colorClass}`} role="status" aria-live="polite">
      <span className={styles.pct}>{probability.toFixed(1)}%</span>
      <span className={styles.label}>chance of reaching your {fmtFull(nestEgg)} target</span>
    </div>
  - Import fmtFull from './chartUtils.jsx'
  - Import styles from './ProbabilityBadge.module.css'
  - PropTypes: probability PropTypes.number, nestEgg PropTypes.number
  - data-testid="probability-badge"
```

---

```
File: /home/user/stashtrend/frontend/src/components/ProbabilityBadge.module.css
Lines: new file
Parallelism: depends-on: ProbabilityBadge.jsx
Description: Styles for the probability badge card.
Details:
  - .badge: display flex, align-items center, gap 8px, padding 12px 16px, border-radius var(--radius-card), border 1px solid var(--border), background var(--bg-card), margin-bottom var(--sp-4)
  - .pct: font-size 28px, font-weight 700, line-height 1
  - .label: font-size 14px, color var(--text-secondary)
  - .green .pct: color #2ECC8A (COLOR_POSITIVE)
  - .amber .pct: color #F5A623 (COLOR_AMBER)
  - .red .pct: color #FF5A7A (COLOR_NEGATIVE)
  - .green: border-color rgba(46,204,138,0.2)
  - .amber: border-color rgba(245,166,35,0.2)
  - .red: border-color rgba(255,90,122,0.2)
```

---

```
File: /home/user/stashtrend/frontend/src/components/MonteCarloChart.jsx
Lines: new file
Parallelism: independent
Description: Stacked delta area chart for probability bands using ComposedChart. Displays p10/p25/p50/p75/p90 percentile bands with a solid median line and a custom tooltip showing absolute values.
Details:
  - Props: { bands: array } — each band object has { month, date, p10, p25, p50, p75, p90 }
  - If !bands or bands.length === 0, render loading placeholder div
  - Data transformation (done inside component, not in a utility):
    const chartData = bands.map(b => ({
      date: b.date,
      base: b.p10,
      band_10_25: b.p25 - b.p10,
      band_25_50: b.p50 - b.p25,
      band_50_75: b.p75 - b.p50,
      band_75_90: b.p90 - b.p75,
      p50: b.p50,      // keep absolute p50 for the Line overlay
      // keep original values for tooltip
      _p10: b.p10, _p25: b.p25, _p50: b.p50, _p75: b.p75, _p90: b.p90,
    }))
  - Custom tooltip component (inline):
    - Receives { active, payload, label }
    - Find the data point by label match (or use payload[0].payload directly)
    - Display all 5 absolute percentile values using fmtFull()
    - Use TOOLTIP_STYLE from chartUtils.jsx
  - Chart structure:
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ComposedChart data={chartData} margin={{top:10, right:10, left:10, bottom:0}}>
        {sharedChartElements({ yAxisWidth, tooltip: <MonteCarloTooltip /> })}
        <defs>
          <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_ACCENT} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COLOR_ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Transparent base anchoring the stack at p10 */}
        <Area type="monotone" dataKey="base" stackId="mc" fill="transparent" stroke="none" dot={false} legendType="none" />
        {/* p10-p25 band — lightest */}
        <Area type="monotone" dataKey="band_10_25" stackId="mc" fill={COLOR_ACCENT} fillOpacity={0.12} stroke="none" dot={false} name="10th–25th" />
        {/* p25-p50 band — medium */}
        <Area type="monotone" dataKey="band_25_50" stackId="mc" fill={COLOR_ACCENT} fillOpacity={0.20} stroke="none" dot={false} name="25th–50th" />
        {/* p50-p75 band — medium */}
        <Area type="monotone" dataKey="band_50_75" stackId="mc" fill={COLOR_ACCENT} fillOpacity={0.20} stroke="none" dot={false} name="50th–75th" />
        {/* p75-p90 band — lightest */}
        <Area type="monotone" dataKey="band_75_90" stackId="mc" fill={COLOR_ACCENT} fillOpacity={0.12} stroke="none" dot={false} name="75th–90th" />
        {/* Solid median line */}
        <Line type="monotone" dataKey="p50" stroke={COLOR_ACCENT} strokeWidth={2} dot={false} name="Median (50th)" />
        <Legend iconType="line" wrapperStyle={{ color: '#8BA8CC', fontSize: 12 }} />
      </ComposedChart>
    </ResponsiveContainer>
  - Import: ComposedChart, Area, Line, Legend, ResponsiveContainer from 'recharts'
  - Import: sharedChartElements, fmtFull, fmtCompact, TOOLTIP_STYLE, COLOR_ACCENT, AXIS_TICK from './chartUtils.jsx'
  - Import: useResponsive from '../hooks/useResponsive.js'
  - Import: PropTypes; import styles from './MonteCarloChart.module.css'
  - chartHeight: isMobile ? 240 : 320; yAxisWidth: isMobile ? 52 : 72
  - data-testid="montecarlo-chart" on the outer wrapper div
  - PropTypes: bands PropTypes.arrayOf(PropTypes.shape({ month: PropTypes.number, date: PropTypes.string, p10: PropTypes.number, p25: PropTypes.number, p50: PropTypes.number, p75: PropTypes.number, p90: PropTypes.number }))
```

---

```
File: /home/user/stashtrend/frontend/src/components/MonteCarloChart.module.css
Lines: new file
Parallelism: depends-on: MonteCarloChart.jsx
Description: Container and skeleton styles for the Monte Carlo chart.
Details:
  - .container: position relative (for skeleton overlay)
  - .skeleton: position absolute, inset 0, background linear-gradient (shimmer animation), border-radius var(--radius-card), display flex, align-items center, justify-content center
  - .skeletonText: color var(--text-muted), font-size 13px
  - .chartTitle: font-size 14px, font-weight 600, color var(--text-primary), margin-bottom var(--sp-3)
```

---

```
File: /home/user/stashtrend/frontend/src/components/ForecastAIPanel.jsx
Lines: new file
Parallelism: independent (does not depend on MonteCarloChart or ViewToggle)
Description: AI narrative panel for forecast context. Identical visual structure to AIAnalysisPanel.jsx but sends a rich POST body and uses different loading text. Shares AIAnalysisPanel.module.css.
Details:
  - Props: { payload: object } — the POST body to send to /api/forecast/ai-analysis
    payload shape: { portfolio_value, monthly_contribution, annual_return_pct, years_to_retirement, nest_egg_target, cagr_1y, on_track, monte_carlo }
  - Import styles from './AIAnalysisPanel.module.css' (shared, not a new file)
  - Import { fetchAiConfig, saveAiConfig, runForecastAiAnalysis } from '../api.js'
  - State: expanded (bool, false), config (null|object), status ('idle'|'running'|'done'), analysis (string), error (string)
  - Config form state: provider, apiKey, model, baseUrl (identical to AIAnalysisPanel)
  - useEffect on mount: fetchAiConfig().then(setConfig).catch(() => setConfig({ configured: false }))
  - runAnalysis(): setStatus('running'), call runForecastAiAnalysis(payload), set analysis from data.analysis, setStatus('done') on success; setError + setStatus('idle') on error
  - handleConfigSubmit(e): save config, then call runAnalysis()
  - handleReconfigure(): reset config form state, set config.configured=false, reset status/analysis
  - JSX structure is IDENTICAL to AIAnalysisPanel.jsx with these differences:
    - Header text: "✦ Analyze Forecast with AI" (not "Analyze with AI")
    - Spinner text: "Analyzing your forecast data..." (not "budget data")
    - runAnalysis() calls runForecastAiAnalysis(payload) instead of runAiAnalysis()
  - data-testid="forecast-ai-panel" on the outer .panel div
  - Note on CSS sharing: both components import from './AIAnalysisPanel.module.css'. CSS modules scope by component, so ForecastAIPanel's className references resolve to the same compiled selectors — this is intentional and maintains visual consistency.
```

---

### Group D: ForecastingPage Integration (depends on Phase 4 + Group C)

```
File: /home/user/stashtrend/frontend/src/pages/ForecastingPage.jsx
Lines: modify existing Phase 4 file — all sections noted relative to Phase 4's structure
Parallelism: depends-on: ViewToggle.jsx, MonteCarloChart.jsx, ProbabilityBadge.jsx, ForecastAIPanel.jsx, api.js changes
Description: Add Simple/Advanced toggle, Monte Carlo simulation state machine, and AI panel to the Forecasting page. Phase 4 props/layout are the host; Phase 5 adds state and components.
Details:
  Phase 4 delivers ForecastingPage.jsx with these assumed state variables (from architecture doc):
    - retirementSettings (from GET /api/retirement)
    - typeData (from GET /api/networth/by-type)
    - slider-overridden contribution and return rate values

  Add these Phase 5 state variables (at the top of the component body alongside Phase 4 state):
    const [view, setView] = useState('simple')          // 'simple' | 'advanced'
    const [mcResult, setMcResult] = useState(null)      // null | simulation result object
    const [mcLoading, setMcLoading] = useState(false)
    const [mcError, setMcError] = useState(null)        // null | error message string

  Add imports at top of file:
    import ViewToggle from '../components/ViewToggle.jsx'
    import MonteCarloChart from '../components/MonteCarloChart.jsx'
    import ProbabilityBadge from '../components/ProbabilityBadge.jsx'
    import ForecastAIPanel from '../components/ForecastAIPanel.jsx'
    import { runMonteCarlo } from '../api.js'

  Add runSimulation callback:
    async function runSimulation() {
      setMcLoading(true)
      setMcError(null)
      try {
        const body = {
          portfolio_value: investableCapital,          // from Phase 4's computed value
          monthly_contribution: effectiveContribution, // slider-overridden value
          annual_return_pct: effectiveReturnRate,      // slider-overridden value
          years: yearsToRetirement,
          nest_egg_target: nestEgg ?? undefined,       // omit if null
        }
        const result = await runMonteCarlo(body)
        setMcResult(result)
      } catch (err) {
        // Handle 422 (insufficient data) specifically
        if (err.message && err.message.includes('insufficient_history')) {
          setMcError('insufficient_data')
        } else {
          setMcError(err.message || 'Simulation failed')
        }
      } finally {
        setMcLoading(false)
      }
    }

  Build forecastAiPayload object for ForecastAIPanel:
    const forecastAiPayload = {
      portfolio_value: investableCapital,
      monthly_contribution: effectiveContribution,
      annual_return_pct: effectiveReturnRate,
      years_to_retirement: yearsToRetirement,
      nest_egg_target: nestEgg ?? null,
      cagr_1y: typeData?.cagr?.Retirement?.['1y'] ?? null,  // blended CAGR from Phase 4
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
    }

  JSX layout additions (insert into the existing chart card, after the ForecastingChart and before any existing summary cards):

  1. Add ViewToggle in the chart card header row (right-aligned, next to chart title):
     <ViewToggle view={view} onChange={setView} />

  2. After ViewToggle / chart section, add Advanced view block (conditional):
     {view === 'advanced' && (
       <div className={styles.advancedSection}>
         {/* Simulation controls row */}
         <div className={styles.simControls}>
           <div className={styles.simMeta}>
             {!mcResult && !mcLoading && !mcError && (
               <span className={styles.simHint}>No simulation run yet</span>
             )}
             {mcLoading && (
               <>
                 <span className={styles.spinner} aria-hidden="true" />
                 <span className={styles.simHint}>Simulating 5,000 scenarios...</span>
               </>
             )}
             {mcResult && !mcLoading && (
               <span className={styles.volPill}>
                 Volatility: {(mcResult.volatility_used * 100).toFixed(1)}% · {mcResult.volatility_source === 'fallback' ? 'Default estimate' : 'Historical'}
                 {mcResult.cached && <span className={styles.cachedBadge}>Cached</span>}
               </span>
             )}
             {mcError === 'insufficient_data' && (
               <div className={styles.insufficientWarning} role="alert">
                 Need at least 90 days of portfolio history for Monte Carlo simulation.
               </div>
             )}
             {mcError && mcError !== 'insufficient_data' && (
               <div className={styles.simError} role="alert">{mcError}</div>
             )}
           </div>
           <button
             className={styles.runSimBtn}
             onClick={runSimulation}
             disabled={mcLoading || mcError === 'insufficient_data'}
             aria-busy={mcLoading}
           >
             {mcLoading ? 'Running...' : mcResult ? 'Re-run Simulation' : 'Run Simulation'}
           </button>
         </div>

         {/* Probability badge (only if target exists and sim ran) */}
         <ProbabilityBadge
           probability={mcResult?.probability_of_target ?? null}
           nestEgg={nestEgg}
         />

         {/* Monte Carlo chart (only when results available) */}
         {mcResult && <MonteCarloChart bands={mcResult.bands} />}
       </div>
     )}

  3. Below the chart section (in both views), add ForecastAIPanel:
     <ForecastAIPanel payload={forecastAiPayload} />

  Add CSS class definitions for new layout elements to ForecastingPage.module.css:
    .advancedSection, .simControls, .simMeta, .simHint, .spinner, .volPill, .cachedBadge,
    .insufficientWarning, .simError, .runSimBtn

  IMPORTANT PHASE 4 COMPATIBILITY NOTE: The exact names of Phase 4's computed variables
  (investableCapital, effectiveContribution, effectiveReturnRate, yearsToRetirement, nestEgg)
  must be confirmed when Phase 4 is merged. The implementation should locate these from
  Phase 4's ForecastingPage state and adjust the prop wiring accordingly. The data flow
  concept is fixed; the variable names may differ.
```

---

```
File: /home/user/stashtrend/frontend/src/pages/ForecastingPage.module.css
Lines: append new classes after existing Phase 4 styles
Parallelism: depends-on: ForecastingPage.jsx changes
Description: CSS for the simulation controls row, volatility pill, warning states, and run button.
Details:
  - .advancedSection: margin-top var(--sp-4)
  - .simControls: display flex, justify-content space-between, align-items center, gap var(--sp-3), padding bottom var(--sp-4)
  - .simMeta: display flex, align-items center, gap var(--sp-2), flex 1
  - .simHint: font-size 13px, color var(--text-secondary)
  - .spinner: display inline-block, width 14px, height 14px, border 2px solid var(--border), border-top-color var(--accent), border-radius 50%, animation spin 0.7s linear infinite
  - @keyframes spin: 0% transform rotate(0deg), 100% transform rotate(360deg)
  - .volPill: display inline-flex, align-items center, gap 6px, padding 4px 10px, background #1E2D4A, border-radius var(--radius-pill), font-size 12px, color #99CCFF
  - .cachedBadge: font-size 11px, color var(--text-muted), padding 2px 6px, border 1px solid var(--border), border-radius var(--radius-pill)
  - .insufficientWarning: font-size 13px, color var(--text-secondary), padding 8px 12px, background rgba(245,166,35,0.08), border 1px solid rgba(245,166,35,0.25), border-radius var(--radius-card)
  - .simError: font-size 13px, color var(--color-negative, #FF5A7A)
  - .runSimBtn: padding 8px 16px, background var(--accent), color #fff, border none, border-radius var(--radius-card), font-size 13px, font-weight 500, cursor pointer; .runSimBtn:disabled opacity 0.5, cursor not-allowed
  - @media (max-width: 767px): .simControls { flex-direction column, align-items stretch }, .runSimBtn { width 100% }
```

---

### Group E: Test Files (can begin in parallel with implementation once interfaces are known)

```
File: /home/user/stashtrend/backend/tests/test_forecast.py
Lines: new file
Parallelism: independent (can be written in parallel with backend implementation, interfaces are fully defined)
Description: Backend tests for all forecast endpoints and helper functions.
Details:
  Test class: TestComputePortfolioVolatility
  - test_volatility_fallback_no_data: empty DB → returns fallback dict with insufficient_data=True
  - test_volatility_fallback_insufficient_days: seed <90 days of account_history → fallback
  - test_volatility_returns_float_with_sufficient_data: seed 120 days of daily account_history for a Retirement account → returns dict with volatility float, source='account_history', insufficient_data=False
  - test_volatility_floors_at_min: seed artificially flat data (near-zero volatility) → result.volatility >= MC_MIN_VOLATILITY_FLOOR
  - test_volatility_outlier_filter: include a single 15% single-day jump → that data point excluded, volatility meaningfully lower than raw
  - test_volatility_cache_hit: call twice with same DB → second call returns cached result (assert DB query count by patching conn.execute)
  - test_volatility_cache_invalidated: call _clear_forecast_caches(), then call again → fresh computation

  Test class: TestRunMonteCarlo
  - test_montecarlo_returns_correct_bands_shape: run with years=10 → bands has 121 entries (0 to 120 months), each with p10/p25/p50/p75/p90
  - test_montecarlo_p10_less_than_p50_less_than_p90: verify percentile ordering at every month
  - test_montecarlo_starting_value_correct: bands[0] → all percentiles equal portfolio_value
  - test_montecarlo_probability_of_target_none_when_no_target: call with nest_egg_target=None → result.probability_of_target is None
  - test_montecarlo_probability_0_when_target_huge: nest_egg_target=1e12 → probability near 0
  - test_montecarlo_probability_100_when_target_trivial: nest_egg_target=1 → probability = 100.0
  - test_montecarlo_cache_hit: call twice with same params → second call has cached=True
  - test_montecarlo_cache_miss_different_params: call with different years → cache miss, different result
  - test_montecarlo_lru_eviction: fill cache to MC_MAX_CACHE_ENTRIES+1 → oldest entry evicted
  - test_montecarlo_negative_return_allowed: annual_return_pct=-3.0 → runs without error, p50 final < portfolio_value

  Test class: TestForecastMontecarlo (HTTP endpoint)
  Set up helper: _make_investment_db() — seeds accounts table with a Retirement account and 120 days of account_history
  - test_montecarlo_endpoint_happy_path: POST with valid payload → 200, response has bands/probability_of_target/volatility_used/num_simulations/cached
  - test_montecarlo_endpoint_missing_portfolio_value: POST {} → 400
  - test_montecarlo_endpoint_years_too_high: POST years=51 → 400
  - test_montecarlo_endpoint_years_too_low: POST years=0 → 400
  - test_montecarlo_endpoint_negative_return: POST annual_return_pct=-3.0 → 200 (valid)
  - test_montecarlo_endpoint_return_too_low: POST annual_return_pct=-6.0 → 400
  - test_montecarlo_endpoint_no_investment_data: empty DB (no accounts) → 422 with insufficient_history error key
  - test_montecarlo_endpoint_cached_response: POST same params twice → second response has cached=true
  - test_montecarlo_cache_cleared_on_settings_save: run simulation, then POST /api/retirement (save settings), then run again → second run has cached=false

  Test class: TestForecastAiAnalysis (HTTP endpoint)
  Uses same _configured_db() pattern from test_ai.py (reuse from test_helpers)
  - test_ai_analysis_returns_400_when_not_configured: POST with valid payload but no AI config → 400
  - test_ai_analysis_simple_variant: POST without monte_carlo field → prompt sent to AI contains portfolio_value but NOT "MONTE CARLO" section; assert via captured prompt
  - test_ai_analysis_mc_variant: POST with monte_carlo dict → prompt contains "MONTE CARLO SIMULATION RESULTS"
  - test_ai_analysis_returns_analysis_text: mock _call_ai to return "Analysis." → response has analysis="Analysis.", model, provider, truncated=false
  - test_ai_analysis_truncated_flag: mock _call_ai returning stop_reason="max_tokens" → response has truncated=true
  - test_ai_analysis_rate_limited: call twice rapidly → second call returns 429
  - test_ai_analysis_ai_exception: mock _call_ai to raise Exception → 500 with generic error
  - test_ai_analysis_no_monte_carlo_null_fields: POST with nest_egg_target=null, on_track=null → endpoint handles None gracefully, returns 200
  - test_clear_forecast_caches_thread_safe: call _clear_forecast_caches() from two threads simultaneously → no crash
```

---

```
File: /home/user/stashtrend/frontend/src/components/ViewToggle.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for the segmented control component.
Details:
  - 'renders Simple and Advanced buttons': render, expect both buttons in DOM
  - 'Simple button is active when view=simple': check aria-checked=true on Simple, false on Advanced
  - 'Advanced button is active when view=advanced': reverse check
  - 'calls onChange with simple when Simple clicked': fireEvent.click Simple → expect onChange called with 'simple'
  - 'calls onChange with advanced when Advanced clicked': fireEvent.click Advanced → expect onChange called with 'advanced'
  - 'Simple is checked by default when view=simple': aria-checked="true" on Simple button
  - 'has group role with aria-label': getByRole('group', { name: /Projection view/i })
```

---

```
File: /home/user/stashtrend/frontend/src/components/ProbabilityBadge.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for the probability badge display and color logic.
Details:
  - 'renders null when probability is null': render with probability=null → queryByTestId('probability-badge') is null
  - 'renders null when nestEgg is null': render with nestEgg=null → null
  - 'renders probability and formatted target': probability=73.2, nestEgg=2000000 → text includes "73.2%" and "$2,000,000"
  - 'applies green class when probability >= 70': probability=70 → element has green styling class
  - 'applies amber class when probability >= 40 and < 70': probability=55 → amber class
  - 'applies red class when probability < 40': probability=39 → red class
  - 'has role=status for accessibility': getByRole('status') is present
  - 'boundary: probability=40 applies amber not red': probability=40 → amber
  - 'boundary: probability=70 applies green not amber': probability=70 → green
```

---

```
File: /home/user/stashtrend/frontend/src/components/MonteCarloChart.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for the chart component (recharts mocked via existing __mocks__/recharts.jsx).
Details:
  Build MOCK_BANDS fixture: generate 13 months (0–12) of band data with p10 < p25 < p50 < p75 < p90
  - 'renders loading placeholder when bands is null': render with bands=null → does not render composed-chart
  - 'renders ComposedChart when bands provided': render with MOCK_BANDS → getByTestId('composed-chart') in document
  - 'renders inside a responsive container': getByTestId('responsive-container') in document
  - 'has data-testid=montecarlo-chart on wrapper': getByTestId('montecarlo-chart')
  - 'renders without crashing for 12-month horizon': smoke test with 13-entry bands array
  - 'renders without crashing for 360-month horizon': smoke test with 361-entry bands array (large dataset)
```

---

```
File: /home/user/stashtrend/frontend/src/components/ForecastAIPanel.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for the forecast AI panel. Follows AIAnalysisPanel.test.jsx structure exactly.
Details:
  MOCK_PAYLOAD fixture: { portfolio_value: 450000, monthly_contribution: 2000, annual_return_pct: 7.0, years_to_retirement: 25, nest_egg_target: 2000000, cagr_1y: 8.2, on_track: true, monte_carlo: null }
  MOCK_FORECAST_ANALYSIS: { analysis: 'Your portfolio is on track for retirement.' }
  - 'renders collapsed by default': header button text "Analyze Forecast with AI" visible; body hidden
  - 'expands when header clicked': fireEvent.click header → config form or run button appears
  - 'shows config form when unconfigured': mockFetch with unconfigured config → "Save & Analyze" button visible
  - 'shows Run Analysis button when configured': mockFetch with configured config → "Run Analysis" button visible
  - 'calls POST /api/forecast/ai-analysis on Run Analysis click': verify fetch called with correct URL
  - 'sends payload in POST body': capture fetch args → body contains portfolio_value
  - 'shows spinner while running': use never-resolving fetch → "Analyzing your forecast data..." text visible
  - 'shows analysis text after completion': mockFetch with analysis response → analysis text in DOM
  - 'shows Reconfigure after analysis done': Re-run and Reconfigure buttons visible
  - 'shows error message on API failure': reject fetch → error message visible, status back to idle
  - 'Re-run clears previous analysis and refetches': click Re-run → second fetch to /api/forecast/ai-analysis
```

---

```
File: /home/user/stashtrend/frontend/src/test/fixtures.js
Lines: append after line 336 (after MOCK_RETIREMENT)
Parallelism: independent
Description: Add Monte Carlo and forecast AI mock fixtures for use in test files.
Details:
  - MOCK_MONTE_CARLO_RESULT: {
      bands: Array of 13 objects (months 0-12) with date, p10, p25, p50, p75, p90 values,
      probability_of_target: 73.2,
      volatility_used: 0.152,
      volatility_source: 'account_history',
      num_simulations: 5000,
      cached: false,
    }
  - MOCK_MONTE_CARLO_INSUFFICIENT: { error: 'insufficient_history', volatility_source: 'fallback', volatility_used: 0.15 }
  - MOCK_FORECAST_AI_ANALYSIS: { analysis: 'Your portfolio is well-positioned for retirement.', model: 'claude-opus-4-5', provider: 'anthropic', truncated: false }
```

---

## Dependency Order

The following ordering must be respected. Items at the same level can run in parallel.

**Level 0 — No dependencies (start immediately, in parallel):**
- `requirements.txt` (add numpy)
- `api.js` (add exports)
- `ViewToggle.jsx` + `ViewToggle.module.css`
- `ProbabilityBadge.jsx` + `ProbabilityBadge.module.css`
- `MonteCarloChart.jsx` + `MonteCarloChart.module.css`
- `ForecastAIPanel.jsx` (imports from AIAnalysisPanel.module.css — that file already exists)
- `frontend/src/test/fixtures.js` (append mock data)
- All test files (interfaces are fully defined in this plan)

**Level 1 — Depends on Level 0:**
- Backend app.py: Cache infrastructure constants + `_clear_forecast_caches()` block (needs no other changes; insert after line 1514)
- `ForecastingPage.jsx` (depends on all new components existing)
- `ForecastingPage.module.css` (depends on ForecastingPage.jsx change scope being known)

**Level 2 — Depends on Level 1:**
- Backend app.py: `_compute_portfolio_volatility()` + `_run_monte_carlo()` helper functions (must come after cache infrastructure block)
- Backend app.py: Cache invalidation in `_run_sync_worker()` (must come after cache infrastructure block)
- Backend app.py: Cache invalidation in `save_retirement()` (must come after cache infrastructure block)

**Level 3 — Depends on Level 2:**
- Backend app.py: Route handlers `POST /api/forecast/montecarlo` and `POST /api/forecast/ai-analysis` (must come after helper functions)

---

## Test Strategy

### Backend Tests (`/home/user/stashtrend/backend/tests/test_forecast.py`)

**Pattern to follow:** `test_ai.py` for endpoint structure, `test_retirement.py` for input validation pattern, `test_helpers.py` for `make_test_db()` usage.

**Test database setup helper:**
```python
def _make_investment_db_with_history(days=120):
    """Seed an account + account_history rows for volatility testing."""
    db = make_test_db()
    db.execute("INSERT INTO accounts (id, name, type, subtype, include_in_net_worth, is_asset) VALUES ('acct1', 'IRA', '401k', 'ira', 1, 1)")
    # Seed `days` rows of account_history with realistic portfolio values
    base = 400000.0
    from datetime import date, timedelta
    import random, math
    start = date.today() - timedelta(days=days)
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        val = base * math.exp(0.07/252 * i + 0.15/math.sqrt(252) * random.gauss(0, 1))
        db.execute("INSERT OR IGNORE INTO account_history (account_id, date, balance) VALUES (?, ?, ?)", ('acct1', d, val))
    db.commit()
    return db
```

**Happy path tests:**
- Volatility computed from 120 days of investment history
- Monte Carlo returns 121 bands for a 10-year horizon
- Endpoint returns all required response fields

**Edge case tests:**
- Fewer than 90 calendar days → 422 from endpoint
- Zero monthly contribution → valid simulation
- Negative expected return (-3%) → simulation runs, p50 final < portfolio_value
- Probability of target = null when no nest_egg_target provided
- Probability = 100.0 when target is trivially small
- Probability ≈ 0 when target is unreachable (1 trillion)
- Volatility floored at MC_MIN_VOLATILITY_FLOOR (0.01) when near-flat data
- Outlier daily return (>10%) excluded from volatility calculation
- AI analysis rate limiting (429 after rapid double-call)
- AI analysis with monte_carlo=null (Variant A prompt) vs. with monte_carlo dict (Variant B prompt)

**Error case tests:**
- POST /api/forecast/montecarlo with missing portfolio_value → 400
- POST /api/forecast/montecarlo with years=51 → 400
- POST /api/forecast/montecarlo with annual_return_pct=-6 → 400
- POST /api/forecast/ai-analysis with no AI configured → 400
- Cache invalidation: after POST /api/retirement → mc cache cleared, volatility cache intact
- Cache invalidation: after sync completes → both caches cleared
- Thread safety: _clear_forecast_caches() called concurrently does not crash

**What may break:**
- No existing tests should break. The cache-clearing additions to `_run_sync_worker()` and `save_retirement()` are additive no-ops in tests (caches are always empty in test context). The `requirements.txt` change (adding numpy) does not affect any existing test.

### Frontend Tests

**Pattern to follow:** `AIAnalysisPanel.test.jsx` for panel components; `NetWorthPage.test.jsx` for page-level component mocking; `chartUtils.test.jsx` for utility tests.

**ViewToggle tests:**
- Accessibility role attributes (group, radio, aria-checked)
- onChange callback fired with correct string value
- Active/inactive visual state reflected in DOM

**ProbabilityBadge tests:**
- Null guard — renders nothing when either prop is null
- Three color-coding thresholds (>= 70, >= 40, < 40)
- Boundary conditions (exactly 70%, exactly 40%)
- Formatted dollar amount and percentage display
- role="status" accessible attribute

**MonteCarloChart tests:**
- Null/empty bands guard
- ComposedChart renders when data provided (via recharts mock)
- No crash on large datasets (360-month horizon)
- Smoke tests only — recharts internals (Area, Line rendering) are mocked

**ForecastAIPanel tests:**
- Complete state machine coverage (loading config → idle unconfigured → idle configured → running → done)
- POST body contains payload fields
- Error display and retry capability
- Spinner text uses "forecast data" not "budget data"

**ForecastingPage tests (additions to existing Phase 4 test file):**
- 'renders Simple view by default' — ForecastingChart visible, MonteCarloChart not visible
- 'shows Advanced controls after toggle click' — ViewToggle click to advanced → simulation controls visible
- 'Run Simulation button calls runMonteCarlo with correct params'
- 'shows ProbabilityBadge after simulation completes'
- 'shows insufficient data warning on 422 response'
- 'switching from Advanced back to Simple hides Monte Carlo chart but preserves mcResult'
- 'ForecastAIPanel renders in both Simple and Advanced views'
- 'ForecastAIPanel payload includes monte_carlo when simulation has run'
- 'ForecastAIPanel payload has monte_carlo=null when no simulation run'

**Can be written in parallel with implementation:** All test files. The API contracts, prop shapes, and state machine are fully specified in this plan.

---

## Rollback Notes

- All backend changes are additive. The new route handlers and helper functions do not modify any existing routes. Rolling back means deleting the new functions/routes.
- The cache infrastructure block (module-level dicts) can be removed without side effects — the `_clear_forecast_caches()` calls in `_run_sync_worker()` and `save_retirement()` must also be removed together.
- The numpy addition to `requirements.txt` can be reverted by removing the line. If a docker image was built with numpy installed, a container rebuild is needed.
- Frontend: new components can be deleted without affecting existing pages. The `ForecastingPage.jsx` changes are the only modification to an existing file — revert to Phase 4's version.
- No database migrations were made. There is no rollback for data changes.
- The cache is in-memory and resets on server restart — no persistent state to roll back.

---

## Key Implementation Notes

1. **numpy import:** Add `import numpy as np` at the top of `app.py` alongside the existing stdlib imports. The try/except pattern used for `apscheduler` is NOT needed here — numpy is a hard dependency (the simulation cannot run without it). A missing numpy will fail at import time, which is the correct behavior (surface the missing dependency early).

2. **Phase 4 variable name reconciliation:** `ForecastingPage.jsx` Phase 4 will have computed variables for investable capital, effective contribution, and effective return rate. When integrating, search for these values in the Phase 4 implementation and wire them. Do not duplicate the computation — use what Phase 4 already has.

3. **AI panel CSS sharing:** `ForecastAIPanel.jsx` imports `./AIAnalysisPanel.module.css` directly. CSS Modules generates unique class names per import site, so both components will render with the same visual styling but isolated scopes. This is the correct approach for shared styles without a separate shared file.

4. **Monte Carlo tooltip absolute values:** The custom tooltip in `MonteCarloChart.jsx` receives Recharts `payload` where stacked `<Area>` components report delta values (not absolute). Use `payload[0].payload._p10`, `._p25` etc. (the original absolute values stored in the data object) to display correct percentile labels.

5. **422 vs 400 for insufficient data:** The endpoint returns 422 (Unprocessable Entity) when data is insufficient — not 400. This distinction allows the frontend to differentiate between a user input error (400) and a data availability constraint (422). The `err.message` in the frontend catch block will contain the JSON `error` field extracted by `mutateJSON`.

6. **Cache eviction order:** Python dicts maintain insertion order since Python 3.7. LRU eviction uses `next(iter(_montecarlo_cache))` to get the oldest key. This is intentional — no need for `collections.OrderedDict`.

7. **Volatility cache key:** The volatility cache uses a hash of sorted investment account IDs. When new accounts are added (after a sync), the cache is already cleared by `_clear_forecast_caches()` in `_run_sync_worker()`, so the key change is handled automatically.

8. **Monte Carlo starting point (month 0):** All percentiles at `bands[0]` equal `portfolio_value` exactly (before any simulation steps). This is computed in `_run_monte_carlo()` by setting `paths[:, 0] = portfolio_value` and should not be recomputed from the GBM output.
