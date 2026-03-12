# Implementation Plan: Milestones Page Consolidation

**Feature:** Milestones Page Consolidation
**Change size:** M
**Date:** 2026-03-12
**Status:** Final plan — staff review incorporated

---

## Overview

This plan reorganizes existing UI by: (1) deleting two components no longer needed (`MilestoneHeroCard`, `MilestoneSkylineView`) along with their CSS and tests, (2) stripping those components from `NetWorthPage`, (3) adding `MilestoneCardsView`, `RetirementPanel`, `useMilestoneData`, and a `handleSaveRetirement` callback to `ForecastingPage`, (4) reordering the `ForecastingPage` sections into the SC-2 order, (5) renaming the nav entry and updating the route. No backend changes. No new API calls — `ForecastingPage` already fetches both required datasets.

All component internals (`MilestoneCardsView.jsx`, `RetirementPanel.jsx`, `useMilestoneData.js`, `milestoneUtils.js`) are left untouched. Only render sites change.

---

## Changes

### Step 1 — Delete MilestoneSkylineView source files

```
File: frontend/src/components/MilestoneSkylineView.jsx
Lines: entire file (delete)
Parallelism: independent
Description: Component permanently removed. Not being relocated anywhere.
Details:
  - Delete the file entirely. No replacement.
```

```
File: frontend/src/components/MilestoneSkylineView.module.css
Lines: entire file (delete)
Parallelism: independent
Description: CSS module for deleted component.
Details:
  - Delete the file entirely.
```

```
File: frontend/src/components/MilestoneSkylineView.test.jsx
Lines: entire file (delete)
Parallelism: independent
Description: Tests for deleted component. File is at
             frontend/src/components/MilestoneSkylineView.test.jsx
             (not in a __tests__/ subdirectory — that directory does not exist).
Details:
  - Delete the file entirely.
```

---

### Step 2 — Delete MilestoneHeroCard source files

```
File: frontend/src/components/MilestoneHeroCard.jsx
Lines: entire file (delete)
Parallelism: independent
Description: Wrapper component deleted. Only existed to toggle Cards/Skyline views. With Skyline gone
             the wrapper is a no-op. useMilestoneData call moves to ForecastingPage directly.
Details:
  - Delete the file entirely. No replacement.
```

```
File: frontend/src/components/MilestoneHeroCard.module.css
Lines: entire file (delete)
Parallelism: independent
Description: CSS module for deleted component.
Details:
  - Delete the file entirely.
```

```
File: frontend/src/components/MilestoneHeroCard.test.jsx
Lines: entire file (delete)
Parallelism: independent
Description: Tests for deleted component. File is at
             frontend/src/components/MilestoneHeroCard.test.jsx
             (not in a __tests__/ subdirectory — that directory does not exist).
Details:
  - Delete the file entirely.
```

---

### Step 3 — Update nav.js (route path and label rename)

```
File: frontend/src/nav.js
Lines: 15
Parallelism: independent
Description: Change the Forecasting nav entry to Milestones. Path, label, and icon all change.
Details:
  - Line 15: change path from '/forecasting' to '/milestones'
  - Line 15: change label from 'Forecasting' to 'Milestones'
  - Line 15: change icon from '🔮' to '🎯'
  - All other nav entries unchanged.
```

---

### Step 3b — Update nav-related tests (Sidebar and BottomTabBar)

```
File: frontend/src/components/Sidebar.test.jsx
Lines: varies — all lines asserting on the Forecasting nav link
Parallelism: depends-on: step 3
Description: nav.js change breaks any assertion that looks for 'Forecasting' text or
             href="/forecasting". Update regex and path to match the new label and route.
Details:
  - Find all occurrences of getByRole('link', { name: /Forecasting/ }) and replace
    the regex with /Milestones/.
  - Find all occurrences of href="/forecasting" and replace with href="/milestones".
  - No other changes — all other link assertions are unaffected.
```

```
File: frontend/src/components/BottomTabBar.test.jsx
Lines: varies — all lines asserting on the Forecasting nav link
Parallelism: depends-on: step 3
Description: Same breakage as Sidebar.test.jsx — update regex and href to match the
             renamed nav entry.
Details:
  - Find all occurrences of getByRole('link', { name: /Forecasting/ }) and replace
    the regex with /Milestones/.
  - Find all occurrences of href="/forecasting" and replace with href="/milestones".
  - No other changes.
```

---

### Step 4 — Update App.jsx (route rename + redirect)

```
File: frontend/src/App.jsx
Lines: 45
Parallelism: independent
Description: Replace the single /forecasting route with a /milestones route and a /forecasting
             redirect so existing bookmarks continue to work.
Details:
  - Line 45: replace:
      <Route path="/forecasting" element={<ForecastingPage />} />
    with:
      <Route path="/milestones" element={<ForecastingPage />} />
      <Route path="/forecasting" element={<Navigate to="/milestones" replace />} />
  - The Navigate import on line 2 already includes Navigate — no new import needed.
  - The redirect uses `replace` (not push) so /forecasting does not appear in browser
    history and the back button does not loop.
  - No other routes change.
```

---

### Step 5 — Update NetWorthPage.jsx (strip retirement + milestone UI)

```
File: frontend/src/pages/NetWorthPage.jsx
Lines: 1–109 (full rewrite of affected sections; non-affected sections are unchanged)
Parallelism: independent (touches no file that steps 1–4 modify at runtime)
Description: Remove all retirement and milestone rendering from NetWorthPage. After this change
             the page renders only StatsCards → TypeStackedChart → AccountsBreakdown.
Details:
  - Line 6: remove import of RetirementPanel
  - Line 7: remove import of MilestoneHeroCard
  - Line 8: remove fetchRetirement and saveRetirement from the api.js import.
    New import line:
      import { fetchNetworthStats, fetchAccountsSummary, fetchNetworthByType } from '../api.js'
  - Lines 14, 18–19: remove state declarations for `retirement`, `retirementLoading`,
    `retirementError`.
  - Lines 28–29: remove `fetchRetirement().catch(...)` from the Promise.all array.
    Promise.all now has 3 entries: fetchNetworthStats(), fetchAccountsSummary(), fetchNetworthByType().
  - Lines 30–35: update destructuring from ([s, a, t, ret]) to ([s, a, t]).
    Remove setRetirement(ret) call.
  - Lines 41–53: delete the entire handleSaveRetirement useCallback.
  - Line 96: remove <MilestoneHeroCard typeData={typeData} retirement={retirement} /> JSX.
  - Lines 98–104: remove <RetirementPanel ... /> JSX block.
  - The rendered output becomes:
      <StatsCards stats={stats} />
      <TypeStackedChart data={typeData} />
      <AccountsBreakdown accounts={accounts} />
  - The `useCallback` import on line 1 can be removed since handleSaveRetirement is the
    only useCallback in the file. Verify no other useCallback remains before removing it.
```

---

### Step 6 — Update ForecastingPage.jsx (add milestone/retirement, reorder sections, rename title)

```
File: frontend/src/pages/ForecastingPage.jsx
Lines: 1–354 (surgical changes spread across imports, state, callbacks, and render)
Parallelism: independent
Description: This is the primary change. Add useMilestoneData hook call, MilestoneCardsView
             render, RetirementPanel render, retirementRef scroll target, handleSaveRetirement
             callback, retirementLoading/retirementError state, and handleEditSettings in-page
             scroll. Reorder the three main sections: ForecastingControls moves from position 1
             (above ForecastingChart) to position 4 (below ForecastingChart); ForecastingSummary
             moves from position 3 (below ForecastingChart) to position 1 (above it). Rename
             the page title.

             ForecastingPage does not import MilestoneHeroCard or MilestoneSkylineView, so this
             step does NOT depend on steps 1 or 2 completing first. It can run in Wave 1 in
             parallel with all other steps.
Details:

  IMPORTS (lines 1–17):
  - Line 1: add `useRef` to the React import. New line:
      import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
  - Line 2: remove the `useNavigate` import entirely (navigate is no longer used).
  - After line 7 (ForecastingSetup import), add two new import lines:
      import MilestoneCardsView from '../components/MilestoneCardsView.jsx'
      import RetirementPanel from '../components/RetirementPanel.jsx'
  - After the retirementMath import block, add:
      import { useMilestoneData } from '../hooks/useMilestoneData.js'
  - The existing `saveRetirement` is already imported on line 8 — no change needed there.

  STATE AND REFS (after existing useState declarations, around line 33):
  - After `const [setupError, setSetupError] = useState(null)` add:
      const [retirementLoading, setRetirementLoading] = useState(false)
      const [retirementError,   setRetirementError]   = useState(null)
      const retirementRef = useRef(null)

  REMOVE useNavigate (line 34):
  - Delete `const navigate = useNavigate()` — navigate is no longer used.

  ADD useMilestoneData CALL (after existing derived value declarations, before render):
  - After the isRetirementTargetInvalid useMemo (around line 243), add at the top level
    of the component (not inside a conditional):
      const milestoneData = useMilestoneData(typeData, retirement)
  - This obeys React rules of hooks — unconditional, top-level call. The hook's own
    shouldRender flag handles conditional rendering.

  REPLACE handleEditSettings (line 99):
  - Remove: `const handleEditSettings = useCallback(() => navigate('/networth'), [navigate])`
  - Replace with:
      const handleEditSettings = useCallback(() => {
        retirementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, [])

  ADD handleSaveRetirement CALLBACK (after handleSetupSave, around line 93):
  - Add a new useCallback after handleSetupSave:
      const handleSaveRetirement = useCallback(async (data) => {
        setRetirementLoading(true)
        setRetirementError(null)
        try {
          await saveRetirement(data)
          const updated = await fetchRetirement()
          setRetirement(updated)
          // Re-derive slider defaults from updated settings (mirrors handleSetupSave logic)
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

  PAGE TITLE (line 259):
  - Change `<h1 className={styles.pageTitle}>Forecasting</h1>`
    to    `<h1 className={styles.pageTitle}>Milestones</h1>`

  REORDER SECTIONS AND ADD NEW SECTIONS (lines 319–349, the main content gate block):
  - Current order: ForecastingControls → ForecastingChart → ForecastingSummary
  - New order:     ForecastingSummary → MilestoneCardsView → ForecastingChart →
                   ForecastingControls → RetirementPanel
  - Replace the entire fragment inside `{!isRetirementTargetInvalid && !hasNoData && (...)}`:

      <>
        <ForecastingSummary
          investableCapital={investableCapital}
          nestEgg={nestEgg}
          projectedAtRetirement={projectedAtRetirement}
          targetYear={targetYear}
          neededContribution={neededContribution}
          currentContribution={contribution}
          onEditSettings={handleEditSettings}
          hasSettings={!!retirement?.exists}
        />

        {milestoneData.shouldRender && (
          <MilestoneCardsView milestones={milestoneData.milestones} />
        )}

        <ForecastingChart
          chartData={mergedChartData}
          nestEgg={nestEgg}
          showVariants={showVariants}
          retirementYear={targetYear}
          srSummary={srSummary}
        />

        <ForecastingControls
          contribution={contribution}
          returnRate={returnRate}
          onContributionChange={setContribution}
          onReturnRateChange={setReturnRate}
          onReset={handleReset}
          contributionMax={contributionMax}
          defaultsNote={defaultsNote}
          cagrWarning={cagrWarning}
        />

        <section
          id="retirement-settings"
          ref={retirementRef}
          aria-label="Retirement Settings"
        >
          <RetirementPanel
            data={retirement}
            onSave={handleSaveRetirement}
            loading={retirementLoading}
            error={retirementError}
            typeData={typeData}
          />
        </section>
      </>

  NOTE on section aria: Use aria-label="Retirement Settings" directly on the <section>
  element instead of aria-labelledby, to avoid touching RetirementPanel.jsx internals.
  This deviates from the design spec's first option but matches its own fallback
  recommendation (design spec Decision 3, final paragraph).
```

---

### Step 7 — Update NetWorthPage.test.jsx (remove retirement + milestone assertions)

```
File: frontend/src/pages/NetWorthPage.test.jsx
Lines: 1–110
Parallelism: depends-on: step 5 (tests must match the updated NetWorthPage)
Description: Remove mocks and assertions for the two components no longer rendered by
             NetWorthPage. Fix the fetch count expectation from 4 to 3. Remove the
             /api/retirement URL check.
Details:
  - Line 10: remove the RetirementPanel vi.mock line entirely.
  - Line 11: remove the MilestoneHeroCard vi.mock line entirely.
  - Lines 15–21 (beforeEach mockFetch): remove '/api/retirement': MOCK_RETIREMENT entry.
    The mockFetch call now covers only 3 URLs: stats, accounts/summary, by-type.
  - Line 41: remove `expect(screen.getByTestId('milestone-hero-card')).toBeInTheDocument()`
    from the "renders StatsCards, TypeStackedChart, AccountsBreakdown after data loads" test.
  - Lines 45–48: delete the entire "renders MilestoneHeroCard after data loads" test.
  - Lines 85–92: update the "fetches retirement data in Promise.all (4 total fetches on mount)"
    test:
      - Rename test to: 'fetches data in Promise.all (3 total fetches on mount)'
      - Change `expect(global.fetch.mock.calls.length).toBe(4)` to `.toBe(3)`
      - Change comment from '4 fetch calls: stats, accounts, by-type, retirement'
        to '3 fetch calls: stats, accounts, by-type'
      - Remove `expect(urls.some((u) => u.includes('/api/retirement'))).toBe(true)`
  - Lines 94–97: delete the entire "renders RetirementPanel after data loads" test.
  - Lines 99–109: delete the entire "does not crash when retirement returns exists=false" test.
    Also remove the MOCK_RETIREMENT_EMPTY import from the fixtures import on line 4 if it is
    no longer used elsewhere in the file.
  - Line 71: update the comment inside "re-fetches data when Refresh is clicked":
    Change "Refresh triggers 4 more fetch calls (stats, accounts, by-type, retirement)"
    to "Refresh triggers 3 more fetch calls (stats, accounts, by-type)".
  - The MOCK_RETIREMENT import on line 4 should be removed if no test still uses it.
    Check the full file after edits and remove any unused fixture imports.
```

---

### Step 8 — Create ForecastingPage.test.jsx (new file)

```
File: frontend/src/pages/ForecastingPage.test.jsx
Lines: new file
Parallelism: depends-on: step 6 (tests exercise the updated ForecastingPage)
Description: New test file covering the full ForecastingPage surface area including the
             added MilestoneCardsView and RetirementPanel sections. ForecastingPage.test.jsx
             does not currently exist.
Details: See Test Plan section below for the full required test list.
```

---

### Step 9 — Update App.test.jsx (nav link label + route redirect)

```
File: frontend/src/App.test.jsx
Lines: varies — line 64 and any other lines asserting on the Forecasting link or route
Parallelism: depends-on: step 4 (App.jsx must be updated before its test is updated)
Description: Three changes are required:
  (1) Line 64 asserts getAllByRole('link', { name: /Forecasting/ }) has length 2. After
      nav.js and App.jsx changes, both nav links are now labelled "Milestones". Update
      the regex so the test still passes.
  (2) Add a redirect test asserting that rendering at /forecasting redirects to /milestones.
Details:
  - Line 64: change:
      getAllByRole('link', { name: /Forecasting/ })
    to:
      getAllByRole('link', { name: /Milestones/ })
    The expected length (2 — one Sidebar link, one BottomTabBar link) does not change.
  - Add a new test in the routing/navigation section:
      test('redirects /forecasting to /milestones', () => {
        renderWithRouter(<App />, { initialEntries: ['/forecasting'] })
        expect(window.location.pathname).toBe('/milestones')
      })
    (Adjust renderWithRouter call to match the existing helper signature in App.test.jsx.)
  - No other changes.
```

---

## Deviations from Architecture

None. Every decision in the architecture document (OQ-1 through OQ-4) is implemented exactly as specified:

- OQ-1 (route): `/milestones` route created, `/forecasting` redirect added with `replace`.
- OQ-2 (RetirementPanel position): bottom of page, below ForecastingControls.
- OQ-3 (MilestoneHeroCard): deleted entirely, `useMilestoneData` call moved to ForecastingPage.
- OQ-4 (data source): `useMilestoneData(typeData, retirement)` called with existing state — no new fetches.

One minor implementation choice not explicitly resolved in the architecture: the design spec (Decision 3) offers two options for the section aria label:
1. `aria-labelledby="retirement-settings-heading"` — requires adding an `id` to RetirementPanel's internal title element (touching RetirementPanel.jsx).
2. `aria-label="Retirement Settings"` inline on the `<section>` — no change to RetirementPanel.jsx.

This plan uses option 2. The architecture constraint states "No changes to component files being moved" (constraint #1). Option 2 satisfies both the accessibility goal and the no-touch constraint. The design spec itself recommends option 2 as the fallback when touching RetirementPanel is unacceptable.

---

## Dependency Order

All steps are independent and can run in a single parallel wave. There are no cross-step file dependencies between Wave 1 steps — ForecastingPage does not import MilestoneHeroCard or MilestoneSkylineView, so Step 6 no longer depends on Steps 1 or 2.

**Wave 1 — all independent, run in parallel:**
- Step 1 (delete MilestoneSkylineView files)
- Step 2 (delete MilestoneHeroCard files)
- Step 3 (update nav.js)
- Step 4 (update App.jsx)
- Step 5 (update NetWorthPage.jsx)
- Step 6 (update ForecastingPage.jsx)

**Wave 2 — run after Wave 1 completes:**
- Step 3b (update Sidebar.test.jsx and BottomTabBar.test.jsx) — depends on step 3
- Step 7 (update NetWorthPage.test.jsx) — depends on step 5
- Step 8 (create ForecastingPage.test.jsx) — depends on step 6
- Step 9 (update App.test.jsx) — depends on step 4

Steps 3b, 7, 8, and 9 can run in parallel with each other within Wave 2 once their respective dependencies complete.

---

## Test Plan

### ForecastingPage.test.jsx — required test cases (new file)

Base pattern: follow `NetWorthPage.test.jsx`. Mock all child components at the top of the file. Mock `../api.js` functions with `vi.mock`. Use `MOCK_NETWORTH_BY_TYPE` and `MOCK_RETIREMENT` fixtures.

**Mock setup (top of file):**
```
vi.mock('../components/ForecastingChart.jsx',    () => ({ default: () => <div data-testid="forecasting-chart" /> }))
vi.mock('../components/ForecastingControls.jsx', () => ({ default: () => <div data-testid="forecasting-controls" /> }))
vi.mock('../components/ForecastingSummary.jsx',  () => ({ default: (props) => <div data-testid="forecasting-summary"><button onClick={props.onEditSettings}>Edit</button></div> }))
vi.mock('../components/ForecastingSetup.jsx',    () => ({ default: () => <div data-testid="forecasting-setup" /> }))
vi.mock('../components/MilestoneCardsView.jsx',  () => ({ default: () => <div data-testid="milestone-cards-view" /> }))
vi.mock('../components/RetirementPanel.jsx',     () => ({
  default: (props) => (
    <div
      data-testid="retirement-panel"
      data-loading={String(props.loading)}
      data-error={props.error ?? ''}
    >
      <button onClick={() => props.onSave({ test: true })}>Save</button>
    </div>
  )
}))
vi.mock('../hooks/useMilestoneData.js',          () => ({
  useMilestoneData: vi.fn(() => ({ shouldRender: true, milestones: [] }))
}))
```

Note: The RetirementPanel mock exposes `data-loading` and `data-error` attributes so tests can
assert loading/error state without inspecting React props directly. It also exposes an `onSave`
trigger button so `handleSaveRetirement` tests can invoke the callback through the DOM.

**Required tests:**

| Test name | What it asserts |
|-----------|-----------------|
| `shows loading state before data arrives` | `data-testid="forecasting-loading"` present; child sections absent |
| `renders error state when API fetch fails` | Error box with "Could not connect" text visible; no child sections |
| `renders page title "Milestones"` | `<h1>` text is "Milestones" (not "Forecasting") |
| `renders ForecastingSummary after data loads` | `data-testid="forecasting-summary"` present |
| `renders MilestoneCardsView when shouldRender is true` | Mock `useMilestoneData` returns `{ shouldRender: true, milestones: [] }`; `data-testid="milestone-cards-view"` present |
| `does not render MilestoneCardsView when shouldRender is false` | Mock `useMilestoneData` returns `{ shouldRender: false, milestones: [] }`; `queryByTestId("milestone-cards-view")` is null |
| `renders ForecastingChart after data loads` | `data-testid="forecasting-chart"` present |
| `renders ForecastingControls after data loads` | `data-testid="forecasting-controls"` present |
| `renders RetirementPanel after data loads` | `data-testid="retirement-panel"` present |
| `renders ForecastingSetup when retirement.exists is false` | Mock retirement as `{ exists: false }`; `data-testid="forecasting-setup"` present |
| `does not render ForecastingSetup when retirement.exists is true` | Mock retirement as MOCK_RETIREMENT (exists: true); `queryByTestId("forecasting-setup")` is null |
| `section order: Summary before Chart` | Query both testids; assert Summary appears before Chart in document order using `compareDocumentPosition` or element index |
| `section order: MilestoneCardsView between Summary and Chart` | Query testids for all three; assert middle position of MilestoneCardsView |
| `section order: Controls below Chart` | Assert ForecastingControls appears after ForecastingChart in DOM |
| `section order: RetirementPanel below Controls` | Assert RetirementPanel appears after ForecastingControls in DOM |
| `handleEditSettings calls scrollIntoView (not navigate)` | Mock `Element.prototype.scrollIntoView`; click the "Edit" button on the ForecastingSummary mock; assert scrollIntoView called; assert navigate was NOT called |
| `handleSaveRetirement calls saveRetirement then re-fetches retirement` | Spy on saveRetirement and fetchRetirement mocks; click the "Save" button on the RetirementPanel mock; assert saveRetirement called once, fetchRetirement called a second time, retirement state updated |
| `handleSaveRetirement sets retirementLoading during save` | Click the "Save" button on the RetirementPanel mock; assert `data-loading="true"` on the mock during the in-flight save; assert `data-loading="false"` after resolution |
| `handleSaveRetirement sets retirementError on failure` | Mock saveRetirement to reject; click "Save" on the mock; assert `data-error` attribute on RetirementPanel mock contains the error message |
| `Refresh button re-fetches data` | Click Refresh; assert fetch call count increases by 2 (fetchNetworthByType + fetchRetirement) |
| `shows invalid age warning when target age <= current age` | Mock retirement with target_retirement_age <= current_age; assert `data-testid="invalid-age-warning"` present; ForecastingSummary absent |
| `shows no-investment-accounts empty state when investableCapital is null` | Mock typeData with no Retirement/Brokerage series; assert `data-testid="no-investment-accounts"` present |
| `does not crash when retirement returns exists=false on initial load` | Mock retirement fetch to return `{ exists: false }`; assert no unhandled errors; ForecastingSetup present |

**Total new tests: ~23**

### Existing tests that require updates

| File | Change |
|------|--------|
| `frontend/src/pages/NetWorthPage.test.jsx` | Remove MilestoneHeroCard/RetirementPanel mocks and assertions; fix fetch count 4→3; remove /api/retirement URL check; remove MOCK_RETIREMENT/MOCK_RETIREMENT_EMPTY imports if unused |
| `frontend/src/components/Sidebar.test.jsx` | Update link name regex /Forecasting/ → /Milestones/; update href "/forecasting" → "/milestones" |
| `frontend/src/components/BottomTabBar.test.jsx` | Update link name regex /Forecasting/ → /Milestones/; update href "/forecasting" → "/milestones" |
| `frontend/src/App.test.jsx` | Line 64: update getAllByRole regex /Forecasting/ → /Milestones/; add redirect test for /forecasting → /milestones |

### Existing tests that must NOT break (no changes required)

| File | Reason unchanged |
|------|-----------------|
| `frontend/src/components/MilestoneCardsView.test.jsx` | Component file untouched |
| `frontend/src/components/MilestoneEditor.test.jsx` | Component file untouched |
| `frontend/src/hooks/useMilestoneData.test.js` (if it exists) | Hook file untouched |
| `frontend/src/utils/milestoneUtils.test.js` (if it exists) | Utility file untouched |
| All other page tests | No imports from deleted files |

### Edge cases that must be covered in ForecastingPage.test.jsx

- EC-1: First-time user (retirement.exists = false) — ForecastingSetup shown, main content sections gated.
- EC-2: User has settings but zero milestones (`shouldRender: false`) — MilestoneCardsView absent, rest of page unaffected.
- EC-4: RetirementPanel save triggers full data re-derivation including slider defaults.
- Risk 1 from architecture: MilestoneCardsView not rendered during loading state (shouldRender false until data ready).

---

## Rollback Notes

This change has no database migrations and no backend changes. Rollback is a git revert.

**To revert:**
1. `git revert <commit-sha>` — restores all 6 deleted files, reverts 4 modified files.
2. Run `make test` to confirm clean state.

**File restoration checklist if reverting manually:**
- Restore `frontend/src/components/MilestoneSkylineView.jsx`, `.module.css`, `.test.jsx`
- Restore `frontend/src/components/MilestoneHeroCard.jsx`, `.module.css`, `.test.jsx`
- Revert `frontend/src/nav.js` line 15 (path back to /forecasting, label back to Forecasting, icon back to 🔮)
- Revert `frontend/src/App.jsx` line 45 (remove /milestones route and /forecasting redirect; restore single /forecasting route)
- Revert `frontend/src/pages/NetWorthPage.jsx` (restore 4-fetch Promise.all, retirement state, handleSaveRetirement, MilestoneHeroCard JSX, RetirementPanel JSX)
- Revert `frontend/src/pages/NetWorthPage.test.jsx` (restore mocks and assertions)
- Delete `frontend/src/pages/ForecastingPage.test.jsx`
- Revert `frontend/src/pages/ForecastingPage.jsx` to original (remove added imports, state, callbacks, retirementRef; restore original section order; restore page title; restore navigate-based handleEditSettings)
- Revert `frontend/src/components/Sidebar.test.jsx` (restore /Forecasting/ regex and /forecasting href)
- Revert `frontend/src/components/BottomTabBar.test.jsx` (restore /Forecasting/ regex and /forecasting href)
- Revert `frontend/src/App.test.jsx` (restore /Forecasting/ regex on line 64; remove redirect test)
