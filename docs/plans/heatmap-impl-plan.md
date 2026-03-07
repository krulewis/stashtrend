# Implementation Plan: Budget Heatmap View
## FINAL PLAN (Staff Review Incorporated)

> **Staff Review Pass:** 15 findings addressed. Each finding is noted inline with
> a `[SR-N]` tag at the point of change. A summary of all changes is in the
> "Staff Review Response" section at the bottom of this document.

---

## Overview

Add a mobile-only 6-month budget health heatmap as pane 0 in the existing `HorizontalSwipeContainer`, shifting `MonthDetailView` to pane 1 and `MonthlySummaryView` to pane 2. The heatmap displays expense groups as rows and months as columns, with colored dots encoding spend status via `getBudgetZone()`. No backend changes are needed — the existing `fetchBudgetHistory(12)` data is sufficient.

**Default view:** The heatmap is pane 0 and `activeView` defaults to 0. This is intentional per the product spec: "This view is the default landing view for the Budgets tab on mobile." [SR-9]

The work is organized into five implementation groups (A–E) plus a parallel test group (F). Groups A and C are fully independent and can start immediately. Groups B and D depend on A. Group E depends on B, C, and D. Group F (test files for new components) can be written in parallel with D as soon as interfaces are pinned.

Architecture decisions are documented in `docs/plans/heatmap-architecture.md`. Design measurements are in `docs/plans/heatmap-design-spec.md`.

---

## Changes

### Group A — Shared Utilities (independent)

---

```
File: frontend/src/utils/budgetUtils.js
Lines: append after line 63 (after getPillAriaLabel)
Parallelism: independent
Description: Add two exported functions: groupExpenses() and formatMonthLabel().
  groupExpenses() is the shared grouping logic extracted from MonthDetailView's
  useMemo, modified to preserve the full `months` object on each returned
  category instead of extracting a single month. HeatmapView and the refactored
  MonthDetailView both call this function.
  formatMonthLabel() is extracted here as a shared utility to avoid duplication
  between WindowPicker and HeatmapView. [SR-13]
Details:
  - [SR-13] Export a new function: formatMonthLabel(monthKey)
      Input:  ISO date string e.g. '2026-01-01'
      Output: '3-letter month + 2-digit year' e.g. 'Jan 26'
      Implementation:
        return new Date(monthKey + 'T00:00:00').toLocaleDateString('en-US',
          { month: 'short', year: '2-digit' })
      This avoids timezone shift from bare new Date('2026-01-01') which can
      roll back to Dec in UTC-offset environments. Always append 'T00:00:00'.
      JSDoc: @param {string} monthKey - ISO date string e.g. '2026-01-01'
             @returns {string} Formatted label e.g. 'Jan 26'

  - Export a new function: groupExpenses(categories, customGroups)
  - Parameters:
      categories   — array of raw API category objects, each with:
                     category_id, category_name, group_type, group_name,
                     months (Record<string, { actual, budgeted }>)
      customGroups — object shaped { "Group Name": [{ category_id, sort_order }] }
  - Return type:
      Array<{ groupName: string, categories: Array<{
        category_id, category_name, effectiveGroup, sort_order, months
      }> }>
  - Implementation steps (mirror MonthDetailView lines 86-137 exactly, except
    step 3 is removed — do NOT extract month values):
      Step 1: Filter to expense categories only:
              cat.group_type !== 'income' && cat.group_type !== 'transfer'
      Step 2: Build customLookup from customGroups entries:
              customLookup[item.category_id] = { custom_group: groupName,
                sort_order: item.sort_order ?? 0 }
      Step 3: Map each expense category to a flat object — resolve effectiveGroup
              (custom?.custom_group ?? cat.group_name ?? 'Other'), carry through
              sort_order (custom?.sort_order ?? Infinity), preserve cat.months intact.
              Do NOT read cat.months[selectedMonth] — callers do that.
      Step 4: Group by effectiveGroup name into a groupMap object.
      Step 5: Sort within each group: sort_order ascending, then category_name
              ascending via localeCompare.
      [SR-14] Step 6: Sort groups themselves before returning — sort groupMap entries
              by minimum sort_order across their categories (ascending), with
              alphabetical groupName as a tiebreaker:
                const groupEntries = Object.entries(groupMap)
                groupEntries.sort(([nameA, catsA], [nameB, catsB]) => {
                  const minA = Math.min(...catsA.map(c => c.sort_order))
                  const minB = Math.min(...catsB.map(c => c.sort_order))
                  if (minA !== minB) return minA - minB
                  return nameA.localeCompare(nameB)
                })
                return groupEntries.map(([groupName, categories]) =>
                  ({ groupName, categories }))
              NOTE: When minA and minB are both Infinity (no custom sort_order),
              sort falls back to alphabetical groupName, which is deterministic.
      Step 6 (previous): The return statement is now the final step after sorting
              group entries above.
  - Guard: return [] if categories is falsy or empty.
  - customGroups guard: if customGroups is falsy, treat as {} (no custom groups —
    all categories fall back to group_name).
  - JSDoc comment describing params and return shape (mirrors architecture doc).
```

---

```
File: frontend/src/utils/budgetUtils.test.js
Lines: append after line 171 (after getPillAriaLabel suite)
Parallelism: independent (same group as budgetUtils.js changes)
Description: Tests for groupExpenses() and formatMonthLabel(). Write these BEFORE
  the implementation exists (TDD). They will fail until both functions are exported
  from budgetUtils.js.
Details:
  - Import groupExpenses and formatMonthLabel from './budgetUtils.js'
    (add to existing import line)

  - [SR-13] New describe block: 'formatMonthLabel'
      "formats a January date as Jan 26"
        — formatMonthLabel('2026-01-01') === 'Jan 26'
      "formats a December date as Dec 25"
        — formatMonthLabel('2025-12-01') === 'Dec 25'
      "does not shift to the previous month due to timezone"
        — formatMonthLabel('2026-01-01') should NOT produce 'Dec 25'
        — This explicitly guards the T00:00:00 fix

  - Define shared fixtures at top of the groupExpenses describe block:
      CATEGORIES fixture — array of 5 categories:
        { category_id: 'cat_1', category_name: 'Groceries',    group_type: 'expense',
          group_name: 'Food', months: { '2026-01-01': { actual: 100, budgeted: 500 } } }
        { category_id: 'cat_2', category_name: 'Restaurants',  group_type: 'expense',
          group_name: 'Food', months: { '2026-01-01': { actual: 90,  budgeted: 100 } } }
        { category_id: 'cat_3', category_name: 'Rent',         group_type: 'expense',
          group_name: 'Housing', months: {} }
        { category_id: 'cat_4', category_name: 'Salary',       group_type: 'income',
          group_name: 'Income', months: {} }
        { category_id: 'cat_5', category_name: 'CC Payment',   group_type: 'transfer',
          group_name: 'Transfers', months: {} }
      CUSTOM_GROUPS fixture:
        { 'Dining': [{ category_id: 'cat_2', sort_order: 0 }],
          'Groceries Group': [{ category_id: 'cat_1', sort_order: 0 }] }

  - Test cases (describe 'groupExpenses'):
      "returns empty array when categories is null"
        — groupExpenses(null, {}) → []
      "returns empty array when categories is empty"
        — groupExpenses([], {}) → []
      "filters out income categories"
        — result contains no group with category_id 'cat_4'
      "filters out transfer categories"
        — result contains no group with category_id 'cat_5'
      "groups expense categories by group_name when customGroups is empty"
        — groupExpenses([cat_1, cat_2, cat_3], {}) returns 2 groups:
          'Food' (cat_1, cat_2) and 'Housing' (cat_3)
      "applies custom group override over group_name"
        — groupExpenses([cat_1, cat_2], CUSTOM_GROUPS) returns
          'Dining' (cat_2) and 'Groceries Group' (cat_1) instead of 'Food'
      "preserves the full months object on each returned category"
        — result[0].categories[0].months toEqual the original cat.months value
        [SR-12] Use toEqual (deep equality) rather than toBe (reference equality)
        because useMemo and spread operations may not preserve reference identity
        across component renders. Deep equality is the correct semantic here.
      "falls back to 'Other' when group_name is null and no custom group"
        — category with group_name: null → lands in 'Other' group
      "sorts categories within a group by sort_order ascending"
        — custom group with sort_order 0 and 1 — lower sort_order item appears first
      "sorts categories with equal sort_order by category_name (localeCompare)"
        — two categories in same group, same sort_order → alphabetical order
      "places uncustomised categories (sort_order = Infinity) after customised ones"
        — one cat in customGroups (sort_order 0), one not → custom appears first
      "handles customGroups being null gracefully (treats as no custom groups)"
        — groupExpenses(categories, null) should not throw; falls back to group_name
      "returns groupName matching the effectiveGroup key"
        — result[i].groupName matches the group name used in groupMap
      [SR-14] "sorts groups by minimum sort_order ascending"
        — CUSTOM_GROUPS assigns sort_order 0 to cat_2 (Dining) and cat_1 (Groceries Group)
          Feed a fixture where group A has min sort_order 5 and group B has min 2
          → group B appears before group A in result
      [SR-14] "sorts groups alphabetically when all sort_orders are Infinity (no custom groups)"
        — groupExpenses([cat_1, cat_2, cat_3], {}) → 'Food' before 'Housing'
          (F < H alphabetically)
```

---

### Group B — MonthDetailView Refactor (depends-on: Group A)

---

```
File: frontend/src/components/mobile/MonthDetailView.jsx
Lines: 1-8 (imports), 71-138 (useMemo block)
Parallelism: depends-on: Group A
Description: Replace the inline grouping useMemo with calls to groupExpenses()
  plus a separate post-processing step to extract the selected month's values.
  Split into two useMemos to avoid re-running grouping on every month change.
  All downstream behavior must be identical to the current implementation.
Details:
  - Line 1-8 (imports): Add groupExpenses to the import from budgetUtils:
      import { groupExpenses } from '../../utils/budgetUtils.js'
    (formatMonthLabel is not needed in MonthDetailView — it already has its own
    month formatting elsewhere or uses selectedMonth directly as a key.)

  - [SR-6] Lines 82-138 (groupedExpenses useMemo): Split the single useMemo into
    TWO useMemos to avoid re-running the expensive grouping step on every month
    change:

    useMemo #1 — grouping only (deps: [categories, effectiveGroups]):
      const grouped = useMemo(() => {
        if (!categories) return []
        return groupExpenses(categories, effectiveGroups)
      }, [categories, effectiveGroups])

    useMemo #2 — month extraction (deps: [grouped, selectedMonth]):
      const groupedExpenses = useMemo(() => {
        if (!grouped.length || !selectedMonth) return []
        return grouped.map(({ groupName, categories: cats }) => ({
          groupName,
          categories: cats.map(cat => ({
            category_id:    cat.category_id,
            category_name:  cat.category_name,
            effectiveGroup: cat.effectiveGroup,
            sort_order:     cat.sort_order,
            actual:         cat.months?.[selectedMonth]?.actual   ?? null,
            budgeted:       cat.months?.[selectedMonth]?.budgeted ?? null,
          })),
        }))
      }, [grouped, selectedMonth])

    The variable name `groupedExpenses` (used by all downstream code including
    BudgetGroup, BudgetLineItem, and the totals useMemo) is preserved on the
    second memo. The intermediate `grouped` variable is new and only used
    within this file.

  - No other changes to MonthDetailView.jsx. All other useMemo blocks,
    handlers, and JSX are untouched.
  - Verify: the shape of groupedExpenses elements (groupName, categories[].actual,
    categories[].budgeted, categories[].category_name, categories[].category_id)
    must remain identical — BudgetGroup, BudgetLineItem, and the totals useMemo
    all depend on this shape.
  - NOTE on draftGroups path: effectiveGroups = isReorderMode && draftGroups
    ? draftGroups : customGroups is computed BEFORE the useMemos and passed to
    groupExpenses. This preserves the existing draft state behaviour exactly.
    groupExpenses receives effectiveGroups (which may be draftGroups), not
    customGroups directly. Do not change this.
```

No new test file is needed for MonthDetailView — the refactor is mechanical and all existing MonthDetailView behaviour is covered by running the existing test suite (`make test`) after the change.

---

### Group C — HorizontalSwipeContainer (independent)

---

```
File: frontend/src/components/mobile/HorizontalSwipeContainer.jsx
Lines: 5-12 (props destructuring), 72 (aria-label line), 83-88 (propTypes)
Parallelism: independent
Description: Add optional labels prop. Use it for dot aria-labels, falling back
  to a generic "View N" string if labels is not provided. This decouples the
  container from specific view names and enables 3-pane operation.
Details:
  - Line 5: Add labels to props destructuring:
      export default function HorizontalSwipeContainer({
        children,
        activeIndex,
        onIndexChange,
        isLocked,
        labels,
      }) {
  - Line 72: Replace the current hardcoded aria-label ternary with:
      aria-label={labels?.[i] ?? `View ${i + 1}`}
    The current line reads:
      aria-label={i === 0 ? 'Month detail view' : 'Monthly summary view'}
    This must be replaced entirely — not wrapped in additional logic.
  - Lines 83-88 (propTypes): Add labels to PropTypes:
      labels: PropTypes.arrayOf(PropTypes.string),
    Insert after the isLocked line. No defaultProps change needed — labels is
    optional and the ?? fallback in the JSX handles the undefined case.
  - No changes to HorizontalSwipeContainer.module.css.
  - No changes to scroll, pane rendering, isLocked, or any other logic.
```

---

```
File: frontend/src/components/mobile/HorizontalSwipeContainer.test.jsx
Lines: append new tests after line 142 (after the existing isLocked suite)
Parallelism: independent (same group as HorizontalSwipeContainer.jsx changes)
Description: Add tests for the labels prop. The two existing aria-label tests
  (lines 68-78) must be UPDATED to reflect that the fallback is now "View 1"
  / "View 2" rather than hardcoded names, OR the existing tests can be updated
  to pass labels explicitly to preserve their assertions.
Details:
  - CRITICAL: Update the two existing failing tests on lines 68-74 and 75-78.
    These currently assert exact strings "Month detail view" and "Monthly summary
    view". After the change, those strings only appear when labels prop is passed.
    Choose one of two approaches (prefer approach A):
      Approach A: Update the renderContainer helper to pass labels by default:
        labels={['Month detail view', 'Monthly summary view']}
        This keeps existing assertions green with zero semantic change.
      Approach B: Update the assertions to match the new fallback strings
        "View 1" and "View 2". Less preferred — tests lose specificity.
    Use Approach A.
  - [SR-15] Add a comment above the updated renderContainer helper noting that the
    semantic meaning of the labels has shifted: they are now passed as prop data
    rather than hardcoded in the component. This documents the intentional change
    so future maintainers understand why labels is supplied in the test helper.
  - New test: "uses labels[i] as aria-label on each dot tab when labels prop provided"
      render with labels={['Heatmap view', 'Month detail view', 'Monthly summary view']}
      and three children. Assert tabs[0] aria-label is 'Heatmap view',
      tabs[1] is 'Month detail view', tabs[2] is 'Monthly summary view'.
  - New test: "falls back to 'View N' aria-label when labels prop is omitted"
      render with no labels prop and two children.
      Assert tabs[0].getAttribute('aria-label') === 'View 1'
      Assert tabs[1].getAttribute('aria-label') === 'View 2'
  - New test: "falls back to 'View N' for indices beyond labels array length"
      render with labels={['Only one label']} and two children.
      tabs[0] aria-label === 'Only one label'
      tabs[1] aria-label === 'View 2'
  - Keep all existing tests (renders, tabpanel count, aria-selected, CSS class,
    click callbacks, isLocked) passing without modification (Approach A above
    handles the aria-label tests).
```

---

### Group D — New Components (depends-on: Group A)

---

```
File: frontend/src/components/mobile/WindowPicker.jsx
Lines: new file
Parallelism: depends-on: Group A (imports formatMonthLabel from budgetUtils)
Description: Month window shift control. Renders a horizontal strip showing
  the 6 months currently in the heatmap window with left/right arrow buttons
  to shift the window. The parent (HeatmapView) owns windowStart state.

  [SR-1] CRITICAL — Month display order: WindowPicker receives `displayMonths`
  (already reversed to oldest-first by HeatmapView, ready for left-to-right
  display). WindowPicker renders this array directly without any additional
  sorting or reversing. The grid columns and the picker labels will always
  be in sync because both use the same `displayMonths` array.
Details:
  - Imports: React (no hooks needed — stateless), PropTypes,
    formatMonthLabel from '../../utils/budgetUtils.js',
    styles from './WindowPicker.module.css'
  - [SR-1] Props interface (UPDATED — displayMonths replaces months+windowStart slice):
      displayMonths  — PropTypes.arrayOf(PropTypes.string).isRequired
                       ALREADY oldest-first slice for the current window.
                       HeatmapView passes [...windowMonths].reverse() here.
                       WindowPicker renders this array directly, left-to-right.
      canGoOlder     — PropTypes.bool.isRequired
                       true when the window can shift to show older months
      canGoNewer     — PropTypes.bool.isRequired
                       true when the window can shift to show more recent months
      onGoOlder      — PropTypes.func.isRequired
                       called when left arrow is clicked (no argument)
      onGoNewer      — PropTypes.func.isRequired
                       called when right arrow is clicked (no argument)
      hidden         — PropTypes.bool (default: false)
                       when true, render null (used by HeatmapView when
                       months.length <= windowSize)

  - [SR-1] NOTE on the old props interface: The original plan passed `months`,
    `windowStart`, `windowSize`, and `onWindowChange`. This has been replaced
    with pre-computed props to eliminate the display-order mismatch. HeatmapView
    computes everything and passes results; WindowPicker is purely presentational.

  - JSX structure:
      if (hidden) return null
      <div className={styles.picker} aria-label="Select 6-month window">
        <button
          type="button"
          className={styles.arrow}
          onClick={onGoOlder}
          disabled={!canGoOlder}
          aria-label="Show older months"
        >
          ‹
        </button>
        <div className={styles.monthStrip} role="group" aria-label="Current window">
          {displayMonths.map(m => (
            <span key={m} className={styles.monthLabel}>
              {formatMonthLabel(m)}
            </span>
          ))}
        </div>
        <button
          type="button"
          className={styles.arrow}
          onClick={onGoNewer}
          disabled={!canGoNewer}
          aria-label="Show newer months"
        >
          ›
        </button>
      </div>

  - PropTypes validation block at bottom.
```

---

```
File: frontend/src/components/mobile/WindowPicker.module.css
Lines: new file
Parallelism: depends-on: Group A (same new-component group)
Description: Styling for the month window strip. Full-width, 44px height, flex row.
Details:
  - .picker:
      display: flex
      align-items: center
      width: 100%
      height: 44px
      margin-bottom: var(--sp-3)   /* 12px — picker-to-grid gap per design spec */
      background: var(--bg-card)
      border: 1px solid var(--border)
      border-radius: var(--radius-md)
      padding: 0 var(--sp-2)
  - .arrow:
      flex-shrink: 0
      width: 44px
      height: 44px
      border: none
      background: transparent
      color: var(--accent)
      font-size: 20px
      cursor: pointer
      display: inline-flex
      align-items: center
      justify-content: center
      padding: 0
      border-radius: var(--radius-sm)
    .arrow:disabled:
      color: var(--text-muted)
      cursor: default
    .arrow:not(:disabled):active:
      background: var(--bg-hover)
  - .monthStrip:
      flex: 1
      display: flex
      justify-content: space-around
      align-items: center
      overflow: hidden
  - .monthLabel:
      font-size: 11px
      font-weight: 400
      color: var(--text-muted)
      white-space: nowrap
      text-align: center
  - No reduced-motion rules needed — no animations in this component.
  - No hardcoded hex — all values use design tokens from index.css.
```

---

```
File: frontend/src/components/mobile/HeatmapView.jsx
Lines: new file
Parallelism: depends-on: Group A (calls groupExpenses, formatMonthLabel)
Description: Main heatmap grid component. Renders the 6-month budget health grid
  with group rows (aggregate dots) that expand to reveal category rows (item dots).
  Owns windowStart state. Renders WindowPicker above the grid.

  [SR-1] ORDERING CONTRACT: `months` prop is most-recent-first (monthsDesc).
  The window slice (windowMonths) is also most-recent-first. `displayMonths`
  is the reversed slice: oldest-first, for left-to-right column rendering.
  BOTH the column header cells AND WindowPicker receive `displayMonths` so
  grid columns and picker labels are always in sync.

  [SR-9] DEFAULT VIEW NOTE: HeatmapView is pane 0 and MobileBudgetPage uses
  activeView = useState(0), making the heatmap the default landing view for
  the Budgets tab on mobile per the product spec.
Details:
  - Imports:
      import { useState, useMemo } from 'react'
      import PropTypes from 'prop-types'
      import { groupExpenses, getBudgetZone, formatMonthLabel }
        from '../../utils/budgetUtils.js'
      import WindowPicker from './WindowPicker.jsx'
      import styles from './HeatmapView.module.css'
  - Props interface:
      categories   — PropTypes.arrayOf(PropTypes.object).isRequired
                     raw API categories with months object
      customGroups — PropTypes.object.isRequired
      months       — PropTypes.arrayOf(PropTypes.string).isRequired
                     most-recent-first (monthsDesc from MobileBudgetPage)
  - State:
      const [windowStart, setWindowStart] = useState(0)
        // 0 = show most recent 6 months (months[0..5])
  - Derived data (useMemo):
      const WINDOW_SIZE = 6
      const windowMonths = useMemo(
        () => months.slice(windowStart, windowStart + WINDOW_SIZE),
        [months, windowStart]
      )
      // windowMonths is most-recent-first. Reverse for oldest-first display:
      const displayMonths = useMemo(
        () => [...windowMonths].reverse(),
        [windowMonths]
      )
      // [SR-1] displayMonths is passed to BOTH the column headers AND WindowPicker.
      // This guarantees the picker labels match the grid columns exactly.

      const canGoOlder = windowStart + WINDOW_SIZE < months.length
      const canGoNewer = windowStart > 0
      // [SR-1] These booleans are passed to WindowPicker as canGoOlder/canGoNewer.
      // WindowPicker no longer computes its own window bounds.

      // groupExpenses returns groups with full months object on each category
      const groupedData = useMemo(
        () => groupExpenses(categories, customGroups),
        [categories, customGroups]
      )
  - [SR-5] HeatmapGroupRow props: HeatmapGroupRow must receive displayMonths as
    a prop named `months`. HeatmapView passes months={displayMonths} to each
    HeatmapGroupRow. HeatmapGroupRow does NOT access displayMonths from closure —
    it is always passed explicitly as a prop.

  - Column header row:
      Render a header row with the same grid template as data rows.
      One empty cell for the label column, then one <span> per displayMonth.
      Use formatMonthLabel(m) imported from budgetUtils.js.
      [SR-1] Use displayMonths (not windowMonths) so header order matches columns.
      ARIA: role="row" on the header row div; role="columnheader" on each month span.

  - [SR-8] Column header row CSS: the .columnHeaders element must NOT have horizontal
    padding, because the outer .heatmap container already provides --sp-4 page
    gutters. Adding padding on .columnHeaders would double-pad the header row
    and misalign it with the group card rows beneath it. See CSS details below.

  - Group rows:
      Map over groupedData. Each group renders a HeatmapGroupRow.
      HeatmapGroupRow is defined as a named component ABOVE the HeatmapView
      function definition in this same file (not in a separate file).
      Pass months={displayMonths} to each HeatmapGroupRow. [SR-5]

  - [SR-3] ARIA correction: The HeatmapGroupRow group name cell must use
    role="rowheader" (not role="button"). The interactive behavior is achieved
    via tabIndex, keyboard handler, and aria-expanded on the same element.
    The group name cell structure:
      <div
        role="rowheader"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={`heatmap-group-${groupId}-items`}
        onClick={() => setIsExpanded(prev => !prev)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded(prev => !prev)
          }
        }}
        className={styles.groupLabel}
      >
        ...chevron + group name text...
      </div>
    role="rowheader" inside role="row" inside role="grid" is valid ARIA.
    role="button" inside role="row" is NOT valid. [SR-3]

  - HeatmapGroupRow structure:
      Props: group (object with groupName and categories), months (oldest-first array)
      [SR-5] Receives `months` prop — does NOT read displayMonths from outer scope.
      const [isExpanded, setIsExpanded] = useState(false)
      // Aggregate dot values: sum then classify
      // [SR-4] Zone-to-CSS class mapping via ZONE_CLASS_MAP (see below).
      // Compute all 6 aggregate zones before rendering (not inline in JSX)
      const groupZones = months.map(m => {
        const groupActual   = group.categories.reduce(
          (s,c) => s + (c.months[m]?.actual ?? 0), 0)
        const groupBudgeted = group.categories.reduce(
          (s,c) => s + (c.months[m]?.budgeted ?? 0), 0)
        const zone = getBudgetZone(groupActual, groupBudgeted)
        return { month: m, zone, actual: groupActual, budgeted: groupBudgeted }
      })
      // groupId: sanitize groupName for use in DOM id (replace spaces with dashes,
      // lowercase): const groupId = group.groupName.toLowerCase().replace(/\s+/g, '-')
      // Group header row JSX:
      //   role="row" on outer div
      //   role="rowheader" + tabIndex/aria-expanded/handlers on the label cell [SR-3]
      //   role="gridcell" on each dot cell
      // Item rows: wrapped in role="rowgroup" div with collapse animation

  - [SR-4] ZONE_CLASS_MAP — define as a module-level constant at the top of the
    file (after imports, before HeatmapGroupRow):
      const ZONE_CLASS_MAP = {
        safe:       styles.dotSafe,
        warning:    styles.dotWarning,
        over:       styles.dotOver,
        'no-budget': styles.dotMuted,
        'no-data':  styles.dotFaint,
      }
    When composing dot className:
      className={`${styles.dot} ${ZONE_CLASS_MAP[zone] ?? styles.dotFaint}`}
    For category dots (smaller size):
      className={`${styles.dotItem} ${ZONE_CLASS_MAP[zone] ?? styles.dotFaint}`}
    [SR-11] ZONE_CLASS_MAP covers both 'no-budget' (→ dotMuted) and 'no-data'
    (→ dotFaint), satisfying the design spec's two-tone distinction.
    The previous plan used styles[`dot--${zone}`] which would produce undefined
    CSS module lookups. This map is the correct pattern.

  - getDotAriaLabel helper (module-level, not exported):
      (name, monthKey, actual, budgeted, zone) => string
      no-data:   "${name}, ${monthLabel}: no data"
      no-budget: "${name}, ${monthLabel}: $${rounded actual} spent, no budget set"
      safe/warning/over: "${name}, ${monthLabel}: ${pct}% spent, ${zoneLabel}"
        zoneLabel: 'within budget' | 'approaching limit' | 'over budget'
        monthLabel: formatted as "Jan 2026" (full month name + 4-digit year for ARIA,
          NOT the abbreviated "Jan 26" used for visual labels — use:
          new Date(monthKey + 'T00:00:00').toLocaleDateString('en-US',
            { month: 'long', year: 'numeric' }))

  - Item rows (expanded):
      Wrapped in a div with id={`heatmap-group-${groupId}-items`}
        and role="rowgroup"
      Same CSS collapse pattern as BudgetGroup (grid-template-rows: 0fr / 1fr)
      For each category in group.categories:
        role="row" on the row div
        [SR-7] Indented label: padding-left: var(--sp-4) (16px, NOT --sp-6/24px).
          At 110px label column width, --sp-6 (24px) leaves only 86px for the name.
          --sp-4 (16px) leaves 94px — sufficient for most category names without
          truncation at typical font sizes.
        font-size: 13px, color: var(--text-secondary)
        6 dot cells (role="gridcell") using category-level actual/budgeted

  - Outer grid ARIA:
      Wrap the entire grid section in:
        role="grid" aria-label="Budget heatmap, 6-month overview"

  - WindowPicker invocation (passes pre-computed props, not raw months):
      [SR-1] <WindowPicker
        displayMonths={displayMonths}
        canGoOlder={canGoOlder}
        canGoNewer={canGoNewer}
        onGoOlder={() => setWindowStart(w => w + 1)}
        onGoNewer={() => setWindowStart(w => w - 1)}
        hidden={months.length <= WINDOW_SIZE}
      />
    NOTE: WindowPicker is rendered ABOVE the grid inside the HeatmapView return.

  - Loading state: not handled here — MobileBudgetPage already shows a loading
    spinner before HeatmapView renders. HeatmapView can assume data is present.
  - Empty guard: if groupedData.length === 0, render a placeholder:
      <p className={styles.empty}>No expense groups to display.</p>
  - Full component PropTypes block at bottom.
  - IMPORTANT: HeatmapGroupRow uses useState. It must be defined as a named
    inner component (const HeatmapGroupRow = ...) ABOVE the HeatmapView function
    definition in the same file. Do NOT define it inline inside a .map() callback,
    as hooks cannot be called in callbacks. Treat HeatmapGroupRow as a file-local
    component.
```

---

```
File: frontend/src/components/mobile/HeatmapView.module.css
Lines: new file
Parallelism: depends-on: Group A (same new-component group)
Description: Grid layout, dot styles, row styles, collapse animation.
  All values use design tokens. No hardcoded hex.
Details:
  - Grid template (applied to each row — header, group, category):
      display: grid
      grid-template-columns: 110px repeat(6, 1fr)
      align-items: center
    NOTE: architecture doc specifies 110px label column. Design spec says 127px.
    Use 110px per the architecture decision (Decision 1). The architecture doc
    is the authoritative source when specs differ on a layout detail.
  - .heatmap:
      display: flex
      flex-direction: column
      gap: var(--sp-3)   /* 12px between group cards */
      padding: var(--sp-4)   /* 16px page gutters — matches design spec §2.1 */
  - [SR-8] .columnHeaders (header row):
      display: grid
      grid-template-columns: 110px repeat(6, 1fr)
      /* NO horizontal padding here — .heatmap already provides --sp-4 gutters.
         Adding padding here would double-pad and shift headers out of alignment
         with the group card rows below. */
      margin-bottom: var(--sp-2)
  - .headerLabel (empty label cell):
      /* empty spacer — no styles needed beyond grid placement */
  - .headerMonth:
      font-size: 11px
      font-weight: 400
      color: var(--text-muted)
      text-align: center
  - .groupCard:
      background: var(--bg-card)
      border: 1px solid var(--border)
      border-radius: var(--radius-lg)
      overflow: hidden
  - .groupHeaderRow:
      display: grid
      grid-template-columns: 110px repeat(6, 1fr)
      align-items: center
      min-height: 44px
      padding: 0 var(--sp-3)
      cursor: pointer
    .groupHeaderRow:active:
      background: var(--bg-hover)
  - .groupLabel:
      display: flex
      align-items: center
      gap: var(--sp-2)
      overflow: hidden
  - .chevron:
      font-size: 12px
      color: var(--text-muted)
      flex-shrink: 0
      transition: transform var(--ease-default)
      display: inline-block
  - .chevronExpanded:
      transform: rotate(90deg)
  - .groupName:
      font-size: 15px
      font-weight: 500
      color: var(--text-primary)
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
  - .groupContent (collapse container — mirrors BudgetGroup.module.css pattern exactly):
      display: grid
      grid-template-rows: 0fr
      transition: grid-template-rows var(--ease-smooth)
      overflow: hidden
  - .groupContentExpanded:
      grid-template-rows: 1fr
  - .groupContentInner (min-height: 0 child required for 0fr to work):
      min-height: 0
  - .categoryRow:
      display: grid
      grid-template-columns: 110px repeat(6, 1fr)
      align-items: center
      min-height: 36px
      padding: 0 var(--sp-3)
  - [SR-7] .categoryLabel:
      font-size: 13px
      font-weight: 400
      color: var(--text-secondary)
      padding-left: var(--sp-4)   /* [SR-7] 16px indent — NOT --sp-6 (24px).
                                     --sp-6 leaves only 86px for names in the
                                     110px label column. --sp-4 leaves 94px. */
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
  - .dotCell:
      display: flex
      justify-content: center
      align-items: center
  - .dot (aggregate — 12px):
      width: 12px
      height: 12px
      border-radius: 50%
      background: var(--text-muted)   /* default/fallback */
      cursor: default
      flex-shrink: 0
  - .dotItem (category — 10px):
      width: 10px
      height: 10px
      border-radius: 50%
      background: var(--text-muted)
      cursor: default
      flex-shrink: 0
  - [SR-4] Zone color modifiers (referenced via ZONE_CLASS_MAP in JSX — do not
    use dynamic string interpolation like styles[`dot--${zone}`], which would
    produce undefined CSS module lookups):
      .dotSafe:    background: var(--color-positive)
      .dotWarning: background: var(--color-warning)
      .dotOver:    background: var(--color-negative)
      .dotMuted:   background: var(--text-muted)    /* no-budget */
      [SR-11] .dotFaint: background: var(--text-faint)  /* no-data — distinct from
                                                           no-budget per design spec */
    NOTE: ZONE_CLASS_MAP in HeatmapView.jsx maps 'no-budget' → dotMuted and
    'no-data' → dotFaint, satisfying the two-tone design spec requirement.
  - .empty:
      padding: var(--sp-6)
      text-align: center
      color: var(--text-muted)
      font-size: 14px
  - Reduced motion:
      @media (prefers-reduced-motion: reduce) {
        .groupContent { transition: none; }
        .chevron { transition: none; }
      }
```

---

### Group E — Page Integration (depends-on: Groups B, C, D)

---

```
File: frontend/src/pages/MobileBudgetPage.jsx
Lines: 1-8 (imports), 17 (activeView comment), 83-103 (JSX content section)
Parallelism: depends-on: Groups B, C, D
Description: Add HeatmapView as pane 0. Shift existing views to panes 1 and 2.
  Pass labels prop to HorizontalSwipeContainer. Update activeView comment.
  [SR-9] The heatmap is the intentional default: activeView = useState(0) means
  pane 0 (HeatmapView) is shown on first load per the product spec.
Details:
  - Lines 1-8 (imports): Add HeatmapView import:
      import HeatmapView from '../components/mobile/HeatmapView.jsx'
    Add after the MonthlySummaryView import line.
  - Line 17 (activeView state comment): Update comment:
      // 0 = heatmap (default landing view), 1 = detail, 2 = summary
    [SR-9] The comment explicitly documents the heatmap as the default landing view.
  - Lines 83-103 (JSX HorizontalSwipeContainer block):
    Add labels prop to HorizontalSwipeContainer:
      <HorizontalSwipeContainer
        activeIndex={activeView}
        onIndexChange={setActiveView}
        isLocked={isReorderMode}
        labels={['Heatmap view', 'Month detail view', 'Monthly summary view']}
      >
    Add HeatmapView as the FIRST child (pane 0) before MonthDetailView:
      <HeatmapView
        categories={budgetData.categories}
        customGroups={customGroups}
        months={monthsDesc}
      />
    MonthDetailView remains unchanged (now pane 1).
    MonthlySummaryView remains unchanged (now pane 2).
  - activeView default of 0 already points to heatmap (no change to useState(0)).
  - No changes to handleDone, isReorderMode, selectedMonth, or any other state.
  - No changes to loading/error/empty guard blocks.
  - IMPORTANT: The existing isLocked={isReorderMode} must remain. Reorder mode
    (in MonthDetailView/pane 1) still needs to lock swipe. The heatmap (pane 0)
    has no DnD and will never set isReorderMode itself.
```

---

```
File: frontend/src/pages/MobileBudgetPage.module.css
Lines: all (no changes)
Parallelism: depends-on: Groups B, C, D
Description: No changes needed. The page CSS is layout-only (flex column, overflow
  hidden, bottom padding for BottomTabBar). HeatmapView handles its own internal
  padding via HeatmapView.module.css. The pane scroll is handled by
  HorizontalSwipeContainer.module.css (.pane { overflow-y: auto }).
```

---

### Group F — Tests for New Components (parallel with Group D)

Tests for HeatmapView and WindowPicker can be written as soon as their interfaces are defined — before the implementations exist. Write all tests to fail first (TDD).

---

```
File: frontend/src/components/mobile/WindowPicker.test.jsx
Lines: new file
Parallelism: independent (parallel with Group D implementation)
Description: Unit tests for WindowPicker. Write before implementing the component.
  [SR-1] Tests reflect the updated props interface: WindowPicker receives
  displayMonths (oldest-first, pre-computed), canGoOlder, canGoNewer, onGoOlder,
  onGoNewer, and hidden. Tests do NOT pass months+windowStart — that interface
  no longer exists.
  [SR-2] All tests use oldest-first order for displayMonths, matching the contract.
Details:
  - Imports: render, screen, fireEvent from @testing-library/react;
    vi, describe, it, expect from vitest; WindowPicker from './WindowPicker.jsx'

  - [SR-1][SR-2] Fixture: DISPLAY_MONTHS_6 — 6 months in OLDEST-FIRST order
    (this is what HeatmapView passes after reversing windowMonths):
      ['2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']
    Left-to-right rendered order: Oct 25, Nov 25, Dec 25, Jan 26, Feb 26, Mar 26.

  - Helper: renderPicker(overrides) — renders WindowPicker with sensible defaults:
      displayMonths=DISPLAY_MONTHS_6,
      canGoOlder=true,
      canGoNewer=true,
      onGoOlder=vi.fn(),
      onGoNewer=vi.fn(),
      hidden=false

  - Test cases:
      "renders nothing when hidden=true"
        — renderPicker({ hidden: true })
        — container.firstChild should be null
      "renders 6 month labels when hidden=false"
        — renderPicker() → screen should contain 6 label elements
      [SR-2] "renders displayMonths in left-to-right (oldest-first) order"
        — getAllByText with each label and check document order matches
          DISPLAY_MONTHS_6 array order (Oct 25, Nov 25, ... Mar 26 left to right)
        — This test explicitly guards against any internal reversal in WindowPicker.
      "left arrow (older) button is disabled when canGoOlder=false"
        — renderPicker({ canGoOlder: false })
        — getByLabelText('Show older months') should be disabled
      "right arrow (newer) button is disabled when canGoNewer=false"
        — renderPicker({ canGoNewer: false })
        — getByLabelText('Show newer months') should be disabled
      "left arrow click calls onGoOlder"
        — renderPicker({ canGoOlder: true })
        — fireEvent.click(getByLabelText('Show older months'))
        — onGoOlder called once; onGoNewer not called
      "right arrow click calls onGoNewer"
        — renderPicker({ canGoNewer: true })
        — fireEvent.click(getByLabelText('Show newer months'))
        — onGoNewer called once; onGoOlder not called
      "both arrows enabled when canGoOlder and canGoNewer are both true"
        — neither button is disabled
      "left arrow is not clickable when disabled (canGoOlder=false)"
        — fireEvent.click on disabled 'Show older months' button
        — onGoOlder should NOT be called
      "right arrow is not clickable when disabled (canGoNewer=false)"
        — fireEvent.click on disabled 'Show newer months' button
        — onGoNewer should NOT be called
```

---

```
File: frontend/src/components/mobile/HeatmapView.test.jsx
Lines: new file
Parallelism: independent (parallel with Group D implementation)
Description: Unit tests for HeatmapView. Cover rendering, collapse/expand, dot
  zone classification, and edge cases. Write before implementing.
Details:
  - Imports: render, screen, fireEvent from @testing-library/react;
    vi, describe, it, expect, beforeEach from vitest;
    HeatmapView from './HeatmapView.jsx'
  - Fixtures:
      MONTHS_8 — 8 months most-recent-first:
        ['2026-03-01','2026-02-01','2026-01-01','2025-12-01',
         '2025-11-01','2025-10-01','2025-09-01','2025-08-01']
      CATEGORIES — 4 categories:
        { category_id: 'c1', category_name: 'Groceries', group_type: 'expense',
          group_name: 'Food',
          months: {
            '2026-01-01': { actual: 100, budgeted: 500 },
            '2026-02-01': { actual: 430, budgeted: 500 },
            '2026-03-01': { actual: 510, budgeted: 500 },
          } }
        { category_id: 'c2', category_name: 'Restaurants', group_type: 'expense',
          group_name: 'Food', months: { '2026-01-01': { actual: 90, budgeted: 100 } } }
        { category_id: 'c3', category_name: 'Salary', group_type: 'income',
          group_name: 'Income', months: {} }
        { category_id: 'c4', category_name: 'Rent', group_type: 'expense',
          group_name: 'Housing', months: { '2026-02-01': { actual: 1500, budgeted: 2000 } } }
      CUSTOM_GROUPS — {} (empty, use Monarch group_name fallback)
  - Helper: renderHeatmap(props) — renders HeatmapView with defaults:
      categories=CATEGORIES, customGroups=CUSTOM_GROUPS, months=MONTHS_8
  - Test cases:
      "renders the grid with role='grid'"
        — screen.getByRole('grid') should be in document
      "renders column headers with role='columnheader'"
        — getAllByRole('columnheader') length === 6
      "renders one row per expense group (excludes income)"
        — CATEGORIES has 2 expense groups (Food, Housing) + 1 income
        — screen should contain group labels 'Food' and 'Housing' but not 'Income'
      [SR-3] "all groups start collapsed (aria-expanded=false on rowheader cells)"
        — [SR-10] Use queryAllByAttribute or screen.getAllByRole('rowheader')
          to find group header cells, then assert each has aria-expanded='false'.
          Do NOT use getAllByRole('button') — this catches WindowPicker arrows too.
          Use getAllByRole('rowheader') scoped to the grid instead.
      [SR-3] "clicking group rowheader toggles aria-expanded to true"
        — fireEvent.click(getAllByRole('rowheader')[0])
        — check aria-expanded becomes 'true'
      [SR-3] "clicking expanded group rowheader collapses it (aria-expanded back to false)"
        — click twice on the same rowheader, assert false after second click
      "category rows are in DOM even when collapsed (CSS-only collapse)"
        — queryByText('Groceries') should be in document even when collapsed
        — check aria-expanded is 'false', not DOM absence
      "renders 6 dot cells per group header row"
        — after clicking a rowheader to expand, count gridcell elements in that row
        — NOTE: query within the specific group row, not globally
        — each row has 6 dot cells (the rowheader label cell is not a gridcell)
      "renders WindowPicker when months.length > 6"
        — MONTHS_8 has 8 > 6 → WindowPicker should render
        — check for aria-label 'Show older months' button
      "does not render WindowPicker when months.length <= 6"
        — render with months of length 5 → no 'Show older months' button
      "dot has correct aria-label for safe zone category"
        — c1 in Jan 2026: 100/500 = 20% → safe zone
        — expand Food group, find a gridcell with aria-label containing 'Groceries'
          and 'within budget'
      "dot has correct aria-label for no-data month"
        — c1 has no data for months outside its fixture months
        — expand Food group, find a dot cell for c1 in a month with no data
        — aria-label contains 'no data'
      "renders 'No expense groups to display' when categories is empty"
        — renderHeatmap({ categories: [] })
        — screen.getByText(/No expense groups to display/i)
      "group header aggregate dot accounts for both categories in Food group"
        — In Jan 2026: c1 actual=100 budget=500, c2 actual=90 budget=100
          Total actual=190, total budgeted=600 → ratio=0.317 → 'safe'
        — The aggregate dot cell for Food/Jan should have aria-label 'within budget'
  - CRITICAL test pattern note: HeatmapGroupRow uses useState (expand/collapse).
    It must be an actual React component (not a render prop or callback), so it
    will work correctly in tests with fireEvent. If HeatmapGroupRow is defined
    incorrectly (inside a .map() callback), tests calling fireEvent.click will
    find the element but state will not update. Verify the implementation
    defines HeatmapGroupRow as a named component before the HeatmapView function.
  - COLLAPSE TESTING NOTE: Per gotchas.md — the collapse is CSS-only
    (grid-template-rows: 0fr). Never test collapse with toBeInTheDocument().
    Always test aria-expanded state or class names.
```

---

## Dependency Order

```
Phase 1 (run in parallel):
  - Group A: budgetUtils.js + budgetUtils.test.js
  - Group C: HorizontalSwipeContainer.jsx + HorizontalSwipeContainer.test.jsx
  - Group F (partial): WindowPicker.test.jsx (can start immediately — no code deps)

Phase 2 (after Group A completes; C and F can keep running):
  - Group B: MonthDetailView.jsx refactor
  - Group D: WindowPicker.jsx, WindowPicker.module.css,
             HeatmapView.jsx, HeatmapView.module.css
  - Group F (partial): HeatmapView.test.jsx (can start once D interfaces are confirmed)

Phase 3 (after B, C, D all complete):
  - Group E: MobileBudgetPage.jsx
  - MobileBudgetPage.module.css (no changes — verify only)
```

Parallel agent assignments:
- Agent 1: Group A (budgetUtils.js + budgetUtils.test.js)
- Agent 2: Group C (HorizontalSwipeContainer.jsx + test)
- Agent 3: Group F — WindowPicker.test.jsx (immediately) + HeatmapView.test.jsx (after D interfaces confirmed)
- Agent 4 (after A): Group B (MonthDetailView.jsx refactor)
- Agent 5 (after A): Group D (WindowPicker + HeatmapView components + CSS)
- Agent 6 (after B + C + D): Group E (MobileBudgetPage.jsx)

---

## Test Strategy

### TDD Order

1. Write `budgetUtils.test.js` additions (Group A tests) — fail immediately.
2. Write `WindowPicker.test.jsx` (Group F) — fail immediately.
3. Write `HeatmapView.test.jsx` (Group F) — fail immediately.
4. Update `HorizontalSwipeContainer.test.jsx` (Group C) — two existing tests will break from the aria-label change; fix them per Approach A before implementing.
5. Implement Group A (budgetUtils.js) → Group A tests pass.
6. Implement Group C (HorizontalSwipeContainer.jsx) → Group C tests pass.
7. Implement Group B (MonthDetailView.jsx) → run existing MonthDetailView tests and full suite → must all pass before proceeding.
8. Implement Group D (WindowPicker + HeatmapView) → Group F tests pass.
9. Implement Group E (MobileBudgetPage.jsx) → run full suite.

### Tests That Will Break and Need Updating

- `HorizontalSwipeContainer.test.jsx` lines 68-74 and 75-78: assertions for exact
  aria-label strings "Month detail view" and "Monthly summary view". These will
  fail after the labels prop change because the component now uses the fallback
  "View 1" / "View 2" when labels is not provided. Fix by updating the
  `renderContainer` helper to pass `labels={['Month detail view', 'Monthly summary view']}` —
  this is Approach A from the Group C details above. [SR-15]

- Any test in the broader suite that renders `MobileBudgetPage` with a mocked
  `HorizontalSwipeContainer` and asserts a specific number of children (2 panes)
  will need to be updated to expect 3 panes. Check for such tests in
  `frontend/src/pages/` test files before Phase 3.

### Happy Path Coverage

- `groupExpenses` correctly groups, filters, sorts categories (within groups and at group level).
- `formatMonthLabel` formats month strings correctly without timezone rollback.
- `WindowPicker` shows correct months in oldest-first order, arrow enable/disable, callbacks fire.
- `HeatmapView` renders correct group names, dots with correct zones, collapse/expand works.
- `MobileBudgetPage` with 3 panes renders all three views; swipe container has 3 tab buttons.

### Edge Cases

- `groupExpenses`: null categories, empty categories, null customGroups, category with null group_name (falls back to 'Other'), income and transfer categories excluded, group-level sort when all sort_orders are Infinity (alphabetical fallback).
- `WindowPicker`: hidden=true (renders null), both arrows at boundaries, canGoOlder=false, canGoNewer=false, click on disabled arrow does not call callback.
- `HeatmapView`: empty categories, all-null months data (all grey dots), group with single category (aggregate = item dots), month with no data for any category.
- `HorizontalSwipeContainer` labels prop: undefined labels (fallback), labels array shorter than children count (fallback for missing entries), labels provided explicitly.

### Error Cases

- `groupExpenses` with null `customGroups` — must not throw (treat as {}).
- `HeatmapView` with empty `months` array — `windowMonths` is empty; column headers show 0 columns; no crash.
- `WindowPicker` with `canGoOlder=false` and `canGoNewer=false` — both arrows disabled, no crash on click.

### Parallelism for Tests

- Group A tests, Group C tests, and Group F tests (WindowPicker + HeatmapView) can all be written and run in parallel — they have no implementation dependencies on each other before Phase 2.
- After Phase 2, all tests in the full suite (`make test`) must pass before Group E is implemented.

---

## Rollback Notes

All changes are additive except for the `MonthDetailView.jsx` refactor (Group B) and the `HorizontalSwipeContainer.jsx` label change (Group C).

- **Group A rollback**: Remove the `groupExpenses` and `formatMonthLabel` exports from `budgetUtils.js` and their tests. No other files are affected at this stage.
- **Group B rollback**: Restore `MonthDetailView.jsx` lines 82-138 from git. The extracted functions in `budgetUtils.js` are harmless to leave — they are just unused. Remove the import line added at the top.
- **Group C rollback**: Restore `HorizontalSwipeContainer.jsx` line 72 to the original hardcoded ternary: `aria-label={i === 0 ? 'Month detail view' : 'Monthly summary view'}`. Remove `labels` from prop destructuring and propTypes.
- **Group D rollback**: Delete the 4 new files: `WindowPicker.jsx`, `WindowPicker.module.css`, `HeatmapView.jsx`, `HeatmapView.module.css`.
- **Group E rollback**: Restore `MobileBudgetPage.jsx` lines 1-8 (remove HeatmapView import) and lines 83-103 (remove HeatmapView child and labels prop from HorizontalSwipeContainer).

No database migrations, backend changes, or API contract changes are involved. Rollback is purely a git revert of the affected frontend files.

---

## Staff Review Response

This section documents every finding from the staff review and what was changed or, where this plan disagrees, why.

### SR-1 — WindowPicker display order mismatch (Critical)
**Finding:** WindowPicker computed its own slice from `months` + `windowStart`, but HeatmapView reversed the slice for column display. The picker and grid would show months in opposite orders.

**Fix:** WindowPicker's props interface is entirely replaced. It now receives `displayMonths` (the already-reversed, oldest-first array), `canGoOlder`, `canGoNewer`, `onGoOlder`, and `onGoNewer`. HeatmapView computes all of these before rendering and passes them in. WindowPicker is now purely presentational — it renders `displayMonths` directly without any slicing or reversing. Both the column headers and the picker are driven by the same `displayMonths` array.

Files changed: `WindowPicker.jsx` props interface (Group D), `HeatmapView.jsx` WindowPicker invocation (Group D), `WindowPicker.test.jsx` fixtures and test cases (Group F).

### SR-2 — WindowPicker test contradicts itself (Critical)
**Finding:** Tests described labels as "Mar, Feb, Jan..." (most-recent-first) but claimed "displayMonths = reversed = oldest-first."

**Fix:** All WindowPicker tests use `DISPLAY_MONTHS_6` which is oldest-first: `['2025-10-01', ..., '2026-03-01']`. A dedicated test ("renders displayMonths in left-to-right oldest-first order") explicitly guards against any internal reversal in WindowPicker. The fixture naming and test descriptions are now consistent with the updated contract.

### SR-3 — ARIA grid violation (High)
**Finding:** `role="button"` inside `role="row"` inside `role="grid"` is invalid HTML/ARIA.

**Fix:** The group name cell now uses `role="rowheader"` with `tabIndex={0}`, `aria-expanded`, `onClick`, and `onKeyDown` handlers. `role="rowheader"` inside `role="row"` inside `role="grid"` is valid ARIA. The interactive behavior (toggle expand) is preserved via the keyboard/click handlers on the rowheader element itself.

Files changed: `HeatmapView.jsx` HeatmapGroupRow JSX (Group D), `HeatmapView.test.jsx` queries updated to use `getAllByRole('rowheader')` (Group F).

### SR-4 — Dot zone CSS class mismatch (High)
**Finding:** JSX used `styles[\`dot--${zone}\`]` which produces undefined CSS module lookups (CSS module keys are camelCase, not kebab-case with double dashes).

**Fix:** A `ZONE_CLASS_MAP` constant is defined at module level in `HeatmapView.jsx`:
```js
const ZONE_CLASS_MAP = {
  safe: styles.dotSafe,
  warning: styles.dotWarning,
  over: styles.dotOver,
  'no-budget': styles.dotMuted,
  'no-data': styles.dotFaint,
}
```
Dot className is now: `` `${styles.dot} ${ZONE_CLASS_MAP[zone] ?? styles.dotFaint}` ``.

### SR-5 — HeatmapGroupRow missing `months` prop (High)
**Finding:** HeatmapGroupRow was defined above HeatmapView but needed access to `displayMonths`, which was only in HeatmapView's scope.

**Fix:** HeatmapGroupRow explicitly receives `months` as a prop. HeatmapView passes `months={displayMonths}` to each `<HeatmapGroupRow>`. No closure access to outer scope state.

### SR-6 — MonthDetailView refactor re-runs grouping on month change (High)
**Finding:** A single useMemo with deps `[categories, effectiveGroups, selectedMonth]` would re-run the expensive `groupExpenses()` call on every month change, when grouping does not depend on the selected month.

**Fix:** Split into two useMemos:
1. `grouped` — deps `[categories, effectiveGroups]` — runs `groupExpenses()` only when data or groups change.
2. `groupedExpenses` — deps `[grouped, selectedMonth]` — extracts month values from the pre-grouped result.

### SR-7 — Category indent too aggressive (Medium)
**Finding:** `--sp-6` (24px) leaves only 86px for names in the 110px label column, causing excessive truncation.

**Fix:** Changed to `--sp-4` (16px), leaving 94px for category names. Updated in both `HeatmapView.jsx` item row description and `HeatmapView.module.css` `.categoryLabel` rule.

### SR-8 — Column header double padding (Medium)
**Finding:** `.columnHeaders` had horizontal padding that stacked with `.heatmap`'s padding, misaligning headers from group card rows.

**Fix:** Horizontal padding removed from `.columnHeaders`. Only `margin-bottom: var(--sp-2)` remains. The outer `.heatmap` container's `padding: var(--sp-4)` handles all page gutters uniformly.

### SR-9 — Default landing view not documented (Medium)
**Finding:** `useState(0)` silently made heatmap the default without any documentation that this was intentional.

**Fix:** Added explicit documentation at three points: (1) the Overview section states "This view is the default landing view for the Budgets tab on mobile" citing the product spec. (2) The MobileBudgetPage.jsx change updates the comment to `// 0 = heatmap (default landing view), 1 = detail, 2 = summary`. (3) HeatmapView.jsx includes a `[SR-9]` note on the default view intent.

### SR-10 — Test button query includes WindowPicker arrows (Medium)
**Finding:** `getAllByRole('button')` in HeatmapView tests would catch WindowPicker arrow buttons in addition to group header buttons, making the query ambiguous.

**Fix:** HeatmapView tests query group header cells via `getAllByRole('rowheader')` instead of `getAllByRole('button')`. This is consistent with the SR-3 fix (rowheader, not button). The WindowPicker arrow buttons remain as `role="button"` (in `<button>` elements) and are now unambiguously separate from group header cells.

### SR-11 — Zone-to-class mapping must distinguish no-data vs no-budget (Medium)
**Finding:** Both `no-budget` and `no-data` must map to distinct CSS classes.

**Fix:** Already covered by SR-4's `ZONE_CLASS_MAP`. `'no-budget'` maps to `styles.dotMuted` and `'no-data'` maps to `styles.dotFaint`. The CSS defines `.dotMuted: background: var(--text-muted)` and `.dotFaint: background: var(--text-faint)`, satisfying the design spec's two-tone distinction. Noted explicitly in both the HeatmapView.jsx and HeatmapView.module.css sections.

### SR-12 — Test should use `toEqual` not `toBe` for months reference (Low)
**Finding:** `toBe` checks reference equality; `months` may not preserve reference through useMemo or spread operations.

**Fix:** The `budgetUtils.test.js` test "preserves the full months object" uses `toEqual` (deep equality). Updated with a note explaining why `toBe` is inappropriate here.

**Note on disagreement with the finding title:** The finding says "use `toBe` not `toEqual`" but the explanation says the opposite. The correct fix is `toEqual` (deep equality), which is what this plan implements. The finding title appears to be a typo in the review.

### SR-13 — `formatMonthLabel` duplicated (Low)
**Finding:** Both WindowPicker and HeatmapView would define `formatMonthLabel` locally, duplicating the timezone-safe implementation.

**Fix:** `formatMonthLabel` is extracted as an exported function in `budgetUtils.js` (Group A). Both WindowPicker and HeatmapView import it from there. Tests for `formatMonthLabel` are added to `budgetUtils.test.js` including an explicit timezone-rollback guard.

### SR-14 — Groups not sorted at group level (Low)
**Finding:** `groupExpenses()` sorted categories within groups but did not sort the groups themselves, making group order non-deterministic.

**Fix:** Added group-level sorting as the final step in `groupExpenses()`: sort by minimum `sort_order` across the group's categories (ascending), with alphabetical `groupName` as a tiebreaker. When all `sort_order` values are `Infinity` (no custom groups), sort falls back to alphabetical group names, which is deterministic. Two new test cases added to `budgetUtils.test.js`.

### SR-15 — Existing HorizontalSwipeContainer tests semantic shift (Low)
**Finding:** The semantic change from hardcoded labels to prop-driven labels should be noted in the test file.

**Fix:** Added a comment directive in the `HorizontalSwipeContainer.test.jsx` section: the `renderContainer` helper update includes a comment noting that labels were previously hardcoded in the component and are now supplied as a prop, documenting the intentional semantic shift for future maintainers.
