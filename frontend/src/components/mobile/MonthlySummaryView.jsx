import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import BudgetPill from './BudgetPill.jsx'
import styles from './MonthlySummaryView.module.css'

const RANGE_OPTIONS = [3, 6, 12]

function formatMonthLabel(monthStr) {
  // monthStr format: "YYYY-MM" or "YYYY-MM-DD" — parse as UTC to avoid timezone shift
  const [year, month] = monthStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function MonthlySummaryView({ months, categories }) {
  const [rangeMonths, setRangeMonths] = useState(6)

  // Slice to the most recent N months (months is already sorted most-recent-first)
  const displayMonths = useMemo(() => months.slice(0, rangeMonths), [months, rangeMonths])

  // Filter to expense categories only — exclude income and transfers
  const expenseCategories = useMemo(
    () => categories.filter(
      (cat) => cat.group_type !== 'income' && cat.group_type !== 'transfer'
    ),
    [categories]
  )

  // Compute aggregate actual/budgeted for a given month string
  function computeMonthTotals(monthStr) {
    let totalActual = 0
    let totalBudgeted = 0
    let hasAny = false

    for (const cat of expenseCategories) {
      const entry = cat.months?.[monthStr]
      if (!entry) continue
      hasAny = true
      if (entry.actual != null)   totalActual   += entry.actual
      if (entry.budgeted != null) totalBudgeted += entry.budgeted
    }

    if (!hasAny) return null
    return { totalActual, totalBudgeted }
  }

  if (months.length === 0) {
    return (
      <div className={styles.emptyState}>
        No budget data available
      </div>
    )
  }

  return (
    <div className={styles.view}>
      {/* ─── Range dropdown ─────────────────────────────────────────────── */}
      <div className={styles.rangeRow}>
        <label htmlFor="range-select" className={styles.rangeLabel}>Show:</label>
        <select
          id="range-select"
          className={styles.rangeSelect}
          value={rangeMonths}
          onChange={(e) => setRangeMonths(Number(e.target.value))}
        >
          {RANGE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} months</option>
          ))}
        </select>
      </div>

      {/* ─── Summary rows ───────────────────────────────────────────────── */}
      <div className={styles.rowList}>
        {displayMonths.map((monthStr) => {
          const totals = computeMonthTotals(monthStr)
          if (!totals) return null

          return (
            <div key={monthStr} className={styles.summaryRow}>
              <span className={styles.monthLabel}>{formatMonthLabel(monthStr)}</span>
              <BudgetPill
                actual={totals.totalActual}
                budgeted={totals.totalBudgeted}
                size="summary"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

MonthlySummaryView.propTypes = {
  months:     PropTypes.arrayOf(PropTypes.string).isRequired,
  categories: PropTypes.arrayOf(PropTypes.object).isRequired,
}
