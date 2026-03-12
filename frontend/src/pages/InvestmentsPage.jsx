import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchInvestmentsSummary,
  fetchInvestmentsHoldings,
  fetchInvestmentsPerformance,
} from '../api.js'
import InvestmentAccountsTable from '../components/InvestmentAccountsTable.jsx'
import InvestmentPerformanceChart from '../components/InvestmentPerformanceChart.jsx'
import AccountDetailHeader from '../components/AccountDetailHeader.jsx'
import HoldingsTable from '../components/HoldingsTable.jsx'
import AllocationChart from '../components/AllocationChart.jsx'
import styles from './InvestmentsPage.module.css'

function fmtFull(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtPct(n) {
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

export default function InvestmentsPage() {
  const { accountId } = useParams()
  const navigate = useNavigate()
  const isDrillDown = Boolean(accountId)

  const [summary, setSummary] = useState(null)
  const [performance, setPerformance] = useState(null)
  const [holdings, setHoldings] = useState(null)
  const [perfRange, setPerfRange] = useState('1y')
  const [loading, setLoading] = useState(true)
  const [perfLoading, setPerfLoading] = useState(false)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [perfError, setPerfError] = useState(null)
  const [holdingsError, setHoldingsError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Dashboard data loader — summary ONLY; performance is handled by the [perfRange] effect
  function loadDashboardData() {
    setError(null)
    setLoading(true)
    fetchInvestmentsSummary()
      .then((s) => {
        setSummary(s)
        setLastUpdated(new Date().toLocaleTimeString())
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // Performance is NOT fetched here. The [perfRange] effect handles all perf fetches.
  }

  // Performance re-fetch effect — handles initial load AND range changes
  // Fires on mount (perfRange = '1y') AND on every range selection
  useEffect(() => {
    if (isDrillDown) return
    setPerfError(null)
    setPerfLoading(true)
    fetchInvestmentsPerformance(perfRange)
      .then((p) => setPerformance(p))
      .catch((err) => setPerfError(err.message))
      .finally(() => setPerfLoading(false))
  }, [perfRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dashboard mount effect — re-fires when navigating back from drill-down
  // isDrillDown dep ensures re-fetch on transition from true → false
  useEffect(() => {
    if (!isDrillDown) loadDashboardData()
  }, [isDrillDown]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drill-down fetch effect
  useEffect(() => {
    if (!isDrillDown) return
    setHoldingsError(null)
    setHoldingsLoading(true)
    setHoldings(null)
    fetchInvestmentsHoldings(accountId)
      .then((h) => setHoldings(h))
      .catch((err) => {
        if (err.status === 404) setHoldingsError('not_found')
        else setHoldingsError(err.message)
      })
      .finally(() => setHoldingsLoading(false))
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stale banner: show when any account has stale_days >= 7
  const maxStaleDays = summary?.accounts?.length
    ? Math.max(...summary.accounts.map((a) => a.stale_days ?? 0))
    : 0
  const showStaleBanner = maxStaleDays >= 7

  const totals = summary?.totals

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Investments</h1>
        <div className={styles.pageActions}>
          {lastUpdated && !isDrillDown && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          {!isDrillDown && (
            <button className={styles.refreshBtn} onClick={loadDashboardData}>
              ↻ Refresh
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {loading && !isDrillDown && (
          <div className={styles.loading}>Loading…</div>
        )}
        {!loading && error && !isDrillDown && (
          <div className={styles.errorBox}>
            <div className={styles.errorTitle}>Could not load investments data</div>
            <div className={styles.errorDetail}>{error}</div>
          </div>
        )}
      </div>

      {!loading && !error && !isDrillDown && (
        <>
          {showStaleBanner && (
            <div className={styles.staleBanner}>
              Some accounts have not synced in {maxStaleDays} days. Data may be out of date.
            </div>
          )}

          {summary?.accounts?.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💼</div>
              <h2 className={styles.emptyHeading}>No investment accounts found</h2>
              <p className={styles.emptyBody}>
                Make sure your brokerage or retirement accounts are connected.{' '}
                <a href="/sync" onClick={(e) => { e.preventDefault(); navigate('/sync') }} className={styles.emptyLink}>
                  Sync accounts
                </a>
              </p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className={styles.summaryRow}>
                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>Portfolio Value</div>
                  <div className={styles.cardValue}>{fmtFull(totals?.current_value)}</div>
                  {totals?.total_return_dollars != null && (
                    <div className={`${styles.cardSub} ${totals.total_return_dollars >= 0 ? styles.positive : styles.negative}`}>
                      {totals.total_return_dollars > 0 ? '+' : ''}{fmtFull(totals.total_return_dollars)} total return
                    </div>
                  )}
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>Total Return</div>
                  {totals?.total_return_dollars == null ? (
                    <div className={`${styles.cardValue} ${styles.muted}`}>N/A</div>
                  ) : (
                    <div className={`${styles.cardValue} ${totals.total_return_dollars >= 0 ? styles.positive : styles.negative}`}>
                      {totals.total_return_dollars > 0 ? '+' : ''}{fmtFull(totals.total_return_dollars)}
                    </div>
                  )}
                  {totals?.total_return_pct != null && (
                    <div className={`${styles.cardSub} ${totals.total_return_pct >= 0 ? styles.positive : styles.negative}`}>
                      {fmtPct(totals.total_return_pct)}
                    </div>
                  )}
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.cardLabel}>
                    Est. CAGR{' '}
                    <span className={styles.tooltipTrigger}>
                      ?
                      <span className={styles.tooltipPopup}>
                        Compound Annual Growth Rate — annualized return based on account history.
                        Requires at least 30 days of data.
                      </span>
                    </span>
                  </div>
                  {totals?.cagr_pct == null ? (
                    <div className={`${styles.cardValue} ${styles.muted}`}>—</div>
                  ) : (
                    <div className={`${styles.cardValue} ${totals.cagr_pct >= 0 ? styles.positive : styles.negative}`}>
                      {fmtPct(totals.cagr_pct)}
                    </div>
                  )}
                </div>
              </div>

              <InvestmentPerformanceChart
                performance={performance}
                loading={performance == null && !perfError}
                error={perfError}
                range={perfRange}
                onRangeChange={setPerfRange}
                perfLoading={perfLoading}
              />

              <InvestmentAccountsTable
                accounts={summary?.accounts}
                loading={false}
              />
            </>
          )}
        </>
      )}

      {isDrillDown && (
        <>
          {holdingsLoading && (
            <div className={styles.loading}>Loading holdings…</div>
          )}
          {!holdingsLoading && holdingsError === 'not_found' && (
            <div className={styles.errorBox}>
              <div className={styles.errorTitle}>Account not found</div>
              <div className={styles.errorDetail}>
                This account may not be an investment account or may no longer exist.
              </div>
            </div>
          )}
          {!holdingsLoading && holdingsError && holdingsError !== 'not_found' && (
            <div className={styles.errorBox}>
              <div className={styles.errorTitle}>Could not load holdings</div>
              <div className={styles.errorDetail}>{holdingsError}</div>
            </div>
          )}
          {!holdingsLoading && !holdingsError && holdings && (
            <>
              <AccountDetailHeader
                account={holdings.account}
                totals={holdings.totals}
              />
              <div className={styles.drillDownGrid}>
                <HoldingsTable
                  holdings={holdings.holdings}
                  accountName={holdings.account?.name}
                  loading={false}
                />
                <AllocationChart
                  allocation={holdings.allocation}
                  totals={holdings.totals}
                  accountName={holdings.account?.name}
                  loading={false}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
