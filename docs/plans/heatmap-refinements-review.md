# Heatmap Refinements -- Staff Engineer Plan Review

**Date:** 2026-03-07
**Verdict:** Needs revision (7 findings, 2 HIGH, 3 MEDIUM, 2 LOW)

The plan is thorough, well-organized, and demonstrates strong attention to ARIA, parallelism, and edge cases. The code sketches are detailed and mostly correct. The issues below must be addressed before implementation proceeds.

---

## Findings

### 1. [HIGH] WindowPicker: `oldestMonth` / `newestMonth` are swapped

**Location:** Plan line 495-496, WindowPicker.jsx code sketch

**Description:** The `months` array is sorted most-recent-first, so `months[windowStart]` is the _newest_ month in the window, and `months[windowStart + windowSize - 1]` is the _oldest_. The plan computes:

```js
const oldestMonth = windowSlice[windowSlice.length - 1] ?? months[months.length - 1]
const newestMonth = windowSlice[0] ?? months[0]
```

Since `windowSlice = months.slice(windowStart, windowStart + windowSize)`, index 0 of the slice is the most-recent month and the last element is the oldest. The variable names are correct for the trigger label ("oldest -- newest"), BUT the `aria-selected` logic on line 683 uses `monthKey === oldestMonth` to mark the selected grid cell. This means the _oldest_ month in the window is marked as selected, which is correct per the architecture doc ("selecting a month sets windowStart so that month is the oldest visible month"). However, when the user selects a month from the grid, `handleSelect` calls `onWindowStartChange(idx)` where `idx = months.indexOf(monthKey)`. Since `months` is most-recent-first, this sets `windowStart` to the index of the selected month, making it `months[windowStart]` -- which is the _newest_ month in the window, not the oldest.

This is a correctness bug. If the user selects "Sep 2025" intending it to be the oldest month, `windowStart` is set to `months.indexOf('2025-09-01')` (say, index 6). Then `months.slice(6, 12)` gives Sep, Aug, Jul, Jun, May, Apr -- making Sep the _newest_ visible month, not the oldest.

**Required action:** The selection logic needs to compute the correct index. If the selected month should be the oldest in the window, then `windowStart = months.indexOf(selectedMonth) - (windowSize - 1)`. The existing `HeatmapView` code confirms this: `displayMonths = [...windowMonths].reverse()` where `windowMonths = months.slice(windowStart, windowStart + windowSize)`, so the oldest visible month is `months[windowStart + windowSize - 1]`, not `months[windowStart]`. The correct formula:

```js
const idx = months.indexOf(monthKey)
const newStart = Math.max(0, idx - (windowSize - 1))
onWindowStartChange(newStart)
```

Additionally, `aria-selected` should compare against `months[windowStart + windowSize - 1]` (the actual oldest month), and the trigger label should swap variable assignments or rename them for clarity.

The test at plan lines 976-988 ("clicking an available month calls onWindowStartChange with correct index") will also need its expected value recalculated.

---

### 2. [HIGH] WindowPicker test: `aria-disabled` assertion expects `"false"` but the attribute may not be present

**Location:** Plan line 1023, WindowPicker.test.jsx code sketch

**Description:** The test asserts:
```js
expect(sepOption).toHaveAttribute('aria-disabled', 'false')
```

However, looking at the WindowPicker JSX code sketch (plan line 691), `aria-disabled={disabled}` renders as `aria-disabled="false"` when the month is available. While this technically works, the ARIA best practice is to omit `aria-disabled` entirely when the element is not disabled, rather than setting it to `"false"`. Setting `aria-disabled="false"` on every non-disabled option adds noise to the accessibility tree.

**Required action:** Change the JSX to conditionally render `aria-disabled` only when true:
```jsx
aria-disabled={disabled || undefined}
```
Then update the test to use:
```js
expect(sepOption).not.toHaveAttribute('aria-disabled')
```
Or keep the current approach and accept the ARIA noise -- this is a judgment call but the test must match whichever approach is chosen.

---

### 3. [MEDIUM] Parallelism conflict: Stream 3 owns `HeatmapView.test.jsx` but fixes tests broken by Stream 4

**Location:** Plan lines 360-375, Stream 3 test updates

**Description:** Stream 3 is described as "independent" but its test file edits include updating two tests (lines 103-111) that break because of Stream 4's WindowPicker rewrite. This creates a dependency: Stream 3's test updates cannot be validated until Stream 4's WindowPicker rewrite is complete. If Stream 3 runs first and updates the tests to query for `role="combobox"`, those tests will fail because the old arrow-based WindowPicker is still in place.

**Required action:** Move the two broken-test fixes from Stream 3 to the integration pass (Step 2). Stream 3 should only add the new legend tests. The broken-test fixes are a direct consequence of Stream 4's rewrite and belong in the integration step where both streams' changes are merged.

---

### 4. [MEDIUM] `formatGroupLabel` edge case: `undefined` input not handled

**Location:** Plan lines 42-78, `formatGroupLabel` code sketch in `budgetUtils.js`

**Description:** The code sketch handles `null` and empty string:
```js
if (!name || name.length === 0) return 'Other'
```

This also catches `undefined` due to the falsy check. However, the test cases only list `null` and `""` explicitly (tests 6 and 7, plan lines 1146-1147). The architecture doc (line 96-97) also only mentions "null/undefined/empty." Since `groupExpenses` falls back to `'Other'` for null `group_name` (line 133 of budgetUtils.js), `formatGroupLabel` could receive names like `0` (a number) or other unexpected types if the data is malformed.

**Required action:** Add a test case for `undefined` input. Optionally add a type coercion guard (`String(name)`) for non-string inputs, or document that the function expects strings only.

---

### 5. [MEDIUM] `groupCard` border-left conflicts with existing `border` shorthand

**Location:** Plan lines 189-197, Stream 2 CSS changes

**Description:** The current `.groupCard` rule has:
```css
border: 1px solid var(--border);
```

The plan adds:
```css
border-left: 3px solid transparent;
```

CSS specificity means `border-left` after `border` will override the left side correctly. But the visual result is that the left border is 3px transparent while top/right/bottom are 1px with `var(--border)`. When expanded, the left border becomes 3px cobalt accent. The asymmetric border width (3px left vs 1px elsewhere) combined with `border-radius: var(--radius-lg)` (12px) may produce a visual artifact where the top-left and bottom-left corners have mismatched radius rendering. This is a rendering concern, not a correctness bug.

**Required action:** Verify during Playwright QA that the border-radius corners render cleanly with the asymmetric border widths. If the radius looks off, consider using `box-shadow: inset 3px 0 0 var(--accent)` instead (as the architecture doc noted as a rejected alternative but acknowledged as visually equivalent). Add a note to the QA checklist to specifically inspect this.

---

### 6. [LOW] `formatRangeMonth` JSDoc says "full month name" but implementation uses `month: 'short'`

**Location:** Plan lines 456-464, WindowPicker.jsx code sketch

**Description:** The JSDoc comment says "Format an ISO date string as 'Sep 2025' (full month name + 4-digit year)" but "Sep" is a short month name, not a full month name. The architecture doc (line 197) correctly describes it as "full month name + 4-digit year" with the example "Sep 2025" -- but these two descriptions are contradictory (Sep is short, September is full).

**Required action:** Fix the JSDoc to say "short month name + 4-digit year" or update the implementation to use `{ month: 'long' }` if "September 2025" is desired. Based on the trigger label fitting in a mobile viewport (375px), short names are the correct choice. Update the JSDoc only.

---

### 7. [LOW] Missing test: click-outside-to-close for WindowPicker

**Location:** Plan lines 1170-1181, WindowPicker test list

**Description:** The architecture doc (line 218) specifies "Click-outside-to-close: Same pattern as MonthDropdown (document mousedown listener)" and the WindowPicker code sketch implements this pattern (lines 557-565). However, the test list (9 tests) does not include a click-outside test. The plan's test list at line 1180 says "10" tests (numbering goes to 10) but there are actually only 9 test `it()` blocks in the code sketch. The architecture doc's "Tests" section (line 226) lists "closes on click-outside" as a required test but it is missing from the implementation plan's test code.

**Required action:** Add a test:
```js
it('closes panel when clicking outside the component', () => {
  renderPicker()
  fireEvent.click(screen.getByRole('combobox'))
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  fireEvent.mouseDown(document.body)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
```

---

## Questions for the Engineer

1. **Finding 1 (window index mapping):** Can you confirm whether the selected month should become the oldest or newest month in the 6-month window? The architecture doc says "oldest" but the `handleSelect` implementation makes it the newest. This needs to be resolved before implementation because it affects the selection callback, `aria-selected` target, and test expected values.

2. **Stream parallelism in practice:** Given that Streams 1, 3, and 4 all touch `HeatmapView.jsx` and the integration pass is described as sequential, would it be simpler to run Streams 1 and 2 in parallel, then Stream 4 (picker rewrite) solo, then apply Stream 3 (legend) and integration as a final pass? The current plan's "all four parallel" approach has three streams colliding in the same file.

3. **Year navigation edge case:** If the user navigates to a year that has zero months in the available dataset (e.g., data spans 2025-2026, user clicks "Previous year" to reach 2024), all 12 month cells will be disabled. Is that acceptable UX, or should the year navigation buttons be disabled when the adjacent year has no data? The current `prevYear`/`nextYear` logic (plan lines 621-622) checks against `availableYears[0]` and `availableYears[last]`, which would prevent navigating beyond available years. However, a year might be _partially_ available (e.g., only Dec 2024) -- confirm this is handled correctly by the `availableYears` derivation.
