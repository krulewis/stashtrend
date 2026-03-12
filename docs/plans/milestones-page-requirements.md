# Requirements: Milestones Page Consolidation

**Feature name:** Milestones Page Consolidation
**Change size:** M (multi-file, involves tests, clear scope — no new backend, no new systems)
**Date:** 2026-03-12
**Status:** Ready for pipeline

---

## 1. Overview

Consolidate all milestone and retirement-related UI onto a single dedicated "Milestones" page by:

1. Renaming the "Forecasting" nav tab to "Milestones"
2. Moving `MilestoneCardsView` and `RetirementPanel` from `NetWorthPage` to the renamed page
3. Deleting `MilestoneSkylineView` (the Recharts AreaChart skyline — not being relocated)
4. Deleting `MilestoneHeroCard` (the two-view toggle wrapper, no longer needed)
5. Reordering the Milestones page sections into a logical top-to-bottom flow
6. Cleaning up `NetWorthPage` so it contains only `TypeStackedChart` and `AccountsBreakdown`

No new features. No backend changes. Pure reorganization and deletion.

---

## 2. User Stories

| # | Story |
|---|-------|
| US-1 | As a user, I want all milestone and retirement content in one place so I don't have to switch between pages to see my progress and adjust my settings. |
| US-2 | As a user, I want the Net Worth page to focus on my current financial picture (chart by type + account list) without retirement planning UI cluttering it. |
| US-3 | As a user, I want retirement readiness context (am I on track?) shown before I see the raw projection numbers, so I understand the summary before the details. |
| US-4 | As a user, I want my milestone cards visible alongside the forecasting projection so I can see how milestones relate to the projection line. |

---

## 3. Page Layouts

### NetWorth page — BEFORE
```
StatsCards
NetWorthChart          ← already removed (committed 2026-03-12)
TypeStackedChart
MilestoneHeroCard
  └── MilestoneCardsView | MilestoneSkylineView (toggle)
AccountsBreakdown
RetirementPanel
```

### NetWorth page — AFTER
```
StatsCards
TypeStackedChart
AccountsBreakdown
```

### Milestones page — BEFORE (currently labeled "Forecasting")
```
[ForecastingSetup if first-time user]
ForecastingSummary   (readiness cards + gap analysis)
ForecastingChart     (historical + 3 projected lines + nest egg target)
ForecastingControls  (dual sliders: monthly contribution + expected return)
```

### Milestones page — AFTER
```
[ForecastingSetup if first-time user]
ForecastingSummary   (readiness cards + gap analysis)
MilestoneCardsView   (milestone cards grid with state pills, progress bars, projected dates)
ForecastingChart     (historical + 3 projected lines + nest egg target)
ForecastingControls  (dual sliders)
RetirementPanel      (collapsible settings form — exact position TBD: OQ-2)
```

---

## 4. Component Change Summary

| Component | Action | Notes |
|-----------|--------|-------|
| `MilestoneCardsView.jsx` | **Move** render site: NetWorthPage → Milestones page | Component file unchanged; only where it's rendered changes |
| `RetirementPanel.jsx` | **Move** render site: NetWorthPage → Milestones page | Component file unchanged |
| `MilestoneSkylineView.jsx` | **Delete** | Not moving — permanently removed |
| `MilestoneSkylineView.module.css` | **Delete** | |
| `MilestoneHeroCard.jsx` | **Delete or inline** | Only existed to toggle between Cards/Skyline views; with Skyline gone it's a no-op wrapper |
| `MilestoneHeroCard.module.css` | **Delete** | |
| `useMilestoneData.js` | **Evaluate** | Reads `typeData.series` passed as prop from NetWorthPage; Milestones page will need its own `typeData` fetch — see OQ-4 |
| `milestoneUtils.js` | **Keep unchanged** | Pure utilities still used by MilestoneCardsView |
| `nav.js` | **Update** | Label: `"Forecasting"` → `"Milestones"` |
| Route config (`App.jsx`) | **Update** | Path: `/forecasting` → `/milestones` (or keep with redirect — OQ-1) |
| `NetWorthPage.jsx` | **Remove** MilestoneHeroCard, RetirementPanel, their imports, their state, and their fetch calls | `fetchRetirement` and `typeData`→retirement prop chain removed |
| `ForecastingPage.jsx` | **Add** MilestoneCardsView section + RetirementPanel; reorder sections | |
| Tests for deleted components | **Delete** | `MilestoneSkylineView.test.jsx`, `MilestoneHeroCard.test.jsx` |
| `NetWorthPage.test.jsx` | **Update** | Remove MilestoneHeroCard/RetirementPanel mocks and assertions; reduce expected fetch count |
| `ForecastingPage.test.jsx` | **Update** | Add MilestoneCardsView and RetirementPanel presence assertions |

---

## 5. Success Criteria

| # | Criterion |
|---|-----------|
| SC-1 | Nav tab reads "Milestones" in Sidebar (desktop) and BottomTabBar (mobile) |
| SC-2 | Milestones page section order top-to-bottom: ForecastingSummary → MilestoneCardsView → ForecastingChart → ForecastingControls → RetirementPanel |
| SC-3 | RetirementPanel is present and functional on the Milestones page |
| SC-4 | NetWorth page contains only: StatsCards, TypeStackedChart, AccountsBreakdown |
| SC-5 | `MilestoneSkylineView` is fully removed — no file, no imports, no references |
| SC-6 | `MilestoneHeroCard` is fully removed — no file, no imports, no references |
| SC-7 | No milestone ReferenceLines on TypeStackedChart (already the case — must not regress) |
| SC-8 | ForecastingSetup first-time gate still works on the Milestones page |
| SC-9 | RetirementPanel save → data refreshes readiness cards, milestone cards, and projection (end-to-end data flow intact) |
| SC-10 | All tests pass (`make test`) — no failures from removed/moved components |
| SC-11 | Mobile layout renders Milestones page correctly in the new section order |

---

## 6. Out of Scope

- No visual redesign of any component
- No new features added to moved components
- No new backend endpoints
- No replacement content for the space freed on NetWorth
- No milestone ReferenceLines restored on TypeStackedChart
- No changes to ForecastingChart, ForecastingSummary, ForecastingControls internals

---

## 7. Edge Cases

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| EC-1 | First-time user (no retirement settings) | ForecastingSetup inline form appears; MilestoneCardsView and ForecastingChart are gated behind it (existing behavior preserved) |
| EC-2 | User has retirement settings but zero milestones | MilestoneCardsView renders its empty state; rest of page unaffected |
| EC-3 | User bookmarked `/forecasting` | If route changes to `/milestones`, `/forecasting` must redirect to `/milestones` |
| EC-4 | RetirementPanel save on Milestones page | Readiness cards, milestone cards, and projection all reflect updated settings without full page reload |
| EC-5 | Mobile viewport | All five sections stack vertically in the specified order; no overflow |

---

## 8. Open Questions (for research + architect)

| # | Question | Impact |
|---|----------|--------|
| OQ-1 | **Route path:** Keep `/forecasting` with label rename only, or change to `/milestones` with a `/forecasting` redirect? | Affects `App.jsx` router config, `nav.js`, any deep links, and test URLs |
| OQ-2 | **RetirementPanel position:** Top of Milestones page (above readiness), bottom (below controls), or inline with controls as a settings section? | Affects page layout and ForecastingPage.jsx composition order |
| OQ-3 | **MilestoneHeroCard disposition:** Delete entirely and render `MilestoneCardsView` directly, or keep as a thin wrapper? | Recommend delete — the wrapper only existed for the two-view toggle |
| OQ-4 | **`useMilestoneData` data source:** Hook currently receives `typeData` as a prop passed down from NetWorthPage (which fetches `/api/networth/by-type`). When MilestoneCardsView moves to ForecastingPage, will ForecastingPage fetch `/api/networth/by-type` independently, or will `useMilestoneData` call the API itself? | May require adding a `fetchNetworthByType` call to ForecastingPage's data-loading logic |
