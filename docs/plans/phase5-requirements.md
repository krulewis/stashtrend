# Phase 5 Requirements — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Source:** PM Agent (refined from locked-in requirements + research findings)
**Status:** Ready for architecture pipeline
**Depends on:** Phase 4 (Forecasting page with simple projections + retirement planner)
**Size:** M

---

## 1. Clarified Intent

Phase 5 adds two "depth" layers to the Forecasting page built in Phase 4:

1. **Monte Carlo Simulation** -- Run thousands of randomized portfolio growth scenarios using historical volatility derived from `account_history` data. Display the results as probability bands (10th/25th/50th/75th/90th percentile) overlaid on the existing projection chart. Show the probability of reaching the user's retirement target. This is an opt-in "Advanced" view, not the default.

2. **AI Narrative Analysis** -- A collapsible panel (same UX as the Budget `AIAnalysisPanel`) that calls `_call_ai()` with projection and simulation context. The AI generates plain-English commentary: interpreting results, highlighting risks, and suggesting concrete actions. Works with or without Monte Carlo data.

The user is a retirement-focused, periodic-check investor. These features add analytical depth without cluttering the default simple projection view.

---

## 2. User Stories with Acceptance Criteria

### US-1: Monte Carlo Simulation View

**As a** retirement-focused investor,
**I want to** see probabilistic outcomes for my portfolio based on historical volatility,
**So that** I understand the range of possible futures, not just one deterministic line.

**Acceptance Criteria:**

| # | Criterion | Testable? |
|---|-----------|-----------|
| 1a | An "Advanced" toggle on the Forecasting page reveals the Monte Carlo view | UI test |
| 1b | Default view remains the simple projection from Phase 4 -- no Monte Carlo shown until toggled | UI test |
| 1c | Clicking "Run Simulation" triggers a backend call to `POST /api/forecast/montecarlo` | Integration test |
| 1d | Backend runs 5,000 simulations using Geometric Brownian Motion (GBM) with monthly time steps | Unit test |
| 1e | Volatility is computed from `account_history` daily balance data (portfolio-level, contribution-adjusted) | Unit test |
| 1f | Response includes percentile band data: 10th, 25th, 50th (median), 75th, 90th at each monthly time step | API contract test |
| 1g | Probability bands rendered as layered shaded areas on the projection chart (Recharts `<Area>` components with decreasing opacity from median outward) | Visual test |
| 1h | A "Probability of reaching target" percentage is displayed prominently when retirement target is set | UI test |
| 1i | Loading spinner shown while simulation computes; chart area shows placeholder | UI test |
| 1j | Results are cached server-side keyed on input parameters; re-displayed without recomputation on page revisit | Backend test |
| 1k | Cache invalidated when a new sync completes or retirement settings change | Backend test |
| 1l | If fewer than 90 days of `account_history` data exist for investment accounts, show an informational message and disable the simulation button | UI + backend test |

### US-2: AI Narrative Analysis Panel

**As a** user who is not a financial expert,
**I want to** read a plain-English interpretation of my projections and simulation results,
**So that** I can understand what the numbers mean and what actions I should consider.

**Acceptance Criteria:**

| # | Criterion | Testable? |
|---|-----------|-----------|
| 2a | A collapsible AI panel appears below the chart on the Forecasting page, collapsed by default | UI test |
| 2b | Panel follows the same state machine as `AIAnalysisPanel.jsx`: loading config -> idle (unconfigured: config form / configured: run button) -> running (spinner) -> done (analysis text + re-run/reconfigure) | UI test |
| 2c | "Run Analysis" sends `POST /api/forecast/ai-analysis` with a payload containing: current investable capital, retirement target (nest egg), CAGR, monthly contribution, time horizon (years), expected return rate, and (if available) Monte Carlo percentile endpoints and probability of target | API contract test |
| 2d | Backend constructs a prompt from the payload data and calls `_call_ai()` with `max_tokens=1500` | Unit test |
| 2e | AI response includes: (i) plain-English interpretation of the projection, (ii) interpretation of Monte Carlo spread and probability if available, (iii) identified risks, (iv) 2-3 concrete suggested actions | Prompt test / manual review |
| 2f | Panel works when Monte Carlo has NOT been run -- prompt adapts to include only simple projection data | Integration test |
| 2g | Rate-limited via `_check_ai_rate_limit("forecast_ai_analysis")` with 2s cooldown | Backend test |
| 2h | AI errors display in the panel and allow retry; do not affect the chart or Monte Carlo display | UI test |
| 2i | "Re-run" button clears previous analysis and re-calls the endpoint | UI test |

### US-3: Simple/Advanced View Toggle

**As a** user,
**I want to** choose between a simple projection view and an advanced Monte Carlo view,
**So that** the default experience stays clean but I can access depth when I want it.

**Acceptance Criteria:**

| # | Criterion | Testable? |
|---|-----------|-----------|
| 3a | A toggle (tab or button group) switches between "Simple" and "Advanced" views | UI test |
| 3b | "Simple" is the default on first visit | UI test |
| 3c | Switching to "Advanced" shows the Monte Carlo controls and (if previously run) the cached band chart | UI test |
| 3d | Toggle preference persists in component state for the session; does NOT need to persist across page loads | Behavioral test |
| 3e | AI panel is visible in both views, adapting its prompt based on what data is available | Integration test |
| 3f | Switching views does not trigger a new simulation run -- only the explicit "Run Simulation" button does | UI test |

---

## 3. Monte Carlo Simulation Requirements

### 3.1 Algorithm

- **Model:** Geometric Brownian Motion (GBM)
  - `S(t+1) = S(t) * exp((mu - sigma^2/2) * dt + sigma * sqrt(dt) * Z)`
  - `mu` = expected annual return (from retirement settings `expected_return_pct`, or CAGR if not set)
  - `sigma` = annualized volatility (computed from `account_history`)
  - `Z` = standard normal random variable (numpy)
  - `dt` = 1/12 (monthly time steps)
- **Monthly contributions** added to balance at each time step before applying returns

### 3.2 Parameters

| Parameter | Source | Default |
|-----------|--------|---------|
| Starting portfolio value | Sum of Retirement + Brokerage account balances (investable capital) | Required -- no default |
| Monthly contribution | `retirement_settings.monthly_contribution` | 0 |
| Expected annual return (mu) | `retirement_settings.expected_return_pct` or CAGR from Phase 1 | 7% |
| Annualized volatility (sigma) | Computed from `account_history` (see 3.3) | Fallback: 15% if insufficient data |
| Time horizon | `retirement_settings.target_retirement_age - retirement_settings.current_age` (years) | Required -- no default |
| Number of simulations | Fixed at 5,000 | Not user-configurable |
| Retirement target (nest egg) | `computeNestEgg()` output from retirement settings | Optional -- omit probability display if not set |

### 3.3 Volatility Computation

1. Query `account_history` for all investment accounts (type = 'investment'), filter to Retirement + Brokerage buckets via `BUCKET_MAP`
2. Sum daily balances across these accounts to get a portfolio time series
3. Compute daily log returns: `ln(balance_t / balance_{t-1})`
4. Adjust for detected contributions: estimate daily contribution = monthly contribution / ~21 trading days. Subtract from daily balance change before computing return. (Approximation is acceptable for v1.)
5. Annualize: `daily_std * sqrt(252)`
6. **Minimum data requirement:** 90 calendar days of `account_history` data with at least 60 non-zero data points. Below this threshold, return a `volatility_unavailable` flag and use the 15% fallback (with a UI note).

### 3.4 Output Shape

```
POST /api/forecast/montecarlo

Request body:
{
  "portfolio_value": 450000,
  "monthly_contribution": 2000,
  "annual_return_pct": 7.0,
  "years": 25,
  "nest_egg_target": 2000000    // optional
}

Response:
{
  "bands": [
    {
      "month": 0,
      "date": "2026-03-01",
      "p10": 450000,
      "p25": 450000,
      "p50": 450000,
      "p75": 450000,
      "p90": 450000
    },
    {
      "month": 1,
      "date": "2026-04-01",
      "p10": 448200,
      "p25": 451300,
      "p50": 455000,
      "p75": 458700,
      "p90": 462100
    },
    ...
  ],
  "probability_of_target": 73.2,       // null if no nest_egg_target
  "volatility_used": 0.152,            // annualized sigma
  "volatility_source": "account_history",  // or "fallback"
  "num_simulations": 5000,
  "cached": false
}
```

### 3.5 Caching

- Cache key: hash of `(portfolio_value, monthly_contribution, annual_return_pct, years, nest_egg_target, volatility_used)`
- Storage: in-memory dict (single-user app, no need for Redis)
- Invalidation: clear cache when `POST /api/retirement` saves new settings, or when a sync job completes
- Return `"cached": true` when serving from cache

---

## 4. AI Narrative Requirements

### 4.1 Endpoint

```
POST /api/forecast/ai-analysis

Request body:
{
  "portfolio_value": 450000,
  "monthly_contribution": 2000,
  "annual_return_pct": 7.0,
  "years_to_retirement": 25,
  "nest_egg_target": 2000000,
  "cagr_1y": 8.2,
  "on_track": true,
  "monte_carlo": {               // optional -- null if simulation not run
    "p10_final": 980000,
    "p25_final": 1400000,
    "p50_final": 1950000,
    "p75_final": 2600000,
    "p90_final": 3400000,
    "probability_of_target": 73.2,
    "volatility_used": 0.152
  }
}

Response:
{
  "analysis": "...(plain text, ~300-500 words)...",
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic"
}
```

### 4.2 Prompt Design

The backend constructs the prompt. Two variants:

**Variant A -- Simple projection only (no Monte Carlo):**

```
You are a personal finance advisor analyzing retirement projections for a single user.

DATA:
- Current investable portfolio: ${portfolio_value}
- Monthly contributions: ${monthly_contribution}
- Historical 1-year CAGR: ${cagr_1y}%
- Assumed annual return: ${annual_return_pct}%
- Years to retirement: ${years_to_retirement}
- Required nest egg: ${nest_egg_target}
- On track: ${on_track}

INSTRUCTIONS:
1. Interpret the projection in plain English (2-3 sentences)
2. Assess whether the user is on track for retirement
3. Identify 1-2 specific risks (contribution shortfall, return assumptions, time horizon)
4. Suggest 2-3 concrete actions with specific numbers where possible (e.g., "Increasing monthly contributions by $500 would...")
5. Keep tone encouraging but honest. No disclaimers about not being financial advice.
6. Use plain language. No jargon. No bullet points longer than one sentence.
7. Total length: 200-400 words.
```

**Variant B -- With Monte Carlo data:**

Same as Variant A, plus:

```
MONTE CARLO SIMULATION RESULTS (5,000 scenarios):
- 10th percentile final value: ${p10_final}
- 25th percentile final value: ${p25_final}
- Median (50th percentile) final value: ${p50_final}
- 75th percentile final value: ${p75_final}
- 90th percentile final value: ${p90_final}
- Probability of reaching target: ${probability_of_target}%
- Portfolio volatility (annualized): ${volatility_used}

ADDITIONAL INSTRUCTIONS:
- Interpret the spread between 10th and 90th percentile
- Explain the probability of target in practical terms
- If probability < 50%, emphasize the gap and what changes would help
- If probability > 80%, note that this is strong but not guaranteed
```

### 4.3 Prompt Safety

- All numeric fields passed through `_sanitize_prompt_field()` (existing helper)
- No user free-text is included in the prompt -- all values are numeric or boolean
- `max_tokens=1500` to allow full analysis without truncation risk

### 4.4 Error Handling

| Scenario | Behavior |
|----------|----------|
| AI not configured | Panel shows config form (existing pattern) |
| `_call_ai()` returns None | Return 400: "AI not configured. Save config via /api/ai/config first." |
| `_call_ai()` raises exception | Return 500: "AI analysis failed. Check server logs." Log full traceback. |
| `stop_reason` is `max_tokens`/`length` | Return the partial response with a note: `"truncated": true` |
| Rate limited (< 2s since last call) | Return 429 with retry message |

---

## 5. Edge Cases and Error States

| # | Case | Expected Behavior |
|---|------|-------------------|
| E-1 | Fewer than 90 days of `account_history` for investment accounts | Simulation button disabled. Tooltip: "Need at least 90 days of portfolio history for Monte Carlo simulation." Volatility falls back to 15% if user manually triggers (future consideration). |
| E-2 | All investment accounts are cash-equivalent (near-zero volatility, sigma < 0.5%) | Monte Carlo runs but bands collapse to near-identical lines. Show note: "Your portfolio shows very low volatility -- simulation outcomes are tightly clustered." |
| E-3 | AI not configured | AI panel shows config form. Monte Carlo works independently -- these are decoupled features. |
| E-4 | AI call fails or times out | Error message in AI panel. Retry available. No impact on chart or simulation. |
| E-5 | Very long time horizon (40+ years) | Allow up to 50 years. Beyond 50, return validation error: "Maximum projection horizon is 50 years." |
| E-6 | Zero monthly contributions | Valid scenario. Simulation projects growth from existing balance only. AI prompt notes zero contributions as a risk factor. |
| E-7 | Negative expected return | Allow values down to -5%. GBM handles it. AI prompt notes the pessimistic assumption. |
| E-8 | Retirement target not set (no nest egg) | Monte Carlo runs and shows bands. Probability-of-target section hidden. AI prompt uses Variant A without target comparison. |
| E-9 | Portfolio value is zero or very small (< $100) | Simulation runs but results are trivially small. No special handling needed -- the math is valid. |
| E-10 | Contribution-adjusted daily returns produce negative volatility estimate | Floor volatility at 0.01 (1%). This is a data quality issue from contribution noise -- log a warning. |
| E-11 | Phase 4 not deployed | Hard dependency. Phase 5 code assumes the Forecasting page route, chart component, and retirement settings exist. Build order enforcement is sufficient. |
| E-12 | Simulation request while another is in-flight | Frontend disables "Run Simulation" button during loading state. No backend queuing needed (single-user app). |
| E-13 | Browser tab left open, cached results go stale after sync | Cache invalidation on sync handles this server-side. Frontend should re-fetch when page gains focus if data is older than the last sync timestamp. |

---

## 6. UX Requirements

### 6.1 Advanced View Toggle

- Position: Above or beside the projection chart, consistent with Phase 4 layout
- Implementation: Tab group or segmented control ("Simple" | "Advanced")
- "Simple" is the default and always selected on page load
- Switching to "Advanced" does NOT auto-run the simulation -- user must click "Run Simulation"
- If cached results exist, display them immediately on toggle

### 6.2 Monte Carlo Chart

- Bands rendered as layered `<Area>` components with the median (p50) as a solid line
- Opacity gradient: p10-p90 band is lightest, p25-p75 is medium, p50 line is solid
- Color: Use `--accent` (cobalt) with varying opacity -- consistent with existing chart palette
- Legend: Label each band ("90th percentile", "75th", "Median", "25th", "10th")
- Tooltip: On hover, show all five percentile values at that date
- The simple projection line from Phase 4 should remain visible (possibly dimmed) when Monte Carlo is shown, for comparison

### 6.3 Probability of Target Display

- Prominent display near the chart (not buried in a table)
- Format: "73.2% chance of reaching your $2,000,000 target"
- Color coding: green (>= 70%), amber (40-69%), red (< 40%)
- Hidden entirely if no retirement target is configured

### 6.4 Loading States

| Component | Loading State |
|-----------|--------------|
| Monte Carlo simulation | "Run Simulation" button shows spinner. Chart area shows skeleton/placeholder. "Simulating 5,000 scenarios..." text. |
| AI analysis | Same as existing `AIAnalysisPanel`: spinner + "Analyzing your forecast data..." |

### 6.5 AI Panel

- Reuse the collapsible panel pattern from `AIAnalysisPanel.jsx`
- Can be a new component (`ForecastAIPanel.jsx`) or a generalized version of `AIAnalysisPanel`
- Running text: "Analyzing your forecast data..." (not "budget data")
- Output rendered as `<pre>` with `white-space: pre-wrap` (same as budget panel)
- Placed below the chart, after any Monte Carlo controls

### 6.6 Mobile

- Monte Carlo bands should render legibly on mobile (may need simplified legend)
- AI panel follows existing responsive patterns (full-width, collapsible)
- "Run Simulation" button should be full-width on mobile

---

## 7. Non-Functional Requirements

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Simulation performance | 5,000 runs x 30-year horizon (360 months) completes in < 2 seconds | numpy vectorized GBM is trivially fast; research confirms < 1s for this scale |
| End-to-end Monte Carlo latency (request to rendered chart) | < 5 seconds including network round-trip | User-facing responsiveness |
| AI narrative latency | < 15 seconds (depends on AI provider) | Acceptable for on-demand generation with spinner |
| Cache hit response time | < 200ms | Serving from in-memory cache should be near-instant |
| Memory overhead of cache | < 50MB for cached simulation results | Single set of band data (~300 rows x 5 floats) is tiny; cap at 10 cached parameter sets |
| No new Python dependencies | numpy must be already available; no new packages | Keep dependency footprint small |
| Accessibility | Probability bands have ARIA labels; target probability has `role="status"` for screen readers | WCAG compliance |

---

## 8. Constraints and Anti-Goals

### Constraints

- All portfolio data comes from Monarch sync -- no manual data entry for historical returns
- Volatility computed from `account_history` table (portfolio-level), NOT from `security_prices` (which does not exist)
- AI uses existing `_call_ai()` infrastructure -- no new AI provider integrations
- Must not regress Phase 4 simple projection functionality
- UI follows existing design system (Dark Cobalt tokens, Recharts patterns)

### Anti-Goals (explicitly NOT building)

- No per-security Monte Carlo (portfolio-level only)
- No user-configurable simulation count or distribution shape
- No saving/comparing multiple simulation runs
- No inflation-adjusted projections (deferred)
- No tax-drag modeling
- No real-time price feeds
- No FIRE calculator integration
- No Monte Carlo parameter tuning UI (number of sims, seed, etc.)
- No new database tables -- simulation results are cached in memory, not persisted

---

## 9. Deferred Decisions

| Item | Reason | When to Revisit |
|------|--------|-----------------|
| Per-security volatility via `security_prices` table | Table doesn't exist; `account_history` is sufficient for v1 | If users request holding-level risk analysis |
| Inflation adjustment toggle | Adds complexity; simple projection already uses nominal returns | Phase 6+ or user request |
| Exportable simulation reports | Nice-to-have, not core | After core simulation is validated |
| Configurable simulation parameters (num sims, confidence levels) | Premature optimization; 5,000 runs with standard percentiles is industry standard | If power users request it |
| Persistent view preference (Simple vs Advanced) | Session state is sufficient for v1 | If users consistently prefer Advanced view |
| Streaming AI responses | Current `_call_ai()` returns full text; streaming would improve perceived latency | If AI latency complaints arise |

---

## 10. Open Questions for Downstream Agents

| # | Question | Context |
|---|----------|---------|
| Q-1 | Should the Monte Carlo endpoint compute volatility on every call, or precompute and cache it separately? | Volatility changes only when new `account_history` data syncs. A separate `/api/forecast/volatility` endpoint could cache it independently. |
| Q-2 | Should the frontend send all Monte Carlo input parameters, or should the backend read retirement_settings directly? | Current draft has frontend sending params (more explicit, testable). Alternative: backend reads settings + account data (less network payload, but harder to test). |
| Q-3 | How should the Phase 4 simple projection line coexist with Monte Carlo bands on the same chart? | Options: (a) dim the simple line, (b) replace it with the p50 median, (c) show both. Architect should decide. |
| Q-4 | Is `AIAnalysisPanel` worth generalizing into a shared component, or should `ForecastAIPanel` be a separate component with copied patterns? | The config form logic is identical; the `runAnalysis` call differs. A shared base with a prop for the analysis function would reduce duplication. |
| Q-5 | Should contribution adjustment for volatility use detected monthly contributions from transactions, or the `retirement_settings.monthly_contribution` value? | Transaction-detected is more accurate but adds query complexity. Settings value is simpler but may not reflect actual behavior. |

---

## 11. Scope Summary

**Will be built in Phase 5:**

1. `POST /api/forecast/montecarlo` endpoint -- runs GBM simulation, returns percentile bands and target probability
2. Volatility computation module -- derives annualized volatility from `account_history` with contribution adjustment
3. In-memory simulation cache with parameter-based keys and sync/settings invalidation
4. Simple/Advanced view toggle on the Forecasting page
5. Monte Carlo band chart (Recharts `<Area>` components with layered opacity)
6. Probability-of-target display with color coding
7. `POST /api/forecast/ai-analysis` endpoint -- constructs prompt from projection/simulation data, calls `_call_ai()`
8. Forecast AI panel component (collapsible, same UX as Budget AI panel)
9. Loading states for both simulation and AI generation
10. Edge case handling (insufficient data, zero volatility, missing target, AI unavailable)

**Will NOT be built:**

- `security_prices` table or per-security volatility
- User-configurable simulation parameters
- Inflation adjustment
- Tax modeling
- FIRE calculator
- Multiple saved simulation runs
- New database tables

---

## 12. Dependencies Diagram

```
Phase 0 (Holdings sync)
    |
Phase 1 (NW by type + CAGR)
    |
Phase 2 (Milestones + Retirement tracker)
    |
Phase 4 (Forecasting page + simple projections)    <-- HARD DEPENDENCY
    |
Phase 5 (THIS PHASE)
    |-- Monte Carlo simulation (backend + frontend)
    |-- AI narrative analysis (backend + frontend)
    |-- Simple/Advanced toggle (frontend)

Infrastructure dependencies:
    - account_history table (Phase 0) -- for volatility
    - retirement_settings table (Phase 2) -- for simulation inputs
    - _call_ai() helper (existing) -- for AI narrative
    - AIAnalysisPanel.jsx (existing) -- UX reference
    - retirementMath.js (Phase 2/4) -- computeNestEgg, generateProjectionSeries
    - Forecasting page route + chart component (Phase 4) -- layout host
```
