# Phase 4: Forecasting Page — Final Implementation Plan (Delta)

**Date:** 2026-03-10
**Author:** Engineer Agent
**Status:** Ready for implementation
**Inputs:** phase4-impl-plan.md + phase4-review.md
**Read this alongside:** phase4-impl-plan.md — this document is a delta, not a rewrite.

---

## Review Response Table

| # | Severity | Decision | Summary |
|---|----------|----------|---------|
| 1 | Critical | Accepted | Add `Math.max(result, currentContribution)` floor guard in `calculateContributionToTarget` r≠0 path |
| 2 | High | Accepted | Add explicit tracked change blocks for Sidebar.test.jsx and BottomTabBar.test.jsx |
| 3 | High | Accepted | Remove dead `fetchRetirement` import from ForecastingSetup.jsx |
| 4 | High | Accepted | Adopt option (b): ForecastingSetup only collects form data, parent owns the API call entirely |
| 5 | Medium | Accepted | Render `{srSummary}` inside the `<p>` tag explicitly in ForecastingChart JSX |
| 6 | Medium | Accepted | Use `var(--color-warning)` in ForecastingControls.module.css; audit ForecastingSummary.module.css for semantic tokens |
| 7 | Medium | Accepted | Distinguish null (no data) from 0 (zero balance); change empty-state condition and message accordingly |
| 8 | Medium | Accepted | Cap `contributionMax` with an upper bound of 50000 |
| 9 | Medium | Accepted (doc-only) | Add JSDoc note about monthly rate approximation in `calculateContributionToTarget` |
| 10 | Medium | Accepted (doc-only) | Add comment explaining `/networth` navigation in `handleEditSettings`; hash anchor not implemented (RetirementPanel has no `id` attribute today) |
| 11 | Medium | Accepted | Change ForecastingControls.jsx parallelism tag from "independent" to `depends-on: SliderInput.jsx` |
| 12 | Low | Accepted | Add sync comment at top of ForecastingSetup.module.css |
| 13 | Low | Accepted | Fix optional chaining in `computeBlendedCAGR` plan pseudocode |
| 14 | Low | Resolved | App.test.jsx exists and does test nav links by name — tracked change added below |

---

## Corrected Sections

### Track A — retirementMath.js (Finding #1, #9, #13)

Replace the `calculateContributionToTarget` Details block in the initial plan with:

```
File: /home/user/stashtrend/frontend/src/utils/retirementMath.js
Lines: append after line 84 (end of file)
Parallelism: independent
Description: Add three new exported pure functions. No changes to existing functions.
Details:
  - Add `getInvestableCapital(typeData)`: (unchanged from initial plan)

  - Add `computeBlendedCAGR(typeData)`:
    - Change line 46 pseudocode from:
        `const latest = typeData?.series?.[typeData.series.length - 1] ?? {}`
      to:
        `const latest = typeData?.series?.[typeData?.series?.length - 1] ?? {}`
      (full optional chaining on both sides of the bracket accessor — Finding #13)
    - All other details unchanged.

  - Add `calculateContributionToTarget(...)`:
    - The r === 0 path is unchanged (already has the floor guard).
    - The r !== 0 path: after computing `Math.ceil(neededContrib / 100) * 100`, assign to
      `const result` and then return `Math.max(result, currentContribution)`.
      Full corrected r !== 0 path:
        ```js
        const fvLump = currentNetWorth * Math.pow(1 + r, n)
        const shortfall = targetAmount - fvLump
        if (shortfall <= 0) return currentContribution
        const neededContrib = shortfall * r / (Math.pow(1 + r, n) - 1)
        const result = Math.ceil(neededContrib / 100) * 100
        return Math.max(result, currentContribution)   // floor: never suggest a cut
        ```
      (Finding #1 — prevents negative `additionalNeeded` in ForecastingSummary)
    - Add JSDoc note (after the existing formula description):
        `@note Uses simple monthly rate approximation (annualReturnPct / 100 / 12) for
        consistency with generateProjectionSeries. Do not "fix" one without the other.`
      (Finding #9)
```

### Track B — ForecastingControls.jsx (Finding #11)

Change the parallelism tag from:
```
Parallelism: independent (depends-on: SliderInput.jsx for import, but can be written concurrently)
```
to:
```
Parallelism: depends-on: SliderInput.jsx
```
Note: The file can be written concurrently by a human author (import resolves at build time), but the tag must reflect the agent scheduling dependency so agents do not attempt to run it before SliderInput.jsx exists.

### Track B — ForecastingControls.module.css (Finding #6)

Change the `.cagrWarning` rule from:
```css
.cagrWarning { font-size: 11px; color: var(--amber); margin: 0; }
```
to:
```css
.cagrWarning { font-size: 11px; color: var(--color-warning); margin: 0; }
```

### Track B — ForecastingChart.jsx (Finding #5)

In the JSX Details block, change the screen reader paragraph from:
```jsx
<p className={styles.srOnly} aria-live="polite">
  {/* filled by prop or computed in parent — passed as `srSummary` prop */}
</p>
```
to:
```jsx
<p className={styles.srOnly} aria-live="polite">{srSummary}</p>
```

### Track B — ForecastingSummary.module.css (Finding #6)

The `.badgeOnTrack`, `.badgeOffTrack`, `.gapPositive`, and `.gapNegative` rules use raw color variables `var(--green)` and `var(--red)`. There are no semantic aliases for positive/negative text colors in the codebase (only `--color-warning` and `--color-negative` exist in index.css). Use `--color-negative` for red-toned values and keep `--green` for positive only where no semantic token exists. Corrected rules:

```css
.badgeOnTrack  { background: rgba(46,204,138,0.15); color: var(--green); }
.badgeOffTrack { background: rgba(255,90,122,0.15);  color: var(--color-negative); }
.gapPositive   { font-size: 13px; color: var(--green); margin: 0; }
.gapNegative   { font-size: 13px; color: var(--color-negative); margin: 0; }
```

Note: `--green` is kept for positive states as no `--color-positive` semantic token exists. If one is added in the future, update these classes.

### Track B — ForecastingSetup.jsx (Findings #3, #4)

Replace the ForecastingSetup.jsx Details block in the initial plan with:

```
File: /home/user/stashtrend/frontend/src/components/ForecastingSetup.jsx
Lines: new file
Parallelism: independent
Description: Inline retirement settings setup form. Purely presentational — collects form data
  only. Does NOT call saveRetirement directly. Parent (ForecastingPage) owns the API call.
Details:
  - Props (with PropTypes):
      - `onSave: func` — called with raw form data object when user clicks Save and validation passes
      - `loading: bool` — controls Save button disabled state
      - `error: string | null` — error message to display (set by parent after failed API call)
  - Local state: `currentAge`, `targetAge`, `desiredIncome`, `monthlyContrib` (all string, empty default)
  - Local state: `returnPct`, `ssAnnual`, `withdrawalRate` (advanced fields, string defaults '' / '4.0')
  - Local state: `showAdvanced` (bool, default false)
  - Local state: `validationError` (string | null) — inline validation errors before calling onSave
  - `handleSave` function (NOT async):
      - Validates: currentAge required; targetAge required; Number(targetAge) > Number(currentAge)
      - If invalid: set `validationError` and return (do NOT call onSave)
      - If valid: clear `validationError`; call `onSave({ current_age, target_retirement_age,
        desired_annual_income, monthly_contribution, expected_return_pct, social_security_annual,
        withdrawal_rate_pct })` with numeric-parsed field values (use parseFloat / parseInt as
        appropriate; omit optional fields when empty string)
  - Renders:
      - Container card with title "Set Up Retirement Projections"
      - Subtitle: "Enter your details to see your investable capital projection."
      - 2-col grid (same `.grid` pattern as RetirementPanel):
          - Current age input
          - Target retirement age input
          - Desired annual income input
          - Monthly contribution input
      - Advanced toggle button (same pattern as RetirementPanel)
      - If showAdvanced: 3-col grid with expected return, social security, withdrawal rate
      - If validationError: show inline validation error (local state)
      - If error prop: show API error message from parent
      - Save button (primary style, disabled when loading=true)
  - Imports:
      - `saveRetirement` import is REMOVED — component does not call the API (Finding #3 + #4)
      - `fetchRetirement` import is REMOVED — was never used (Finding #3)
      - `styles` from `'./ForecastingSetup.module.css'`
      - `PropTypes` from 'prop-types'
      - `useState` from 'react'
  - Export default `ForecastingSetup`
  - Note: does NOT import or reuse RetirementPanel. Uses same CSS class names for consistency.
```

### Track B — ForecastingSetup.module.css (Finding #12)

Add this comment as the very first line of the file:
```css
/* Styles copied from RetirementPanel.module.css. Keep in sync manually. */
```
All other rules unchanged from initial plan.

### Track C — ForecastingPage.jsx (Findings #4, #7, #8, #10)

Replace or amend the following subsections in ForecastingPage.jsx Details:

**Finding #4 — handleSetupSave now owns the full API call:**

Replace the `handleSetupSave` block with:
```js
handleSetupSave = useCallback(async (formData) => {
  setSetupLoading(true)
  setSetupError(null)
  try {
    await saveRetirement(formData)          // parent owns the save call
    const updated = await fetchRetirement() // re-fetch to get server-canonical data
    setRetirement(updated)
    // Re-initialize slider defaults from saved data
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
    setSetupError(err.message || 'Failed to save')
  } finally {
    setSetupLoading(false)
  }
}, [typeData])
```

ForecastingSetup receives `onSave={handleSetupSave}` — which now passes raw form data to the parent. The parent performs the API call. This eliminates the double-save.

**Finding #7 — hasNoInvestmentAccounts distinguishes null from 0:**

Replace:
```js
const hasNoInvestmentAccounts = investableCapital === 0 || investableCapital == null
```
with:
```js
// null means no series data (API returned no typeData or empty series)
// 0 means accounts exist but have $0 balance — still show the chart at $0
const hasNoData = investableCapital == null
```

Update the empty-state JSX condition from:
```jsx
{!isRetirementTargetInvalid && hasNoInvestmentAccounts && typeData != null && (
  <div className={styles.emptyState} data-testid="no-investment-accounts">
    No investment accounts found. Sync your retirement or brokerage accounts to see projections.
  </div>
)}
```
to:
```jsx
{!isRetirementTargetInvalid && hasNoData && typeData != null && (
  <div className={styles.emptyState} data-testid="no-investment-accounts">
    No investment data available. Sync your retirement or brokerage accounts to see projections.
  </div>
)}
```

Update the main content guard from:
```jsx
{!isRetirementTargetInvalid && !hasNoInvestmentAccounts && (
```
to:
```jsx
{!isRetirementTargetInvalid && !hasNoData && (
```

This allows a user with $0 investable capital (accounts synced, zero balance) to see the chart with a $0 baseline rather than the "no data" empty state.

**Finding #8 — contributionMax cap:**

Replace:
```js
contributionMax = Math.max(10000, (defaultContribution ?? 0) * 2)
```
with:
```js
// Cap at $50,000 to keep the slider step count manageable (max ~500 positions at $100 step)
contributionMax = Math.min(50000, Math.max(10000, (defaultContribution ?? 0) * 2))
```

**Finding #10 — handleEditSettings comment:**

Add an inline comment to `handleEditSettings`:
```js
// Navigates to /networth where RetirementPanel is located.
// No hash anchor is used because RetirementPanel has no id attribute today.
// If a deep-link is needed in future, add id="retirement" to RetirementPanel's container
// and change this to navigate('/networth#retirement').
handleEditSettings = useCallback(() => navigate('/networth'), [navigate])
```

### Track C — New tracked changes: Sidebar.test.jsx and BottomTabBar.test.jsx (Finding #2)

These are now explicit tracked changes in Track C (depends on nav.js change).

```
File: /home/user/stashtrend/frontend/src/components/Sidebar.test.jsx
Lines: 16-32
Parallelism: depends-on: nav.js
Description: Update test descriptions and assertions to account for the 6th nav item (Forecasting).
Details:
  - Line 16: Change test description from "renders all 5 nav items with correct labels"
    to "renders all 6 nav items with correct labels"
  - After line 22 (after the Sync Data getByRole assertion), add:
      expect(screen.getByRole('link', { name: /Forecasting/ })).toBeInTheDocument()
  - Line 25: Change test description from "each nav item links to the correct href"
    to "each nav item links to the correct href" (no change needed here unless description
    says "5", which it does not — leave as-is)
  - After line 31 (after the Sync Data href assertion), add:
      expect(screen.getByRole('link', { name: /Forecasting/ })).toHaveAttribute('href', '/forecasting')
  - No other changes — the active/inactive class tests and aria-label test are unaffected.
```

```
File: /home/user/stashtrend/frontend/src/components/BottomTabBar.test.jsx
Lines: 15-31
Parallelism: depends-on: nav.js
Description: Update test descriptions and assertions to account for the 6th nav item (Forecasting).
Details:
  - Line 15: Change test description from "renders all 5 tab items with correct labels"
    to "renders all 6 tab items with correct labels"
  - After line 21 (after the Sync Data getByRole assertion), add:
      expect(screen.getByRole('link', { name: /Forecasting/ })).toBeInTheDocument()
  - After line 30 (after the Sync Data href assertion), add:
      expect(screen.getByRole('link', { name: /Forecasting/ })).toHaveAttribute('href', '/forecasting')
  - No other changes.
```

### Track C — New tracked change: App.test.jsx (Finding #14)

App.test.jsx exists and has a nav link test at line 52-62 that asserts exactly 5 named links by name. Adding Forecasting to nav.js will cause this test to fail unless updated.

```
File: /home/user/stashtrend/frontend/src/App.test.jsx
Lines: 49-62
Parallelism: depends-on: nav.js
Description: Update the nav link test to include the Forecasting link and mock ForecastingPage.
Details:
  - Add mock at the top of the file alongside other page mocks (after line 17):
      vi.mock('./pages/ForecastingPage.jsx', () => ({ default: () => <div data-testid="forecasting-page" /> }))
  - Line 52: Change test description from "renders all nav links in sidebar and bottom tab bar"
    to "renders all nav links in sidebar and bottom tab bar" (no change to description needed)
  - After line 61 (after the Sync Data getAllByRole assertion), add:
      expect(screen.getAllByRole('link', { name: /Forecasting/ })).toHaveLength(2)
  - No other changes — routing tests use testids and are unaffected by the additional route.
```

### Updated Dependency Order (Tier 1 additions)

The Dependency Order section in the initial plan is mostly correct. One correction and two additions:

**Tier 1 additions:** Sidebar.test.jsx, BottomTabBar.test.jsx, and App.test.jsx updates are listed under "Track D — Existing Tests That Must Not Break" in the initial plan but must now be treated as explicit tracked changes. They belong in the Tier 2 column (depends on nav.js change, which is in Tier 1). Agents should not begin these test file edits until nav.js is written.

**Tier 2 correction:** Add Sidebar.test.jsx, BottomTabBar.test.jsx, and App.test.jsx to Tier 2 alongside RetirementPanel.jsx.

### Updated Test Strategy — ForecastingSetup.test.jsx (Finding #4)

Replace the ForecastingSetup test "Clicking Save calls `saveRetirement` with correct payload shape" with:

- "Clicking Save calls `onSave` prop with correct payload object (currentAge, targetAge, desiredIncome, monthlyContrib parsed as numbers)"
- "Clicking Save does NOT call `saveRetirement` directly (component is presentational)"

The component no longer imports `saveRetirement`, so the test must mock `onSave` as a `vi.fn()` prop and assert it was called with the expected shape. There is no API mock needed in this unit test.

### Updated Test Strategy — ForecastingPage.test.jsx (Finding #7, #4)

Add or replace the following test cases:

**Finding #7 — investableCapital of 0 shows chart, not empty state:**
- Change "Shows empty state when investableCapital is 0" to:
  "Shows empty state only when investableCapital is null (no series data)" — test with MOCK_NETWORTH_BY_TYPE having no series points
- Add new test: "Shows chart (not empty state) when investableCapital is 0 (zero-balance accounts)" — test with MOCK_NETWORTH_BY_TYPE having series where Retirement=0 and Brokerage=0

**Finding #4 — ForecastingSetup receives correct props:**
- The existing test "Shows ForecastingSetup when retirement `exists: false`" should also verify that ForecastingPage's `handleSetupSave` (passed as `onSave`) triggers `saveRetirement` + `fetchRetirement` when invoked, without ForecastingSetup calling saveRetirement itself. This can be tested by rendering a real ForecastingSetup (unmocked) in an integration-style test if desired, but the standard mocked-child approach is sufficient for the page-level test — just confirm `saveRetirement` is called when `onSave` fires.

---

## Summary of All Changed Files (delta additions to initial plan)

Files with content changes required beyond initial plan:

| File | Change Type | Findings Addressed |
|------|-------------|-------------------|
| `/home/user/stashtrend/frontend/src/utils/retirementMath.js` | Logic + JSDoc | #1, #9, #13 |
| `/home/user/stashtrend/frontend/src/components/ForecastingControls.jsx` | Parallelism tag | #11 |
| `/home/user/stashtrend/frontend/src/components/ForecastingControls.module.css` | CSS token | #6 |
| `/home/user/stashtrend/frontend/src/components/ForecastingChart.jsx` | JSX content | #5 |
| `/home/user/stashtrend/frontend/src/components/ForecastingSummary.module.css` | CSS tokens | #6 |
| `/home/user/stashtrend/frontend/src/components/ForecastingSetup.jsx` | Props contract + imports | #3, #4 |
| `/home/user/stashtrend/frontend/src/components/ForecastingSetup.module.css` | Comment | #12 |
| `/home/user/stashtrend/frontend/src/pages/ForecastingPage.jsx` | Logic: handleSetupSave, hasNoData, contributionMax, comment | #4, #7, #8, #10 |
| `/home/user/stashtrend/frontend/src/components/Sidebar.test.jsx` | Test updates | #2 |
| `/home/user/stashtrend/frontend/src/components/BottomTabBar.test.jsx` | Test updates | #2 |
| `/home/user/stashtrend/frontend/src/App.test.jsx` | Mock + assertion | #14 |

All other files (SliderInput, ForecastingPage.module.css, RetirementPanel.jsx, nav.js, App.jsx, fixtures.js, and their tests) are **no change from initial plan**.

---

## Rollback Notes

No change from initial plan.
