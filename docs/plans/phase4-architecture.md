# Phase 4: Forecasting Page — Architecture Decision Record

**Date:** 2026-03-09
**Author:** Architect Agent
**Inputs:** phase4-requirements.md, phase4-research.md

---

## Decision 1: Projection Calculation — Frontend Only

### Decision
All projection calculations run in the frontend using the existing `retirementMath.js` utilities. No new backend endpoints.

### Rationale
- `generateProjectionSeries()` already implements compound growth with monthly contributions
- `computeNestEgg()` already handles gap analysis math
- Layer 1 projections are deterministic (no randomness, no external data lookups)
- Keeping calculations client-side enables instant slider feedback without network round-trips
- All required inputs (investable capital, CAGR, retirement settings) are already available from existing API endpoints

### Rejected Alternative: Backend projection endpoint
A `POST /api/forecasting/project` endpoint was considered. Rejected because:
- Adds latency to slider interactions (every slider change = network call)
- No server-side data needed that isn't already fetched
- Would duplicate `retirementMath.js` logic in Python
- Monte Carlo (Phase 5) may need backend, but that's future scope

### Risks
- If Phase 5 Monte Carlo needs different projection parameters, the frontend math may need refactoring. Mitigated by keeping `retirementMath.js` functions generic.

---

## Decision 2: No New Backend API Endpoints

### Decision
Phase 4 uses only existing endpoints:
- `GET /api/networth/by-type` — investable capital + CAGR
- `GET /api/retirement` — user settings

### Rationale
- All data needed for simple projections is already served
- No new DB tables, no schema changes
- Minimizes backend risk and review scope

### Rejected Alternative: Dedicated forecasting settings table
Considered a `forecasting_preferences` table to persist slider positions. Rejected because:
- Sliders are exploration-only (requirements state changes don't auto-save)
- "Save as defaults" writes back to `retirement_settings` via existing `POST /api/retirement`
- Avoids schema proliferation for a single-page feature

---

## Decision 3: Blended CAGR Calculation

### Decision
Compute a balance-weighted average CAGR from Retirement and Brokerage buckets as the default return rate for the slider.

**Formula:**
```
blendedCAGR = (retirementBalance * retirementCAGR + brokerageBalance * brokerageCAGR) / (retirementBalance + brokerageBalance)
```

Use 1Y CAGR as primary, fall back to 3Y, then 5Y, then 7% hardcoded default.

### Rationale
- Balance-weighted is more accurate than simple average (a $500K retirement account with 8% matters more than a $10K brokerage with 15%)
- 1Y CAGR is most recent/relevant for near-term projections
- 7% fallback is the commonly cited long-term stock market average

### Implementation
New utility function `computeBlendedCAGR(typeData)` in `retirementMath.js`.

---

## Decision 4: Component Architecture

### Decision

```
ForecastingPage (page)
├── ForecastingChart (component) — recharts LineChart with 3 scenario lines + historical
├── ForecastingControls (component) — sliders for contribution + return rate
├── ForecastingSummary (component) — projected value + gap analysis cards
└── uses retirementMath.js for all calculations
```

### Rationale
- **ForecastingPage** owns all state (retirement settings, typeData, slider values) and passes down
- **ForecastingChart** is a pure render component (data in, chart out) — matches pattern of `NetWorthChart`, `TypeStackedChart`
- **ForecastingControls** encapsulates slider UI — separates interaction from display
- **ForecastingSummary** shows the key numbers — mirrors `RetirementSummary` pattern but with Phase 4-specific content

### Rejected Alternative: Single monolithic component
Rejected because it would exceed 300 lines, harder to test slider logic independently from chart rendering.

### Rejected Alternative: Reuse RetirementPanel directly
RetirementPanel is tightly coupled to editing/saving retirement settings. The Forecasting page needs exploration-only sliders with different UX. Sharing code at the utility level (retirementMath.js) is the right abstraction.

---

## Decision 5: State Management — Local State with useMemo

### Decision
Use React local state (`useState`) for slider values. Use `useMemo` to derive projection data from slider state + fetched data. No global state management (Redux, Context, etc.).

### Rationale
- Forecasting page is self-contained — no cross-page state sharing needed
- `useMemo` ensures projection recalculation only when inputs change
- Matches existing patterns (NetWorthPage, BudgetPage all use local state)
- Slider state is ephemeral — doesn't need persistence beyond the page session

### Performance
- `generateProjectionSeries` for 360 months (30 years) is O(n) with n=360 — sub-millisecond
- Three scenario lines = 3 calls = still sub-millisecond
- No debouncing needed on slider input — direct state update is fine

---

## Decision 6: Chart Type — LineChart (not AreaChart)

### Decision
Use recharts `LineChart` with multiple `Line` components, not `AreaChart`.

### Rationale
- Multiple overlapping projection lines are clearer as lines than filled areas
- Historical data can be a solid line; projected data dashed — clear visual distinction
- Existing charts (NetWorthChart, TypeStackedChart) use AreaChart for single/stacked series; Forecasting is a different use case
- LineChart supports `strokeDasharray` per line for visual differentiation

---

## Decision 7: Extract Shared Investable Capital Utility

### Decision
Extract `getInvestableCapital(typeData)` from the inline computation in `RetirementPanel.jsx` into `retirementMath.js`.

### Rationale
- Currently duplicated logic: `RetirementPanel` computes it inline (lines 44-48)
- Forecasting page needs the same computation
- Single source of truth prevents drift

---

## Decision 8: Navigation Placement

### Decision
Add `/forecasting` nav item after "Net Worth" in the `NAV_ITEMS` array.

**Ordering:** Net Worth → Forecasting → Account Groups → Budgets → Budget Builder → Sync Data

### Rationale
- Forecasting is closely related to Net Worth (same data domain — investments/retirement)
- Placing it adjacent creates a logical flow: see current state (NW) → see future projection (Forecasting)
- Icon: `🔮` (crystal ball — commonly associated with predictions/forecasting)

---

## Decision 9: "Save as Defaults" Flow

### Decision
The "Save as defaults" button on the Forecasting page writes the current slider values (contribution, return rate) back to `retirement_settings` via the existing `POST /api/retirement` endpoint.

### Rationale
- Reuses existing save infrastructure
- Persists user preferences without a new table
- The existing RetirementPanel on the Net Worth page will reflect the updated values

### Implementation
- Read current retirement settings
- Merge slider values into the settings object
- POST the merged object
- Show success toast/feedback

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  ForecastingPage                     │
│                                                      │
│  State: retirementSettings, typeData, sliderValues   │
│  Fetches: /api/retirement, /api/networth/by-type     │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           ForecastingControls                    │ │
│  │  [Contribution slider] [Return rate slider]     │ │
│  │  [Reset] [Save as defaults]                     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           ForecastingChart                       │ │
│  │  recharts LineChart                              │ │
│  │  ── Historical (solid)                           │ │
│  │  -- Baseline projection (dashed)                 │ │
│  │  ·· +10% contributions (dotted)                  │ │
│  │  ·· -10% contributions (dotted lighter)          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │         ForecastingSummary                       │ │
│  │  [Investable Capital] [Projected @ Retirement]  │ │
│  │  [Nest Egg Needed]    [Gap: $X ahead/behind]    │ │
│  │  [On Track / Off Track badge]                   │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## New/Modified Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/pages/ForecastingPage.jsx` | **New** | Page component |
| `frontend/src/pages/ForecastingPage.module.css` | **New** | Page styles |
| `frontend/src/components/ForecastingChart.jsx` | **New** | Projection chart |
| `frontend/src/components/ForecastingChart.module.css` | **New** | Chart styles |
| `frontend/src/components/ForecastingControls.jsx` | **New** | Slider controls |
| `frontend/src/components/ForecastingControls.module.css` | **New** | Controls styles |
| `frontend/src/components/ForecastingSummary.jsx` | **New** | Summary cards + gap analysis |
| `frontend/src/components/ForecastingSummary.module.css` | **New** | Summary styles |
| `frontend/src/utils/retirementMath.js` | **Modify** | Add `getInvestableCapital()`, `computeBlendedCAGR()` |
| `frontend/src/nav.js` | **Modify** | Add forecasting nav item |
| `frontend/src/App.jsx` | **Modify** | Add route + import |
| `frontend/src/api.js` | **No change** | Existing endpoints sufficient |
| `backend/app.py` | **No change** | No new endpoints |

---

## Risks

1. **Slider re-render performance:** Mitigated by `useMemo` — projection math is cheap.
2. **Inconsistency with RetirementPanel:** Both show projections but via different UIs. Mitigated by sharing `retirementMath.js` utilities.
3. **Mobile slider usability:** HTML range inputs need explicit touch-target sizing. Mitigated by CSS with adequate height/padding.
4. **CAGR data gaps:** If user has < 1 year of data, blended CAGR returns null. Mitigated by 7% fallback with visual notice.
