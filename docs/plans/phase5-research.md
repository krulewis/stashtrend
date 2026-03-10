# Phase 5 Research — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Agent:** Researcher
**Inputs:** phase5-requirements.md, phase5-architecture.md (already decided), full codebase survey

---

## 1. Existing AI Infrastructure

### `_call_ai()` Helper

**File:** `/home/user/stashtrend/backend/app.py`, line 1704

Signature: `_call_ai(prompt: str, conn, max_tokens: int = 1024) -> (text, stop_reason, provider)`

- Routes to either Anthropic SDK (`anthropic>=0.25.0`) or OpenAI-compatible SDK (`openai>=1.30.0`) based on `ai_provider` setting in `settings` table.
- Returns `(None, None, None)` if AI not configured — callers must check for `None` before using result.
- API key retrieved via `_get_ai_key(conn)`: keychain first (via `auth.load_ai_key()`), then `settings` table fallback.

### AI Rate Limiting Pattern

**File:** `/home/user/stashtrend/backend/app.py`, lines 1510–1524

```python
_ai_cooldowns = {}
_AI_COOLDOWN_SECONDS = 2.0
_ai_cooldowns_lock = threading.Lock()

def _check_ai_rate_limit(endpoint: str):
    now = time.monotonic()
    with _ai_cooldowns_lock:
        last = _ai_cooldowns.get(endpoint, 0.0)
        if last > 0 and (now - last) < _AI_COOLDOWN_SECONDS:
            return jsonify({"error": "Please wait before retrying."}), 429
        _ai_cooldowns[endpoint] = now
    return None
```

Each endpoint uses its own string key. Call pattern: `blocked = _check_ai_rate_limit("my_key")` then `if blocked: return blocked` before any AI work.

### Prompt Sanitization

`_sanitize_prompt_field(value, max_length=500)` strips control chars (keeps `\n`, `\t`) and truncates. Used in every AI endpoint that injects user data into prompts.

### Existing AI Endpoints

| Endpoint | Purpose | max_tokens | Cooldown Key |
|----------|---------|-----------|--------------|
| `POST /api/ai/analyze` | Budget analysis | 1024 | `ai_analyze` |
| `POST /api/budget-builder/regional/fetch` | Regional cost data via AI | 1024 | `fetch_builder_regional_ai` |
| `POST /api/budget-builder/generate` | Budget plan generation | 4096+ | `generate_budget_plan` |

### AI Config Endpoints

- `GET /api/ai/config` → `{configured, model, provider, base_url}` — never returns raw key
- `POST /api/ai/config` → saves provider, key, model, base_url

### Frontend API Hooks

**File:** `/home/user/stashtrend/frontend/src/api.js`, lines 47–49

```js
export const fetchAiConfig = () => fetchJSON('/api/ai/config')
export const saveAiConfig = (data) => mutateJSON('/api/ai/config', 'POST', data)
export const runAiAnalysis = () => mutateJSON('/api/ai/analyze', 'POST', {})
```

The `mutateJSON` helper (unexported) handles error extraction from JSON `error` field automatically. A new `runForecastAiAnalysis(body)` following `postJSON('/api/forecast/ai-analysis', body)` fits this pattern.

---

## 2. Budget AI Analysis Panel (UX Reference)

**File:** `/home/user/stashtrend/frontend/src/components/AIAnalysisPanel.jsx`

### State Machine
```
states: idle | running | done
config: null (loading) | { configured: true } | { configured: false }
```

The component combines these: `status === 'idle' && !config` → loading skeleton; `status === 'idle' && config && !config.configured` → config form; `status === 'idle' && config.configured` → run button; `status === 'running'` → spinner; `status === 'done'` → analysis text + action buttons.

### UX Flow
1. Panel collapsed by default (header `<button>` toggles `expanded` state).
2. Click header → shows body.
3. Config form or run button shown based on `config.configured`.
4. `runAnalysis()` fires `mutateJSON('/api/ai/analyze', 'POST', {})` — body is empty; server fetches its own context.
5. Done state renders `<pre className={styles.analysisText}>{analysis}</pre>` — plain text, no markdown rendering.
6. Error state: red `.errorMsg` div above action row.

### What ForecastAIPanel Will Differ On
- The POST body is not empty — client must send projection/simulation data to the server.
- Analysis text will likely be longer (retirement-focused narrative) and may benefit from a `<div>` with `white-space: pre-wrap` instead of `<pre>`.
- Panel should be available in both Simple and Advanced (Monte Carlo) views, adjusting what data is sent.

### Key CSS Classes to Reuse
`.panel`, `.header`, `.headerTitle`, `.chevron`, `.body`, `.runningRow`, `.spinner`, `.analysisText`, `.configuredView`, `.badges`, `.badge`, `.configForm`, `.btnPrimary`, `.btnGhost`, `.errorMsg`, `.loadingMsg`

All styles use design tokens (`var(--bg-card)`, `var(--border)`, `var(--accent)`, etc.).

---

## 3. Security Prices Table and Historical Data Availability

### `security_prices` Table: NOT IN PIPELINE SCHEMA

The `pipeline/monarch_pipeline/schema.py` DDL has no `security_prices` table. Phase 0 made it optional and deferred it. The `phase5-architecture.md` already decided to use `account_history` instead of creating this table for Phase 5 volatility calculation.

**Note:** Phase 6 (Benchmark Comparison) plans to create `security_prices` with schema `(ticker TEXT, date TEXT, price REAL, UNIQUE(ticker, date))` and populate it with S&P 500 data via `yfinance`. If Phase 6 ships before or alongside Phase 5, the table will exist but will only contain `^GSPC` data — not per-holding price history. That does not change the Phase 5 volatility approach (portfolio-level from `account_history`).

### `account_history` Table (EXISTS, populated by sync)

**Schema** (from `/home/user/stashtrend/pipeline/monarch_pipeline/schema.py`):
```sql
CREATE TABLE IF NOT EXISTS account_history (
    account_id  TEXT NOT NULL,
    date        TEXT NOT NULL,
    balance     REAL,
    PRIMARY KEY (account_id, date),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

- Daily balance snapshots per account, synced from Monarch Money.
- Already queried extensively in `networth_by_type` endpoint.
- Includes investment, cash, real estate, and debt accounts — must filter to investment buckets (Retirement + Brokerage) for portfolio volatility.

### `holdings` Table (EXISTS, point-in-time snapshot)

Holdings have tickers but no price history — only a single snapshot from last sync. Not usable for volatility estimation. Relevant for knowing which securities exist but not for computing historical returns.

### Volatility Estimation Strategy (Decided in Architecture)

From `account_history`, filtering to accounts in Retirement and Brokerage buckets via `BUCKET_MAP`/`TYPE_MAP` in `app.py`:
1. Sum daily balances across investment accounts → portfolio time series.
2. Calculate daily log returns: `ln(balance_t / balance_{t-1})`.
3. Filter outlier returns (`> 3 std dev` or `> 10% single-day`) — likely contributions/withdrawals.
4. Annualize: `std(daily_returns) * sqrt(252)`.
5. Fallback: if `< 30` clean data points, use default `15%` annualized volatility.

**Risk:** The `_compute_bucket_cagr()` function (lines 757–811 of `app.py`) already handles the per-bucket balance aggregation and date iteration pattern — the volatility function can follow the exact same structure, reusing the `acct_history` and `acct_bucket` data structures from `networth_by_type`.

---

## 4. Holdings Data for Portfolio-Level Computation

The `BUCKET_MAP` (lines 647–694) and `TYPE_MAP` (lines 700–728) in `app.py` map Monarch account types/subtypes to display buckets: Retirement, Brokerage, Cash, Real Estate, Other, Debt.

For Monte Carlo, only Retirement and Brokerage balances matter. The existing `_get_bucket()` helper can filter accounts to these two buckets. The `networth_by_type` endpoint already runs the exact query needed: accounts where `include_in_net_worth = 1`, joined with `account_history`. The Monte Carlo endpoint can reuse the same query structure or call a shared helper.

The `retirement_settings` table contains:
- `current_age`, `target_retirement_age` → years to retirement
- `monthly_contribution` → simulation input
- `expected_return_pct` → `mu` in GBM
- `withdrawal_rate_pct`, `desired_annual_income`, `social_security_annual` → for nest egg target

---

## 5. Recharts Patterns for Probability Band Visualization

### Existing Area Chart Patterns

**Files:**
- `/home/user/stashtrend/frontend/src/components/NetWorthChart.jsx` — single-series AreaChart with gradient fill
- `/home/user/stashtrend/frontend/src/components/TypeStackedChart.jsx` — stacked AreaChart with `stackId="nw"`, multiple `<Area>` components, `linearGradient` defs per bucket

### Stacked Delta Area Approach (Decided in Architecture)

The Phase 5 architecture decision (Decision 8) specifies transforming backend data `{ dates, p10, p25, p50, p75, p90 }` into delta values:

```js
chartData[i] = {
  date: dates[i],
  base: p10[i],
  band_10_25: p25[i] - p10[i],
  band_25_50: p50[i] - p25[i],
  band_50_75: p75[i] - p50[i],
  band_75_90: p90[i] - p75[i],
}
```

Then rendered as stacked `<Area>` components with `stackId="mc"` and a transparent base area, with graduated opacity (outer bands lighter, inner darker). A separate `<Line>` overlays the median.

### Recharts Mock Compatibility

The test mock at `/home/user/stashtrend/frontend/__mocks__/recharts.jsx` already stubs `ComposedChart` (returns `<div data-testid="composed-chart">`). If the Monte Carlo chart uses `ComposedChart` (for mixing `<Area>` and `<Line>`), no mock changes are needed.

### Key chartUtils.jsx Constants Available

`COLOR_ACCENT` (#4D9FFF) — primary band fill color. `sharedChartElements()` returns CartesianGrid + XAxis + YAxis + Tooltip. `TOOLTIP_STYLE` for custom tooltip container.

---

## 6. Phase 4 Forecasting Page (Dependency)

### Architecture Summary (from `phase4-architecture.md`)

Phase 4 creates:
- `frontend/src/pages/ForecastingPage.jsx` — state owner
- `frontend/src/components/ForecastingChart.jsx` — recharts LineChart with 3 scenario lines + historical
- `frontend/src/components/ForecastingControls.jsx` — sliders
- `frontend/src/components/ForecastingSummary.jsx` — gap analysis cards
- Extended `retirementMath.js` with `getInvestableCapital(typeData)` and `computeBlendedCAGR(typeData)`

Phase 4 uses no new backend endpoints. All data from `GET /api/retirement` and `GET /api/networth/by-type`.

### What Phase 5 Receives from Phase 4

ForecastingPage owns:
- `retirementSettings` (age, contribution, return rate, nest egg target)
- `typeData` (CAGR, investable capital from `networth_by-type`)
- Slider state (contribution amount, return rate overrides)

Phase 5 must wire into ForecastingPage to add:
1. A view toggle (Simple ↔ Advanced)
2. The `MonteCarloChart` component (Advanced view only)
3. The `ForecastAIPanel` component (both views)

The exact prop interface of ForecastingPage will be defined when Phase 4 is implemented. Phase 5 planning should be flexible on prop names but can assume the above data is available at the page level.

---

## 7. Backend Computation Patterns

### Synchronous vs. Async

All computationally intensive work in the current backend runs synchronously in Flask request handlers. The sync pipeline is the exception: it spawns a `threading.Thread` and updates a `sync_jobs` table for status polling.

Monte Carlo simulation is NOT dispatched to a background thread — it runs synchronously in the request handler. With numpy this is feasible: 5,000 simulations × 360 months = ~1.8M array operations, completing in `< 1 second`. The per-request latency is acceptable (1–2 seconds).

If the 5-second budget turns out to be tight on slower hardware, a fallback is reducing to 1,000 simulations with a note to the user. A background thread approach is explicitly rejected in the architecture (see Decision 1 rejected alternatives).

### Caching Pattern (Decided in Architecture)

In-memory Python dict with a hash key derived from simulation parameters. No existing pattern for this in `app.py` — this will be a new pattern. The architecture specifies:

```python
_montecarlo_cache = {}  # {cache_key: result_dict}
# Invalidate on sync complete and retirement settings save
```

The cache key rounds `investable_capital` to nearest $1,000 to avoid trivial misses. No TTL — invalidated explicitly on sync completion and settings change.

### Error Handling Pattern

All endpoints use:
```python
try:
    result = compute(...)
    return jsonify(result)
except Exception:
    app.logger.exception("Monte Carlo failed")
    return jsonify({"error": "..."}), 500
```

The `@app.errorhandler(Exception)` global handler also catches unhandled exceptions.

---

## 8. Monte Carlo Simulation — External Best Practices

### Geometric Brownian Motion (GBM) — Industry Standard

The standard discrete-time formula for portfolio simulation:

```
S(t+1) = S(t) * exp((mu - sigma^2/2) * dt + sigma * sqrt(dt) * Z)
```

Where:
- `mu` = expected annual return (from retirement settings or blended CAGR)
- `sigma` = annualized volatility (from account_history)
- `dt` = 1/12 (monthly timesteps)
- `Z` = standard normal random variable

The `-sigma^2/2` term is the **drift correction** (Ito correction) that accounts for volatility drag on compound returns. Without it, the simulation is upward-biased. Median outcome grows at `mu - sigma^2/2`, not `mu`.

### NumPy Vectorization

For 5,000 simulations × 360 months, generate the full random matrix at once:
```python
Z = np.random.standard_normal((num_simulations, months))
# Then compute all paths in one vectorized operation
```

This avoids Python loops over simulations entirely. The single `np.random.standard_normal` call is O(num_simulations * months).

### Number of Simulations

| Count | Use Case |
|-------|----------|
| 1,000 | Minimum for stable percentile estimates |
| 5,000 | Standard for user-facing tools — good accuracy, <1 second |
| 10,000+ | Publication quality — diminishing returns above 5K |

The architecture uses 5,000 as the default. This is well-established as the sweet spot for consumer financial planning tools.

### Percentile Extraction

After running N simulations, at each time step `t`, extract percentiles from the distribution of `S_i(t)` values across all simulations:
```python
# paths shape: (num_simulations, months)
percentiles = np.percentile(paths, [10, 25, 50, 75, 90], axis=0)
```

### Contribution Modeling

Add monthly contribution to each path at each step before applying the GBM return:
```
balance_new = (balance_old + monthly_contribution) * growth_factor
```

This correctly compounds contributions along with returns.

### Probability of Target

Count simulations where final value >= nest egg target:
```python
probability = np.mean(paths[:, -1] >= target_nest_egg) * 100
```

### Alternative: Bootstrap Sampling

Instead of GBM, draw actual historical daily log returns from `account_history` with replacement. This is more robust to non-normality but requires more historical data (needs enough daily returns to sample from meaningfully). GBM is simpler and sufficient for v1.

### NumPy Availability

NumPy is not currently in `backend/requirements.txt`. It must be added. It is a safe, standard dependency with no version conflicts. No existing code imports it, so the Phase 5 PR will be the first to add it.

---

## 9. Key Findings Summary

| Finding | Impact on Phase 5 |
|---------|------------------|
| `_call_ai()` at line 1704, well-tested pattern | Copy the endpoint structure exactly from `ai_analyze` |
| `_check_ai_rate_limit("forecast_ai_analysis")` available | Use as-is for new endpoint |
| `AIAnalysisPanel.jsx` is the UX template | Fork it as `ForecastAIPanel.jsx`; diff is POST body content |
| `security_prices` table does not exist in pipeline | Use `account_history` for portfolio-level volatility — already decided in architecture |
| `account_history` daily balances exist; used in `networth_by_type` | Volatility function can reuse the existing bucket-filtering query structure |
| `BUCKET_MAP`/`TYPE_MAP` at lines 647–728 define investment buckets | Filter to Retirement + Brokerage for volatility calculation |
| `_compute_bucket_cagr()` at line 757 shows how to iterate account history | The volatility calculation follows the same per-bucket aggregation pattern |
| Recharts `TypeStackedChart` uses stacked `<Area>` with `stackId` | Monte Carlo bands use the same stacked-delta-area technique |
| Phase 4 architecture uses `LineChart` for projections, Phase 5 needs `AreaChart` or `ComposedChart` for bands | MonteCarloChart is a new component, not an extension of ForecastingChart |
| `numpy` not in `requirements.txt` | Must add `numpy>=1.24.0` in Phase 5 PR |
| All AI calls are synchronous (no streaming) | Consistent with existing pattern; 400-word limit prevents long waits |
| In-memory cache pattern is new | No existing equivalent — design carefully for thread safety |
| Phase 4 is a hard dependency (page route, component props, slider state) | Phase 5 planning must be flexible on exact API surface until Phase 4 is built |
| Phase 6 `security_prices` table will be created later, not before Phase 5 | No impact on Phase 5 volatility approach |

---

## 10. Open Questions for Architecture

1. **Cache thread safety:** The in-memory `_montecarlo_cache` dict needs a `threading.Lock` to be safe (Flask can serve concurrent requests). The architecture document notes the dict approach but doesn't specify locking. This must be addressed in the implementation plan.

2. **Cache invalidation hooks:** The architecture says to invalidate on sync complete and settings save. The sync worker is in `_run_sync_worker()` (line 390); the settings save is in `POST /api/retirement`. The implementation must add cache-clear calls at both locations.

3. **Contribution noise threshold:** The architecture specifies filtering daily returns `> 3 std dev` or `> 10% single-day`. These thresholds should be constants (not magic numbers) and tested with at least one edge case where a large deposit is correctly excluded.

4. **ForecastAIPanel POST body:** The architecture specifies the exact JSON body shape (including optional `montecarlo` field). The frontend must extract final-value percentiles from the montecarlo response arrays to pass as scalars to the AI endpoint — this logic should live in the component, not in a utility function, since it's UI-specific.

5. **Phase 4 surface compatibility:** The exact props of `ForecastingPage` and `ForecastingChart` are unknown until Phase 4 is built. The Phase 5 engineer plan should note this dependency and specify integration points at the page level.

6. **Minimum data requirement:** The architecture says `< 30` clean data points → use default 15% volatility. What "clean" means (after outlier filtering) should be specified precisely. If a user has synced for 2 months (60 raw days), contribution noise could reduce clean data points below 30 easily.
