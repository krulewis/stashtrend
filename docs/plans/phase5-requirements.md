# Phase 5 Requirements — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Source:** Extracted from locked-in requirements (`investment-forecasting-requirements.md`)
**Status:** Ready for research/architecture pipeline
**Depends on:** Phase 4 (Forecasting page with simple projections + retirement planner)

---

## Overview

Phase 5 adds two advanced layers to the existing Forecasting page built in Phase 4:
1. **Monte Carlo Simulation** — probabilistic forecasting using historical volatility
2. **AI Narrative Analysis** — personalized plain-English interpretation of projection/simulation results

These are "depth" features that enhance the base forecasting experience without replacing it.

---

## User Stories

### US-1: Monte Carlo Simulation View
**As a** retirement-focused investor,
**I want to** see probabilistic outcomes for my portfolio based on historical volatility,
**So that** I understand the range of possible futures, not just one line.

**Acceptance Criteria:**
- [ ] An "Advanced" toggle/tab on the Forecasting page reveals the Monte Carlo view
- [ ] The simulation runs thousands of randomized scenarios (default: 1,000–5,000 runs)
- [ ] Uses historical volatility calculated from `security_prices` data and/or account history
- [ ] Displays probability bands: 10th, 25th, 50th (median), 75th, 90th percentile outcomes
- [ ] Bands rendered as shaded areas on the existing projection chart (Recharts `<Area>` fills)
- [ ] Shows a clear "probability of hitting retirement target" percentage
- [ ] Simulation runs on the backend (Python) — not in the browser
- [ ] Results are cached to avoid re-running on every page load
- [ ] Loading state shown while simulation is computing
- [ ] Graceful degradation if insufficient historical price data (show message, fall back to simple projection)

### US-2: AI Narrative Analysis Panel
**As a** user who is not a financial expert,
**I want to** read a plain-English interpretation of my projections and simulation results,
**So that** I can understand what the numbers mean and what actions I should consider.

**Acceptance Criteria:**
- [ ] An AI analysis panel appears on the Forecasting page (collapsed by default)
- [ ] Same UX pattern as the Budget AI analysis panel (`AIAnalysisPanel.jsx`)
- [ ] Uses the existing `_call_ai()` backend infrastructure (no new AI provider code)
- [ ] The prompt includes: current portfolio value, retirement target, CAGR, contribution rate, Monte Carlo percentiles (if available), time to retirement
- [ ] AI generates personalized commentary that:
  - Interprets the projection in plain English
  - Interprets Monte Carlo results (probability of success, spread of outcomes)
  - Highlights specific risks (e.g., high volatility, low contribution rate, late start)
  - Suggests concrete actions (increase contributions, rebalance, adjust target age)
- [ ] "Re-run" button to regenerate analysis
- [ ] Works even without Monte Carlo data (just interprets simple projection)
- [ ] Rate-limited per existing AI cooldown pattern (2s per-endpoint cooldown)

### US-3: Simple/Advanced View Toggle
**As a** user,
**I want to** choose between a simple projection view and an advanced Monte Carlo view,
**So that** the default experience stays clean but I can access depth when I want it.

**Acceptance Criteria:**
- [ ] Default view shows simple projection (Phase 4 output)
- [ ] Toggle/tab switches to Advanced view with Monte Carlo bands
- [ ] User's view preference persists (e.g., via `retirement_settings` or local state)
- [ ] AI panel available in both views (adjusts prompt based on available data)

---

## Edge Cases

| # | Case | Expected Behavior |
|---|------|-------------------|
| E-1 | No historical price data in `security_prices` | Show message: "Historical price data needed for Monte Carlo simulation. Sync more data." Fall back to simple projection. |
| E-2 | Very short price history (< 30 days) | Same as E-1 — insufficient for meaningful volatility estimate |
| E-3 | All accounts are cash (zero volatility) | Monte Carlo collapses to a single line (no spread). Show note explaining why. |
| E-4 | AI not configured | AI panel shows config form (existing pattern). Monte Carlo works independently. |
| E-5 | AI call fails | Show error in panel, allow retry. Don't affect Monte Carlo display. |
| E-6 | Very long time horizon (40+ years) | Simulation should still work but note increasing uncertainty. Cap at reasonable limits if needed. |
| E-7 | Zero contributions | Valid scenario — project growth from existing balance only |
| E-8 | Negative expected return | Allow it (bear case). Monte Carlo handles it naturally. |
| E-9 | Retirement target not set | Monte Carlo still runs (shows bands). Probability-of-target section hidden. |
| E-10 | Simulation takes too long | Show timeout message. Consider reducing iterations or returning partial results. |
| E-11 | Phase 4 not yet deployed | Phase 5 cannot function — hard dependency. Build system should enforce order. |

---

## Out of Scope

- **Real-time price feeds** — Monte Carlo uses synced historical data, not live prices
- **Individual security-level simulation** — Simulation is portfolio-level, not per-holding
- **Custom distribution assumptions** — Uses log-normal (standard), no user-configurable distribution shapes
- **Tax-adjusted projections** — Not modeling tax drag in simulation
- **Inflation adjustment toggle** — Deferred (could be Phase 6+)
- **Monte Carlo parameter tuning UI** — Default parameters only; no user-facing knobs for number of simulations, etc.
- **Saving/comparing multiple simulation runs** — Single run at a time
- **FIRE calculator integration** — Explicitly deferred per requirements

---

## Data Dependencies

### From Phase 4 (assumed available):
- Forecasting page with route and layout
- Simple projection engine (`retirementMath.js` or backend equivalent)
- Retirement settings (target age, desired income, contributions, etc.)
- Projection chart component (Recharts-based)

### From Phase 0 (available):
- `holdings` table with per-account positions
- `security_prices` table (may be empty or sparse — need to verify data availability)

### From existing infrastructure:
- `_call_ai()` helper in `app.py`
- AI config endpoints (`/api/ai/config`)
- `AIAnalysisPanel.jsx` as UX reference
- `retirement_settings` table
- Account history and CAGR data from Phase 1

---

## Non-Functional Requirements

- **Performance:** Monte Carlo simulation (1,000 runs, 30-year horizon) should complete in < 5 seconds
- **Caching:** Results cached per parameter set (portfolio value + contributions + return assumptions + time horizon). Invalidate on new sync or settings change.
- **Accessibility:** Probability bands must have adequate contrast. Screen reader text for probability-of-target percentage.
- **Mobile:** Monte Carlo chart should be readable on mobile. AI panel follows existing responsive patterns.

---

## Success Criteria (Phase 5 specific)

1. User can toggle to Advanced view and see Monte Carlo probability bands
2. Probability of hitting retirement target displayed as a clear percentage
3. AI panel generates useful, personalized commentary about projections
4. AI suggestions are actionable (increase contributions by $X, adjust target age, etc.)
5. Default view remains the simple projection — Monte Carlo is opt-in
6. No regression to Phase 4 simple projection functionality
