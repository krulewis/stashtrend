# Phase 4: Forecasting Page — Research Report

**Date:** 2026-03-09
**Author:** Research Agent
**Status:** Complete

---

## 1. Existing Projection Math (`retirementMath.js`)

**Location:** `/home/user/stashtrend/frontend/src/utils/retirementMath.js`

Three pure functions already exist:

| Function | Purpose | Reusable for Phase 4? |
|----------|---------|----------------------|
| `computeNestEgg(desiredIncome, ssAnnual, withdrawalRate)` | Calculates required nest egg via safe withdrawal rate method | **Yes** — gap analysis needs this |
| `generateProjectionSeries({ currentNetWorth, monthlyContribution, annualReturnPct, years, startDate })` | Generates monthly compound growth array `[{date, projected_net_worth}]` | **Yes** — core projection engine |
| `mergeHistoryWithProjection(history, projection)` | Merges historical NW with projection by date key | **Possibly** — useful if we overlay historical on the chart |

`generateProjectionSeries` is already used in `RetirementPanel.jsx` (line 55) to compute `projectedAtRetirement`. It takes investable capital as the starting point.

**Key insight:** The math engine is frontend-only and already handles the exact compound growth calculation needed. No new math is required for Layer 1.

---

## 2. Retirement Settings & Data Flow

### Backend

**Table:** `retirement_settings` (single-row, `id = 1`)
- Fields: `current_age`, `target_retirement_age`, `desired_annual_income`, `monthly_contribution`, `expected_return_pct`, `inflation_rate_pct`, `social_security_annual`, `withdrawal_rate_pct`, `milestones` (JSON text)

**Endpoints:**
- `GET /api/retirement` — returns full settings row (or `{"exists": false}`)
- `POST /api/retirement` — upserts settings with validation

### Frontend

**`RetirementPanel.jsx`** — manages form state, calls `computeNestEgg` and `generateProjectionSeries`, renders `RetirementSummary`.

**`RetirementSummary.jsx`** — displays: current investable capital, nest egg needed, projected at retirement, target year, on/off track badge.

**Data flow in `NetWorthPage.jsx`:**
1. `fetchRetirement()` → retirement settings
2. `fetchNetworthByType()` → typeData (series with Retirement/Brokerage buckets + CAGR)
3. `RetirementPanel` receives both, computes investable capital from `typeData.series[-1].Retirement + typeData.series[-1].Brokerage`

**For Forecasting page:** Same two fetches needed. Can reuse exact same pattern.

---

## 3. Investable Capital Computation

**Location:** `RetirementPanel.jsx`, lines 44-48

```javascript
const investableCapital = (() => {
  if (!typeData?.series?.length) return null
  const latest = typeData.series[typeData.series.length - 1]
  return (latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)
})()
```

This should be extracted into a shared utility for reuse on the Forecasting page.

---

## 4. CAGR Data

**Backend:** `_compute_bucket_cagr()` in `app.py` computes 1Y/3Y/5Y CAGR per bucket.

**API response from `/api/networth/by-type`:**
```json
{
  "series": [...],
  "cagr": {
    "Retirement": {"1y": 12.5, "3y": 8.2, "5y": 9.1},
    "Brokerage": {"1y": 15.0, "3y": null, "5y": null}
  },
  "bucket_colors": {...},
  "bucket_order": [...]
}
```

**For Forecasting page default return rate:** Use a blended CAGR across Retirement + Brokerage buckets, weighted by current balance. Fall back to 7% if no CAGR available.

---

## 5. Contribution Detection

Currently **manual only**. The `monthly_contribution` field in `retirement_settings` is user-entered. There is no auto-detection from transactions yet (mentioned in requirements as a future enhancement).

The Forecasting page should use `retirement_settings.monthly_contribution` as the default slider value.

---

## 6. Existing Page Patterns

### Page structure (from `NetWorthPage.jsx`):
1. Page header with title + refresh button
2. Loading state → error state → content
3. `Promise.all` for parallel data fetching in `useEffect`
4. CSS modules for styling

### Navigation:
- `nav.js` exports `NAV_ITEMS` array — add new entry for `/forecasting`
- `App.jsx` has `<Routes>` with lazy-free direct imports
- `Sidebar.jsx` and `BottomTabBar.jsx` both consume `NAV_ITEMS`

### Chart patterns:
- All charts use `recharts` (`AreaChart`, `LineChart`)
- `ResponsiveContainer` wraps all charts
- Shared utilities from `chartUtils.jsx`: `fmtCompact`, `fmtFull`, `filterByRange`, `downsample`, `sharedChartElements`, color constants, `TOOLTIP_STYLE`
- `useResponsive()` for JS-dependent chart dimensions
- `RangeSelector` for time range filtering

---

## 7. Design System Tokens

**Location:** `/home/user/stashtrend/frontend/src/index.css`

Key tokens for the Forecasting page:
- **Backgrounds:** `--bg-card` (#1C2333), `--bg-deep` (#0E1423), `--bg-inset` (#0D1220)
- **Text:** `--text-primary` (#F0F6FF), `--text-secondary` (#8BA8CC), `--text-muted` (#4A6080)
- **Accents:** `--accent` (#4D9FFF), `--green` (#2ECC8A), `--red` (#FF5A7A), `--amber` (#F5A623)
- **Spacing:** `--sp-1` through `--sp-12` (4px–48px)
- **Radius:** `--radius-sm` (6px) through `--radius-xl` (16px)
- **Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Transitions:** `--ease-quick` (150ms), `--ease-default` (200ms)

Chart-specific (hardcoded hex in `chartUtils.jsx` because SVG doesn't support CSS vars):
- `COLOR_ACCENT` = #4D9FFF
- `COLOR_POSITIVE` = #2ECC8A
- `COLOR_NEGATIVE` = #FF5A7A
- `COLOR_AMBER` = #F5A623

---

## 8. Existing Component Reuse Opportunities

| Component | Reuse | Notes |
|-----------|-------|-------|
| `RangeSelector` | **Yes** | Time range filtering for chart |
| `RetirementSummary` | **Partial** | Could adapt for gap analysis, but Forecasting needs more dynamic display |
| `chartUtils.jsx` | **Yes** | formatters, tooltip style, shared chart elements, colors |
| `retirementMath.js` | **Yes** | `generateProjectionSeries`, `computeNestEgg`, `mergeHistoryWithProjection` |
| `useResponsive` | **Yes** | Responsive chart dimensions |
| `StatsCards` | **Partial** | Pattern to follow for summary cards, but different content |

---

## 9. File Structure Patterns

Pages live in `frontend/src/pages/` with `.jsx` + `.module.css` pairs.
Components live in `frontend/src/components/`.
Utilities in `frontend/src/utils/`.
API functions in `frontend/src/api.js`.

Test files are co-located: `ComponentName.test.jsx` next to `ComponentName.jsx`.

---

## 10. Backend API — No New Endpoints Needed

All data for Layer 1 projections is available from existing endpoints:
- `/api/networth/by-type` — investable capital + CAGR
- `/api/retirement` — user settings (age, contribution, return rate, etc.)

No new backend tables or endpoints are required for Phase 4.

---

## 11. Key Risks / Considerations

1. **Blended CAGR calculation:** Need a clear formula for combining Retirement + Brokerage CAGR weighted by balance. If one bucket has null CAGR, fall back to the other.
2. **Slider performance:** Recharts re-renders can be expensive. May need `useMemo` or debouncing on slider changes.
3. **Shared investable capital logic:** Currently computed inline in `RetirementPanel`. Should extract to avoid duplication.
4. **Chart data volume:** Monthly projection for 30+ years = 360+ data points. Within recharts comfort zone but should downsample if needed.
5. **Mobile slider UX:** HTML range inputs can be finicky on mobile. Consider touch-friendly sizing.
