# Phase 5 Architecture Decision — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Author:** Architect Agent
**Status:** Ready for engineer plan
**Depends on:** Phase 4 (Forecasting page, not yet implemented)
**Size:** M

---

## Decision Summary

Phase 5 adds two analytical depth layers to the Phase 4 Forecasting page: a backend Monte Carlo simulation engine using numpy-vectorized Geometric Brownian Motion that returns percentile bands via a new `POST /api/forecast/montecarlo` endpoint, and an AI narrative panel that calls the existing `_call_ai()` infrastructure via `POST /api/forecast/ai-analysis` with context-adaptive prompts. The frontend adds a Simple/Advanced view toggle, a probability band chart using stacked Recharts `<Area>` components, and a `ForecastAIPanel` component that follows the established `AIAnalysisPanel` pattern. All simulation runs synchronously in the request handler (sub-second with numpy), results are cached in-memory with explicit invalidation on sync completion and settings changes, and no new database tables are introduced.

---

## Decision 1: Monte Carlo Engine — Synchronous NumPy-Vectorized GBM

**Decision:** Run 5,000 Geometric Brownian Motion simulations synchronously in the Flask request handler using fully vectorized numpy operations. Monthly time steps. No background thread, no task queue.

**Rationale:** The computation is trivially fast when vectorized. A matrix of shape `(5000, 360)` for a 30-year horizon requires roughly 1.8 million float operations -- numpy handles this in under 500ms on modern hardware. The single-user nature of the app means there is no concurrent load concern. Synchronous execution keeps the code simple, testable, and consistent with every other computation endpoint in the codebase (`networth_by_type`, `_compute_bucket_cagr`, etc.). The existing sync pipeline is the only place that uses background threads, and that is because it involves network I/O to Monarch Money -- a fundamentally different concern.

**Rejected Alternatives:**

1. **Background thread with polling (like sync worker):** The sync worker pattern (`_run_sync_worker` with `sync_jobs` table polling) was considered. Rejected because the computation finishes in under 1 second -- the overhead of creating a thread, writing status to the database, and polling from the frontend would add more latency than it saves. This pattern is appropriate for multi-second network I/O, not for in-memory math.

2. **Client-side simulation in JavaScript:** Running the simulation in the browser (using a Web Worker) was considered. Rejected for three reasons: (a) the volatility computation requires querying `account_history` which is server-side only, (b) JavaScript lacks numpy's vectorization so 5,000 simulations would be significantly slower, and (c) keeping the simulation server-side allows caching across page loads and browser sessions. The only advantage would be zero network latency, which does not justify the complexity.

3. **Reduce to 1,000 simulations:** Considered as a performance hedge. Rejected as the primary approach because 5,000 simulations produce meaningfully more stable percentile estimates (particularly at the 10th and 90th tails) and numpy handles both sizes in well under 1 second. However, this remains a viable fallback if testing on low-end hardware reveals latency issues -- the number of simulations should be a named constant, not a magic number.

**Risks:**
- numpy is not currently in `requirements.txt` and must be added. This is the only new dependency. Risk is low -- numpy is universally available and has no conflicting version requirements with Flask, anthropic, or openai SDKs.
- If Phase 4 introduces a different computation pattern (e.g., async), this decision may need revisiting. Mitigated by the fact that Phase 4's architecture document specifies no backend endpoints at all -- all Phase 4 computation is client-side.

---

## Decision 2: Volatility Data Source — Portfolio-Level from `account_history` with Contribution Adjustment

**Decision:** Compute annualized volatility from the `account_history` table by summing daily balances across Retirement and Brokerage bucket accounts, calculating daily log returns, applying a contribution-noise filter, and annualizing via `std * sqrt(252)`. Use `retirement_settings.monthly_contribution` for the contribution adjustment (not transaction-detected contributions). Fall back to 15% annualized volatility when fewer than 90 calendar days of data exist or fewer than 60 non-zero data points remain after filtering.

**Rationale:** This approach reuses the exact query and bucket-filtering pattern already proven in `networth_by_type` (lines 814-892 of `app.py`). The `account_history` table is populated by the sync pipeline and contains daily balance snapshots -- this is the only historical time series available in the database. Using `retirement_settings.monthly_contribution` for contribution adjustment is simpler than querying the `transactions` table and produces an adequate approximation: the goal is to remove the largest source of noise (regular contributions appearing as portfolio "gains"), not to achieve perfect contribution stripping. The 15% fallback is the long-term annualized volatility of a diversified US equity portfolio -- a reasonable default for users with insufficient history.

**Rejected Alternatives:**

1. **Per-security volatility from a `security_prices` table:** This table does not exist in the schema. Creating it would require a new data source (e.g., `yfinance`), a new sync entity, and correlation-weighted portfolio variance calculations. This is Phase 6+ scope at earliest. The research confirms the table is not in the pipeline schema.

2. **Transaction-detected contribution adjustment:** Querying `transactions` for deposits into investment accounts and subtracting them from daily balance changes would produce more accurate contribution stripping. Rejected because: (a) it adds a second large SQL query to the volatility computation, (b) matching transactions to specific accounts and dates is fragile (timing differences between balance snapshots and transaction posting dates), and (c) the `monthly_contribution / 21` approximation introduces a small bias that is acceptable for a consumer-grade planning tool. If users report that their volatility estimates are consistently too high (indicating contribution noise leaking through), this can be revisited.

3. **No contribution adjustment (raw daily returns):** The simplest approach -- just compute log returns from raw balance changes. Rejected because monthly contributions to retirement accounts create artificial 2-5% "jumps" in portfolio balance that would inflate volatility estimates significantly. A user contributing $2,000/month to a $100,000 portfolio would see ~2% contribution noise each month, which annualized becomes a substantial volatility overestimate.

**Risks:**
- Contribution adjustment using `monthly_contribution / 21` is approximate. If a user contributes irregular amounts (e.g., annual lump sum), the adjustment will be wrong for those periods. Mitigation: the outlier filter (returns > 3 standard deviations from mean) catches the most extreme cases as a second safety net.
- Accounts that change buckets over time (e.g., reclassified from Brokerage to Retirement) could introduce discontinuities. Mitigation: this is extremely rare in practice and the outlier filter handles it.
- The 90-day minimum data threshold is a UX constraint for new users. Mitigation: clear messaging ("Need at least 90 days of portfolio history") and the Monte Carlo button is simply disabled, not hidden, so users know the feature exists.

---

## Decision 3: Volatility Computation — Precompute Once, Cache Separately from Simulation

**Decision:** Compute volatility as a separate internal function (`_compute_portfolio_volatility(conn)`) that is called by the Monte Carlo endpoint. The volatility result is cached independently from the simulation results, keyed simply on a hash of the date range and account IDs used. The Monte Carlo endpoint calls this function first, gets the cached volatility, then uses it as an input to the simulation (which has its own cache). Volatility cache is invalidated when a sync completes (new `account_history` data). Simulation cache is invalidated when volatility changes OR when retirement settings change.

**Rationale:** Volatility changes only when new `account_history` data is synced -- it does not change when the user adjusts simulation parameters (return rate, contribution amount, time horizon). Separating the caches means that changing simulation parameters does not force a volatility recomputation (which requires a database query and log-return calculation across potentially thousands of rows). This answers Open Question Q-1 from the requirements document.

**Rejected Alternatives:**

1. **Compute volatility on every Monte Carlo request:** Simpler code but wastes 50-200ms on every request recalculating a value that only changes on sync. With 5,000 simulations completing in under 500ms, the volatility query could represent 20-40% of total request time. Unnecessary for a single-user app where syncs happen at most daily.

2. **Expose a separate `GET /api/forecast/volatility` endpoint:** Considered exposing volatility as its own API endpoint so the frontend could display it independently and pass it to the Monte Carlo endpoint. Rejected because: (a) the frontend has no current need to display volatility to the user (it is shown only as metadata in the Monte Carlo response), (b) it adds an extra round-trip, and (c) the backend can handle this internally with a simple function call.

**Risks:**
- Two-layer caching adds complexity to invalidation logic. Mitigation: both caches are simple Python dicts cleared by the same two triggers (sync completion, settings save). A `_clear_forecast_caches()` helper function encapsulates both clears.

---

## Decision 4: API Design — Frontend Sends Parameters, Backend Validates and Supplements

**Decision:** The frontend sends simulation parameters explicitly in the POST body (`portfolio_value`, `monthly_contribution`, `annual_return_pct`, `years`, `nest_egg_target`). The backend validates these, computes volatility internally (not sent by the frontend), and returns the full simulation result including `volatility_used` and `volatility_source` metadata. This answers Open Question Q-2 from the requirements.

**API Contracts:**

### `POST /api/forecast/montecarlo`

Request:
```json
{
  "portfolio_value": 450000,
  "monthly_contribution": 2000,
  "annual_return_pct": 7.0,
  "years": 25,
  "nest_egg_target": 2000000
}
```

Response:
```json
{
  "bands": [
    {"month": 0, "date": "2026-03-01", "p10": 450000, "p25": 450000, "p50": 450000, "p75": 450000, "p90": 450000},
    {"month": 1, "date": "2026-04-01", "p10": 448200, "p25": 451300, "p50": 455000, "p75": 458700, "p90": 462100}
  ],
  "probability_of_target": 73.2,
  "volatility_used": 0.152,
  "volatility_source": "account_history",
  "num_simulations": 5000,
  "cached": false
}
```

Validation rules:
- `portfolio_value`: required, >= 0
- `monthly_contribution`: optional, default 0, >= 0
- `annual_return_pct`: optional, default 7.0, range [-5.0, 30.0]
- `years`: required, range [1, 50]
- `nest_egg_target`: optional, >= 0

### `POST /api/forecast/ai-analysis`

Request:
```json
{
  "portfolio_value": 450000,
  "monthly_contribution": 2000,
  "annual_return_pct": 7.0,
  "years_to_retirement": 25,
  "nest_egg_target": 2000000,
  "cagr_1y": 8.2,
  "on_track": true,
  "monte_carlo": {
    "p10_final": 980000,
    "p25_final": 1400000,
    "p50_final": 1950000,
    "p75_final": 2600000,
    "p90_final": 3400000,
    "probability_of_target": 73.2,
    "volatility_used": 0.152
  }
}
```

Response:
```json
{
  "analysis": "...(plain text, 200-400 words)...",
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic",
  "truncated": false
}
```

**Rationale:** Having the frontend send parameters explicitly makes the API testable in isolation (no database state dependency for the core simulation math), supports the Phase 4 slider-override pattern (user adjusts contribution or return rate via sliders -- those overridden values must be what the simulation uses, not the saved `retirement_settings` values), and keeps the contract transparent. The backend supplements with volatility because that requires a database query the frontend cannot perform.

**Rejected Alternatives:**

1. **Backend reads all parameters from `retirement_settings`:** Simpler API (empty POST body) but breaks when the user uses Phase 4 sliders to override contribution or return rate. The slider values exist only in React state and would need to be saved to the database before simulation, which changes the UX flow (users would need to "save" before "simulate"). This also makes the endpoint impossible to test without database setup.

2. **Frontend sends volatility too:** Would require exposing volatility via a separate endpoint and having the frontend pass it through. Adds an extra round-trip and puts volatility computation logic on the frontend's responsibility. The frontend has no use for the raw volatility value except to pass it back to the backend -- a code smell.

**Risks:**
- Frontend and backend must agree on parameter naming and types. Mitigation: the API contract is specified above; the engineer plan should include a contract test.
- `nest_egg_target` is optional in both endpoints. Frontend must handle `probability_of_target: null` gracefully. This is specified in the requirements (AC 1h) and is a standard null-check.

---

## Decision 5: Simple Projection Line Coexistence with Monte Carlo Bands

**Decision:** When Monte Carlo bands are displayed (Advanced view), the Phase 4 simple projection line is replaced by the Monte Carlo p50 (median) line. The simple projection line is NOT shown simultaneously. This answers Open Question Q-3 from the requirements.

**Rationale:** The Phase 4 simple projection uses deterministic compound growth: `balance * (1 + r)^t`. The Monte Carlo p50 (median) uses `exp(mu - sigma^2/2)` drift, which is the risk-adjusted equivalent. For typical parameters (7% return, 15% volatility), the difference is approximately `0.5 * 0.15^2 = 1.125%` annual drag -- the p50 line will be noticeably below the simple projection. Showing both lines on the same chart would confuse users who would see the "median" below their "expected" projection and wonder which is correct. Both are correct under different assumptions, but explaining that distinction in the UI adds complexity without proportional value.

The p50 line IS the corrected simple projection. The Monte Carlo view IS the advanced replacement for the simple view. The toggle between Simple and Advanced gives users the choice: deterministic optimism or probabilistic realism.

**Rejected Alternatives:**

1. **Show both lines (dimmed simple + bold median):** Would require explaining why the median is lower than the "expected" line. This is a volatility drag concept that is not intuitive. The AI narrative could explain it, but the visual confusion occurs before the user reads the narrative.

2. **Force the simple projection to use the same drift-corrected formula:** Would make Simple and Advanced views show the same center line, differing only in the bands. This misrepresents the simple projection -- the whole point of the simple view is that it shows a clean, optimistic, easy-to-understand line without statistical caveats.

**Risks:**
- Users who toggle between views may notice the center line drops. Mitigation: the AI narrative (when run) explains the difference. A brief tooltip on the Advanced view could read "Median outcome accounts for market volatility -- typically lower than the simple projection."
- If Phase 4's chart component tightly couples the projection line rendering, replacing it with the p50 may require refactoring. Mitigated by the fact that Phase 4 is not yet built -- the engineer plan should note that the ForecastingChart component needs to accept data from either source.

---

## Decision 6: AI Panel Component — New `ForecastAIPanel` with Shared CSS, Not a Generalized Base

**Decision:** Create a new `ForecastAIPanel.jsx` component that follows the same structure and CSS module pattern as `AIAnalysisPanel.jsx` but is a standalone component. The CSS classes are shared by importing the same `AIAnalysisPanel.module.css` file (or extracting shared styles into a `ai-panel-shared.module.css`). The component logic is separate because the `runAnalysis` function has a fundamentally different signature (POST body with projection data vs. empty POST). This answers Open Question Q-4 from the requirements.

**Rationale:** The two panels share visual design (collapsible header, config form, spinner, analysis text display) but differ in their data flow. `AIAnalysisPanel` sends an empty POST body and lets the backend gather its own context. `ForecastAIPanel` must assemble a rich POST body from page-level state (retirement settings, projection data, optional Monte Carlo results). Extracting a generic `<BaseAIPanel runAnalysis={fn}>` component would require lifting the config form, error handling, and state machine into props -- creating a premature abstraction that couples two panels that may diverge as features evolve. The pragmatic approach: duplicate the ~80 lines of JSX structure, share the CSS, and accept the minor duplication. If a third AI panel is added in the future, that is the right time to extract a base component (rule of three).

**Rejected Alternatives:**

1. **Generalized `BaseAIPanel` with `runAnalysis` prop:** Technically clean but creates a coupling point. If the forecast panel later needs streaming responses, different loading states, or a different layout (e.g., inline rather than collapsible), the base component becomes a constraint. The two panels currently differ only in the POST call, but future divergence is likely given that they serve different analytical domains.

2. **Reuse `AIAnalysisPanel` directly with a `mode` prop:** Would require conditional logic inside one component for two different behaviors. This is the classic "one component doing two things" anti-pattern. The component is small enough (under 100 lines) that duplication is cheaper than indirection.

**Risks:**
- CSS drift: if styles are updated in one panel but not the other, they become visually inconsistent. Mitigation: share the CSS module file. Both components import the same `.module.css`, so style changes apply to both.
- If a bug is found in the state machine logic, it must be fixed in two places. Acceptable risk given the component simplicity (5 states, no complex transitions).

---

## Decision 7: Caching Strategy — In-Memory Dict with Threading Lock

**Decision:** Two module-level Python dicts with a shared `threading.Lock`:

```
_volatility_cache = {"key": hash, "result": {...}, "valid": bool}
_montecarlo_cache = {}  # {param_hash: result_dict}, max 10 entries
_forecast_cache_lock = threading.Lock()
```

Cache key for Monte Carlo: hash of `(round(portfolio_value, -3), monthly_contribution, annual_return_pct, years, nest_egg_target, volatility_used)`. The `portfolio_value` is rounded to the nearest $1,000 to prevent trivial cache misses from small balance fluctuations between page loads.

Invalidation triggers:
- Sync completion (end of `_run_sync_worker`): clear both caches
- `POST /api/retirement` settings save: clear Monte Carlo cache only (volatility unchanged)

Cap: maximum 10 Monte Carlo cache entries (LRU eviction by insertion order). Single volatility cache entry (overwritten on recompute).

**Rationale:** This is a single-user desktop app. Redis, memcached, or any external cache is unnecessary overhead. An in-memory dict is the simplest possible cache, consistent with the existing `_ai_cooldowns` dict pattern for rate limiting. The threading lock is necessary because Flask can serve concurrent requests (e.g., the user opens the page in two tabs, or the frontend makes overlapping requests during fast UI interactions). The lock scope is narrow -- held only during cache read/write, not during computation.

**Rejected Alternatives:**

1. **No caching (recompute every request):** Simpler but wastes ~500ms per simulation request. When the user toggles between Simple and Advanced views, the cached result enables instant display of previously computed bands. Without caching, every toggle-back triggers a visible loading spinner.

2. **Database-backed cache (store results in a new table):** The requirements explicitly state "no new database tables." Additionally, simulation results are ephemeral -- they are derived entirely from existing data and settings. Persisting them adds migration complexity and data staleness concerns without benefit.

3. **Flask-Caching extension:** Adds a dependency for a problem that requires 15 lines of code. The app has no existing use of Flask-Caching, and introducing it for a single cache would be over-engineering.

**Risks:**
- Memory: Each cached simulation result is approximately `300 months * 5 percentiles * 8 bytes = 12KB` plus JSON overhead -- negligible even with 10 entries.
- Cache key collisions: SHA-256 hash of parameter tuple makes collisions practically impossible.
- Stale cache after app restart: Not a risk -- in-memory cache is empty on startup, which is correct behavior (volatility should be recomputed from current data).

---

## Decision 8: Monte Carlo Chart — Stacked Delta Areas on ComposedChart

**Decision:** The Monte Carlo band chart is a new component (`MonteCarloChart.jsx`) using Recharts `<ComposedChart>` with stacked `<Area>` components for the probability bands and a `<Line>` overlay for the p50 median. The data transformation from raw percentile values to stacked deltas happens in the component.

Data transformation:
```
For each data point:
  base = p10
  band_10_25 = p25 - p10
  band_25_50 = p50 - p25
  band_50_75 = p75 - p50
  band_75_90 = p90 - p75
```

Rendering (bottom to top):
1. Invisible base `<Area>` at `p10` level (fill: transparent, stroke: none) -- anchors the stack
2. `<Area stackId="mc">` for p10-p25 band -- lightest opacity (0.15)
3. `<Area stackId="mc">` for p25-p50 band -- medium opacity (0.25)
4. `<Area stackId="mc">` for p50-p75 band -- medium opacity (0.25)
5. `<Area stackId="mc">` for p75-p90 band -- lightest opacity (0.15)
6. `<Line>` for p50 median -- solid, full opacity

All fills use `--accent` (cobalt, `#4D9FFF`) at varying opacities via `rgba()`.

**Rationale:** The stacked delta approach is the established pattern in this codebase (`TypeStackedChart.jsx` uses `stackId` for stacked areas). Recharts does not natively support "range areas" (fill between two values), so the delta-stacking technique with a transparent base is the standard workaround. Using `ComposedChart` (rather than `AreaChart`) allows mixing `<Area>` and `<Line>` components, which is needed for the solid median line overlay. The existing test mock already stubs `ComposedChart`, so no mock changes are needed.

**Rejected Alternatives:**

1. **Recharts `<Area>` with `baseValue` prop for range fills:** Recharts does not support a `baseValue` prop on `<Area>`. The only way to create a filled region between two lines is the stacked-delta technique or a custom SVG path. The stacked approach is cleaner and uses standard Recharts API.

2. **Custom SVG `<path>` for each band:** Would give pixel-perfect control but bypasses Recharts entirely for the band rendering, losing tooltips, animations, and responsive behavior. The maintenance cost is high for marginal visual improvement.

3. **Extend `ForecastingChart` (Phase 4) instead of creating a new component:** Phase 4's chart is a `LineChart` with 3 scenario lines. Adding 4 stacked areas and switching the chart type to `ComposedChart` would significantly complicate that component. Separate components with clear responsibilities (simple projection vs. probabilistic bands) are easier to maintain and test independently.

**Risks:**
- Tooltip complexity: showing all 5 percentile values on hover requires a custom tooltip component. Recharts' default tooltip shows stacked delta values, not the absolute percentile values users expect. Mitigation: a custom `<Tooltip>` component that maps delta values back to absolute percentiles. This is a known pattern.
- Mobile legibility: 5-band gradients may be hard to distinguish on small screens. Mitigation: on mobile, the legend can be simplified and band colors can use slightly more contrast (higher opacity step).

---

## Decision 9: Prompt Design — Two Static Templates with Variable Interpolation

**Decision:** The backend maintains two prompt template strings (Variant A: simple projection only; Variant B: with Monte Carlo data) as Python constants. All numeric values are interpolated using `_sanitize_prompt_field()`. The prompt is constructed entirely server-side -- the frontend sends structured data, not prompt text. The AI is called with `max_tokens=1500`.

Prompt selection logic:
```python
if body.get("monte_carlo"):
    prompt = FORECAST_PROMPT_WITH_MC.format(...)
else:
    prompt = FORECAST_PROMPT_SIMPLE.format(...)
```

**Rationale:** Static templates with variable interpolation is the established pattern in every existing AI endpoint. No user free-text enters the prompt (all values are numeric or boolean), so prompt injection risk is negligible -- but `_sanitize_prompt_field()` is still applied for defense in depth. `max_tokens=1500` provides headroom for a 400-word analysis without truncation risk (400 words is approximately 500-600 tokens).

**Rejected Alternatives:**

1. **Dynamic prompt construction with conditional sections:** Building the prompt programmatically (appending sections based on what data is available) would be more flexible but harder to read and test. With only two variants that differ by a single Monte Carlo section, two static templates are clearer.

2. **Frontend sends a pre-built prompt:** Would put prompt engineering in the frontend, mixing concerns. The backend owns AI interaction -- this is the established pattern. The frontend sends structured data; the backend constructs the prompt.

3. **System message + user message separation:** The existing `_call_ai()` function sends a single user message. Adding system message support would require modifying `_call_ai()`, which affects all existing AI endpoints. Not justified for this use case -- the single-message pattern works fine for instruction-following prompts.

**Risks:**
- Prompt quality is hard to unit test. Mitigation: the prompt templates should be tested with representative data to verify they produce coherent output. A "prompt test" (manual review of AI output for 3-4 parameter combinations) should be part of QA.
- Token count could exceed `max_tokens=1500` if the AI is verbose. Mitigation: the response includes a `truncated` field when `stop_reason` is `max_tokens` or `length`, and the prompt explicitly instructs "200-400 words."

---

## Decision 10: Performance Budget and Loading UX

**Decision:** Target latencies:
- Volatility computation (cache miss): < 200ms
- Monte Carlo simulation (cache miss): < 1 second
- Full request (volatility + simulation + JSON serialization): < 2 seconds
- Cache hit: < 100ms
- AI narrative: < 15 seconds (external API dependency)

Loading UX: The "Run Simulation" button shows an inline spinner. The chart area displays a skeleton placeholder with the text "Simulating 5,000 scenarios..." during computation. The AI panel uses the existing spinner pattern ("Analyzing your forecast data...").

**Rationale:** The 2-second budget for Monte Carlo is conservative. Numpy vectorized operations on a `(5000, 360)` matrix complete in under 500ms. The budget includes the volatility query (first request only), percentile extraction, JSON serialization of 300+ data points, and network round-trip. The AI narrative has a separate, longer budget because it depends on an external API with variable latency.

**Risks:**
- First request after cache invalidation is the slowest (volatility query + simulation). Subsequent requests with different parameters still benefit from cached volatility. Acceptable latency profile.
- If the app runs on very low-end hardware (e.g., Raspberry Pi), numpy may be slower. Mitigation: the simulation count (5,000) is a named constant that can be reduced to 1,000 as a config option in the future (currently not user-configurable, per anti-goals).

---

## Design Details

### New Backend Files/Functions

| Location | Purpose |
|----------|---------|
| `backend/app.py` — new function `_compute_portfolio_volatility(conn)` | Queries `account_history` for investment accounts, computes annualized volatility with contribution adjustment |
| `backend/app.py` — new function `_run_monte_carlo(params, volatility)` | Vectorized GBM simulation, returns percentile bands and target probability |
| `backend/app.py` — new route `POST /api/forecast/montecarlo` | Validates input, calls volatility + simulation, manages cache |
| `backend/app.py` — new route `POST /api/forecast/ai-analysis` | Constructs prompt from payload, calls `_call_ai()`, rate-limited |
| `backend/app.py` — new constants `FORECAST_PROMPT_SIMPLE`, `FORECAST_PROMPT_WITH_MC` | Prompt templates |
| `backend/app.py` — new module-level `_volatility_cache`, `_montecarlo_cache`, `_forecast_cache_lock` | Cache infrastructure |
| `backend/app.py` — new function `_clear_forecast_caches()` | Called from sync completion and retirement settings save |
| `backend/requirements.txt` | Add `numpy>=1.24.0` |

### New Frontend Files

| File | Purpose |
|------|---------|
| `frontend/src/components/MonteCarloChart.jsx` | Stacked delta area chart for probability bands |
| `frontend/src/components/MonteCarloChart.module.css` | Chart-specific styles (container, legend, tooltip) |
| `frontend/src/components/ForecastAIPanel.jsx` | AI narrative panel for forecast context |
| `frontend/src/components/ProbabilityBadge.jsx` | "73.2% chance of reaching target" display with color coding |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/pages/ForecastingPage.jsx` (Phase 4) | Add Simple/Advanced toggle state, wire MonteCarloChart and ForecastAIPanel, add "Run Simulation" button |
| `frontend/src/api.js` | Add `runMonteCarlo(body)` and `runForecastAiAnalysis(body)` exports |
| `backend/app.py` — `_run_sync_worker()` | Add `_clear_forecast_caches()` call after sync completes (after line 537) |
| `backend/app.py` — `POST /api/retirement` | Add `_clear_forecast_caches()` call after settings save |

### Data Model Changes

None. No new database tables. All new data is computed on the fly and cached in memory.

### Cache Invalidation Integration Points

1. **Sync completion:** In `_run_sync_worker()`, after `update_sync_job(conn, job_id, ...)` at line 537, call `_clear_forecast_caches()`.
2. **Retirement settings save:** In the `POST /api/retirement` handler, after the successful INSERT/UPDATE, call `_clear_forecast_caches()` (Monte Carlo cache only -- volatility is unchanged by settings).

### Volatility Computation Constants

```
MIN_CALENDAR_DAYS = 90
MIN_DATA_POINTS = 60
OUTLIER_STD_THRESHOLD = 3.0
OUTLIER_ABS_THRESHOLD = 0.10  # 10% single-day
FALLBACK_VOLATILITY = 0.15
MIN_VOLATILITY_FLOOR = 0.01
TRADING_DAYS_PER_YEAR = 252
CONTRIBUTION_TRADING_DAYS = 21
```

---

## Open Questions for Human Decision

1. **numpy version pinning:** The research notes numpy is not currently in `requirements.txt`. Should we pin to `numpy>=1.24.0` (broad compatibility) or `numpy>=2.0.0` (latest major, potentially incompatible with some environments)? Recommendation: `numpy>=1.24.0` for maximum compatibility. This should be confirmed with the user before implementation.

2. **Phase 4 integration timing:** Phase 4 (Forecasting page) is not yet implemented. Phase 5 code depends on Phase 4's component structure. Should Phase 5 implementation wait until Phase 4 is merged, or should Phase 5 be planned against Phase 4's architecture document and reconciled during implementation? Recommendation: plan against the Phase 4 architecture document; implement after Phase 4 merges. The engineer plan should note exact integration points.

---

## Open Questions for Implementation (Resolved During Engineering)

1. The exact prop names of `ForecastingPage.jsx` (Phase 4) are unknown. The engineer plan should specify integration at the data level (retirement settings, type data, slider overrides) and note that prop names will be confirmed when Phase 4 ships.

2. Custom tooltip for the Monte Carlo chart needs to map stacked delta values back to absolute percentiles. The transformation is the reverse of the delta computation and should be implemented inline in the tooltip render function.

3. The `_clear_forecast_caches()` function runs inside `_run_sync_worker()` which is in a background thread. The `_forecast_cache_lock` threading lock handles this safely, but the implementation must verify that the lock is acquired before clearing.

4. The cache key rounding (`portfolio_value` rounded to nearest $1,000) means that a user whose portfolio changes by less than $500 between page loads will get a cache hit. This is intentional behavior -- sub-$1,000 changes do not materially affect a Monte Carlo simulation over decades.
