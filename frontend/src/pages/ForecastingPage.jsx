import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import styles from './ForecastingPage.module.css'
import ForecastingChart from '../components/ForecastingChart.jsx'
import ForecastingControls from '../components/ForecastingControls.jsx'
import ForecastingSummary from '../components/ForecastingSummary.jsx'
import ForecastingSetup from '../components/ForecastingSetup.jsx'
import MilestoneCardsView from '../components/MilestoneCardsView.jsx'
import RetirementPanel from '../components/RetirementPanel.jsx'
import { fetchNetworthByType, fetchRetirement, saveRetirement } from '../api.js'
import {
  getInvestableCapital,
  computeBlendedCAGR,
  computeNestEgg,
  generateProjectionSeries,
  mergeHistoryWithProjection,
  calculateContributionToTarget,
} from '../utils/retirementMath.js'
import { fmtFull } from '../components/chartUtils.jsx'
import { useMilestoneData } from '../hooks/useMilestoneData.js'

export default function ForecastingPage() {
  const [typeData,     setTypeData]     = useState(null)
  const [retirement,   setRetirement]   = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [lastUpdated,  setLastUpdated]  = useState(null)

  const [contribution,        setContribution]        = useState(0)
  const [returnRate,          setReturnRate]           = useState(7)
  const [defaultContribution, setDefaultContribution] = useState(0)
  const [defaultReturnRate,   setDefaultReturnRate]   = useState(7)

  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError,   setSetupError]   = useState(null)

  const [retirementLoading, setRetirementLoading] = useState(false)
  const [retirementError,   setRetirementError]   = useState(null)
  const retirementRef = useRef(null)

  function loadData() {
    setError(null)
    setLoading(true)
    Promise.all([
      fetchNetworthByType(),
      fetchRetirement().catch(() => ({ exists: false })),
    ])
      .then(([td, ret]) => {
        setTypeData(td)
        setRetirement(ret)
        setLastUpdated(new Date().toLocaleTimeString())
        // Initialize slider defaults from saved settings or blended CAGR
        const blendedCAGR = computeBlendedCAGR(td)
        const savedReturn = ret?.exists ? (ret.expected_return_pct ?? null) : null
        const initReturn = savedReturn ?? blendedCAGR
        const clampedReturn = Math.min(15, Math.max(0, initReturn))
        const initContrib = ret?.exists ? (ret.monthly_contribution ?? 0) : 0
        setContribution(initContrib)
        setReturnRate(clampedReturn)
        setDefaultContribution(initContrib)
        setDefaultReturnRate(clampedReturn)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = useCallback(() => {
    setContribution(defaultContribution)
    setReturnRate(defaultReturnRate)
  }, [defaultContribution, defaultReturnRate])

  const handleSetupSave = useCallback(async (formData) => {
    setSetupLoading(true)
    setSetupError(null)
    try {
      await saveRetirement(formData)          // parent owns the save call
      const updated = await fetchRetirement() // re-fetch to get server-canonical data
      setRetirement(updated)
      // Re-initialize slider defaults from saved data
      const blendedCAGR = computeBlendedCAGR(typeData)
      const savedReturn = updated?.exists ? (updated.expected_return_pct ?? null) : null
      const initReturn = savedReturn ?? blendedCAGR
      const clampedReturn = Math.min(15, Math.max(0, initReturn))
      const initContrib = updated?.exists ? (updated.monthly_contribution ?? 0) : 0
      setContribution(initContrib)
      setReturnRate(clampedReturn)
      setDefaultContribution(initContrib)
      setDefaultReturnRate(clampedReturn)
    } catch (err) {
      setSetupError(err.message || 'Failed to save')
    } finally {
      setSetupLoading(false)
    }
  }, [typeData])

  const handleEditSettings = useCallback(() => {
    retirementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleSaveRetirement = useCallback(async (data) => {
    setRetirementLoading(true)
    setRetirementError(null)
    try {
      await saveRetirement(data)
      const updated = await fetchRetirement()
      setRetirement(updated)
      // Re-derive slider defaults from updated settings (mirrors handleSetupSave logic)
      const blendedCAGR = computeBlendedCAGR(typeData)
      const savedReturn = updated?.exists ? (updated.expected_return_pct ?? null) : null
      const initReturn = savedReturn ?? blendedCAGR
      const clampedReturn = Math.min(15, Math.max(0, initReturn))
      const initContrib = updated?.exists ? (updated.monthly_contribution ?? 0) : 0
      setContribution(initContrib)
      setReturnRate(clampedReturn)
      setDefaultContribution(initContrib)
      setDefaultReturnRate(clampedReturn)
    } catch (err) {
      setRetirementError(err.message || 'Failed to save retirement settings')
    } finally {
      setRetirementLoading(false)
    }
  }, [typeData])

  // ── Derived values ────────────────────────────────────────────────────────

  const investableCapital = useMemo(() => getInvestableCapital(typeData), [typeData])

  const blendedCAGR = useMemo(() => computeBlendedCAGR(typeData), [typeData])

  const historicalSeries = useMemo(() => {
    if (!typeData?.series?.length) return []
    return typeData.series.map(pt => ({
      date: pt.date,
      net_worth: (pt.Retirement ?? 0) + (pt.Brokerage ?? 0),
    }))
  }, [typeData])

  const years = useMemo(() => {
    if (!retirement?.exists) return null
    const y = (retirement.target_retirement_age ?? 0) - (retirement.current_age ?? 0)
    return y > 0 ? y : null
  }, [retirement])

  const targetYear = useMemo(() => {
    if (!years) return null
    return new Date().getFullYear() + years
  }, [years])

  const nestEgg = useMemo(() => {
    if (!retirement?.exists) return null
    return computeNestEgg(
      retirement.desired_annual_income ?? null,
      retirement.social_security_annual ?? 0,
      retirement.withdrawal_rate_pct ?? 4.0
    )
  }, [retirement])

  // Variant contributions — rounded to nearest $100 step
  const plus10Contrib  = useMemo(() => Math.round(contribution * 1.1 / 100) * 100, [contribution])
  const minus10Contrib = useMemo(() => Math.round(contribution * 0.9 / 100) * 100, [contribution])

  // Suppress variants when $0 contribution or when rounded values equal baseline
  const showVariants = useMemo(() =>
    contribution > 0 && plus10Contrib !== contribution && minus10Contrib !== contribution,
    [contribution, plus10Contrib, minus10Contrib]
  )

  const baselineProjection = useMemo(() => {
    if (investableCapital == null || !years) return []
    return generateProjectionSeries({
      currentNetWorth: investableCapital,
      monthlyContribution: contribution,
      annualReturnPct: returnRate,
      years,
    })
  }, [investableCapital, contribution, returnRate, years])

  const plus10Projection = useMemo(() => {
    if (!showVariants || investableCapital == null || !years) return []
    return generateProjectionSeries({
      currentNetWorth: investableCapital,
      monthlyContribution: plus10Contrib,
      annualReturnPct: returnRate,
      years,
    })
  }, [showVariants, investableCapital, plus10Contrib, returnRate, years])

  const minus10Projection = useMemo(() => {
    if (!showVariants || investableCapital == null || !years) return []
    return generateProjectionSeries({
      currentNetWorth: investableCapital,
      monthlyContribution: minus10Contrib,
      annualReturnPct: returnRate,
      years,
    })
  }, [showVariants, investableCapital, minus10Contrib, returnRate, years])

  // Merge all projection data into one dataset for the chart
  const mergedChartData = useMemo(() => {
    if (!baselineProjection.length && !historicalSeries.length) return []
    let merged = mergeHistoryWithProjection(historicalSeries, baselineProjection)
    if (showVariants) {
      const plus10Map  = new Map(plus10Projection.map(p  => [p.date, p.projected_net_worth]))
      const minus10Map = new Map(minus10Projection.map(p => [p.date, p.projected_net_worth]))
      merged = merged.map(pt => ({
        ...pt,
        projected_plus10:  plus10Map.get(pt.date)  ?? null,
        projected_minus10: minus10Map.get(pt.date) ?? null,
      }))
    }
    return merged
  }, [historicalSeries, baselineProjection, plus10Projection, minus10Projection, showVariants])

  const projectedAtRetirement = useMemo(() =>
    baselineProjection.length
      ? baselineProjection[baselineProjection.length - 1].projected_net_worth
      : null,
    [baselineProjection]
  )

  const neededContribution = useMemo(() => {
    if (!nestEgg || projectedAtRetirement == null || projectedAtRetirement >= nestEgg || !years) {
      return null
    }
    return calculateContributionToTarget({
      currentNetWorth: investableCapital ?? 0,
      currentContribution: contribution,
      annualReturnPct: returnRate,
      years,
      targetAmount: nestEgg,
    })
  }, [nestEgg, projectedAtRetirement, years, investableCapital, contribution, returnRate])

  // ── CAGR warning and defaults note ───────────────────────────────────────

  const cagrWarning = useMemo(() => {
    if (blendedCAGR < 0) {
      return 'Your historical return rate is negative. Projections assume continued decline unless adjusted.'
    }
    if (blendedCAGR > 15) {
      return `Your historical CAGR of ${blendedCAGR.toFixed(1)}% exceeds the slider range. Adjust manually if needed.`
    }
    return null
  }, [blendedCAGR])

  const defaultsNote = useMemo(() => {
    const usedBlended = !(retirement?.exists && retirement.expected_return_pct != null)
    return usedBlended ? 'Default based on your historical return rate.' : null
  }, [retirement])

  // Cap at $50,000 to keep the slider step count manageable (max ~500 positions at $100 step)
  const contributionMax = useMemo(() =>
    Math.min(50000, Math.max(10000, (defaultContribution ?? 0) * 2)),
    [defaultContribution]
  )

  // ── Edge case flags ───────────────────────────────────────────────────────

  // null means no series data (API returned no typeData or empty series)
  // 0 means accounts exist but have $0 balance — still show the chart at $0
  const hasNoData = investableCapital == null

  const isRetirementTargetInvalid = useMemo(() => {
    if (!retirement?.exists) return false
    const y = (retirement.target_retirement_age ?? 0) - (retirement.current_age ?? 0)
    return y <= 0
  }, [retirement])

  // ── Screen reader summary ─────────────────────────────────────────────────

  const isOnTrack = projectedAtRetirement != null && nestEgg != null && projectedAtRetirement >= nestEgg

  const srSummary = projectedAtRetirement != null
    ? `Projected investable capital at retirement: ${fmtFull(projectedAtRetirement)}. ${isOnTrack ? 'On track' : 'Off track'}.`
    : ''

  const milestoneData = useMilestoneData(typeData, retirement)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Milestones</h1>
        <div className={styles.pageActions}>
          {lastUpdated && (
            <span className={styles.updatedAt}>Updated at {lastUpdated}</span>
          )}
          <button className={styles.refreshBtn} onClick={loadData}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div data-testid="forecasting-loading" className={styles.loading}>
          Loading…
        </div>
      )}

      {/* Error */}
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
          <button className={styles.retryBtn} onClick={loadData}>Try Again</button>
        </div>
      )}

      {/* Main content — only when loaded and no error */}
      {!loading && !error && (
        <div className={styles.content}>
          {/* First-time setup gate */}
          {!retirement?.exists && (
            <ForecastingSetup
              onSave={handleSetupSave}
              loading={setupLoading}
              error={setupError}
            />
          )}

          {/* Invalid target age edge case */}
          {isRetirementTargetInvalid && (
            <div className={styles.infoBox} data-testid="invalid-age-warning">
              Your target retirement age is at or before your current age. Update your retirement settings.
            </div>
          )}

          {/* Empty state — no series data */}
          {!isRetirementTargetInvalid && hasNoData && typeData != null && (
            <div className={styles.emptyState} data-testid="no-investment-accounts">
              No investment data available. Sync your retirement or brokerage accounts to see projections.
            </div>
          )}

          {/* Summary → MilestoneCardsView → Chart → Controls → RetirementPanel */}
          {!isRetirementTargetInvalid && !hasNoData && (
            <>
              <ForecastingSummary
                investableCapital={investableCapital}
                nestEgg={nestEgg}
                projectedAtRetirement={projectedAtRetirement}
                targetYear={targetYear}
                neededContribution={neededContribution}
                currentContribution={contribution}
                onEditSettings={handleEditSettings}
                hasSettings={!!retirement?.exists}
              />

              {milestoneData.shouldRender && (
                <MilestoneCardsView milestones={milestoneData.milestones} />
              )}

              <ForecastingChart
                chartData={mergedChartData}
                nestEgg={nestEgg}
                showVariants={showVariants}
                retirementYear={targetYear}
                srSummary={srSummary}
              />

              <ForecastingControls
                contribution={contribution}
                returnRate={returnRate}
                onContributionChange={setContribution}
                onReturnRateChange={setReturnRate}
                onReset={handleReset}
                contributionMax={contributionMax}
                defaultsNote={defaultsNote}
                cagrWarning={cagrWarning}
              />

              <section
                id="retirement-settings"
                ref={retirementRef}
                aria-label="Retirement Settings"
              >
                <RetirementPanel
                  data={retirement}
                  onSave={handleSaveRetirement}
                  loading={retirementLoading}
                  error={retirementError}
                  typeData={typeData}
                />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}
