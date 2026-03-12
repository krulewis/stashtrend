import { useEffect, useState } from 'react'
import styles from './NetWorthPage.module.css'
import StatsCards from '../components/StatsCards.jsx'
import AccountsBreakdown from '../components/AccountsBreakdown.jsx'
import TypeStackedChart from '../components/TypeStackedChart.jsx'
import { fetchNetworthStats, fetchAccountsSummary, fetchNetworthByType } from '../api.js'

export default function NetWorthPage() {
  const [stats,       setStats]       = useState(null)
  const [accounts,    setAccounts]    = useState(null)
  const [typeData,    setTypeData]    = useState(null)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading,     setLoading]     = useState(true)

  function loadDashboardData() {
    setError(null)
    setLoading(true)
    Promise.all([
      fetchNetworthStats(),
      fetchAccountsSummary(),
      fetchNetworthByType(),
    ])
      .then(([s, a, t]) => {
        setStats(s)
        setAccounts(a)
        setTypeData(t)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Net Worth</h1>
        <div className={styles.pageActions}>
          {lastUpdated && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          <button className={styles.refreshBtn} onClick={loadDashboardData}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div data-testid="networth-loading" className={styles.loading}>
          Loading…
        </div>
      )}

      {!loading && error && (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>⚠ Could not connect to the API</div>
          <div className={styles.errorMsg}>Make sure the backend is running:</div>
          <pre className={styles.errorCode}>
            cd stashtrend/backend{'\n'}
            pip install -r requirements.txt{'\n'}
            python app.py
          </pre>
          <div className={styles.errorDetail}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          <StatsCards stats={stats} />
          <TypeStackedChart data={typeData} />
          <AccountsBreakdown accounts={accounts} />
        </>
      )}
    </div>
  )
}
