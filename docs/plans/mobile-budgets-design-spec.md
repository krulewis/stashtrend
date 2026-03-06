# Mobile Budgets vs. Actuals — Design Specification

**Date:** 2026-03-06
**Status:** Draft
**Scope:** Mobile-only redesign (viewport < 768px). Desktop BudgetPage unchanged.

---

## 1. Component Hierarchy

```
MobileBudgetPage
├── ViewIndicator                    # Dot indicators showing active view
├── HorizontalSwipeContainer         # Snap-scroll container for the two views
│   ├── MonthDetailView              # View 1 (default, left)
│   │   ├── MonthDropdown            # Scrollable month/year selector
│   │   ├── MonthSummaryHeader       # Aggregate totals + pill for selected month
│   │   └── GroupList                # Collapsible group list
│   │       └── BudgetGroup          # One per group (repeating)
│   │           ├── GroupHeader       # Group name + aggregate pill + chevron
│   │           └── BudgetLineItem   # One per category in group (repeating)
│   │               ├── BudgetPill   # Pill-shaped budget vs. actual indicator
│   │               └── DragHandle   # Touch drag affordance (reorder mode only)
│   └── MonthlySummaryView           # View 2 (scroll right)
│       ├── RangeDropdown            # 3/6/12 month selector
│       └── SummaryRow               # One per month (repeating)
│           └── BudgetPill           # Aggregate pill (shared component)
├── ReorderModeOverlay               # Overlay when drag-and-drop is active
└── GroupAssignmentSheet             # Bottom sheet for reassigning items to groups
```

**Routing:** `MobileBudgetPage` replaces `BudgetPage` when `useResponsive().isMobile` is true. The parent route in `App.jsx` conditionally renders one or the other. Both consume the same `fetchBudgetHistory` API.

**New files (all under `frontend/src/`):**

| File | Purpose |
|------|---------|
| `pages/MobileBudgetPage.jsx` | Top-level mobile page, owns fetch + view state |
| `pages/MobileBudgetPage.module.css` | Styles for the mobile page shell |
| `components/mobile/MonthDetailView.jsx` | View 1 container |
| `components/mobile/MonthlySummaryView.jsx` | View 2 container |
| `components/mobile/BudgetPill.jsx` | Shared pill indicator component |
| `components/mobile/BudgetPill.module.css` | Pill styles |
| `components/mobile/BudgetGroup.jsx` | Collapsible group with header + items |
| `components/mobile/BudgetGroup.module.css` | Group styles |
| `components/mobile/BudgetLineItem.jsx` | Single category row |
| `components/mobile/BudgetLineItem.module.css` | Line item styles |
| `components/mobile/MonthDropdown.jsx` | Scrollable month selector |
| `components/mobile/MonthDropdown.module.css` | Dropdown styles |
| `components/mobile/GroupAssignmentSheet.jsx` | Bottom sheet for group reassignment |
| `components/mobile/GroupAssignmentSheet.module.css` | Sheet styles |
| `components/mobile/HorizontalSwipeContainer.jsx` | Snap-scroll wrapper for views |
| `components/mobile/HorizontalSwipeContainer.module.css` | Swipe container styles |

---

## 2. Annotated Wireframe Descriptions

### View 1: Month Detail View

```
┌──────────────────────────────────────┐
│  [  December 2025      v ]           │  <- MonthDropdown, full width, 44px tall
│                                      │
│  Total Expenses   [$2,847 / $3,200]  │  <- MonthSummaryHeader, aggregate pill (green)
│  Total Income     [$4,100 / $4,000]  │
├──────────────────────────────────────┤
│                                      │
│  > Food & Drink    [$1,023 / $1,100] │  <- GroupHeader row, 52px min-height
│    Groceries       [$523 / $500    ] │  <- BudgetLineItem, 48px min-height, red pill
│    Restaurants     [$198 / $200    ] │  <- green pill
│    Coffee          [$67 / $80      ] │  <- green pill
│    Alcohol         [$235 / $320    ] │  <- green pill
│                                      │
│  > Housing         [$1,450 / $1,500] │  <- Collapsed group, green pill
│                                      │
│  > Entertainment   [$374 / $300    ] │  <- Collapsed group, red pill
│                                      │
│  [ Edit Groups ]                     │  <- Tertiary button, enters reorder mode
│                                      │
│                     .  o             │  <- ViewIndicator dots
└──────────────────────────────────────┘
```

**Layout details:**
- Full viewport width, vertical scroll within the view
- `MonthDropdown` is flush with the top, sticky within the view (not the page header)
- `MonthSummaryHeader` sits below the dropdown with `--sp-4` (16px) vertical padding
- Each `BudgetGroup` is a card-like section with `--bg-card` background, `1px solid var(--border)` border, `--radius-lg` (12px) border-radius, separated by `--sp-3` (12px) gap
- Line items within a group have no individual card -- they are rows within the group card, separated by `1px solid var(--border-sub)` dividers
- Bottom padding accounts for BottomTabBar: `calc(56px + env(safe-area-inset-bottom, 0) + var(--sp-6))`

### View 2: Monthly Summary View

```
┌──────────────────────────────────────┐
│  Show: [ 6 months   v ]             │  <- RangeDropdown
│                                      │
│  Dec 2025          [$2,847 / $3,200] │  <- SummaryRow, green pill
│  Nov 2025          [$3,412 / $3,200] │  <- red pill
│  Oct 2025          [$2,998 / $3,200] │  <- green pill
│  Sep 2025          [$3,180 / $3,200] │  <- yellow pill
│  Aug 2025          [$2,756 / $3,200] │  <- green pill
│  Jul 2025          [$3,050 / $3,200] │  <- green pill
│                                      │
│                     o  .             │  <- ViewIndicator dots
└──────────────────────────────────────┘
```

**Layout details:**
- Each `SummaryRow` is a full-width row, 56px min-height
- Rows have `--bg-card` background, `1px solid var(--border)` border, `--radius-md` (8px) border-radius
- Rows separated by `--sp-2` (8px) gap
- Month label left-aligned, pill right-aligned within each row
- No tap/click handlers on rows -- read-only view
- RangeDropdown offers 3, 6, 12 as options (default: 6)

---

## 3. Pill Component Spec -- `BudgetPill`

### Dimensions

| Variant | Height | Min-width | Padding (horizontal) | Border-radius |
|---------|--------|-----------|----------------------|---------------|
| Standard (line items) | 28px | 100px | `--sp-3` (12px) | `--radius-pill` (9999px) |
| Group aggregate | 28px | 100px | `--sp-3` (12px) | `--radius-pill` (9999px) |
| Summary row aggregate | 32px | 120px | `--sp-4` (16px) | `--radius-pill` (9999px) |

### Typography

- Font size: 13px (standard), 14px (summary row)
- Font weight: 500
- Format: `$actual / $budget` using `fmtDollar()` from `chartUtils.jsx`
- Font family: inherits Helvetica Neue stack

### Color Zones

The pill background and text color are determined by the ratio `actual / budgeted`:

| Zone | Ratio | Background | Text color | CSS token mapping |
|------|-------|------------|------------|-------------------|
| **Safe (green)** | ratio < 0.85 | `color-mix(in srgb, var(--green) 18%, transparent)` | `var(--green)` | Matches existing `.barSafe` pattern |
| **Warning (yellow)** | 0.85 <= ratio <= 1.00 | `color-mix(in srgb, var(--amber) 18%, transparent)` | `var(--amber)` | Matches existing `.barWarn` pattern |
| **Over (red)** | ratio > 1.00 | `color-mix(in srgb, var(--red) 18%, transparent)` | `var(--red)` | Matches existing `.barOver` pattern |
| **No budget** | budgeted === 0 or null | `var(--bg-raised)` | `var(--text-muted)` | Neutral fallback |
| **No data** | actual === null && budgeted === null | `var(--bg-raised)` | `var(--text-faint)` | Displays "---" |

**Threshold constant:** `WARNING_THRESHOLD = 0.85` -- reuse the existing constant from `BudgetTable.jsx`. Extract to a shared location (`chartUtils.jsx` or a new `budgetUtils.js`).

### Group Aggregate Calculation

Group pills compute their own ratio independently from child items:

```
groupActual   = sum of all child category actuals for the selected month
groupBudgeted = sum of all child category budgeted amounts for the selected month
groupRatio    = groupActual / groupBudgeted
```

The group pill's color zone is determined by `groupRatio`, not by the worst-case child. A group can be green even if an individual child is red, as long as the aggregate ratio is < 0.85.

### ARIA

- `role="status"` on the pill element
- `aria-label` format: `"$523 of $500 budget, 105%, over budget"` (or "within budget" / "approaching limit")

---

## 4. Collapsible Group Behavior

### State Management

- Each `BudgetGroup` manages its own `isExpanded` boolean via `useState(false)` (collapsed by default)
- No global expand/collapse-all control in this design
- Expand state resets when switching months (intentional -- user is viewing a new context)

### Animation

```css
.groupContent {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--ease-smooth);  /* 300ms ease */
  overflow: hidden;
}

.groupContentExpanded {
  grid-template-rows: 1fr;
}

.groupContentInner {
  min-height: 0;
}
```

This uses the CSS `grid-template-rows: 0fr -> 1fr` technique for smooth height animation without JavaScript measurement. The inner wrapper has `min-height: 0` to allow collapsing to zero.

### Chevron Rotation

```css
.chevron {
  transition: transform var(--ease-default);  /* 200ms ease */
  font-size: 12px;
  color: var(--text-muted);
}

.chevronExpanded {
  transform: rotate(90deg);
}
```

Use a right-pointing chevron character (or small inline SVG) that rotates 90 degrees clockwise on expand. This matches the `groupToggle` pattern in the existing `BudgetTable`.

### Touch Target

- Entire `GroupHeader` row is tappable, minimum 52px height
- `cursor: pointer` (no hover styles on mobile, but included for tablet compatibility)
- Active state: `background: var(--bg-hover)` on press, using `:active` pseudo-class

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .groupContent { transition: none; }
  .chevron { transition: none; }
}
```

---

## 5. Month Dropdown Spec -- `MonthDropdown`

### Trigger Button

- Full width of the content area
- Height: 44px
- Background: `var(--bg-card)`
- Border: `1px solid var(--border)`
- Border-radius: `var(--radius-md)` (8px)
- Padding: `0 var(--sp-4)` (16px horizontal)
- Display: flex, `justify-content: space-between`, `align-items: center`
- Left side: month/year label (e.g., "December 2025"), 15px, weight 400, `var(--text-primary)`
- Right side: down-chevron icon, 12px, `var(--text-muted)`
- Active state: `border-color: var(--accent)` + `box-shadow: 0 0 0 1px var(--accent)`

### Dropdown Panel

- Position: absolute, anchored below the trigger button
- Full width of the trigger button (100%)
- Max-height: 280px (fits ~6.5 rows, signals scrollability)
- `overflow-y: auto` with `-webkit-overflow-scrolling: touch`
- Background: `var(--bg-card)`
- Border: `1px solid var(--border)`
- Border-radius: `0 0 var(--radius-md) var(--radius-md)` (rounded bottom only)
- Box-shadow: `var(--shadow-lg)` for elevation
- z-index: 25 (above content and above page header at z-index 10)

### Dropdown Items

- Each row: 44px height, padding `0 var(--sp-4)`
- Text: "December 2025" format -- `toLocaleDateString('en-US', { month: 'long', year: 'numeric' })`
- Font size: 14px, weight 400, color `var(--text-primary)`
- Selected item: `background: var(--accent-tint)`, `color: var(--accent)`, weight 500
- Hover/active: `background: var(--bg-hover)`
- Divider: `1px solid var(--border-sub)` between items

### Behavior

- Opens on tap of trigger button
- Closes on: selecting a month, tapping outside (use click-outside listener), pressing Escape
- Scrolled to show the currently-selected month near the top (use `scrollIntoView` with `block: 'nearest'`)
- Most recent month is at the top of the list
- Months with no budget data are skipped entirely (not shown disabled)
- Close animation: `opacity 0 + scale(0.98)` over `var(--ease-quick)` (150ms)

### Data Source

Derive the available months list from the `months` array returned by `fetchBudgetHistory`. Request a large range (e.g., `months=120`) on mount to get the full history, then filter client-side. Or add a new lightweight `/api/budgets/months` endpoint that returns only the month strings.

### ARIA

- Trigger button: `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-controls="month-listbox"`
- Dropdown panel: `role="listbox"`, `id="month-listbox"`
- Each item: `role="option"`, `aria-selected` on the current month
- Arrow key navigation within the open listbox

---

## 6. Horizontal Swipe Container

### Implementation

Uses native CSS scroll-snap, no JavaScript swipe library.

```css
.swipeContainer {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;          /* Firefox */
}

.swipeContainer::-webkit-scrollbar {
  display: none;                  /* Chrome/Safari */
}

.swipePane {
  flex: 0 0 100%;
  width: 100%;
  min-width: 0;
  scroll-snap-align: start;
  overflow-y: auto;
}
```

### Height

Each pane fills the available vertical space below the page header. Use `flex: 1` within a flex column parent and `min-height: 0`.

Alternatively, use `height: calc(100dvh - 60px - 56px - env(safe-area-inset-bottom, 0))` where 60px is the app header and 56px is the BottomTabBar.

### View Indicator Dots

Two dots, positioned at the bottom of the viewport area, centered horizontally.

```
Position: fixed, bottom: calc(56px + env(safe-area-inset-bottom, 0) + var(--sp-3))
```

| State | Style |
|-------|-------|
| Active dot | 8px diameter circle, `background: var(--accent)` |
| Inactive dot | 8px diameter circle, `background: var(--text-faint)` |
| Gap between dots | `--sp-2` (8px) |

### Detecting Active View

Use the `scroll` event on the container and calculate which pane is more than 50% visible:

```js
const handleScroll = (e) => {
  const index = Math.round(e.target.scrollLeft / e.target.clientWidth)
  setActiveView(index)
}
```

### Programmatic Scrolling

If tapping the dots should navigate between views, use:

```js
containerRef.current.scrollTo({
  left: index * containerRef.current.clientWidth,
  behavior: 'smooth'
})
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .swipeContainer { scroll-behavior: auto; }
}
```

---

## 7. Drag-and-Drop Reordering Spec

### Entering Reorder Mode

- Tap "Edit Groups" button at the bottom of the Month Detail View
- Button style: ghost/tertiary -- `background: transparent`, `border: 1px solid var(--border)`, `color: var(--text-secondary)`, `border-radius: var(--radius-md)`, `padding: 8px 16px`, `font-size: 13px`
- On tap, the view enters reorder mode:
  - All groups expand
  - Drag handles appear on each line item (left side, 24px wide)
  - "Edit Groups" button changes to "Done" with `background: var(--accent)`, `color: var(--bg-root)` (primary button style)
  - Horizontal swipe is disabled (prevent accidental view changes during drag)

### Drag Handle

- Visual: three horizontal lines icon (hamburger), 20px, `color: var(--text-muted)`
- Position: left edge of the line item row, vertically centered
- Touch target: 44px x 48px minimum (the full row height acts as the handle area)

### Touch Interaction

Use a lightweight drag library (`@dnd-kit/core` + `@dnd-kit/sortable`) or implement with native touch events:

1. **Touch start** on drag handle: record the item being dragged
2. **Touch move**: translate the dragged item's Y position to follow the finger
   - Apply `transform: translateY(${delta}px)` on the dragged element
   - Dragged item gets: `background: var(--bg-hover)`, `box-shadow: var(--shadow-md)`, `opacity: 0.9`, `z-index: 10`
3. **Gap indicator**: as the item moves over other items, show a 2px `var(--accent)` horizontal line at the insertion point
4. **Touch end**: animate the item into its new position over `var(--ease-default)` (200ms), commit the reorder

### Constraints

- Items can only be reordered **within their current group** during standard drag
- To move an item to a different group, use the Group Assignment Sheet (see section 8)
- Groups themselves cannot be reordered in this version (future enhancement)

### Visual Feedback During Drag

| Element | Style during drag |
|---------|-------------------|
| Dragged item | `background: var(--bg-hover)`, `box-shadow: var(--shadow-md)`, `opacity: 0.9`, slight scale `transform: scale(1.02)` |
| Insertion gap | 2px solid `var(--accent)` horizontal line between items |
| Other items | shift up/down smoothly via `transform: translateY()` with `transition: transform var(--ease-default)` |
| Items in other groups | dimmed -- `opacity: 0.5` |

### Persistence

- On "Done" tap, POST the new ordering to the backend
- New API endpoint: `POST /api/budgets/custom-groups` with payload:
  ```json
  {
    "groups": {
      "Food & Drink": ["cat_123", "cat_456", "cat_789"],
      "Housing": ["cat_101", "cat_102"]
    }
  }
  ```
- New backend table: `budget_custom_groups` with columns `(category_id TEXT PRIMARY KEY, custom_group TEXT, sort_order INTEGER)`
- Custom ordering persists across sessions and applies to all months
- If a new category appears (from Monarch sync) that has no custom order, append it to the bottom of its Monarch-inherited group

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable drag animation, item snaps instantly */
  .dragging { transition: none; }
  .shifting { transition: none; }
}
```

---

## 8. Custom Group Assignment

### Triggering

In reorder mode, long-press (500ms) on a line item to open the Group Assignment Sheet. Visual cue: the item briefly pulses with `background: var(--accent-tint)` before the sheet opens.

Alternatively, each line item in reorder mode shows a small "move" icon (arrow pointing right) on the right edge. Tapping it opens the sheet.

### GroupAssignmentSheet (Bottom Sheet)

**Appearance:**
- Slides up from the bottom of the screen
- Background: `var(--bg-card)`
- Border-radius: `var(--radius-xl) var(--radius-xl) 0 0` (16px top corners)
- Max-height: 60vh
- Scrim/backdrop: `rgba(0, 0, 0, 0.5)` behind the sheet
- Box-shadow: `var(--shadow-lg)` on the sheet

**Layout:**
```
┌──────────────────────────────────────┐
│  ------  (drag indicator, centered)  │  <- 4px tall, 40px wide, var(--text-faint), radius-pill
│                                      │
│  Move "Groceries" to:                │  <- 15px, weight 500, var(--text-primary)
│                                      │
│  ( ) Food & Drink  (current)         │  <- Radio-style list of groups
│  ( ) Housing                         │
│  ( ) Entertainment                   │
│  ( ) Transportation                  │
│  ─────────────────────────           │
│  + Create new group...               │  <- Tappable row to create a custom group
│                                      │
│  [ Cancel ]          [ Move ]        │  <- Ghost + Primary buttons
└──────────────────────────────────────┘
```

**Group list items:**
- Height: 48px each, full width
- Left side: radio circle (16px diameter)
  - Unselected: `border: 2px solid var(--text-muted)`, transparent fill
  - Selected: `border: 2px solid var(--accent)`, `background: var(--accent)` fill
- Right side: group name, 14px, weight 400, `var(--text-primary)`
- Current group gets "(current)" suffix in `var(--text-muted)`, weight 400
- Tap selects the radio

**"Create new group" row:**
- `+` icon in `var(--accent)`, 14px
- Text: "Create new group...", 14px, `var(--accent)`
- On tap: inline text input appears replacing this row
  - Input: `background: var(--bg-inset)`, `border: 1px solid var(--border-focus)`, `border-radius: var(--radius-md)`, `padding: 11px 14px`, `font-size: 14px`
  - Auto-focused, placeholder "Group name"
  - Submit on Enter or tap "Move" button

**Buttons:**
- Cancel: ghost style -- `background: transparent`, `border: 1px solid var(--border)`, `color: var(--text-secondary)`, `border-radius: var(--radius-md)`, `padding: 10px 20px`
- Move: primary style -- `background: var(--accent)`, `color: var(--bg-root)`, `border-radius: var(--radius-md)`, `text-transform: uppercase`, `letter-spacing: 1.5px`, `font-weight: 600`, `padding: 10px 20px`
- Move is disabled (opacity 0.5) until a different group is selected

**Closing:**
- Tap "Cancel" or "Move"
- Swipe down on the sheet (drag the indicator bar)
- Tap the scrim/backdrop
- Animation: slide down + fade scrim over `var(--ease-smooth)` (300ms)

### Persistence

Uses the same `budget_custom_groups` table as reordering. Moving an item to a group updates its `custom_group` value. The sort order within the new group defaults to last position.

### Fallback Behavior

- Items with no custom group assignment use their Monarch-inherited `group_name` from the API
- If all custom items are removed from a custom group, the group ceases to exist (no empty groups shown)
- Monarch groups are always available as targets in the assignment sheet, even if the user has no custom groups

---

## 9. Design Token Mappings

### Colors

| Usage | Token | Value |
|-------|-------|-------|
| Page background | `--bg-root` | #0A0F1E |
| Card/group background | `--bg-card` | #1C2333 |
| Dropdown panel background | `--bg-card` | #1C2333 |
| Sunken/inset inputs | `--bg-inset` | #0D1220 |
| Hover/active press | `--bg-hover` | #243044 |
| Elevated drag item | `--bg-raised` | #1E2D4A |
| Surface for summary header | `--bg-surface` | #111827 |
| Bottom sheet scrim | N/A (raw) | rgba(0,0,0,0.5) |
| Pill safe background | `color-mix(in srgb, var(--green) 18%, transparent)` | Translucent green |
| Pill safe text | `--green` / `--color-positive` | #2ECC8A |
| Pill warning background | `color-mix(in srgb, var(--amber) 18%, transparent)` | Translucent amber |
| Pill warning text | `--amber` / `--color-warning` | #F5A623 |
| Pill over background | `color-mix(in srgb, var(--red) 18%, transparent)` | Translucent red |
| Pill over text | `--red` / `--color-negative` | #FF5A7A |
| Primary text | `--text-primary` | #F0F6FF |
| Secondary text (labels) | `--text-secondary` | #8BA8CC |
| Muted text (disabled, hints) | `--text-muted` | #4A6080 |
| Faint text (inactive dots) | `--text-faint` | #2B4060 |
| Accent (active dot, focus) | `--accent` | #4D9FFF |
| Accent tint (selection highlight) | `--accent-tint` | rgba(77,159,255,0.12) |
| Border (cards, dividers) | `--border` | #1E2D4A |
| Subtle dividers within groups | `--border-sub` | #162035 |
| Focus ring | `--border-focus` | #4D9FFF |

### Spacing

| Usage | Token | Value |
|-------|-------|-------|
| Inline padding (pill horizontal) | `--sp-3` | 12px |
| Standard content padding | `--sp-4` | 16px |
| Page-level horizontal padding | `--sp-4` | 16px |
| Section gap (between groups) | `--sp-3` | 12px |
| Item-to-item vertical padding | `--sp-2` | 8px |
| Large vertical gap (summary header to groups) | `--sp-5` | 20px |
| Bottom safe area clearance | `--sp-6` | 24px |
| View indicator bottom offset | `--sp-3` | 12px |

### Border Radius

| Usage | Token | Value |
|-------|-------|-------|
| Pill shape | `--radius-pill` | 9999px |
| Group cards | `--radius-lg` | 12px |
| Dropdown trigger and items | `--radius-md` | 8px |
| Bottom sheet top corners | `--radius-xl` | 16px |
| Buttons | `--radius-md` | 8px |
| Summary rows | `--radius-md` | 8px |
| View indicator dots | 50% (circle) | 4px radius on 8px element |

### Shadows

| Usage | Token | Value |
|-------|-------|-------|
| Dropdown panel | `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.5) |
| Dragged item | `--shadow-md` | 0 4px 12px rgba(0,0,0,0.4) |
| Bottom sheet | `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.5) |

### Transitions

| Usage | Token | Value |
|-------|-------|-------|
| Quick interactions (dot tap, hover) | `--ease-quick` | 150ms ease |
| Standard transitions (chevron, drag settle) | `--ease-default` | 200ms ease |
| Expand/collapse, sheet slide | `--ease-smooth` | 300ms ease |

### New Tokens Required

None. The existing Dark Cobalt token system covers all needs. The `color-mix()` pattern for translucent pill backgrounds reuses the same approach as the existing `.barSafe`/`.barWarn`/`.barOver` classes in `BudgetTable.module.css`.

---

## 10. Interaction States

### BudgetPill

| State | Appearance |
|-------|------------|
| Default | Pill with zone-colored background and text (see section 3) |
| No budget set | `var(--bg-raised)` background, `var(--text-muted)` text, displays "$X / ---" |
| No data | `var(--bg-raised)` background, `var(--text-faint)` text, displays "---" |
| Loading | Shimmer animation placeholder, 100px x 28px, `--radius-pill` |

### GroupHeader

| State | Appearance |
|-------|------------|
| Default (collapsed) | Right-chevron, group name, aggregate pill |
| Expanded | Down-chevron (rotated 90deg), child items visible |
| Active/pressed | `background: var(--bg-hover)` |
| Reorder mode | All groups forced expanded, no collapse interaction |

### BudgetLineItem

| State | Appearance |
|-------|------------|
| Default | Category name left, pill right, full-width row |
| Active/pressed | `background: var(--bg-hover)` (only in reorder mode for long-press) |
| Dragging | Elevated: `background: var(--bg-hover)`, `box-shadow: var(--shadow-md)`, `opacity: 0.9`, `scale(1.02)` |
| Drag target (insertion point) | 2px `var(--accent)` line above/below |
| Dimmed (other groups during drag) | `opacity: 0.5` |
| Reorder mode (idle) | Drag handle visible on left, category name shifts right by 36px |

### MonthDropdown

| State | Appearance |
|-------|------------|
| Default (closed) | Trigger button with month label + chevron |
| Open | Trigger border becomes `var(--accent)`, dropdown panel visible below |
| Loading months | Trigger shows "Loading..." in `var(--text-muted)`, disabled |
| Error | Trigger border `var(--border-error)`, text "Failed to load months" in `var(--red)` |

### MonthDropdown Item

| State | Appearance |
|-------|------------|
| Default | Text in `var(--text-primary)`, transparent background |
| Selected | `background: var(--accent-tint)`, text in `var(--accent)`, weight 500 |
| Active/pressed | `background: var(--bg-hover)` |

### "Edit Groups" / "Done" Button

| State | Appearance |
|-------|------------|
| Default ("Edit Groups") | Ghost style: transparent bg, `var(--border)` border, `var(--text-secondary)` text |
| Active mode ("Done") | Primary style: `var(--accent)` bg, `var(--bg-root)` text, uppercase, letter-spacing 1.5px |
| Saving | "Done" button shows inline spinner, disabled |

### GroupAssignmentSheet

| State | Appearance |
|-------|------------|
| Opening | Slide up from bottom over `var(--ease-smooth)`, scrim fades in |
| Idle | Sheet visible, radio list scrollable |
| Creating new group | Text input replaces "+ Create new group" row, auto-focused |
| Move button disabled | `opacity: 0.5` when no change selected |
| Move button active | Full opacity, tappable |
| Closing | Slide down + scrim fade out over `var(--ease-smooth)` |

### HorizontalSwipeContainer

| State | Appearance |
|-------|------------|
| View 1 active | Left dot filled (`var(--accent)`), right dot hollow (`var(--text-faint)`) |
| View 2 active | Right dot filled, left dot hollow |
| Mid-swipe | Binary snap -- dot switches at 50% scroll threshold |
| Reorder mode | Swipe disabled, `overflow-x: hidden` on container |

### Page-Level States

| State | Appearance |
|-------|------------|
| Loading (initial fetch) | Full-page centered spinner + "Loading budget data..." |
| Error | Error card: `background: var(--bg-card)`, `border: 1px solid var(--red)`, title "Error loading budget data" in `var(--red)`, detail text in `var(--text-secondary)`. Matches existing `BudgetPage` error pattern. |
| Empty (no budget data at all) | Centered: "No budget data found" in `var(--text-secondary)`, 14px. "Sync your Monarch data to see budgets here." in `var(--text-muted)`, 13px. |

---

## 11. Edge Cases

### Empty Months
- Months with zero budget data are excluded from the MonthDropdown list entirely
- If the currently selected month has no data (e.g., data was deleted during sync), auto-select the most recent month with data
- Monthly Summary View skips empty months; the list may have non-consecutive months

### Single-Item Groups
- A group with only one category still renders as a collapsible group with a header
- The group aggregate pill will show identical values to the single child item
- In reorder mode, the single item can still be moved to another group (leaving the group empty and auto-removed)

### All Zeros
- If both `actual` and `budgeted` are 0 for a line item, the pill displays "$0 / $0" with the "no data" style (`var(--bg-raised)`, `var(--text-faint)`)
- Groups where all children are zero still appear (they have budget allocation)

### All Over-Budget
- Every pill is red; no special aggregate styling
- Group aggregate pills are independently calculated and will also be red
- Monthly Summary View rows are all red; no additional warning banner

### No Custom Groups Yet
- All items grouped by their Monarch-inherited `group_name`
- "Edit Groups" button is still visible and functional
- Group Assignment Sheet shows only Monarch-inherited groups plus the "+ Create new group" option

### New Categories After Customization
- When a Monarch sync introduces a new category not in `budget_custom_groups`, it appears at the bottom of its Monarch-inherited group
- If the user has moved all other items out of that Monarch group, the new category creates a new group section with just itself

### Very Long Category/Group Names
- Category names: truncate with ellipsis after one line (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`)
- Maximum width for category name: `calc(100% - 140px)` to always leave room for the pill
- Group names: same truncation behavior

### Many Groups (> 10)
- The view scrolls vertically; no limit on group count
- Group Assignment Sheet scrolls its list; max-height 60vh prevents full-screen takeover

### Extremely Large Dollar Amounts
- `fmtDollar()` already handles formatting with commas
- If the pill text exceeds min-width, the pill grows horizontally to fit (no truncation of dollar amounts)
- Prevent line wrapping within pills with `white-space: nowrap`

### Rapid Month Switching
- Debounce is not needed since it is a dropdown selection (not continuous input)
- Show loading state (shimmer pills) while fetching new month data
- Cancel any in-flight fetch when a new month is selected (abort controller pattern)

---

## 12. Accessibility

### Touch Targets
- All tappable elements: minimum 44px x 44px touch target (WCAG 2.5.5 AAA)
- GroupHeader: 52px height, full width
- BudgetLineItem: 48px height, full width
- MonthDropdown trigger: 44px height, full width
- MonthDropdown items: 44px height, full width
- SummaryRow: 56px height, full width
- View indicator dots: 44px x 44px touch target (visual dot is 8px, but tappable area is padded)
- Bottom sheet group items: 48px height

### Color Contrast
All text-on-background combinations meet WCAG AA (4.5:1 for normal text):

| Combination | Ratio | Pass |
|-------------|-------|------|
| `--text-primary` (#F0F6FF) on `--bg-card` (#1C2333) | 11.3:1 | AAA |
| `--text-secondary` (#8BA8CC) on `--bg-card` (#1C2333) | 5.2:1 | AA |
| `--green` (#2ECC8A) on green pill bg | 5.8:1 | AA |
| `--amber` (#F5A623) on amber pill bg | 6.4:1 | AA |
| `--red` (#FF5A7A) on red pill bg | 5.1:1 | AA |
| `--text-muted` (#4A6080) on `--bg-card` (#1C2333) | 3.1:1 | Decorative only |

Note: `--text-muted` is used only for decorative/supplementary labels, never for essential information. Essential data always uses `--text-primary` or semantic colors.

### Screen Reader Labels

| Component | ARIA pattern |
|-----------|-------------|
| BudgetPill | `role="status"`, `aria-label="$523 of $500 budget, 105%, over budget"` |
| GroupHeader | `role="button"`, `aria-expanded="true/false"`, `aria-controls="group-{id}-content"` |
| Group content | `id="group-{id}-content"`, `role="region"`, `aria-labelledby="group-{id}-header"` |
| MonthDropdown trigger | `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"` |
| MonthDropdown list | `role="listbox"`, each item `role="option"` with `aria-selected` |
| HorizontalSwipeContainer | `role="tablist"` on the indicator dots |
| View indicator dots | `role="tab"`, `aria-selected`, `aria-label="Month detail view"` / `"Monthly summary view"` |
| Each view pane | `role="tabpanel"`, `aria-labelledby` pointing to the dot |
| ReorderModeOverlay | `aria-live="assertive"` to announce "Reorder mode active" |
| Draggable items | `aria-roledescription="sortable item"`, `aria-describedby` pointing to instructions text |
| GroupAssignmentSheet | `role="dialog"`, `aria-modal="true"`, `aria-label="Move category to group"` |

### Keyboard Support (for screen reader users using Bluetooth keyboard)

| Context | Key | Action |
|---------|-----|--------|
| MonthDropdown (open) | ArrowUp/ArrowDown | Navigate months |
| MonthDropdown (open) | Enter | Select month, close |
| MonthDropdown (open) | Escape | Close without selecting |
| GroupHeader | Enter/Space | Toggle expand/collapse |
| View indicator dots | ArrowLeft/ArrowRight | Switch views |
| GroupAssignmentSheet | Tab | Cycle through radio items and buttons |
| GroupAssignmentSheet | Escape | Close sheet |
| Reorder mode | Not supported | Drag-and-drop requires touch; keyboard users use the Group Assignment Sheet for moving items |

### Reduced Motion

All animations (group expand/collapse, sheet slide, drag, chevron rotation, swipe) respect `@media (prefers-reduced-motion: reduce)` by setting `transition: none` and `animation: none`. Functional behavior is unchanged; only visual motion is removed.

### Focus Management

- When MonthDropdown opens, focus moves to the selected month item
- When MonthDropdown closes, focus returns to the trigger button
- When GroupAssignmentSheet opens, focus moves to the sheet heading
- When GroupAssignmentSheet closes, focus returns to the item that triggered it
- On view change (swipe or dot tap), focus moves to the first focusable element in the new view

---

## Appendix A: API Changes Required

| Method | Path | Purpose | New? |
|--------|------|---------|------|
| `GET` | `/api/budgets/history?months=N` | Existing. No changes needed. | No |
| `GET` | `/api/budgets/months` | Returns array of month strings with budget data, sorted most-recent-first. Lightweight -- no category data. | Yes |
| `GET` | `/api/budgets/custom-groups` | Returns the user's custom group assignments + sort orders. | Yes |
| `POST` | `/api/budgets/custom-groups` | Saves/updates custom group assignments and sort orders. | Yes |

## Appendix B: New Backend Table

```sql
CREATE TABLE IF NOT EXISTS budget_custom_groups (
  category_id TEXT PRIMARY KEY,
  custom_group TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

No singleton pattern -- one row per customized category. Categories not in this table use their Monarch-inherited `group_name`.
