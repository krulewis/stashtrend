# Architecture Decision: Milestones Page Consolidation

**Feature name:** Milestones Page Consolidation
**Change size:** M
**Date:** 2026-03-12
**Status:** Approved

---

## Decision Summary

Consolidate all milestone and retirement UI onto the existing ForecastingPage by: (1) renaming the route to `/milestones` with a `/forecasting` redirect, (2) calling `useMilestoneData` inside ForecastingPage and rendering MilestoneCardsView directly (no wrapper), (3) adding a `handleSaveRetirement` callback and rendering RetirementPanel at the bottom of the page, (4) replacing the `handleEditSettings` navigate-away call with an in-page scroll to the RetirementPanel anchor, and (5) deleting MilestoneHeroCard, MilestoneSkylineView, and all their associated files and tests. No backend changes. No new API calls (ForecastingPage already fetches both `/api/networth/by-type` and `/api/retirement`).

---

## Open Question Decisions

### OQ-1: Route path

**Decision:** Change to `/milestones` with a `/forecasting` redirect.

**Rationale:** The page's primary identity is shifting from "Forecasting" to "Milestones." Keeping the old path as the canonical route while only changing the label creates a semantic mismatch that will confuse future developers (the nav says "Milestones" but the URL says "forecasting"). A `<Navigate to="/milestones" replace />` on `/forecasting` preserves any bookmarks at zero cost -- `Navigate` is already imported in `App.jsx`. The rename also makes the codebase grep-friendly: searching for "milestone" surfaces the route, the page, and the nav entry.

### OQ-2: RetirementPanel position

**Decision:** Bottom of page, below ForecastingControls.

**Rationale:** RetirementPanel is a settings form -- users configure it once and revisit it rarely. Placing it above readiness cards (ForecastingSummary) would push the high-value content below the fold on every visit. Placing it inline with ForecastingControls would create visual confusion between the dual sliders (which control the projection interactively) and the retirement form fields (which persist to the database). The bottom position mirrors the "configure once, view often" pattern: summary and projections at top, settings at bottom. This matches US-3 ("retirement readiness context shown before raw numbers") -- the summary and milestone cards appear first, then the chart, then controls, then the settings form.

### OQ-3: MilestoneHeroCard disposition

**Decision:** Delete entirely.

**Rationale:** MilestoneHeroCard exists solely to (a) call `useMilestoneData`, (b) own the Cards/Skyline toggle state, and (c) render one of two views. With MilestoneSkylineView deleted, the toggle is meaningless. The `useMilestoneData` call and `shouldRender` guard move into ForecastingPage. The wrapper adds zero value and would be a single-child pass-through component -- a maintenance cost with no benefit.

### OQ-4: `useMilestoneData` data source

**Decision:** Call `useMilestoneData(typeData, retirement)` directly in ForecastingPage using the `typeData` and `retirement` state it already fetches.

**Rationale:** ForecastingPage's `loadData()` already calls `fetchNetworthByType()` and `fetchRetirement()` in a `Promise.all`, storing results in `typeData` and `retirement` state. These are the exact two arguments `useMilestoneData` requires. Zero new API calls. Zero new state variables for data fetching. The hook is a pure computation layer -- it takes data in, returns enriched milestones out.

---

## Chosen Approach

### Component Composition -- ForecastingPage render order (AFTER)

```
<div>
  {/* Page header */}
  <div className={styles.pageHeader}>
    <h1 className={styles.pageTitle}>Milestones</h1>   {/* was "Forecasting" */}
    ...existing lastUpdated + Refresh button...
  </div>

  {loading && <div>Loading...</div>}
  {!loading && error && <div>...error box...</div>}

  {!loading && !error && (
    <div className={styles.content}>

      {/* Gate 1: First-time setup (unchanged) */}
      {!retirement?.exists && <ForecastingSetup ... />}

      {/* Gate 2: Invalid target age warning (unchanged) */}
      {isRetirementTargetInvalid && <div>...warning...</div>}

      {/* Gate 3: Empty state -- no series data (unchanged) */}
      {!isRetirementTargetInvalid && hasNoData && typeData != null && <div>...empty...</div>}

      {/* Main content gate (unchanged condition) */}
      {!isRetirementTargetInvalid && !hasNoData && (
        <>
          <ForecastingSummary ... />          {/* position unchanged */}

          {/* NEW: MilestoneCardsView -- guarded by milestoneData.shouldRender */}
          {milestoneData.shouldRender && (
            <MilestoneCardsView milestones={milestoneData.milestones} />
          )}

          <ForecastingChart ... />            {/* position unchanged */}
          <ForecastingControls ... />         {/* position unchanged */}

          {/* NEW: RetirementPanel at bottom */}
          <div id="retirement-settings">
            <RetirementPanel
              data={retirement}
              onSave={handleSaveRetirement}
              loading={retirementLoading}
              error={retirementError}
              typeData={typeData}
            />
          </div>
        </>
      )}
    </div>
  )}
</div>
```

**Key differences from the current ForecastingPage:**
1. Page title: `"Forecasting"` becomes `"Milestones"`
2. `ForecastingSummary` moves ABOVE `ForecastingChart` (currently it is below the chart). This satisfies SC-2 and US-3.
3. `MilestoneCardsView` inserted between ForecastingSummary and ForecastingChart.
4. `ForecastingControls` moves BELOW `ForecastingChart` (currently it is above the chart). This groups the interactive projection controls closer to the settings form at the bottom.
5. `RetirementPanel` added at the bottom, wrapped in a `<div id="retirement-settings">` for scroll targeting.

**Section order matches SC-2:** ForecastingSummary, MilestoneCardsView, ForecastingChart, ForecastingControls, RetirementPanel.

### Data Flow

```
ForecastingPage
  |-- loadData() fetches: fetchNetworthByType() + fetchRetirement()
  |     stores: typeData (state), retirement (state)
  |
  |-- const milestoneData = useMilestoneData(typeData, retirement)
  |     returns: { shouldRender, milestones, achievedCount, totalCount, ... }
  |     NOTE: only milestones and shouldRender are consumed; other fields
  |           (mergedSeries, projectionSeries, investableCapital) are unused
  |           because MilestoneSkylineView is deleted
  |
  |-- MilestoneCardsView receives: { milestones: milestoneData.milestones }
  |
  |-- RetirementPanel receives: { data: retirement, onSave: handleSaveRetirement,
  |     loading: retirementLoading, error: retirementError, typeData }
  |
  |-- ForecastingSummary receives: { ...existing props..., onEditSettings: handleEditSettings }
```

### New State Variables in ForecastingPage

```js
const [retirementLoading, setRetirementLoading] = useState(false)
const [retirementError, setRetirementError] = useState(null)
```

### New Callback: `handleSaveRetirement`

```js
const handleSaveRetirement = useCallback(async (data) => {
  setRetirementLoading(true)
  setRetirementError(null)
  try {
    await saveRetirement(data)
    const updated = await fetchRetirement()
    setRetirement(updated)
    // Re-derive slider defaults from updated settings (same logic as handleSetupSave)
    const blendedCAGR = computeBlendedCAGR(typeData)
    const savedReturn = updated?.exists ? (updated.expected_return_pct ?? null) : null
    const initReturn = savedReturn ?? blendedCAGR
    const clampedReturn = Math.min(15, Math.max(0, initReturn))
    const initContrib = updated?.exists ? (updated.monthly_contribution ?? 0) : 0
    setContribution(initContrib)
    setReturnRate(clampedReturn)
    setDefaultContribution(initContrib)
    setDefaultReturnRate(clampedReturn)
  } catch (err) {
    setRetirementError(err.message || 'Failed to save retirement settings')
  } finally {
    setRetirementLoading(false)
  }
}, [typeData])
```

This callback mirrors `handleSetupSave` but also re-derives slider defaults, ensuring SC-9 (save refreshes readiness cards, milestone cards, and projection). The re-derivation is necessary because RetirementPanel can change `monthly_contribution` and `expected_return_pct`, which feed the projection sliders.

### `handleEditSettings` Change

**Decision:** Replace `navigate('/networth')` with a smooth scroll to the RetirementPanel anchor.

```js
const retirementRef = useRef(null)
const handleEditSettings = useCallback(() => {
  retirementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}, [])
```

The `<div id="retirement-settings" ref={retirementRef}>` wrapper around RetirementPanel provides the scroll target. The existing comment in ForecastingPage (lines 95-98) explicitly anticipated this -- it says "If a deep-link is needed in future, add id='retirement' to RetirementPanel's container." We are implementing that future.

**ForecastingSummary impact:** The `onEditSettings` prop type and usage are unchanged -- it still receives a function and calls it on click. The function's implementation changes from navigation to scrolling, but ForecastingSummary is unaware of this. No changes to ForecastingSummary.jsx.

### Route and Nav Changes

**App.jsx:**
```jsx
<Route path="/milestones" element={<ForecastingPage />} />
<Route path="/forecasting" element={<Navigate to="/milestones" replace />} />
```
Remove the old `/forecasting` route line; add both new lines. The `Navigate` import already exists.

**nav.js:**
```js
{ path: '/milestones', label: 'Milestones', icon: '🎯' }
```
Path changes from `/forecasting` to `/milestones`. Label changes from `"Forecasting"` to `"Milestones"`. Icon changes from crystal ball to target (milestone connotation). This is a user-facing cosmetic choice -- flag for user confirmation if preferred.

### NetWorthPage Cleanup

Remove from `NetWorthPage.jsx`:
- **Imports:** `RetirementPanel`, `MilestoneHeroCard`, `fetchRetirement`, `saveRetirement`
- **State:** `retirement`, `retirementLoading`, `retirementError`
- **Fetch call:** `fetchRetirement().catch(...)` from the `Promise.all` array (reduces from 4 to 3 parallel fetches)
- **Callback:** `handleSaveRetirement`
- **JSX:** `<MilestoneHeroCard ... />` and `<RetirementPanel ... />`

NetWorthPage render becomes:
```
StatsCards → TypeStackedChart → AccountsBreakdown
```

This satisfies SC-4.

### File Deletions

| File | Reason |
|------|--------|
| `frontend/src/components/MilestoneHeroCard.jsx` | Wrapper deleted per OQ-3 |
| `frontend/src/components/MilestoneHeroCard.module.css` | Styles for deleted component |
| `frontend/src/components/MilestoneSkylineView.jsx` | Permanently removed per requirements |
| `frontend/src/components/MilestoneSkylineView.module.css` | Styles for deleted component |
| `frontend/src/components/__tests__/MilestoneHeroCard.test.jsx` | Tests for deleted component |
| `frontend/src/components/__tests__/MilestoneSkylineView.test.jsx` | Tests for deleted component |

### Test Changes

**Delete:**
- `MilestoneHeroCard.test.jsx`
- `MilestoneSkylineView.test.jsx`

**Update `NetWorthPage.test.jsx`:**
- Remove mocks for `MilestoneHeroCard` and `RetirementPanel`
- Remove assertions that these components render
- Change expected fetch count from 4 to 3 (remove `fetchRetirement` from mock expectations)
- Remove any `retirementLoading`/`retirementError`/`handleSaveRetirement` test coverage

**Create or update `ForecastingPage.test.jsx`:**
- Assert MilestoneCardsView renders when `useMilestoneData` returns `shouldRender: true`
- Assert MilestoneCardsView does NOT render when `shouldRender: false`
- Assert RetirementPanel renders with correct props
- Assert `handleSaveRetirement` updates state and re-derives slider defaults
- Assert `handleEditSettings` scrolls (mock `scrollIntoView`)
- Assert page title is "Milestones"
- Assert route redirect from `/forecasting` to `/milestones` (in App-level routing tests)

**Unchanged:**
- `MilestoneCardsView.test.jsx` -- component file untouched
- `RetirementPanel.test.jsx` -- component file untouched
- `useMilestoneData.test.js` -- hook file untouched
- `milestoneUtils.test.js` -- utility file untouched

---

## Rejected Alternatives

### Alternative 1: Keep `/forecasting` route, change only the nav label

**What:** Update `nav.js` label to "Milestones" but keep the URL as `/forecasting`.

**Why rejected:** Creates a semantic split -- users see "Milestones" in the nav but `/forecasting` in the URL bar. Future developers searching the codebase for "milestone" would not find the route definition. The redirect cost is trivial (one line of JSX, `Navigate` already imported), and it preserves backward compatibility for any bookmarks. The small implementation cost yields a permanently cleaner codebase.

### Alternative 2: Keep MilestoneHeroCard as a thin wrapper

**What:** Strip MilestoneHeroCard of its toggle logic but keep it as a semantic wrapper that calls `useMilestoneData` and renders MilestoneCardsView.

**Why rejected:** The wrapper would become a single-purpose component that calls a hook and passes one prop to one child. This adds a file to maintain, an import to manage, and an indirection layer that obscures the data flow. The hook call is one line. The guard check (`shouldRender`) is one conditional. Moving these into ForecastingPage is simpler and keeps the page's data flow explicit -- the page already calls other hooks (`useMemo`, `useCallback`) and owns all other derived state. A wrapper that does nothing but proxy a hook result violates the project's convention of keeping presentational components prop-driven and pages as the data orchestrators.

### Alternative 3: RetirementPanel above ForecastingSummary (top of page)

**What:** Place RetirementPanel as the first section after the setup gate, above the readiness cards.

**Why rejected:** This violates US-3 ("retirement readiness context shown before raw projection numbers"). RetirementPanel is a settings form with input fields -- it is not readiness context. Placing it first forces every page visit to scroll past a form the user rarely edits to reach the summary and milestones they visit to check. The "configure once, view often" pattern dictates that high-read sections go at top and high-write sections go at bottom.

### Alternative 4: `useMilestoneData` fetches its own data internally

**What:** Refactor `useMilestoneData` to call `fetchNetworthByType()` and `fetchRetirement()` internally instead of receiving them as props.

**Why rejected:** ForecastingPage already fetches both datasets for its own projection calculations. Having the hook fetch independently would create duplicate API calls on every page load. It would also break the current architecture where hooks are pure computation layers and pages own data fetching. Additionally, `useMilestoneData` is tested with mock data passed as arguments -- making it fetch internally would require mocking `fetch` in those tests, increasing coupling and test fragility.

### Alternative 5: Replace `handleEditSettings` scroll with removal of the "Edit Settings" button

**What:** Since RetirementPanel is now on the same page, remove the "Edit Retirement Settings" link from ForecastingSummary entirely.

**Why rejected:** On mobile viewports, the RetirementPanel will be several scroll heights below ForecastingSummary. The link serves as a shortcut that saves the user from hunting for the settings form. Removing it degrades the mobile experience. Replacing navigation with scrolling preserves the UX intent (take me to settings) while adapting to the new same-page layout.

---

## Key Constraints for the Engineer

1. **No changes to component files being moved.** `MilestoneCardsView.jsx`, `RetirementPanel.jsx`, `useMilestoneData.js`, and `milestoneUtils.js` must remain untouched. Only their render sites change.

2. **`handleSaveRetirement` must re-derive slider defaults.** When RetirementPanel saves, the `monthly_contribution` and `expected_return_pct` values may change. The projection sliders must reflect the new saved values. Copy the re-derivation logic from `handleSetupSave` (lines 78-87 of the current ForecastingPage). Both callbacks should produce identical re-derivation behavior.

3. **`useMilestoneData` hook placement.** Call it at the top level of ForecastingPage (not inside a conditional). The hook uses `useMemo` internally and must obey React's rules of hooks. The `shouldRender` return value handles the conditional rendering.

4. **Section order is a success criterion.** SC-2 specifies: ForecastingSummary, MilestoneCardsView, ForecastingChart, ForecastingControls, RetirementPanel. The current ForecastingPage renders Controls, Chart, Summary. All three must be reordered.

5. **The `<div id="retirement-settings" ref={retirementRef}>` wrapper** is the scroll target for `handleEditSettings`. Use a ref (not `document.getElementById`) to stay within React conventions.

6. **Fetch count change in NetWorthPage tests.** The `Promise.all` drops from 4 calls to 3. Any test that asserts fetch call counts or mocks the 4-call pattern must be updated.

7. **No new CSS files.** ForecastingPage already has `ForecastingPage.module.css`. MilestoneCardsView and RetirementPanel bring their own CSS modules. No additional styling should be needed -- the components render their own containers. If spacing between sections needs adjustment, use existing `styles.content` or add a simple margin class to `ForecastingPage.module.css`.

8. **Redirect must use `replace`.** `<Navigate to="/milestones" replace />` prevents `/forecasting` from appearing in browser history, which would cause a redirect loop on back-button press.

9. **`saveRetirement` import.** ForecastingPage already imports `saveRetirement` from `../api.js` (line 8). No new import needed for that function.

10. **`useMilestoneData` import.** Add `import { useMilestoneData } from '../hooks/useMilestoneData.js'` and `import MilestoneCardsView from '../components/MilestoneCardsView.jsx'` and `import RetirementPanel from '../components/RetirementPanel.jsx'` to ForecastingPage.

---

## Risks and Mitigations

### Risk 1: `useMilestoneData` hook called unconditionally but returns `NOT_READY` before data loads

**Severity:** Low
**Details:** During the loading phase, `typeData` and `retirement` are both `null`. The hook returns `NOT_READY` with `shouldRender: false`. The MilestoneCardsView guard (`{milestoneData.shouldRender && ...}`) prevents rendering. This is the existing behavior from MilestoneHeroCard.
**Mitigation:** None needed -- the guard handles it. Add a test that confirms MilestoneCardsView does not render during loading state.

### Risk 2: `handleSaveRetirement` and `handleSetupSave` have duplicated re-derivation logic

**Severity:** Medium
**Details:** Both callbacks perform the same 8-line sequence to re-derive slider defaults from updated retirement data. Divergence over time is a maintenance risk.
**Mitigation:** Accept for this PR (pure reorganization, no new features). Flag as a follow-up refactor: extract a `rederiveSliderDefaults(updated, typeData)` helper function. Do not block the PR on this.

### Risk 3: Scroll behavior of `handleEditSettings` may be jarring on short pages

**Severity:** Low
**Details:** On desktop with few milestones, the entire page may fit without scrolling. `scrollIntoView` on a visible element is a no-op, which is fine.
**Mitigation:** The `{ behavior: 'smooth', block: 'start' }` options ensure graceful behavior in all cases.

### Risk 4: ForecastingPage test file may not exist yet

**Severity:** Low
**Details:** Research indicates `ForecastingPage.test.jsx` does not currently exist. Tests must be created from scratch.
**Mitigation:** The QA agent creates it as part of the test-first workflow step. Base the test structure on the existing `NetWorthPage.test.jsx` patterns (mock API calls, assert component rendering).

---

## Open Questions (for user/human judgment)

1. **Nav icon choice:** The decision uses `'🎯'` (target) for the Milestones nav icon. The current Forecasting icon is `'🔮'` (crystal ball). If the user prefers a different icon, this is a single-character change in `nav.js`. Does not affect architecture.

2. **Page file rename:** The component file remains `ForecastingPage.jsx`. Renaming it to `MilestonesPage.jsx` would improve naming consistency but increases the diff size (every import and test reference changes). Recommend deferring the file rename to a follow-up XS change to keep this PR focused on the functional consolidation.
