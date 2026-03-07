# Heatmap Refinements -- Architecture Decision Document

**Date:** 2026-03-07
**Change Size:** M
**Inputs:** `docs/plans/heatmap-refinements-requirements.md`, `docs/plans/heatmap-refinements-research.md`, `docs/heatmap-design-brief.html`

---

## Decision Summary

Six visual and interaction refinements to the budget heatmap, all frontend-only. The approach implements all six changes from the design brief as a single coordinated PR. Changes A (smart labels), B (dot sizing/padding), D (legend), and E (expanded accent) are independent and can be implemented in parallel. Changes C (remove arrow nav, update month format) and F (calendar picker) are coupled and must be coordinated. The window size remains at 6. The `formatMonthLabel` function is modified in place since its only callers are heatmap components. The legend includes all 5 states. Aggregate dots stay at 12px (matching the design brief spec table, not the Change 2 annotation which contradicts it).

---

## Resolved Open Questions

### 1. Legend states: 4 or 5?

**Decision:** 5 states. Include "No data" with `--text-faint`.

**Rationale:** The design brief mockup explicitly renders 5 legend items including "No data" (line 685-688 of the HTML). The heatmap already renders `dotFaint` dots for the `no-data` zone (via `getBudgetZone` returning `'no-data'`). Showing only 4 legend items would leave users wondering what the dimmer dots mean. The 5th item costs one extra flex child -- negligible.

**Rejected alternatives:**
- **4 states only** -- Would omit an explanation for dots that are visually present in the grid. Users would see unlabeled faint dots and wonder what they mean. Rejected because it creates a gap between what the user sees and what the legend explains.

### 2. `formatMonthLabel` change scope

**Decision:** Modify `formatMonthLabel` in place to output `"Sep '25"` format (apostrophe before 2-digit year).

**Rationale:** The function is imported in exactly two files: `HeatmapView.jsx` and `WindowPicker.jsx`. Both are heatmap components. There are zero other callers in the codebase (confirmed via import search). Changing the function in place is safe and avoids creating a near-duplicate utility. The new format matches `fmtBudgetMonth` in `chartUtils.jsx`, establishing a consistent apostrophe-year pattern across the app.

**Rejected alternatives:**
- **New `formatMonthShort()` function** -- Would create two functions with nearly identical implementations (both produce short month + 2-digit year, differing only in the apostrophe). Unnecessary duplication when there are no other callers to break. Rejected for adding code without benefit.
- **Format parameter on `formatMonthLabel`** -- Over-engineering for a function with 2 callers and no foreseeable need for multiple formats. If a caller someday needs the old format, they can use `toLocaleDateString` directly. Rejected for YAGNI.

### 3. Dot sizing: 10px or 12px aggregates?

**Decision:** Aggregate dots stay at 12px. Item dots stay at 10px. No change.

**Rationale:** The design brief's spec table (lines 715-716 of the HTML) is the authoritative layout reference and explicitly states "Aggregate dot: 12px diameter, Item dot: 10px diameter." The Change 2 annotation saying "10px dots" is a summary-level callout that conflicts with its own spec table. When a summary and a spec table disagree, the spec table wins. Additionally, the current implementation already matches the spec table values, so this is zero work.

**Rejected alternatives:**
- **Reduce aggregates to 10px** -- Would make aggregate and item dots identical in size, eliminating the visual hierarchy between group-level and category-level indicators. The 12px/10px distinction is intentional design. Rejected because it degrades information density.

### 4. Calendar picker layout: flat list or 2D grid?

**Decision:** 2D month grid (3 columns x 4 rows per year) with year navigation arrows.

**Rationale:** The design brief uses the phrase "calendar-style month grid" (line 741 of HTML) and the requirements spec says "3 columns x 4 rows = 12 months per year, with year navigation." A flat scrollable list of months is what `MonthDropdown` already does -- building another one would be visually redundant and harder to scan. A 3x4 grid lets users find a month spatially (Q1 top, Q4 bottom) and supports jump-to-any-month efficiently. The ARIA pattern remains combobox/listbox (each month cell is `role="option"`) since the grid is a selection mechanism, not a data grid.

**Rejected alternatives:**
- **Flat vertical list (like MonthDropdown)** -- Functional but does not match "calendar-style" language. Scrolling through 12+ months in a list is slower than a spatial grid. MonthDropdown already exists for single-month selection in a different context; duplicating its UX would be confusing. Rejected for usability and design intent mismatch.
- **Reuse MonthDropdown directly** -- MonthDropdown selects a single month for a detail view. The heatmap picker selects a window start with range semantics (the trigger shows "Sep 2025 -- Feb 2026"). Different interaction model, different trigger label, different ARIA ID requirement (both are mounted simultaneously in the swipe container). Rejected because the component serves a different purpose.

### 5. Window size: 5 or 6?

**Decision:** Keep `WINDOW_SIZE = 6`.

**Rationale:** The design brief mockup renders 6 dot columns in every group row (count the `.dot-col` elements -- there are 6 per row, lines 423-428, 437-442, etc.). The spec table says "6 columns." The brief's column headers show 6 months (Sep through Feb). The picker label shows a 6-month span ("Sep 2025 -- Feb 2026" = Sep, Oct, Nov, Dec, Jan, Feb = 6 months). The current implementation uses `WINDOW_SIZE = 6` and this matches all authoritative specs.

**Rejected alternatives:**
- **Change to 5** -- No evidence in the brief supports this. The picker label "Show: 5 months" does not appear in the brief HTML. Counting columns in the mockup yields 6 everywhere. Rejected because the premise was incorrect.

### 6. Expanded group visual treatment

**Decision:** Both `border-left: 3px solid var(--accent)` on the group card AND `background: var(--bg-inset)` on child rows.

**Rationale:** The requirements doc specifies both (lines 123-124). Using both provides two levels of visual feedback: the accent border marks which group is open (visible even when scrolled so only the header is on screen), and the inset background distinguishes child rows from the parent. To prevent layout shift from the border appearing/disappearing, the collapsed state will use `border-left: 3px solid transparent` so the space is always reserved.

**Rejected alternatives:**
- **Border-left only** -- Would differentiate the group card but not the child rows within it. When multiple groups are expanded, it becomes hard to tell where one group's children end and the next group starts. Rejected for incomplete visual differentiation.
- **Background only** -- Would differentiate child rows but not highlight which header triggered the expansion. Less useful when scanning a long grid. Rejected for the same reason.
- **`box-shadow` instead of `border-left`** -- `box-shadow: inset 3px 0 0 var(--accent)` would avoid layout shift without the transparent-border trick. However, `box-shadow` does not participate in the box model and can bleed into adjacent elements depending on overflow/clipping. The transparent-border approach is simpler and more predictable. Rejected for fragility.

### 7. Label column width

**Decision:** Keep at 110px. Do not change to 100px.

**Rationale:** The design brief mockup uses flex layout with a 127px label zone (including chevron + gap). The current CSS grid uses 110px for the label column, plus 12px padding (`--sp-3`) on each side. The chevron and gap are inside the 110px cell. At 13px font and `maxLen=14`, the maximum text width is ~91px which fits comfortably in 110px minus the chevron (~10px) and gap (~8px), leaving ~92px for text. Changing to 100px risks clipping edge-case names after abbreviation. The 10px difference is not visually meaningful. Keep what works.

**Rejected alternatives:**
- **Reduce to 100px** -- Would recover ~10px per row for dot columns. But the dots are already `flex: 1` within the remaining space and have plenty of room. The risk of label clipping outweighs the marginal space gain. Rejected for risk without benefit.

---

## Technical Approach by Change

### Change A: Smart Label Abbreviation

**New export in `budgetUtils.js`:**
```js
export function formatGroupLabel(name, maxLen = 14)
```

**Algorithm:**
1. If `name` is null/undefined/empty, return `"Other"`
2. If `name.length <= maxLen`, return as-is
3. Try word-boundary truncation: split on spaces, accumulate words while total length (with spaces) is within `maxLen`, return joined result (no trailing ellipsis if a clean word boundary was found)
4. If first word alone exceeds `maxLen`, truncate to `maxLen - 1` characters + unicode ellipsis `"\u2026"`

**Call sites in `HeatmapView.jsx`:**
- `group.groupName` in the `.groupName` span: `formatGroupLabel(group.groupName)`
- `cat.category_name` in the `.categoryLabel` div: `formatGroupLabel(cat.category_name, 12)` (shorter maxLen for child rows since they have left padding eating into the column width)

**CSS `text-overflow: ellipsis` remains** as a safety net for edge cases where the font renders wider than expected. The JS abbreviation handles the common case; CSS handles the rare overflow.

**Tests:** Unit tests in `budgetUtils.test.js` covering: short name (no-op), boundary-length name, multi-word truncation, single long word, null/empty input, `maxLen` override.

### Change B: Smaller Dots and Row Padding

**Decision changed from requirements:** Per Open Question 3 resolution, aggregate dots remain at 12px. No dot size changes needed. Only add explicit vertical padding.

**CSS changes in `HeatmapView.module.css`:**
- `.groupHeaderRow`: add `padding: 10px var(--sp-3)` (replaces `padding: 0 var(--sp-3)`)
- `.categoryRow`: add `padding: 7px var(--sp-3)` (replaces `padding: 0 var(--sp-3)`)

Since `min-height: 44px` and `min-height: 36px` are already set, the explicit padding may increase row height slightly beyond those minimums, which is acceptable -- the padding ensures consistent spacing regardless of content height.

### Change C: Single-Line Month Headers, Remove Arrow Nav

**`formatMonthLabel` in `budgetUtils.js`:**
Change the output format. Implementation: manually construct `"Sep '25"` by using `toLocaleDateString` for the month part and extracting 2-digit year, then concatenating with `" '"`. This avoids locale variations in `toLocaleDateString`'s handling of the 2-digit year format (some locales omit the apostrophe).

Concrete implementation:
```js
export function formatMonthLabel(monthKey) {
  const d = new Date(monthKey + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year = d.toLocaleDateString('en-US', { year: '2-digit' })
  return `${month} '${year}`
}
```

**Current-month accent in `HeatmapView.jsx`:**
- Compute `currentMonthKey` once: `new Date().toISOString().slice(0, 7) + '-01'` (yields `"2026-03-01"` format)
- In the column header `map`, compare `m` to `currentMonthKey` and apply a conditional CSS class `.headerMonthCurrent` with `color: var(--accent)`
- New CSS class in `HeatmapView.module.css`: `.headerMonthCurrent { color: var(--accent); font-weight: 500; }`

**Remove arrow nav bar:**
- Remove the `<WindowPicker .../>` usage from `HeatmapView.jsx` (the arrow-based one). It will be replaced by the new calendar picker (Change F), rendered in the same location.
- The old `WindowPicker.jsx` is not deleted -- it is rewritten in Change F.

### Change D: Persistent Legend

**New markup in `HeatmapView.jsx`**, rendered between the column headers row and the first `HeatmapGroupRow`. Positioned inside the grid container, after the `.columnHeaders` div.

**Legend data as a constant array** (not derived from state):
```js
const LEGEND_ITEMS = [
  { zone: 'safe',      label: 'Under 85%',  className: styles.dotSafe },
  { zone: 'warning',   label: '85 - 100%',  className: styles.dotWarning },
  { zone: 'over',      label: 'Over 100%',  className: styles.dotOver },
  { zone: 'no-budget', label: 'No budget',  className: styles.dotMuted },
  { zone: 'no-data',   label: 'No data',    className: styles.dotFaint },
]
```

**CSS in `HeatmapView.module.css`:**
- `.legend`: `display: flex; justify-content: center; gap: var(--sp-4); flex-wrap: wrap; padding: 10px var(--sp-3);`
- `.legendItem`: `display: flex; align-items: center; gap: 6px;`
- `.legendDot`: `width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;`
- `.legendLabel`: `font-size: 11px; font-weight: 400; color: var(--text-muted);`

**Test:** Verify legend renders 5 items with expected labels.

### Change E: Expanded Group Accent

**CSS changes in `HeatmapView.module.css`:**
- `.groupCard`: add `border-left: 3px solid transparent;` (reserves space, prevents layout shift)
- New `.groupCardExpanded`: `border-left-color: var(--accent); transition: border-left-color var(--ease-default);`
- `.groupContentInner`: add `background: var(--bg-inset);`

**JSX change in `HeatmapView.jsx` (`HeatmapGroupRow`):**
- Add conditional class to the `.groupCard` div:
  ```jsx
  className={`${styles.groupCard} ${isExpanded ? styles.groupCardExpanded : ''}`}
  ```

**Reduced motion:** Add `.groupCard` to the `prefers-reduced-motion` block to disable the `border-left-color` transition.

### Change F: Calendar Picker Replaces Arrow Nav

**Complete rewrite of `WindowPicker.jsx`.** New prop interface:

```jsx
<WindowPicker
  months={months}           // full sorted array (most-recent-first)
  windowStart={windowStart} // current offset index
  windowSize={WINDOW_SIZE}  // 6
  onWindowStartChange={setWindowStart}  // callback receiving new index
/>
```

**Trigger element:**
- `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls="heatmap-window-listbox"`
- Uses distinct `LISTBOX_ID = 'heatmap-window-listbox'` (not `'month-listbox'`) to avoid DOM ID collision with MonthDropdown which is mounted simultaneously in pane 1
- Displays range label: `"Sep 2025 \u2014 Feb 2026"` format (full month name + 4-digit year for the range label, using an em-dash separator)
- Chevron rotates when open

**Month grid panel:**
- `role="listbox"`, `id="heatmap-window-listbox"`
- Layout: 3-column CSS grid (`grid-template-columns: repeat(3, 1fr)`)
- Each cell: `role="option"`, shows 3-letter month abbreviation, `aria-selected` for the current window-start month
- Year header row with prev/next year buttons
- Months beyond available data range: `aria-disabled="true"`, visually muted, not selectable
- Months that would create a window extending beyond the newest available month: disabled (clamped)

**Selection behavior:**
- Tapping a month sets `windowStart` so that month is the oldest visible month in the 6-month window
- The conversion: `onWindowStartChange(months.indexOf(selectedMonth))` (since `months` is sorted most-recent-first, the index positions the window correctly)
- If the selected month is within `WINDOW_SIZE - 1` of the start of the array (newest months), clamp so the window does not extend beyond available data

**Keyboard navigation:**
- Arrow keys navigate months in the grid (left/right for horizontal, up/down for rows of 3)
- Enter selects
- Escape closes without changing selection, returns focus to trigger

**Click-outside-to-close:** Same pattern as MonthDropdown (document `mousedown` listener)

**CSS in `WindowPicker.module.css`:**
- Complete rewrite. Remove all `.arrow`, `.monthStrip`, `.monthLabel` styles
- New styles: `.trigger` (replaces `.picker`), `.triggerLabel`, `.chevron`, `.panel`, `.yearRow`, `.yearButton`, `.yearLabel`, `.monthGrid`, `.monthOption`, `.monthOptionSelected`, `.monthOptionDisabled`, `.monthOptionCurrent`

**Tests in `WindowPicker.test.jsx`:**
- Complete rewrite (all 8 existing tests are arrow-nav specific and become invalid)
- New tests: renders trigger with range label, opens panel on click, renders month grid, selects month and calls callback, disables out-of-range months, closes on Escape, closes on click-outside, applies `aria-selected` to current month

**Integration in `HeatmapView.jsx`:**
- Pass new props to WindowPicker instead of old arrow-nav props
- Remove `canGoOlder`, `canGoNewer` computations (no longer needed -- the picker handles bounds internally)
- Keep `windowStart` state management in HeatmapView (WindowPicker calls back with the new value)
- The `hidden` prop is removed. The picker always renders (even with few months, it shows the current range). When `months.length <= 1`, the picker could be hidden, but that is an extreme edge case not worth special-casing.

---

## Component Boundary Changes

No new components are created. No components are deleted.

| Component | Change |
|-----------|--------|
| `HeatmapView` | Adds legend markup, current-month accent logic, `formatGroupLabel` calls, expanded accent class, new WindowPicker props |
| `HeatmapGroupRow` | Adds conditional `.groupCardExpanded` class |
| `WindowPicker` | Complete rewrite: combobox trigger + month grid panel replaces arrow nav |

---

## Prop Interface Changes

### WindowPicker (breaking change)

**Old:**
```
displayMonths: string[]
canGoOlder: boolean
canGoNewer: boolean
onGoOlder: () => void
onGoNewer: () => void
hidden?: boolean
```

**New:**
```
months: string[]              // full month list, most-recent-first
windowStart: number           // current offset index into months[]
windowSize: number            // 6
onWindowStartChange: (n: number) => void
```

### HeatmapView (no change to external props)

External interface (`categories`, `customGroups`, `months`) is unchanged. Internal state management changes are encapsulated.

---

## File Modification List

| File | Changes | Change IDs |
|------|---------|------------|
| `frontend/src/utils/budgetUtils.js` | Add `formatGroupLabel()` export; update `formatMonthLabel()` output format | A, C |
| `frontend/src/utils/budgetUtils.test.js` | Add `formatGroupLabel` tests; update `formatMonthLabel` expected values | A, C |
| `frontend/src/components/mobile/HeatmapView.jsx` | Import `formatGroupLabel`; apply to group/category names; add legend markup; add current-month accent logic; add `.groupCardExpanded` conditional class; update WindowPicker props | A, C, D, E, F |
| `frontend/src/components/mobile/HeatmapView.module.css` | Add row padding; add legend styles; add `.groupCardExpanded` + transparent border-left on `.groupCard`; add `.headerMonthCurrent`; add `.groupContentInner` background; add to reduced-motion block | B, C, D, E |
| `frontend/src/components/mobile/HeatmapView.test.jsx` | Add legend rendering test; update any format-dependent assertions | C, D |
| `frontend/src/components/mobile/WindowPicker.jsx` | Complete rewrite: combobox trigger + month grid | C, F |
| `frontend/src/components/mobile/WindowPicker.module.css` | Complete rewrite: remove arrow styles, add trigger/panel/grid styles | C, F |
| `frontend/src/components/mobile/WindowPicker.test.jsx` | Complete rewrite: new tests for combobox behavior | C, F |

**Files NOT modified:**
- `frontend/src/index.css` -- all needed tokens already exist
- `frontend/src/pages/MobileBudgetPage.jsx` -- HeatmapView's external props are unchanged
- `frontend/src/components/mobile/MonthDropdown.jsx` -- no changes needed
- Backend -- no changes

---

## Parallelism Guidance

### Independent work streams (can run in parallel):

| Stream | Changes | Files (exclusive) |
|--------|---------|-------------------|
| **Stream 1: Labels** | A | `budgetUtils.js` (add `formatGroupLabel`), `budgetUtils.test.js` (add tests) |
| **Stream 2: CSS polish** | B, E | `HeatmapView.module.css` (padding + accent styles) |
| **Stream 3: Legend** | D | `HeatmapView.jsx` (legend markup only), `HeatmapView.module.css` (legend styles), `HeatmapView.test.jsx` (legend test) |
| **Stream 4: Picker + Headers** | C, F | `WindowPicker.jsx`, `WindowPicker.module.css`, `WindowPicker.test.jsx`, `budgetUtils.js` (update `formatMonthLabel`) |

**Conflicts to manage:**
- Streams 1 and 4 both touch `budgetUtils.js` -- Stream 1 adds a new function, Stream 4 modifies an existing one. These are different functions so the merge is clean, but they should coordinate if working in the same file simultaneously.
- Streams 2, 3 both touch `HeatmapView.module.css` -- different sections (padding/accent vs. legend styles) so merge is clean but be aware.
- Streams 3 and 4 both touch `HeatmapView.jsx` -- Stream 3 adds legend markup, Stream 4 changes WindowPicker props and adds current-month accent. Different sections of the JSX. Manageable but may need rebase.

**Recommended approach:** Implement Streams 1 and 2 first (smallest, fewest conflicts). Then Stream 3 (legend). Then Stream 4 (picker rewrite, largest change). Or run all four in parallel with a final integration pass.

---

## Risks and Mitigations

### Risk 1: WindowPicker rewrite breaks existing HeatmapView tests
**Severity:** Medium
**Mitigation:** The HeatmapView test file renders HeatmapView with mock data. If tests assert on WindowPicker sub-elements (arrow buttons, month strip), they will fail. Review `HeatmapView.test.jsx` during implementation and update assertions that depend on the old WindowPicker structure. The rewrite of `WindowPicker.test.jsx` handles the component's own tests.

### Risk 2: DOM ID collision between MonthDropdown and new WindowPicker
**Severity:** High (breaks ARIA, causes test failures)
**Mitigation:** Use `LISTBOX_ID = 'heatmap-window-listbox'` in the new WindowPicker, distinct from MonthDropdown's `'month-listbox'`. Both components are mounted simultaneously in the swipe container. This is called out explicitly in the implementation requirements.

### Risk 3: `formatMonthLabel` apostrophe rendering
**Severity:** Low
**Mitigation:** Use a straight apostrophe (`'`) not a curly quote. The manual string concatenation approach (`${month} '${year}`) ensures consistent output regardless of locale. Test explicitly for the apostrophe character in the output.

### Risk 4: Calendar grid month-to-index mapping correctness
**Severity:** Medium
**Mitigation:** The `months` array is sorted most-recent-first. Converting a selected month from the grid back to a `windowStart` index requires `months.indexOf(selectedMonthKey)`. If the selected month is not in the array (e.g., user navigates to a year with no data), the selection should be a no-op. Add a guard: `const idx = months.indexOf(key); if (idx < 0) return;`.

### Risk 5: Layout shift on expand/collapse with border-left
**Severity:** Low
**Mitigation:** The transparent border-left is always present (3px). Only the color changes on expand. No geometry changes, no shift.

---

## Open Questions (Requiring Human Input)

1. **Trigger label format:** The requirements say "Sep 2025 -- Feb 2026" and the brief mockup says "Sep 2025 --- Feb 2026". I have specified the trigger uses an em-dash separator with full month + 4-digit year (e.g., "Sep 2025 -- Feb 2026"). If the user prefers a different format (e.g., "Sep '25 -- Feb '26" or "September 2025 -- February 2026"), flag during QA. This is a cosmetic preference, not an architectural decision.

2. **Year navigation in calendar grid:** The architecture specifies minimal year navigation (year label + prev/next arrows). If the user wants a year dropdown instead of arrows, that is a minor implementation variant. The current approach is the simplest that works.
