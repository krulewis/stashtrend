import { useState, useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import { saveCustomGroups } from '../api.js'
import HorizontalSwipeContainer from '../components/mobile/HorizontalSwipeContainer.jsx'
import MonthDetailView from '../components/mobile/MonthDetailView.jsx'
import MonthlySummaryView from '../components/mobile/MonthlySummaryView.jsx'
import HeatmapView from '../components/mobile/HeatmapView.jsx'
import styles from './MobileBudgetPage.module.css'

export default function MobileBudgetPage({
  budgetData,
  customGroups,
  loading,
  error,
  onGroupsSaved,
}) {
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [activeView,    setActiveView]    = useState(0)   // 0 = heatmap (default landing view), 1 = detail, 2 = summary
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [isSaving,      setIsSaving]      = useState(false)

  // Auto-select the most recent month when budgetData arrives.
  // budgetData.months is sorted oldest-first; last element = most recent.
  useEffect(() => {
    if (budgetData?.months?.length > 0 && !selectedMonth) {
      setSelectedMonth(budgetData.months[budgetData.months.length - 1])
    }
  }, [budgetData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse the months array so MonthDropdown shows most-recent first.
  const monthsDesc = useMemo(
    () => (budgetData?.months ? [...budgetData.months].reverse() : []),
    [budgetData]
  )

  // Called when the user taps "Done" after reordering groups.
  async function handleDone(finalGroups) {
    setIsSaving(true)
    try {
      await saveCustomGroups({ groups: finalGroups })
      onGroupsSaved(finalGroups)
      setIsReorderMode(false)
    } catch (err) {
      // Re-throw so MonthDetailView's catch block can surface the error to the user.
      throw err
    } finally {
      setIsSaving(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.spinner} aria-hidden="true" />
        Loading budget data…
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.errorBox}>
        <div className={styles.errorTitle}>Error loading budget data</div>
        <div className={styles.errorDetail}>{error}</div>
      </div>
    )
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!budgetData?.months?.length) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>No budget data found</p>
        <p className={styles.emptySubtitle}>Sync your account to load budget data.</p>
      </div>
    )
  }

  // ── Content ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <HorizontalSwipeContainer
        activeIndex={activeView}
        onIndexChange={setActiveView}
        isLocked={isReorderMode}
        labels={['Heatmap view', 'Month detail view', 'Monthly summary view']}
      >
        <HeatmapView
          categories={budgetData.categories}
          customGroups={customGroups}
          months={monthsDesc}
        />
        <MonthDetailView
          months={monthsDesc}
          categories={budgetData.categories}
          customGroups={customGroups}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          isReorderMode={isReorderMode}
          onEnterReorder={() => setIsReorderMode(true)}
          onExitReorder={handleDone}
          isSaving={isSaving}
        />
        <MonthlySummaryView
          months={monthsDesc}
          categories={budgetData.categories}
        />
      </HorizontalSwipeContainer>
    </div>
  )
}

MobileBudgetPage.propTypes = {
  budgetData:    PropTypes.object,
  customGroups:  PropTypes.object,
  loading:       PropTypes.bool,
  error:         PropTypes.string,
  onGroupsSaved: PropTypes.func,
}

MobileBudgetPage.defaultProps = {
  budgetData:    null,
  customGroups:  {},
  loading:       false,
  error:         null,
  onGroupsSaved: () => {},
}
