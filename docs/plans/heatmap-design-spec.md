# Budget Heatmap View — Mobile UI Specification

## Overview

A compact 6-month budget health grid for mobile. Each budget category group appears as a row; each month as a column. Colored dots encode spending status at a glance. Groups collapse to show an aggregate dot, or expand to reveal individual line-item dots.

This view will become a third pane in the existing `HorizontalSwipeContainer` (alongside Month Detail and Monthly Summary).

---

## 1. Component Hierarchy

```
BudgetHeatmapPane
├── HeatmapWindowPicker          (six-month range selector)
│   └── HeatmapMonthGrid         (calendar-style month picker overlay)
├── HeatmapGrid                  (the main grid)
│   ├── HeatmapColumnHeaders     (6 month labels across top)
│   └── HeatmapGroupRow[]        (one per custom group)
│       ├── HeatmapGroupHeader   (chevron + group name + 6 aggregate dots)
│       └── HeatmapItemRow[]     (expanded: one per category line item)
│           └── (item name + 6 dots)
└── HeatmapLegend                (color key at bottom)
```

### 1.1 Props

#### `BudgetHeatmapPane`
```ts
{
  groups: Array<{
    groupName: string
    categories: Array<{
      category_id: string
      category_name: string
      months: Record<string, { actual: number | null, budgeted: number | null }>
    }>
  }>
  availableMonths: string[]       // all ISO date strings from API
  loading: boolean
}
```

Data is lifted to the parent `BudgetPage` (per the mobile data lift convention). The pane receives pre-fetched multi-month data and does not call APIs directly.

#### `HeatmapWindowPicker`
```ts
{
  startMonth: string              // ISO date, e.g. "2025-09-01"
  endMonth: string                // ISO date, e.g. "2026-02-01"
  availableMonths: string[]
  onWindowChange: (startMonth: string) => void
}
```

#### `HeatmapGrid`
```ts
{
  groups: Array<HeatmapGroupData>
  months: string[]                // exactly 6 ISO strings, oldest-first
}
```

#### `HeatmapGroupRow`
```ts
{
  groupName: string
  categories: Array<HeatmapCategoryData>
  months: string[]
  defaultExpanded?: boolean       // default: false
}
```

#### `HeatmapItemRow`
```ts
{
  categoryName: string
  months: string[]
  monthData: Record<string, { actual: number | null, budgeted: number | null }>
}
```

#### `HeatmapLegend`
No props. Renders a static color key.

---

## 2. Layout Measurements (375px target)

### 2.1 Overall Grid

| Element | Width | Notes |
|---------|-------|-------|
| Page horizontal padding | 16px each side | `var(--sp-4)` |
| Available content width | 343px | 375 - 32 |
| Row label column | 127px | Truncated with ellipsis |
| Gap between label and dots | 8px | `var(--sp-2)` |
| Dot zone | 208px | 343 - 127 - 8 |
| Per-column width | ~34.6px | 208 / 6 — dots centered in each column |

### 2.2 Row Heights

| Row type | Height | Notes |
|----------|--------|-------|
| Column header row | 28px | Month abbreviations |
| Group header row | 44px | Matches existing `BudgetGroup` feel |
| Item row (expanded) | 36px | Compact; read-only dots only |

### 2.3 Dot Sizes

| Dot type | Diameter | Notes |
|----------|----------|-------|
| Aggregate dot (group) | 12px | Prominent |
| Item dot (line item) | 10px | Slightly smaller for hierarchy |
| Dot border-radius | 50% | Perfect circle |

### 2.4 Column Headers

Month labels use 3-letter abbreviation + 2-digit year: "Sep 25", "Oct 25", etc.
- Font: 11px, weight 400, `var(--text-muted)`
- Centered over each dot column

### 2.5 Window Picker

- Full width (343px content area)
- Height: 44px (matches `MonthDropdown` trigger)
- Displays range: "Sep 2025 -- Feb 2026"
- Margin bottom: `var(--sp-3)` (12px) before grid

---

## 3. Dot Color Mapping

Reuses `getBudgetZone()` from `utils/budgetUtils.js`:

| Zone | Color Token | Hex | Dot Meaning |
|------|-------------|-----|-------------|
| `safe` | `--color-positive` | `#2ECC8A` | < 85% of budget spent |
| `warning` | `--color-warning` | `#F5A623` | 85-100% of budget spent |
| `over` | `--color-negative` | `#FF5A7A` | > 100% of budget spent |
| `no-budget` | `--text-muted` | `#4A6080` | Spending exists but no budget set |
| `no-data` | `--text-faint` | `#2B4060` | No data for this month |

### 3.1 Aggregate Dot Logic (Collapsed Groups)

When a group is collapsed, each month column shows a single aggregate dot. The aggregate zone is computed from group-level totals:

```js
const groupActual   = categories.reduce((s, c) => s + (c.months[month]?.actual ?? 0), 0)
const groupBudgeted = categories.reduce((s, c) => s + (c.months[month]?.budgeted ?? 0), 0)
const zone = getBudgetZone(groupActual, groupBudgeted)
```

This matches the existing `BudgetGroup` aggregation pattern.

---

## 4. Interaction States

### 4.1 Collapse / Expand

- **Default state:** All groups collapsed (aggregate dots only).
- **Tap group header row:** Toggles expand/collapse for that group.
- **Animation:** `grid-template-rows: 0fr` to `1fr` transition, identical to existing `BudgetGroup.module.css` pattern. Duration: `var(--ease-smooth)` (300ms).
- **Chevron:** Rotates 0deg (collapsed) to 90deg (expanded) with `var(--ease-default)` (200ms). Uses `>` character, matching `BudgetGroup`.

### 4.2 Window Picker

- **Closed state:** Shows "Sep 2025 -- Feb 2026" with downward chevron.
- **Tap trigger:** Opens overlay panel below trigger.
- **Panel:** Calendar-style month grid (4 columns x N rows). Each cell is a month. Tapping a month sets it as the start of a 6-month window.
  - If fewer than 6 months remain after the selected start, the window is clamped to end at the latest available month (showing fewer than 6 columns if necessary — see Edge Cases).
- **Selected range:** The 6 months in the current window are highlighted with `var(--accent-tint)` background.
- **Close:** Tap outside, Escape key, or select a month.
- **Styling:** Reuses `MonthDropdown.module.css` border/shadow/z-index patterns.

### 4.3 Dots

- **Read-only.** No tap, hover, or focus interaction on individual dots.
- Cursor: `default` (not pointer).

### 4.4 Loading State

- While `loading` is true, render shimmer placeholders in dot positions.
- Use existing `@keyframes shimmer` from `index.css`.
- Dot shimmer: 12px circles with shimmer gradient.

---

## 5. Accessibility

### 5.1 ARIA Roles

| Element | Role / Attribute | Value |
|---------|-----------------|-------|
| `HeatmapGrid` | `role` | `"grid"` |
| `HeatmapGrid` | `aria-label` | `"Budget heatmap, 6-month overview"` |
| Column header row | `role` | `"row"` |
| Each month header | `role` | `"columnheader"` |
| Group header row | `role` | `"row"` |
| Group header | `role` | `"button"` |
| Group header | `aria-expanded` | `true` / `false` |
| Group header | `aria-controls` | `"heatmap-group-{groupName}-items"` |
| Expanded items region | `role` | `"rowgroup"` |
| Expanded items region | `id` | `"heatmap-group-{groupName}-items"` |
| Each item row | `role` | `"row"` |
| Each dot cell | `role` | `"gridcell"` |
| Each dot | `aria-label` | e.g. `"Food & Dining, Oct 2025: 72% spent, within budget"` |

### 5.2 Keyboard Navigation (Window Picker)

Follows the same pattern as `MonthDropdown`:
- **Tab** to picker trigger
- **Enter / Space** to open
- **Arrow keys** navigate months in the grid
- **Enter** selects start month
- **Escape** closes without change, returns focus to trigger

### 5.3 Screen Reader

Each dot cell gets an `aria-label` describing:
- Category or group name
- Month
- Percentage and zone status

Example: `"Housing, Jan 2026: 92% spent, approaching limit"`

For no-data: `"Housing, Jan 2026: no data"`

### 5.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .groupContent { transition: none; }
  .chevron { transition: none; }
}
```

---

## 6. Edge Cases

### 6.1 Single-Item Groups

- Group header row shows aggregate dots (which equal the single item's dots).
- Expanding reveals one item row. The dots will be identical to the aggregate — this is expected and correct.

### 6.2 All Zeros (No Spending)

- `getBudgetZone(0, budgeted)` returns `'safe'` when budgeted > 0.
- All dots render green. This is correct — $0 spent is within budget.

### 6.3 All Over Budget

- All dots render red. No special handling.
- The legend still shows all four colors for reference.

### 6.4 No Custom Groups (Monarch Fallback)

- When `budget_custom_groups` has no entries, the budget system falls back to Monarch's native `group_name` field.
- The heatmap uses the same group list as the existing budget views — no separate logic needed.
- Group ordering follows the existing `sort_order` from custom groups, or alphabetical for Monarch fallback groups.

### 6.5 Fewer Than 6 Months of Data

- If the user has fewer than 6 months of budget data:
  - Display only the available months (e.g., 3 columns instead of 6).
  - Dot zone width distributes evenly among available columns (wider dots/spacing).
  - Window picker is hidden if total months <= 6 (no range to slide).
  - Column headers still show abbreviated month labels.

### 6.6 Empty Groups

- If a group has categories but none have data for any month in the window:
  - Group still appears (with all grey/faint dots).
  - User can still expand to see individual items (also grey/faint).

### 6.7 Long Category / Group Names

- Truncated with `text-overflow: ellipsis` at 127px column width.
- Full name available via `aria-label` on the row.

---

## 7. Design Token Mappings

All values reference CSS custom properties from `index.css`. No hardcoded hex in CSS modules.

### 7.1 Colors

| Usage | Token |
|-------|-------|
| Safe dot | `var(--color-positive)` |
| Warning dot | `var(--color-warning)` |
| Over dot | `var(--color-negative)` |
| No-budget dot | `var(--text-muted)` |
| No-data dot | `var(--text-faint)` |
| Card background | `var(--bg-card)` |
| Card border | `var(--border)` |
| Page background | `var(--bg-root)` |
| Row label text | `var(--text-primary)` |
| Column header text | `var(--text-muted)` |
| Chevron | `var(--text-muted)` |
| Hover/press background | `var(--bg-hover)` |
| Picker open border | `var(--accent)` |
| Selected range highlight | `var(--accent-tint)` |

### 7.2 Spacing

| Usage | Token |
|-------|-------|
| Page padding | `var(--sp-4)` — 16px |
| Gap: label to dots | `var(--sp-2)` — 8px |
| Group card internal padding | `var(--sp-4)` — 16px |
| Picker to grid gap | `var(--sp-3)` — 12px |
| Gap between group cards | `var(--sp-3)` — 12px |

### 7.3 Radius

| Usage | Token |
|-------|-------|
| Group card | `var(--radius-lg)` — 12px |
| Picker trigger | `var(--radius-md)` — 8px |
| Dots | 50% (circle) |

### 7.4 Shadows & Elevation

| Usage | Token |
|-------|-------|
| Picker dropdown panel | `var(--shadow-lg)` |
| Group cards | none (flat on `--bg-root`) |

### 7.5 Transitions

| Usage | Token |
|-------|-------|
| Expand/collapse content | `var(--ease-smooth)` — 300ms |
| Chevron rotation | `var(--ease-default)` — 200ms |
| Picker chevron rotation | `var(--ease-default)` — 200ms |

### 7.6 Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Picker trigger label | 15px | 400 | `--text-primary` |
| Column headers | 11px | 400 | `--text-muted` |
| Group name | 15px | 500 | `--text-primary` |
| Item name (expanded) | 13px | 400 | `--text-secondary` |
| Legend labels | 11px | 400 | `--text-muted` |

---

## 8. CSS Module File

`HeatmapGrid.module.css` — follows existing naming convention (component-level CSS modules).

Additional modules if needed:
- `HeatmapWindowPicker.module.css`

---

## 9. Data Requirements

### 9.1 API

The heatmap needs multi-month budget data in a single request. Two approaches:

**Option A (preferred):** New endpoint `GET /api/budgets/heatmap?start=2025-09-01&end=2026-02-01` that returns:

```json
{
  "months": ["2025-09-01", "2025-10-01", ...],
  "groups": [
    {
      "group_name": "Food & Dining",
      "categories": [
        {
          "category_id": "abc123",
          "category_name": "Groceries",
          "months": {
            "2025-09-01": { "actual": 450, "budgeted": 500 },
            "2025-10-01": { "actual": 520, "budgeted": 500 },
            ...
          }
        }
      ]
    }
  ]
}
```

**Option B:** Fetch 6 individual months via existing `/api/budgets?month=YYYY-MM-01` and merge client-side. Simpler backend change but 6x the requests.

### 9.2 Custom Group Integration

The heatmap reuses the existing `budget_custom_groups` system:
- Groups ordered by `sort_order`
- Categories within groups ordered by their custom order
- Unassigned categories appear in their Monarch `group_name` groups
- Transfer categories filtered out (per existing convention)

---

## 10. Integration with HorizontalSwipeContainer

The heatmap becomes the third pane (index 2) in the swipe container:

```jsx
<HorizontalSwipeContainer activeIndex={viewIndex} onIndexChange={setViewIndex}>
  <BudgetMonthDetail ... />      {/* pane 0 */}
  <BudgetMonthlySummary ... />   {/* pane 1 */}
  <BudgetHeatmapPane ... />      {/* pane 2 */}
</HorizontalSwipeContainer>
```

The `ViewIndicator` dots update automatically (3 dots instead of 2). The third tab's `aria-label` should be `"Heatmap view"`.
