# Phase 4: Forecasting Page — Requirements Document

**Date:** 2026-03-09
**Author:** PM Agent
**Status:** Ready for architecture/design
**Depends on:** Phase 1 (CAGR — done), Phase 2 (Retirement tracker — done), Phase 2.1 (Investable capital fix — done)

---

## Overview

A new top-level **Forecasting** page in the Stashtrend sidebar that provides interactive compound-growth projections and integrated retirement planning. The page answers: "Given my current investable capital, contributions, and historical growth rate, where will I be at retirement?"

This is Layer 1 (Simple Projection) only. Monte Carlo simulation and AI narrative (Layer 2/3, Phase 5) are **out of scope**.

---

## User Stories

### US-1: View default projection curve
**As a** retirement-focused investor,
**I want to** see a compound growth projection of my investable capital from today to my retirement age,
**So that** I can understand my financial trajectory at a glance.

**Acceptance Criteria:**
- Chart shows investable capital (Retirement + Brokerage balances) projected forward
- Uses historical CAGR from `/api/networth/by-type` as the default return rate
- Uses monthly contribution from retirement settings (or auto-detected from transactions if available)
- X-axis: years/dates from now to retirement age
- Y-axis: portfolio value in dollars
- Historical data shown as solid line; projected data as a different style (dashed or lighter)
- Default view loads without any user interaction required

### US-2: See scenario comparison lines
**As a** user exploring what-if scenarios,
**I want to** see multiple projection lines showing current trajectory, +10% contributions, and -10% contributions,
**So that** I can visualize the impact of changing my savings rate.

**Acceptance Criteria:**
- Three lines on the chart: baseline, optimistic (+10% contributions), conservative (-10% contributions)
- Each line has a distinct visual treatment (color/dash pattern) and appears in the legend
- Lines diverge from the same starting point (current investable capital)
- Tooltip shows all three values at the hovered date

### US-3: Adjust projections with interactive sliders
**As a** user planning my finances,
**I want to** adjust the monthly contribution amount and expected return rate via sliders,
**So that** I can see how different assumptions change my projected outcome in real time.

**Acceptance Criteria:**
- Slider for monthly contribution: range $0–$50,000/month, step $100
- Slider for annual return rate: range 0%–20%, step 0.1%
- Sliders default to values from retirement settings (if saved) or sensible defaults
- Chart updates immediately (no save/submit required) as sliders move
- Numeric input field alongside each slider for precise entry
- Reset button to return sliders to saved/default values

### US-4: See projected value at retirement age
**As a** user tracking retirement readiness,
**I want to** see my projected portfolio value at my target retirement age displayed prominently,
**So that** I know the bottom-line number without reading the chart.

**Acceptance Criteria:**
- Summary card/callout shows: "Projected at age {X}: ${Y}"
- Updates in real time as sliders change
- Shows retirement year alongside age
- If retirement settings not configured, prompts user to set them (link to NW page or inline mini-form)

### US-5: Retirement gap analysis
**As a** user planning for retirement,
**I want to** see whether my projected portfolio meets my nest egg target,
**So that** I know if I need to adjust my savings.

**Acceptance Criteria:**
- Uses same nest egg calculation as RetirementSummary (computeNestEgg from retirementMath.js)
- Displays: "You need ${X} more" (shortfall) or "You're ${X} ahead of target" (surplus)
- Visual indicator: green for on-track, red/amber for off-track
- If nest egg target is not set (no desired income configured), section shows a prompt to configure
- Gap analysis updates in real time as sliders change

### US-6: Integrated retirement settings
**As a** user who has already configured retirement settings,
**I want** the Forecasting page to use my saved settings automatically,
**So that** I don't have to re-enter my age, retirement age, and income goal.

**Acceptance Criteria:**
- Page loads retirement settings from `/api/retirement` on mount
- Current age, target retirement age, desired income, monthly contribution, return rate all pre-populated
- If no settings exist, page shows helpful defaults and a prompt to configure
- Changes to sliders on this page do NOT auto-save to retirement settings (they're exploration-only)
- Explicit "Save as defaults" button to persist slider values back to retirement settings

### US-7: Navigate to Forecasting page
**As a** user,
**I want** a "Forecasting" item in the sidebar navigation,
**So that** I can access the page like any other section.

**Acceptance Criteria:**
- New nav item in sidebar between "Budget Builder" and "Sync Data" (or at end)
- Icon consistent with forecasting/projection concept
- URL route: `/forecasting`
- Active state highlights correctly
- Mobile bottom tab bar also includes the item

---

## Data Sources

| Data | Source | Endpoint/Location |
|------|--------|-------------------|
| Current investable capital | Retirement + Brokerage from latest type data point | `/api/networth/by-type` → series[-1].Retirement + series[-1].Brokerage |
| Historical CAGR | Per-bucket CAGR from type data | `/api/networth/by-type` → cagr.Retirement, cagr.Brokerage |
| Monthly contribution | User-entered in retirement settings | `/api/retirement` → monthly_contribution |
| Retirement age / current age | User-entered in retirement settings | `/api/retirement` → current_age, target_retirement_age |
| Desired annual income | User-entered in retirement settings | `/api/retirement` → desired_annual_income |
| Withdrawal rate | User-entered in retirement settings | `/api/retirement` → withdrawal_rate_pct |
| Social Security | User-entered in retirement settings | `/api/retirement` → social_security_annual |

---

## Edge Cases

1. **No retirement settings saved:** Page still renders with default sliders (contribution=$0, return=7%). Gap analysis section hidden. Prompt to configure retirement settings.
2. **No investable accounts:** If Retirement + Brokerage balance is $0, show projection starting from $0 (contribution-only growth).
3. **No CAGR available:** If insufficient history (<1Y), default return rate slider to 7% with a note "Insufficient history — using 7% default."
4. **Retirement age already passed:** If current_age >= target_retirement_age, show "Retirement age reached" message instead of projection.
5. **Very long projections (>40 years):** Chart should handle gracefully with appropriate downsampling.
6. **Negative CAGR:** If historical CAGR is negative, still use it as the default but show a warning: "Your historical return rate is negative."
7. **Zero contribution:** Valid scenario — projection shows growth from existing capital only.
8. **Mobile layout:** Chart and sliders must be usable on mobile. Sliders become full-width; summary cards stack vertically.

---

## Out of Scope (Phase 5)

- Monte Carlo simulation (probability bands, percentile outcomes)
- AI narrative analysis (plain-English commentary on projections)
- Tax-adjusted projections
- Inflation-adjusted projections (beyond what's already in retirement settings)
- Multiple portfolio projections (e.g., separate retirement vs brokerage)
- Contribution auto-detection from transaction history (future enhancement — currently manual entry only)
- Editing retirement settings inline on the Forecasting page (uses saved settings; sliders are exploration-only)

---

## Technical Constraints

- All projection math runs in the frontend (reuse `generateProjectionSeries` from `retirementMath.js`)
- No new backend API endpoints required for Layer 1 — all data available from existing endpoints
- Chart library: recharts (consistent with all other charts in the app)
- Design tokens: use existing CSS custom properties from `index.css`
- Responsive: `useResponsive()` hook for JS-dependent sizing; CSS modules for layout

---

## Success Criteria

1. User can navigate to `/forecasting` and see their projected investable capital growth
2. Sliders allow real-time exploration of contribution and return rate scenarios
3. Three scenario lines (baseline, +10%, -10%) are visible and distinguishable
4. Retirement gap analysis shows on-track/off-track status with dollar amount
5. Page loads existing retirement settings automatically
6. Works on both desktop and mobile layouts
7. Matches existing Stashtrend dark cobalt design language
