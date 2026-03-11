import { useEffect, useState, useCallback } from 'react'
import styles from './NetWorthPage.module.css'
import StatsCards from '../components/StatsCards.jsx'
import NetWorthChart from '../components/NetWorthChart.jsx'
import AccountsBreakdown from '../components/AccountsBreakdown.jsx'
import TypeStackedChart from '../components/TypeStackedChart.jsx'
import RetirementPanel from '../components/RetirementPanel.jsx'
import MilestoneHeroCard from '../components/MilestoneHeroCard.jsx'
import { fetchNetworthStats, fetchNetworthHistory, fetchAccountsSummary, fetchNetworthByType, fetchRetirement, saveRetirement } from '../api.js'

export default function NetWorthPage() {
  const [stats,       setStats]       = useState(null)
  const [history,     setHistory]     = useState(null)
  const [accounts,    setAccounts]    = useState(null)
  const [typeData,    setTypeData]    = useState(null)
  const [retirement,  setRetirement]  = useState(null)
  const [error,       setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [retirementLoading, setRetirementLoading] = useState(false)
  const [retirementError, setRetirementError] = useState(null)

  function loadDashboardData() {
    setError(null)
    setLoading(true)
    Promise.all([
      fetchNetworthStats(),
      fetchNetworthHistory(),
      fetchAccountsSummary(),
      fetchNetworthByType(),
      fetchRetirement().catch(() => ({ exists: false })),
    ])
      .then(([s, h, a, t, ret]) => {
        setStats(s)
        setHistory(h)
        setAccounts(a)
        setTypeData(t)
        setRetirement(ret)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  const handleSaveRetirement = useCallback(async (data) => {
    setRetirementLoading(true)
    setRetirementError(null)
    try {
      await saveRetirement(data)
      const updated = await fetchRetirement()
      setRetirement(updated)
    } catch (err) {
      setRetirementError(err.message || 'Failed to save retirement settings')
    } finally {
      setRetirementLoading(false)
    }
  }, [])

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
            cd monarch-dashboard/backend{'\n'}
            pip install -r requirements.txt{'\n'}
            python app.py
          </pre>
          <div className={styles.errorDetail}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          <StatsCards stats={stats} />
          <NetWorthChart history={history} />
          <TypeStackedChart data={typeData} />
          <MilestoneHeroCard typeData={typeData} retirement={retirement} />
          <AccountsBreakdown accounts={accounts} />
          <RetirementPanel
            data={retirement}
            onSave={handleSaveRetirement}
            loading={retirementLoading}
            error={retirementError}
            typeData={typeData}
          />
        </>
      )}
    </div>
  )
}
