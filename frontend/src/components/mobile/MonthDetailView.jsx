import { useState, useEffect, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import MonthDropdown from './MonthDropdown.jsx'
import BudgetGroup from './BudgetGroup.jsx'
import BudgetPill from './BudgetPill.jsx'
import GroupAssignmentSheet from './GroupAssignmentSheet.jsx'
import styles from './MonthDetailView.module.css'
import { groupExpenses } from '../../utils/budgetUtils.js'

/**
 * MonthDetailView
 *
 * View 1 of the mobile budget experience. Renders:
 *   - MonthDropdown (sticky month selector)
 *   - MonthSummaryHeader (inline aggregate totals — not a separate file)
 *   - List of BudgetGroup cards (collapsible, drag-to-reorder)
 *   - GroupAssignmentSheet (bottom sheet for cross-group category reassignment)
 *   - "Edit Groups" / "Done" button
 *
 * Data flow: categories prop contains the raw nested structure from the API
 * (cat.months[monthKey]). This component extracts flat { actual, budgeted }
 * for the selected month before passing data down to BudgetGroup / BudgetPill.
 * BudgetGroup and below have no knowledge of month selection.
 */
export default function MonthDetailView({
  months,
  categories,
  customGroups,
  selectedMonth,
  onMonthChange,
  isReorderMode,
  onEnterReorder,
  onExitReorder,
  isSaving,
}) {
  // ── Draft groups state (only meaningful during reorder mode) ────────────
  const [draftGroups, setDraftGroups] = useState(null)
  const [saveError,   setSaveError]   = useState(null)

  // When entering reorder mode, snapshot customGroups into draftGroups.
  // When exiting, clear draftGroups.
  useEffect(() => {
    if (isReorderMode) {
      setSaveError(null)
      // Deep copy so mutations to draftGroups do not affect the prop.
      setDraftGroups(JSON.parse(JSON.stringify(customGroups)))
    } else {
      setDraftGroups(null)
    }
  }, [isReorderMode]) // eslint-disable-line react-hooks/exhaustive-deps
  // Intentional: customGroups excluded — we snapshot at the moment of entering
  // reorder mode, not on every customGroups prop update.

  // ── GroupAssignmentSheet state ───────────────────────────────────────────
  const [sheetOpen,       setSheetOpen]       = useState(false)
  const [sheetCategoryId, setSheetCategoryId] = useState(null)

  // Ref to the move button that opened the sheet — used for focus return on close.
  const sheetTriggerRef = useRef(null)

  function handleMoveRequest(categoryId) {
    // Capture the element that triggered the sheet so we can return focus on close.
    sheetTriggerRef.current = document.activeElement
    setSheetCategoryId(categoryId)
    setSheetOpen(true)
  }

  function handleSheetClose() {
    setSheetOpen(false)
  }

  // ── Derive grouped, sorted categories via useMemo ───────────────────────
  // Steps:
  //   1. Filter to expense categories only (exclude income + transfer).
  //   2. Resolve effective group for each category (custom override or Monarch fallback).
  //   3. Extract flat { actual, budgeted } for the selected month.
  //   4. Group by effective group name.
  //   5. Sort within each group by sort_order (custom) then by category_name.

  // During reorder mode, use draftGroups so drag/move changes are visible immediately.
  const effectiveGroups = isReorderMode && draftGroups ? draftGroups : customGroups

  const grouped = useMemo(
    () => groupExpenses(categories, effectiveGroups),
    [categories, effectiveGroups]
  )

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

  // ── MonthSummaryHeader totals ────────────────────────────────────────────
  // Expense totals come from groupedExpenses (already filtered + flattened).
  // Income totals are computed separately from the raw categories array.
  const { totalExpenseActual, totalExpenseBudgeted,
          totalIncomeActual,  totalIncomeBudgeted } = useMemo(() => {
    if (!categories || !selectedMonth) {
      return { totalExpenseActual: 0, totalExpenseBudgeted: 0,
               totalIncomeActual: 0,  totalIncomeBudgeted: 0 }
    }

    let expActual = 0, expBudgeted = 0
    groupedExpenses.forEach(({ categories: cats }) => {
      cats.forEach(cat => {
        expActual   += cat.actual   ?? 0
        expBudgeted += cat.budgeted ?? 0
      })
    })

    let incActual = 0, incBudgeted = 0
    categories
      .filter(cat => cat.group_type === 'income')
      .forEach(cat => {
        const monthData = cat.months?.[selectedMonth]
        incActual   += monthData?.actual   ?? 0
        incBudgeted += monthData?.budgeted ?? 0
      })

    return {
      totalExpenseActual:   expActual,
      totalExpenseBudgeted: expBudgeted,
      totalIncomeActual:    incActual,
      totalIncomeBudgeted:  incBudgeted,
    }
  }, [categories, selectedMonth, groupedExpenses])

  // ── Derive sheet state from category data ────────────────────────────────
  const sheetCategory = useMemo(() => {
    if (!sheetCategoryId) return null
    for (const { groupName, categories: cats } of groupedExpenses) {
      const match = cats.find(c => c.category_id === sheetCategoryId)
      if (match) return { categoryName: match.category_name, currentGroup: groupName }
    }
    return null
  }, [sheetCategoryId, groupedExpenses])

  const availableGroups = useMemo(
    () => groupedExpenses.map(g => g.groupName),
    [groupedExpenses]
  )

  // ── Reorder handler (within-group) ───────────────────────────────────────
  function handleReorder(groupName, newCategoryIds) {
    if (!draftGroups) return

    // Rebuild the draftGroups entry for this group with the new sort_order.
    const updatedDraft = { ...draftGroups }
    updatedDraft[groupName] = newCategoryIds.map((id, idx) => ({
      category_id: id,
      sort_order:  idx,
    }))
    setDraftGroups(updatedDraft)
  }

  // ── Cross-group move handler (from GroupAssignmentSheet) ─────────────────
  function handleMove(targetGroup) {
    if (!draftGroups || !sheetCategoryId) return

    const updatedDraft = { ...draftGroups }

    // Remove from all existing groups.
    Object.keys(updatedDraft).forEach(g => {
      updatedDraft[g] = updatedDraft[g].filter(
        item => item.category_id !== sheetCategoryId
      )
    })

    // Remove now-empty custom groups.
    Object.keys(updatedDraft).forEach(g => {
      if (updatedDraft[g].length === 0) delete updatedDraft[g]
    })

    // Append to target group (or create it).
    if (!updatedDraft[targetGroup]) {
      updatedDraft[targetGroup] = []
    }
    updatedDraft[targetGroup] = [
      ...updatedDraft[targetGroup],
      { category_id: sheetCategoryId, sort_order: updatedDraft[targetGroup].length },
    ]

    setDraftGroups(updatedDraft)
    setSheetOpen(false)
  }

  // ── Done handler ─────────────────────────────────────────────────────────
  async function handleDone() {
    try {
      await onExitReorder(draftGroups)
    } catch (err) {
      // Stay in reorder mode on failure — user can retry.
      setSaveError(err?.message || 'Failed to save. Please try again.')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.view}>
      {/* Sticky month selector */}
      <div className={styles.dropdownWrapper}>
        <MonthDropdown
          months={months}
          selectedMonth={selectedMonth}
          onSelect={onMonthChange}
        />
      </div>

      {/* MonthSummaryHeader — inline, not a separate file */}
      <div className={styles.summaryHeader}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Total Expenses</span>
          <BudgetPill
            actual={totalExpenseActual}
            budgeted={totalExpenseBudgeted}
            size="standard"
          />
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Total Income</span>
          <BudgetPill
            actual={totalIncomeActual}
            budgeted={totalIncomeBudgeted}
            size="standard"
          />
        </div>
      </div>

      {/* Group list */}
      <div className={styles.groupList}>
        {groupedExpenses.map(({ groupName, categories: cats }) => (
          <BudgetGroup
            key={groupName}
            groupName={groupName}
            categories={cats}
            isReorderMode={isReorderMode}
            onReorder={handleReorder}
            onMoveRequest={handleMoveRequest}
          />
        ))}
      </div>

      {/* Save error (above the button, role=alert for screen readers) */}
      {saveError && (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      )}

      {/* Edit Groups / Done button */}
      <div className={styles.footer}>
        <button
          type="button"
          className={isReorderMode ? styles.doneBtn : styles.editBtn}
          onClick={isReorderMode ? handleDone : onEnterReorder}
          disabled={isSaving}
        >
          {isSaving
            ? <span className={styles.spinner} aria-hidden="true" />
            : isReorderMode
              ? 'Done'
              : 'Edit Groups'
          }
        </button>
      </div>

      {/* Group Assignment Sheet */}
      <GroupAssignmentSheet
        isOpen={sheetOpen}
        onClose={handleSheetClose}
        categoryName={sheetCategory?.categoryName ?? ''}
        currentGroup={sheetCategory?.currentGroup ?? null}
        availableGroups={availableGroups}
        onMove={handleMove}
        triggerRef={sheetTriggerRef}
      />
    </div>
  )
}

MonthDetailView.propTypes = {
  months:         PropTypes.arrayOf(PropTypes.string).isRequired,
  categories:     PropTypes.arrayOf(PropTypes.object).isRequired,
  customGroups:   PropTypes.object.isRequired,
  selectedMonth:  PropTypes.string,
  onMonthChange:  PropTypes.func.isRequired,
  isReorderMode:  PropTypes.bool,
  onEnterReorder: PropTypes.func.isRequired,
  onExitReorder:  PropTypes.func.isRequired,
  isSaving:       PropTypes.bool,
}

MonthDetailView.defaultProps = {
  selectedMonth:  null,
  isReorderMode:  false,
  isSaving:       false,
}
