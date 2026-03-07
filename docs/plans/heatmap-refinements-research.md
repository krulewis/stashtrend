# Heatmap Refinements — Research Report

## Problem Summary

The design brief (`heatmap-design-brief.html`) specifies six UI refinements to the existing budget heatmap feature. This report surveys the complete current implementation and characterises exactly what each refinement would require to change.

The six refinements named in the brief are:

1. Smart label abbreviation — `formatGroupLabel()` utility
2. Smaller dots + row padding
3. Single-line month headers, remove arrow nav bar
4. Persistent legend
5. Expanded group accent (inset background / border-left)
6. Calendar picker replaces arrow nav

---

## Codebase Context

### Files and their roles

| File | Role |
|------|------|
| `frontend/src/components/mobile/HeatmapView.jsx` | Main grid, `HeatmapGroupRow` subcomponent, `WindowPicker` usage |
| `frontend/src/components/mobile/HeatmapView.module.css` | All layout, dot, and row CSS |
| `frontend/src/components/mobile/WindowPicker.jsx` | Left/right arrow strip for shifting the 6-month window |
| `frontend/src/components/mobile/WindowPicker.module.css` | Arrow and month-label styling |
| `frontend/src/components/mobile/WindowPicker.test.jsx` | 8 unit tests, all arrow-based |
| `frontend/src/components/mobile/HeatmapView.test.jsx` | 12 unit tests |
| `frontend/src/pages/MobileBudgetPage.jsx` | Owns `activeView` state, renders `HorizontalSwipeContainer` with heatmap as pane 0 |
| `frontend/src/components/mobile/HorizontalSwipeContainer.jsx` | Scroll-snap container, view-indicator dots |
| `frontend/src/components/mobile/MonthDropdown.jsx` | Existing combobox/listbox dropdown for single-month selection |
| `frontend/src/utils/budgetUtils.js` | `getBudgetZone()`, `formatMonthLabel()`, `groupExpenses()` |
| `frontend/src/components/chartUtils.jsx` | `fmtBudgetMonth()`, `formatDateLabel()` |
| `frontend/src/index.css` | All design tokens (`:root`) |

### Data flow

`BudgetPage` calls `fetchBudgetHistory(12)` and `fetchCustomGroups()` on mobile. Data flows as props to `MobileBudgetPage`, then as `categories`, `customGroups`, and `months` (sorted most-recent-first) to `HeatmapView`. `HeatmapView` owns `windowStart` state (`useState(0)`). `groupExpenses()` produces the group/category tree. `getBudgetZone()` classifies each dot.

---

## Finding 1: Label Column Width — 110px

All three row CSS classes use `110px` for the label column:

- `HeatmapView.module.css` line 10: `.columnHeaders { grid-template-columns: 110px repeat(6, 1fr); }`
- `HeatmapView.module.css` line 36: `.groupHeaderRow { grid-template-columns: 110px repeat(6, 1fr); }`
- `HeatmapView.module.css` line 92: `.categoryRow { grid-template-columns: 110px repeat(6, 1fr); }`

### Group name truncation (sub-finding)

Truncation is already implemented via CSS `text-overflow: ellipsis` on `.groupName` and `.categoryLabel`. The design brief proposes a JS-level smart abbreviation (`formatGroupLabel`) instead of pure CSS truncation.

---

## Finding 2: Dot Sizing — Already Matches Brief

Current:
- `.dot` (aggregate): `width: 12px; height: 12px` — matches brief
- `.dotItem` (category): `width: 10px; height: 10px` — matches brief

The design brief's Change 2 says "10px dots" which conflicts with the brief's own spec table showing 12px aggregate / 10px item. Needs clarification.

---

## Finding 3: Column Header Row

`.headerMonth` already uses `font-size: 11px; font-weight: 400; color: var(--text-muted); text-align: center`. Missing: explicit height and bottom border.

---

## Finding 4: Current WindowPicker — Arrow Nav Only

`WindowPicker.jsx` renders:
- Left arrow button (`‹`), disabled when `!canGoOlder`, `aria-label="Show older months"`
- Middle `.monthStrip` div showing all 6 months as read-only `<span>` elements via `formatMonthLabel()`
- Right arrow button (`›`), disabled when `!canGoNewer`, `aria-label="Show newer months"`

Current prop interface:
```jsx
<WindowPicker
  displayMonths={displayMonths}
  canGoOlder={canGoOlder}
  canGoNewer={canGoNewer}
  onGoOlder={() => setWindowStart(w => w + 1)}
  onGoNewer={() => setWindowStart(w => w - 1)}
  hidden={months.length <= WINDOW_SIZE}
/>
```

### MonthDropdown as combobox reference

`MonthDropdown.jsx` implements a combobox with `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls="month-listbox"`. Uses hardcoded `const LISTBOX_ID = 'month-listbox'`.

**Critical constraint:** Both `MonthDropdown` (pane 1) and a new picker (pane 0) are mounted simultaneously — the swipe container does not unmount panes. Two elements sharing the same DOM `id` would break ARIA. A replacement combobox WindowPicker must use a distinct listbox ID (e.g., `'heatmap-window-listbox'`).

---

## Finding 5: Expand/Collapse Visual Treatment

`HeatmapGroupRow` uses local `isExpanded` state. Content animates via CSS `grid-template-rows: 0fr → 1fr` with `var(--ease-smooth)`. No visual differentiation between collapsed/expanded card — same `background: var(--bg-card)` and `border: 1px solid var(--border)` regardless. Only the chevron rotates.

---

## Finding 6: Month Formatting Conventions

| Location | Function | Output | Example |
|----------|----------|--------|---------|
| `budgetUtils.js` line 74 | `formatMonthLabel(monthKey)` | `'short'` month + `'2-digit'` year | "Jan 26" |
| `chartUtils.jsx` line 37 | `fmtBudgetMonth(m)` | `'short'` month + apostrophe + `'2-digit'` year | "Jan '26" |
| `MonthDropdown.jsx` line 12 | Local `formatMonth(iso)` | `'long'` month + `'numeric'` year | "January 2025" |

The heatmap uses `formatMonthLabel` from `budgetUtils.js` in both `HeatmapView.jsx` (column headers) and `WindowPicker.jsx` (month strip).

The design brief column headers show "Sep '25" format — matching `fmtBudgetMonth` pattern but not current `formatMonthLabel` output.

---

## Design Token Availability

All tokens referenced in the design brief are present in `frontend/src/index.css`:

| Token | Present? | Value |
|-------|----------|-------|
| `--bg-inset` | Yes | `#0D1220` |
| `--border-focus` | Yes | `#4D9FFF` |
| `--accent-tint` | Yes | `rgba(77,159,255,0.12)` |
| `--sp-2` | Yes | `8px` |
| `--sp-3` | Yes | `12px` |
| `--sp-4` | Yes | `16px` |
| `--border-sub` | Yes | `#162035` |
| `--bg-card` | Yes | `#1C2333` |
| `--border` | Yes | `#1E2D4A` |
| `--radius-md` | Yes | `8px` |
| `--radius-lg` | Yes | `12px` |
| `--ease-smooth` | Yes | `300ms ease` |

No new tokens needed.

---

## Options Evaluated

### Option A: CSS-only refinements — no WindowPicker replacement

Apply layout and visual changes only. Keep arrow-nav WindowPicker as-is.

**Pros:** Lowest effort, zero risk to WindowPicker test suite.
**Cons:** Does not match design brief's combobox picker specification.

### Option B: Full implementation of all 6 refinements including calendar-picker

All CSS refinements plus replacing WindowPicker with a combobox (range-label trigger + month grid panel).

**Pros:** Fully matches design brief, jump-to-any-month is more usable.
**Cons:** All 8 WindowPicker tests become invalid, ~100 lines of new combobox logic, "calendar-style month grid" ambiguity.

### Option C: Hybrid — CSS refinements + improved trigger label only

CSS refinements plus changing WindowPicker display to range label, but keeping arrow navigation.

**Pros:** Range label matches mockup, most tests survive.
**Cons:** Does not implement the brief's tap-to-open calendar interaction.

**Recommendation:** Option B — the design brief explicitly specifies a combobox picker. CSS-only changes (Option A subset) are independent and can be committed separately.

---

## Open Questions

1. **Column header month labels: "Sep '25" (with year) or "Sep" (month-only)?** Brief mockup shows abbreviated with year. Omitting year risks confusion at year boundaries.

2. **"Calendar-style month grid" — flat list or 2D grid?** Annotation says "follows combobox/listbox pattern" (flat) but "calendar-style" implies 2D. Must be confirmed.

3. **Expanded group visual: inset background, accent border-left, or both?** Both tokens exist.

4. **Dot sizing: design brief says "10px dots" but spec table says 12px aggregate / 10px item.** Needs clarification.

5. **`formatMonthLabel` change scope:** Changing output format affects all callers (MonthDropdown, MonthDetailView, etc.). May need a separate formatter for heatmap.

---

## Key File Paths

- `frontend/src/components/mobile/HeatmapView.jsx`
- `frontend/src/components/mobile/HeatmapView.module.css`
- `frontend/src/components/mobile/WindowPicker.jsx`
- `frontend/src/components/mobile/WindowPicker.module.css`
- `frontend/src/components/mobile/WindowPicker.test.jsx`
- `frontend/src/components/mobile/HeatmapView.test.jsx`
- `frontend/src/components/mobile/MonthDropdown.jsx`
- `frontend/src/pages/MobileBudgetPage.jsx`
- `frontend/src/utils/budgetUtils.js`
- `frontend/src/components/chartUtils.jsx`
- `frontend/src/index.css`
- `docs/plans/heatmap-architecture.md`
