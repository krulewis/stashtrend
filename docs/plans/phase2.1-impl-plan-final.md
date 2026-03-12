# Phase 2.1 — Final Implementation Plan (Errata Applied)

**Base plan:** `phase2.1-impl-plan.md`
**Review findings:** `phase2.1-review.md` (20 findings)

This document captures corrections to the initial plan. Implementers should read the base plan and apply these corrections.

---

## Review Response

| # | Severity | Correction |
|---|----------|------------|
| 1 | Critical | **Remove** `Customized` mock addition entirely. Today-dot is deferred — no component uses it. |
| 2 | Critical | All mock references must use `frontend/__mocks__/recharts.jsx` (NOT `frontend/src/__mocks__/`). |
| 3 | High | Fix overview: "`COLOR_AMBER` exists at line 119. `COLOR_ACCENT_LIGHT` is NEW and must be added." |
| 4 | High | Add `--green-tint: rgba(46,204,138,0.12)` and `--amber-tint: rgba(245,166,35,0.12)` to `index.css` `:root` block (follows `--accent-tint` precedent). |
| 5 | High | Hook returns both `rawInvestableCapital` (for chart) and `investableCapital` (`Math.max(0, raw)` for progress bars). `MilestoneSkylineView` receives `rawInvestableCapital`. |
| 6 | High | Use `aria-pressed` buttons per architecture decision. **No** `role="tablist"`, no roving tabindex, no arrow key handling. Each toggle button gets `aria-pressed={true/false}`. View container uses `role="region"`. |
| 7 | High | Conditional rendering is correct (per architecture). Design spec's `display: none` recommendation is overridden. Note for implementers: do NOT follow design spec on this point. |
| 8 | Medium | Change `years: 50` to `years: Math.min(Number(retirement.target_retirement_age) - Number(retirement.current_age), 50) \|\| 50` |
| 9 | Medium | Remove `tickCount` prop from XAxis. Use `interval="preserveStartEnd"` only (matches existing charts). |
| 10 | Medium | MilestoneLabel signature: `function MilestoneLabel({ viewBox, x, y, milestone, index, total, isMobile })` — `viewBox`/`x`/`y` are injected by Recharts via element cloning. Add code comment. |
| 11 | Medium | Informational — Group F fixture path is correct (`frontend/src/test/fixtures.js`). Overview cross-reference list has wrong path but no code impact. |
| 12 | Medium | Fix comment: import is `'./chartUtils.jsx'` not `'../components/chartUtils.jsx'` (same directory). |
| 13 | Medium | Note: MilestoneCard co-located in MilestoneCardsView.jsx is an intentional deviation from architecture (no independent consumer). |
| 14 | Medium | `Number()` coercion is harmless. Add comment: "API values are numeric; `|| null` converts 0 to null for computeNestEgg." |
| 15 | Low | Confirmed: no `Customized` import needed (consistent with #1). |
| 16 | Low | Accept min-height as-is. Prevents layout jump on toggle. |
| 17 | Low | Confirmed: null guards are correct for initial render. |
| 18 | Low | **Add** test files: `MilestoneCardsView.test.jsx` (status pills, progress bar ARIA, state rendering, nest egg glow, EC-5/EC-6 text) and `MilestoneSkylineView.test.jsx` (AreaChart renders, reference lines per milestone, no-projection notice). |
| 19 | Low | Y-axis domain edge case accepted — too unlikely to warrant complexity. |

---

## Updated File List

### Group A — Foundation (independent)

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/index.css` | **Modify** | Add `--green-tint` and `--amber-tint` tokens (finding #4) |
| `frontend/src/components/chartUtils.jsx` | **Modify** | Add `COLOR_ACCENT_LIGHT = '#7DBFFF'` after line 119 |
| `frontend/__mocks__/recharts.jsx` | **No change** | Customized mock removed (finding #1). Correct path (finding #2). |

### Group B — Data Layer (independent of A)

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/utils/milestoneUtils.js` | **Create** | Pure functions — sort, compute, scan, merge |
| `frontend/src/hooks/useMilestoneData.js` | **Create** | Returns `{ milestones, investableCapital, rawInvestableCapital, ... shouldRender }` (finding #5). Projection years use retirement age calc (finding #8). |

### Group C — View Components (depends on A, B)

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/components/MilestoneCardsView.jsx` | **Create** | Inner MilestoneCard component (finding #13). Uses `--green-tint`/`--amber-tint` tokens. |
| `frontend/src/components/MilestoneCardsView.module.css` | **Create** | Uses new CSS tokens, not broken `var()` refs (finding #4). |
| `frontend/src/components/MilestoneSkylineView.jsx` | **Create** | Receives `rawInvestableCapital` (finding #5). No `tickCount` (finding #9). MilestoneLabel destructures Recharts-injected props (finding #10). Import from `'./chartUtils.jsx'` (finding #12). |
| `frontend/src/components/MilestoneSkylineView.module.css` | **Create** | Minimal wrapper + no-projection notice |

### Group D — Container (depends on C)

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/components/MilestoneHeroCard.jsx` | **Create** | `aria-pressed` buttons, `role="region"` (finding #6). Conditional rendering (finding #7). Passes `rawInvestableCapital` to skyline view (finding #5). |
| `frontend/src/components/MilestoneHeroCard.module.css` | **Create** | Toggle mirrors RangeSelector visually. |

### Group E — Wiring (depends on D)

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/pages/NetWorthPage.jsx` | **Modify** | Add MilestoneHeroCard between TypeStackedChart and AccountsBreakdown. Remove `milestones` prop from TypeStackedChart. |
| `frontend/src/components/TypeStackedChart.jsx` | **Modify** | Remove milestone ReferenceLine loop, remove `milestones` prop, **definitively** remove `ReferenceLine` import (finding #10b). |

### Group F — Tests (parallel with C/D/E)

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/test/fixtures.js` | **Modify** | Add MOCK_RETIREMENT_NO_RETURN, _NO_MILESTONES, _SINGLE_MILESTONE (correct path per finding #11). |
| `frontend/src/__tests__/milestoneUtils.test.js` | **Create** | 14 cases across edge cases |
| `frontend/src/__tests__/useMilestoneData.test.js` | **Create** | Hook tests with renderHook |
| `frontend/src/__tests__/MilestoneHeroCard.test.jsx` | **Create** | Toggle, ARIA, guard conditions |
| `frontend/src/__tests__/MilestoneCardsView.test.jsx` | **Create** | Status pills, progress bars, state rendering (finding #18) |
| `frontend/src/__tests__/MilestoneSkylineView.test.jsx` | **Create** | Chart renders, reference lines, no-projection notice (finding #18) |
| `frontend/src/__tests__/TypeStackedChart.test.jsx` | **Modify** | Remove milestone tests, add no-reference-lines assertion |
| `frontend/src/__tests__/NetWorthPage.test.jsx` | **Modify** | Add MilestoneHeroCard mock and render assertion |

---

## Open Questions for Implementation

1. **Min-height on view panel** (#16) — 220px mobile / 300px desktop acceptable, or should it be dynamic?
2. **Today-dot overlay** (#1) — Deferred. Add as follow-up if desired.
