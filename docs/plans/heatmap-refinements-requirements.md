# Heatmap Refinements -- Requirements Document

**Change Size:** M (multi-file, 6 coordinated UI changes, tests affected)
**Source:** Design brief at `heatmap-design-brief.html`
**Date:** 2026-03-07

---

## 1. Clarified Intent

Six targeted visual and interaction refinements to the existing budget heatmap feature (`HeatmapView.jsx`, `WindowPicker.jsx`, CSS modules, `budgetUtils.js`). These are polish-level changes from a design review -- no new data flows, no backend changes. The goal is to improve information density, scannability, and navigation within the existing heatmap pane.

---

## 2. Change Specifications

### Change A: Smart Label Abbreviation

**Current state:** Group names render with CSS `text-overflow: ellipsis` at the 110px column width. Long names like "Auto & Transport" get clipped mid-word with "...".

**Proposed:** A `formatGroupLabel(name, maxLen = 14)` utility function in `budgetUtils.js` that intelligently abbreviates group names to fit. Strategy: if the name fits within `maxLen`, return as-is; otherwise apply word-boundary truncation or abbreviation rules so the result is readable without relying on CSS ellipsis for the primary label.

**Acceptance criteria:**
- `formatGroupLabel("Food & Dining", 14)` returns a string <= 14 characters that is human-readable (not ending in "...")
- `formatGroupLabel("Housing", 14)` returns "Housing" unchanged (already short enough)
- `formatGroupLabel("Auto & Transport", 14)` returns a readable abbreviation <= 14 characters
- Function is exported from `budgetUtils.js` with unit tests covering: short names (no-op), names at boundary length, names requiring abbreviation, single-word long names, empty/null input
- `HeatmapView.jsx` calls `formatGroupLabel()` on group names before rendering in `.groupName` span
- Category names in child rows also pass through `formatGroupLabel()` (with appropriate `maxLen` for child rows)

**Files affected:**
- `frontend/src/utils/budgetUtils.js` (new export)
- `frontend/src/utils/budgetUtils.test.js` (new tests)
- `frontend/src/components/mobile/HeatmapView.jsx` (call site)

**Dependencies:** None -- independent of other changes.

---

### Change B: Smaller Dots and Row Padding

**Current state:** Aggregate dots are 12px, item dots are 10px. Group header rows are 44px min-height, category rows are 36px min-height. No explicit vertical padding on rows.

**Proposed:** Reduce aggregate dots from 12px to 10px. Item dots remain at 10px (no change). Add explicit vertical padding to group header rows (10px top/bottom) and category rows (7px top/bottom) for tighter density while maintaining tap targets.

**Acceptance criteria:**
- Aggregate dots (`.dot` class) render at 10px x 10px
- Item dots (`.dotItem` class) remain at 10px x 10px (verify no regression)
- Group header rows have exactly 10px vertical padding (top and bottom)
- Category rows have exactly 7px vertical padding (top and bottom)
- All dots remain circular (border-radius: 50%)
- The grid remains readable at 375px viewport width without horizontal overflow

**Files affected:**
- `frontend/src/components/mobile/HeatmapView.module.css` (dot sizes, row padding)

**Dependencies:** None -- independent CSS-only change.

---

### Change C: Single-Line Month Headers, Remove Arrow Nav Bar

**Current state:** Column headers show month labels using `formatMonthLabel()` which outputs "Jan 26" format. The `WindowPicker` component renders as a separate bar above the grid with left/right arrow buttons flanking a month strip that repeats the same labels.

**Proposed:** Keep the column headers row inside the heatmap grid card (already exists). Remove the `WindowPicker`'s arrow-based navigation bar entirely -- its role is replaced by the calendar picker (Change F). Update `formatMonthLabel()` to output "Sep '25" format (abbreviated month + apostrophe + 2-digit year). The current month's column header should render with the accent color (`--accent` / `#4D9FFF`) instead of the default muted color.

**Acceptance criteria:**
- `formatMonthLabel("2025-09-01")` returns `"Sep '25"` (note the apostrophe before the year)
- The arrow nav bar (left arrow, month strip, right arrow) no longer renders
- Column header for the current month (matching today's year-month) renders with `color: var(--accent)` instead of `var(--text-muted)`
- All other month headers remain `var(--text-muted)`
- Existing tests for `formatMonthLabel` are updated to match the new format

**Files affected:**
- `frontend/src/utils/budgetUtils.js` (update `formatMonthLabel` output format)
- `frontend/src/utils/budgetUtils.test.js` (update expected values)
- `frontend/src/components/mobile/HeatmapView.jsx` (current-month accent logic, remove or restructure WindowPicker usage)
- `frontend/src/components/mobile/HeatmapView.module.css` (accent style for current month header)
- `frontend/src/components/mobile/WindowPicker.jsx` (remove arrow nav, may be restructured or deleted -- depends on Change F)
- `frontend/src/components/mobile/WindowPicker.module.css` (remove arrow/strip styles)

**Dependencies:** Coupled with Change F. The arrow nav is removed here; the calendar picker (Change F) replaces it as the navigation mechanism. These two changes must ship together.

---

### Change D: Persistent Legend

**Current state:** No legend is rendered in the heatmap view.

**Proposed:** Add a persistent legend strip that is always visible below the column headers row and above the first group row, inside the heatmap grid card. The legend shows 4 states:

| State | Color Token | Label |
|-------|-------------|-------|
| Under 85% | `--color-positive` | "Under 85%" |
| 85-100% | `--color-warning` | "85 - 100%" |
| Over 100% | `--color-negative` | "Over 100%" |
| No budget | `--text-muted` | "No budget" |

Note: The design brief mockup includes a 5th state "No data" (`--text-faint`). See Open Questions.

**Acceptance criteria:**
- Legend renders between column headers and first group row
- Legend is always visible (not toggleable, not behind a disclosure)
- Each legend item shows a small dot (8px diameter) and a text label
- Legend items are horizontally centered with 16px gap between items
- Legend uses flex-wrap so it does not overflow on narrow viewports
- Legend dot colors match the zone color tokens exactly
- The legend is purely decorative / informational -- no interactive behavior

**Files affected:**
- `frontend/src/components/mobile/HeatmapView.jsx` (add legend markup)
- `frontend/src/components/mobile/HeatmapView.module.css` (legend styles)
- `frontend/src/components/mobile/HeatmapView.test.jsx` (verify legend renders)

**Dependencies:** None -- independent of other changes.

---

### Change E: Expanded Group Accent

**Current state:** When a group row is expanded, the child category rows appear below with the same card background. No visual indicator on the group card beyond the rotated chevron. Child rows have left padding for indentation but no distinct background.

**Proposed:** When a group is expanded:
1. The group card gets a `border-left` accent (e.g., 3px solid `var(--accent)`) to visually highlight the open group
2. Child category rows render with a slightly inset/darker background (`--bg-inset` or darker variant of `--bg-card`)

**Acceptance criteria:**
- When collapsed, no left border accent is visible
- When expanded, a left border accent appears (accent color, approximately 3px wide)
- Child rows within an expanded group have a visually distinct (darker) background
- The accent border and child background transition smoothly with expand/collapse animation
- No layout shift from the accent border (use always-present transparent border, or `box-shadow`/`outline`)
- `prefers-reduced-motion` is respected for all new transitions

**Files affected:**
- `frontend/src/components/mobile/HeatmapView.module.css` (border-left accent, child row background)
- Possibly `frontend/src/components/mobile/HeatmapView.jsx` (if conditional class needed on the group card)

**Dependencies:** None -- independent CSS/class change.

---

### Change F: Calendar Picker Replaces Arrow Nav

**Current state:** `WindowPicker.jsx` renders a bar with left/right arrow buttons and a month strip. Tapping arrows shifts the 6-month window by one month. The parent `HeatmapView` manages `windowStart` state and passes `canGoOlder`/`canGoNewer` + callbacks.

**Proposed:** Replace the arrow navigation with a calendar-style month picker:
- **Trigger element:** A tappable bar showing the current window range (e.g., "Sep 2025 -- Feb 2026") with a chevron indicator
- **On tap:** Opens a month grid overlay/dropdown showing months in a calendar grid layout (3 columns x 4 rows = 12 months per year, with year navigation)
- **Selecting a month:** Sets that month as the start of the 6-month window. The grid closes.
- **ARIA pattern:** Follows the same combobox/listbox pattern as `MonthDropdown`
- **Keyboard support:** Arrow keys to navigate months, Enter to select, Escape to close

**Acceptance criteria:**
- Trigger bar shows the date range of the current window (e.g., "Sep 2025 -- Feb 2026")
- Tapping the trigger opens a month-selection grid
- The month grid shows at least 12 months (current year), with the ability to navigate to other years
- Selecting a month sets `windowStart` so that month is the oldest in the 6-month window
- Selecting a month that would result in future months beyond available data is disabled or clamps
- The picker closes after selection
- Escape key closes the picker without changing selection
- Trigger uses `role="combobox"` with `aria-expanded`, `aria-haspopup`, `aria-controls`
- Month grid uses `role="listbox"` with `role="option"` for each month
- `prefers-reduced-motion` is respected

**Files affected:**
- `frontend/src/components/mobile/WindowPicker.jsx` (major rewrite)
- `frontend/src/components/mobile/WindowPicker.module.css` (new styles)
- `frontend/src/components/mobile/WindowPicker.test.jsx` (rewrite tests)
- `frontend/src/components/mobile/HeatmapView.jsx` (update props passed to WindowPicker)

**Dependencies:** Must ship with Change C. The `WindowPicker` prop interface will change from `canGoOlder`/`canGoNewer`/`onGoOlder`/`onGoNewer` to something like `months` (full list), `windowStart`, `onWindowStartChange`.

---

## 3. Success Criteria (Overall)

1. All 6 changes render correctly in the heatmap pane at 375px and 390px viewport widths
2. No horizontal overflow or layout shift from any change
3. All existing heatmap tests pass (updated where formats/structure changed)
4. New tests cover: `formatGroupLabel`, legend rendering, calendar picker open/close/select, current-month accent
5. `prefers-reduced-motion` is respected for all new transitions
6. No hardcoded hex values in CSS modules -- all colors use CSS custom properties
7. Playwright QA screenshot confirms visual correctness

---

## 4. Constraints and Anti-Goals

- **No backend changes.** All 6 changes are frontend-only.
- **No new data fetching.** The heatmap already receives all needed data as props.
- **No tooltip/popover on dots.** Dots remain read-only with aria-labels only.
- **No changes to the swipe container or pane navigation.** The heatmap remains pane 0 in the 3-pane `HorizontalSwipeContainer`.
- **No changes to zone logic.** `getBudgetZone()` thresholds and logic are unchanged.
- **Do not add a date range picker library.** The calendar month grid should be built with plain JSX/CSS, consistent with the existing `MonthDropdown` pattern.

---

## 5. Edge Cases and Error States

| Scenario | Expected Behavior |
|----------|-------------------|
| Group name is a single very long word (e.g., "Miscellaneous") | `formatGroupLabel` truncates at maxLen with "..." as last resort |
| Group name is empty string or null | `formatGroupLabel` returns a safe fallback (e.g., "Other") |
| Only 1-5 months of data available (fewer than 6) | Calendar picker only shows months with data; window is smaller than 6 |
| Current month is not in the visible window | No column header gets accent styling |
| User selects a month near the edge of available data | Window clamps so it does not extend beyond available months |
| All groups collapsed | Legend and column headers remain visible |
| `prefers-reduced-motion: reduce` is active | All transitions are instant |

---

## 6. Deferred Decisions

- **Hover states on calendar picker months:** Implement basic active/pressed state; hover refinement later.
- **Landscape orientation:** Not in scope for this pass.
- **Year navigation in calendar picker:** Implement minimal approach (year label with prev/next year arrows); refine later if needed.
- **Smart abbreviation algorithm details:** Engineer decides the exact strategy. Requirement is readable results within `maxLen`.

---

## 7. Open Questions

1. **Legend states: 4 or 5?** The change request says "4 states" but the design brief mockup shows 5 (including "No data" with `--text-faint`). Clarify whether "No data" should be included. **Recommendation:** Include all 5 for completeness since dots do render in the "no data" state.

2. **`formatMonthLabel` change scope:** Changing the format from "Jan 26" to "Sep '25" affects everywhere `formatMonthLabel` is called -- not just the heatmap. Verify that all callers (`MonthDropdown`, `MonthDetailView`, etc.) should also get the new format, or whether the heatmap should use a separate formatter. **Recommendation:** Check all call sites during research.

3. **Aggregate dot size:** The change request says "10px dots" but the design brief's layout spec table says "Aggregate dot: 12px diameter, Item dot: 10px diameter." Clarify whether aggregates stay at 12px or shrink to 10px. **Recommendation:** Follow the design brief spec (aggregates 12px, items 10px) since the brief is the authoritative design source.

---

## 8. Scope Summary

| # | Change | Type | Independent? |
|---|--------|------|-------------|
| A | Smart label abbreviation | New utility + call sites | Yes |
| B | Smaller dots + row padding | CSS-only | Yes |
| C | Single-line month headers, remove arrow nav | Format change + component restructure | No -- ships with F |
| D | Persistent legend | New markup + CSS | Yes |
| E | Expanded group accent | CSS + conditional class | Yes |
| F | Calendar picker replaces arrow nav | Component rewrite | No -- ships with C |

**Parallelism:** Changes A, B, D, and E are fully independent and can be implemented in parallel. Changes C and F are coupled and must be coordinated (same component boundaries, shared prop interface change).
