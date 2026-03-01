import { useEffect, useState } from 'react'
import BudgetChart from '../components/BudgetChart.jsx'
import BudgetTable from '../components/BudgetTable.jsx'
import AIAnalysisPanel from '../components/AIAnalysisPanel.jsx'
import styles from './BudgetPage.module.css'
import { fetchBudgetHistory } from '../api.js'

const RANGE_OPTIONS = [3, 6, 12]

export default function BudgetPage() {
  const [months,       setMonths]       = useState(12)
  const [budgetData,   setBudgetData]   = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchBudgetHistory(months)
      .then(data => setBudgetData(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [months])

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
