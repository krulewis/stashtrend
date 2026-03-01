import { useEffect, useState } from 'react'
import styles from './App.module.css'
import StatsCards from './components/StatsCards.jsx'
import NetWorthChart from './components/NetWorthChart.jsx'
import AccountsBreakdown from './components/AccountsBreakdown.jsx'
import GroupsPage from './pages/GroupsPage.jsx'
import BudgetPage from './pages/BudgetPage.jsx'
import SyncPage from './pages/SyncPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import { fetchNetworthStats, fetchNetworthHistory, fetchAccountsSummary } from './api.js'

const TABS = [
  { id: 'networth', label: '📈  Net Worth' },
  { id: 'groups',   label: '⬡  Account Groups' },
  { id: 'budgets',  label: '💰  Budgets' },
  { id: 'sync',     label: '🔄  Sync Data' },
]

export default function App() {
  const [configured, setConfigured] = useState(null) // null=loading, false=needs setup, true=ready
  const [activeTab, setActiveTab] = useState('networth')

  // Net Worth tab data
  const [stats,    setStats]    = useState(null)
  const [history,  setHistory]  = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [error,    setError]    = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // NOTE: This app is designed for local-only use (localhost). It relies on the
  // /api/setup/status configured flag rather than session-based authentication,
  // because all data stays on the user's own machine. If ever exposed beyond
  // localhost, add token or session authentication before the setup check.
  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(false))
  }, [])

  function loadDashboardData() {
    setError(null)
    Promise.all([
      fetchNetworthStats(),
      fetchNetworthHistory(),
      fetchAccountsSummary(),
    ])
      .then(([stats, history, accounts]) => {
        setStats(stats)
        setHistory(history)
        setAccounts(accounts)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    if (configured !== true) return
    loadDashboardData()
  }, [configured])

  if (configured === null) return <div className={styles.loading}>Loading…</div>
  if (configured === false) return <SetupPage onComplete={() => setConfigured(true)} />

  return (
    <div className={styles.root}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>◈</div>
          <div>
            <div className={styles.appName}>Stashtrend</div>
            <div className={styles.appSub}>Personal Finance Intelligence Powered by Monarch Money Data</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {lastUpdated && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          <button className={styles.refreshBtn} onClick={loadDashboardData}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <nav className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Main content ────────────────────────────────────── */}
      <main className={styles.main}>
        {activeTab === 'networth' && (
          <>
            {error ? (
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
            ) : (
              <>
                <StatsCards stats={stats} />
                <NetWorthChart history={history} />
                <AccountsBreakdown accounts={accounts} />
              </>
            )}
          </>
        )}

        {activeTab === 'groups' && <GroupsPage />}

        {activeTab === 'budgets' && <BudgetPage />}

        {activeTab === 'sync' && <SyncPage />}
      </main>
    </div>
  )
}
