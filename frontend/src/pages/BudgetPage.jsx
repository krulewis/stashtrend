import { useEffect, useState, useMemo } from 'react'
import BudgetChart from '../components/BudgetChart.jsx'
import BudgetTable from '../components/BudgetTable.jsx'
import AIAnalysisPanel from '../components/AIAnalysisPanel.jsx'
import styles from './BudgetPage.module.css'
import { fetchBudgetHistory, fetchCustomGroups } from '../api.js'
import { useResponsive } from '../hooks/useResponsive.js'
import MobileBudgetPage from './MobileBudgetPage.jsx'

const RANGE_OPTIONS = [3, 6, 12]

export default function BudgetPage() {
  const [months,           setMonths]           = useState(12)
  const [budgetData,       setBudgetData]       = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState(null)
  const [customGroupsData, setCustomGroupsData] = useState({})

  const { isMobile } = useResponsive()

  // Desktop budget history fetch — skipped on mobile to avoid redundant network call.
  // isMobile is intentionally excluded from deps: it is a guard, not a trigger.
  // Adding it would cause a re-fetch on every window resize crossing 768px.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isMobile) return
    setLoading(true)
    setError(null)
    fetchBudgetHistory(months)
      .then(data => setBudgetData(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [months])

  // Mobile data fetch — fetches budgetData and customGroups together via Promise.all.
  // Runs once when isMobile becomes true. Custom groups failure is non-fatal;
  // budget history failure is shown via the error state.
  useEffect(() => {
    if (!isMobile) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetchBudgetHistory(12),
      fetchCustomGroups().catch(() => ({ groups: {} })),
    ])
      .then(([data, groupsResult]) => {
        setBudgetData(data)
        setCustomGroupsData(groupsResult.groups ?? {})
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [isMobile]) // eslint-disable-line react-hooks/exhaustive-deps
  // Always fetch 12 months for mobile — the MonthlySummaryView range selector
  // slices client-side, so we need the full data set. months state is excluded
  // because mobile has no exposed range control for the detail view.

  const incomeTotalsByMonth = useMemo(() => {
    if (isMobile || !budgetData?.categories) return null
    const incomeCategories = budgetData.categories.filter(cat => cat.group_type === 'income')
    if (incomeCategories.length === 0) return null
    const totals = {}
    for (const cat of incomeCategories) {
      for (const [month, values] of Object.entries(cat.months ?? {})) {
        totals[month] = (totals[month] ?? 0) + (values.actual ?? 0)
      }
    }
    return totals
  }, [budgetData, isMobile])

  // Mobile path — all hooks are called above; conditional return is safe here.
  if (isMobile) {
    return (
      <MobileBudgetPage
        budgetData={budgetData}
        customGroups={customGroupsData}
        loading={loading}
        error={error}
        onGroupsSaved={setCustomGroupsData}
      />
    )
  }

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Budget vs Actuals</h2>
        <div className={styles.rangeButtons}>
          {RANGE_OPTIONS.map(n => (
            <button
              key={n}
              className={`${styles.rangeBtn} ${months === n ? styles.rangeBtnActive : ''}`}
              onClick={() => setMonths(n)}
            >
              {n}M
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && <div className={styles.loadingMsg}>Loading budget data…</div>}

      {/* ── Error ── */}
      {error && (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>⚠ Error loading budget data</div>
          <div className={styles.errorDetail}>{error}</div>
        </div>
      )}

      {/* ── Content ── */}
      {!loading && !error && budgetData && (
        <>
          <BudgetChart
            months={budgetData.months}
            totalsByMonth={budgetData.totals_by_month}
            incomeTotalsByMonth={incomeTotalsByMonth}
          />
          <BudgetTable
            months={budgetData.months}
            categories={budgetData.categories}
          />
        </>
      )}

      <AIAnalysisPanel />
    </div>
  )
}
