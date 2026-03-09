# Phase 4: Forecasting Page — Staff Engineer Review

**Date:** 2026-03-09
**Reviewer:** Staff Engineer Agent
**Input:** phase4-impl-plan.md + CLAUDE.md
**Verdict:** Revisions required before implementation

---

## Findings

1. [Critical] retirementMath.js:calculateContributionToTarget (plan lines 58-72) — The `r !== 0` path has no floor guard ensuring the result is >= `currentContribution`. The function computes `fvLump` from the lump sum alone (no contributions), derives `neededContrib` to fill the shortfall, and returns `Math.ceil(neededContrib / 100) * 100`. Because `generateProjectionSeries` (used for the baseline projection in ForecastingPage) compounds contributions monthly, the baseline can fall slightly short of the target while `calculateContributionToTarget` (which ignores existing contributions differently) returns a value barely below `currentContribution` due to rounding differences. This violates the test assertion on plan line 944 ("Result >= currentContribution") and would produce a negative `additionalNeeded` in ForecastingSummary (line 357: `neededContribution - currentContribution`), rendering nonsense like "Increase contributions by -$100/month."

   Required action: After line 71 (`Math.ceil(neededContrib / 100) * 100`), add `return Math.max(result, currentContribution)` to enforce the floor. Alternatively, restructure so the function always returns the greater of the computed value and `currentContribution`. The `r === 0` path already has this guard (line 66) but the `r !== 0` path does not.

2. [High] Sidebar.test.jsx and BottomTabBar.test.jsx — Both files hardcode "renders all 5 nav items" in test descriptions and assert exactly 5 specific nav links by name. Adding the Forecasting entry to `nav.js` will cause these tests to fail because neither expects a "Forecasting" link. The plan acknowledges this risk on line 1038 but does not include the fix as a tracked change.

   Required action: Add two explicit change blocks to the plan:
   - `Sidebar.test.jsx`: Update the test description from "5" to "6", add `expect(screen.getByRole('link', { name: /Forecasting/ })).toBeInTheDocument()` and the corresponding href assertion for `/forecasting`.
   - `BottomTabBar.test.jsx`: Same updates. These should be listed in Track C (depends on nav.js change) or Track D (tests).

3. [High] ForecastingSetup.jsx (plan lines 407-443) — The plan lists `import fetchRetirement from '../api.js'` (line 439) but the component never uses `fetchRetirement`. The parent (`ForecastingPage`) handles re-fetching after save via `handleSetupSave`. This is a dead import that will trigger lint warnings.

   Required action: Remove `fetchRetirement` from the import list for ForecastingSetup.jsx. Only `saveRetirement` is needed.

4. [High] ForecastingSetup.jsx (plan lines 421-424) — The `handleSave` function calls `saveRetirement({...})` directly and on success calls `onSave(savedData)`. But the parent `ForecastingPage.handleSetupSave` (lines 565-569) also calls `saveRetirement(data)` and then `fetchRetirement()`. This means `saveRetirement` is called twice: once inside ForecastingSetup and once in the parent's `handleSetupSave`. The plan is ambiguous about who owns the save call.

   Required action: Clarify the contract. Either: (a) ForecastingSetup calls `saveRetirement` and passes the result to `onSave`, and the parent only does `fetchRetirement` + state updates (remove the parent's `saveRetirement` call), or (b) ForecastingSetup only collects form data and calls `onSave(formData)`, letting the parent handle the API call entirely. Option (b) is cleaner and matches the pattern where presentational components don't make API calls. Update both ForecastingSetup.jsx and ForecastingPage.jsx accordingly.

5. [Medium] ForecastingChart.jsx (plan lines 310-313) — The `srSummary` prop is listed in the component details but is mentioned late at line 315, after the JSX block. The JSX shows `<p className={styles.srOnly} aria-live="polite">` with a comment saying "filled by prop or computed in parent -- passed as srSummary prop" but the actual content `{srSummary}` is never shown inside the `<p>` tag in the JSX. The JSX block at line 311 shows an empty element.

   Required action: Update the JSX in the plan to explicitly render `{srSummary}` inside the `<p>` tag: `<p className={styles.srOnly} aria-live="polite">{srSummary}</p>`.

6. [Medium] ForecastingControls.module.css (plan line 224) — The `.cagrWarning` style uses `color: var(--amber)` but the plan comment says "use `--color-warning`". These resolve to the same value (`--color-warning: var(--amber)` in index.css), but the inconsistency between the CSS property and the comment is confusing. The rest of the codebase uses the semantic token `--color-warning` or `--color-negative` rather than the raw color variables in component CSS.

   Required action: Use `color: var(--color-warning)` consistently, not `var(--amber)`. Similarly, ForecastingSummary.module.css line 398 uses raw `var(--green)` and `var(--red)` -- check if semantic aliases exist and prefer them.

7. [Medium] ForecastingPage.jsx (plan lines 693-696) — `hasNoInvestmentAccounts` is defined as `investableCapital === 0 || investableCapital == null`. However, `getInvestableCapital` returns `(latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)`, which returns 0 when both buckets are missing from the latest data point (not just when there are no investment accounts). A user who has synced investment accounts but has $0 balance would see "No investment accounts found" -- which is misleading.

   Required action: Distinguish between "no data" (`investableCapital == null`, meaning no series) and "zero balance" (`investableCapital === 0`). For zero balance, show the chart with a $0 starting point rather than the "no accounts" empty state, or change the empty state message to "Your investable capital is currently $0."

8. [Medium] ForecastingPage.jsx (plan line 691) — `contributionMax = Math.max(10000, (defaultContribution ?? 0) * 2)`. If the user's saved monthly contribution is $50,000 (or any large number), the max becomes $100,000 and the slider range is enormous with $100 steps, making fine-grained adjustment impossible (1000 discrete positions). Conversely, if the default is $0, the max is $10,000 which is reasonable.

   Required action: Add an upper bound cap, e.g., `Math.min(Math.max(10000, defaultContribution * 2), 50000)` or use dynamic step sizing. At minimum, document the design decision if the current formula is intentional.

9. [Medium] calculateContributionToTarget (plan lines 60-61) — The function converts annual return to a monthly rate (`r = annualReturnPct / 100 / 12`). This is simple division, not the mathematically correct conversion (`(1 + annual)^(1/12) - 1`). The same simplification is used in `generateProjectionSeries` (line 44 of retirementMath.js: `annualReturnPct / 100 / 12`), so the two are consistent with each other. However, for high return rates (e.g., 15%), the simple division overestimates monthly compounding vs. the correct formula. Since both functions use the same simplification, the projection and contribution calculation will agree, so this is internally consistent but produces slightly optimistic results.

   Required action: No code change required if the existing convention is accepted. Add a JSDoc note in `calculateContributionToTarget` stating it uses the same monthly rate approximation as `generateProjectionSeries` for consistency, so future maintainers don't "fix" one without the other.

10. [Medium] ForecastingPage.jsx (plan line 522) — The plan imports `useNavigate` from react-router-dom and uses it for the "Edit Settings" link (line 573: `navigate('/networth')`). But the "Edit Settings" action navigates to the entire Net Worth page, not to the retirement settings panel specifically. If RetirementPanel is at the bottom of the Net Worth page, the user would need to scroll to find it.

    Required action: Either add a hash/anchor (`navigate('/networth#retirement')`) and add a corresponding `id="retirement"` to RetirementPanel's container, or accept this as a known limitation and add a comment explaining why.

11. [Medium] ForecastingControls.jsx (plan line 174) — Parallelism tag says "independent (depends-on: SliderInput.jsx for import, but can be written concurrently)". This is contradictory. The Dependency Order section (line 896) correctly places ForecastingControls in Tier 2 as dependent on SliderInput. But the file-level parallelism tag says "independent" which could mislead an implementer agent into starting it before SliderInput exists.

    Required action: Change the parallelism tag to `depends-on: SliderInput.jsx` to match the Dependency Order section. The file can be written concurrently (the import will resolve at build time), but the tag should reflect the truth for agent scheduling.

12. [Low] ForecastingSetup.module.css (plan lines 453-462) — The plan acknowledges copying styles from RetirementPanel.module.css verbatim into a new file, with a note explaining CSS Modules don't allow cross-module sharing. This creates maintenance drift risk -- if RetirementPanel styles are updated, ForecastingSetup won't follow.

    Required action: Add a comment at the top of ForecastingSetup.module.css: `/* Styles copied from RetirementPanel.module.css. Keep in sync manually. */` so future maintainers know the relationship.

13. [Low] retirementMath.js (plan lines 46-56) — `computeBlendedCAGR` handles null `typeData` gracefully per the test on line 935, but the plan's implementation details (lines 46-47) start with `const latest = typeData?.series?.[typeData.series.length - 1] ?? {}`. When `typeData` is null, `typeData?.series` is undefined, but `typeData.series.length` would throw because `typeData` is null. The optional chaining on `typeData?.series?.[...]` is correct, but `typeData.series.length` on the same line (inside the bracket accessor) needs to also be guarded: `typeData?.series?.length`.

    Required action: Verify the plan's pseudocode uses `typeData?.series?.[typeData?.series?.length - 1]` (with full optional chaining). The current text on line 46 is ambiguous -- it mixes `typeData?.series?.[typeData.series.length - 1]` which would throw on null `typeData`.

14. [Low] Test count (plan line 1038) — The plan mentions "App.test.jsx -- may need updating if it tests the exact number of routes or route paths" but does not confirm whether App.test.jsx exists or what it tests.

    Required action: Verify whether `App.test.jsx` exists. If it does and tests routing, add it to the tracked changes list with specific updates needed.

---

## Checklist Review

- [x] All new files have co-located CSS modules (6 JSX + 6 CSS = 12 new files, confirmed)
- [x] All components use PropTypes (confirmed in each component spec)
- [x] Parallelism tags are mostly correct (one contradiction noted in Finding #11)
- [x] Test coverage: utility functions well-covered, component tests present, page test follows existing pattern
- [x] No backend changes needed (confirmed -- all math is frontend-only)
- [x] Rollback plan is clear and complete
- [x] Existing test breakage identified but not fully addressed (Finding #2)
- [ ] API call ownership ambiguity needs resolution (Finding #4)
- [ ] Guard missing on contribution calculation (Finding #1)

---

## Summary

The plan is thorough and well-structured. The parallelism decomposition into 4 tracks is sound and the test strategy is comprehensive. However, there are two issues that must be fixed before implementation:

1. **Finding #1 (Critical):** The `calculateContributionToTarget` function lacks a floor guard in the `r !== 0` path, which can produce negative "additional needed" values in the UI.

2. **Finding #2 (High):** Sidebar and BottomTabBar test updates are acknowledged but not tracked as explicit changes, meaning they will be forgotten during implementation and cause test failures.

3. **Finding #4 (High):** The double-save ambiguity between ForecastingSetup and ForecastingPage will cause the retirement settings to be saved twice per setup action.

All other findings are Medium or Low and can be addressed during implementation without plan revisions.
