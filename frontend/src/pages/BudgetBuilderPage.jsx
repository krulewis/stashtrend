import { useEffect, useState, useCallback } from 'react'
import styles from './BudgetBuilderPage.module.css'
import BuilderProfileForm from '../components/BuilderProfileForm.jsx'
import BuilderRegionalData from '../components/BuilderRegionalData.jsx'
import BuilderResultsTable from '../components/BuilderResultsTable.jsx'
import {
  fetchAiConfig,
  fetchBuilderProfile, saveBuilderProfile,
  fetchBuilderRegional, saveBuilderRegional, fetchRegionalFromAI,
  generateBudgetPlan, updateBuilderPlan, applyBuilderPlan,
} from '../api.js'

export default function BudgetBuilderPage() {
  const [aiConfigured, setAiConfigured] = useState(false)
  const [profile, setProfile] = useState(null)
  const [regional, setRegional] = useState(null)
  const [plan, setPlan] = useState(null)
  const [applyResult, setApplyResult] = useState(null)

  const [profileLoading, setProfileLoading] = useState(false)
  const [regionalLoading, setRegionalLoading] = useState(false)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)
  const [error, setError] = useState(null)

  const [monthsAhead, setMonthsAhead] = useState(3)
  const [profileOpen, setProfileOpen] = useState(true)
  const [regionalOpen, setRegionalOpen] = useState(true)

  // Load initial data
  useEffect(() => {
    fetchAiConfig()
      .then(cfg => setAiConfigured(cfg.configured))
      .catch(() => setAiConfigured(false))
    fetchBuilderProfile()
      .then(setProfile)
      .catch(() => {})
    fetchBuilderRegional()
      .then(setRegional)
      .catch(() => {})
  }, [])

  const handleSaveProfile = useCallback(async (data) => {
    setProfileLoading(true)
    setError(null)
    try {
      await saveBuilderProfile(data)
      const updated = await fetchBuilderProfile()
      setProfile(updated)
    } catch (e) { setError(e.message) }
    finally { setProfileLoading(false) }
  }, [])

  const handleSaveRegional = useCallback(async (data) => {
    setRegionalLoading(true)
    setError(null)
    try {
      await saveBuilderRegional(data)
      const updated = await fetchBuilderRegional()
      setRegional(updated)
    } catch (e) { setError(e.message) }
    finally { setRegionalLoading(false) }
  }, [])

  const handleFetchRegionalAI = useCallback(async () => {
    setRegionalLoading(true)
    setError(null)
    try {
      const data = await fetchRegionalFromAI()
      setRegional(data)
    } catch (e) { setError(e.message) }
    finally { setRegionalLoading(false) }
  }, [])

  const handleGenerate = useCallback(async () => {
    setGenerateLoading(true)
    setError(null)
    setApplyResult(null)
    try {
      const resp = await generateBudgetPlan({ months_ahead: monthsAhead })
      setPlan(resp.plan)
    } catch (e) { setError(e.message) }
    finally { setGenerateLoading(false) }
  }, [monthsAhead])

  const handleCellEdit = useCallback((categoryId, month, amount) => {
    setPlan(prev => {
      if (!prev) return prev
      const items = prev.line_items.map(item => {
        if (item.category_id !== categoryId) return item
        return { ...item, months: { ...item.months, [month]: amount } }
      })
      return { ...prev, line_items: items }
    })
  }, [])

  const handleSavePlan = useCallback(async () => {
    if (!plan?.id) return
    setError(null)
    try {
      await updateBuilderPlan(plan.id, { line_items: plan.line_items, name: plan.name })
    } catch (e) { setError(e.message) }
  }, [plan])

  const handleApply = useCallback(async () => {
    if (!plan?.id) return
    setApplyLoading(true)
    setError(null)
    try {
      const result = await applyBuilderPlan(plan.id)
      setApplyResult(result)
    } catch (e) { setError(e.message) }
    finally { setApplyLoading(false) }
  }, [plan])

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Budget Builder</h2>

      {!aiConfigured && (
        <div className={styles.banner}>
          AI not configured. Set up your AI provider in the Budgets tab to use the Budget Builder.
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}

      {/* ── Step 1: Profile ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader} onClick={() => setProfileOpen(o => !o)}>
          <span className={styles.sectionTitle}>
            <span className={styles.stepLabel}>Step 1</span>
            Your Profile
          </span>
          <span className={styles.chevron}>{profileOpen ? '▼' : '▶'}</span>
        </div>
        {profileOpen && (
          <div className={styles.sectionBody}>
            <BuilderProfileForm
              profile={profile?.exists !== false ? profile : null}
              loading={profileLoading}
              onSave={handleSaveProfile}
            />
          </div>
        )}
      </div>

      {/* ── Step 2: Regional Data ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader} onClick={() => setRegionalOpen(o => !o)}>
          <span className={styles.sectionTitle}>
            <span className={styles.stepLabel}>Step 2</span>
            Regional Cost Data
          </span>
          <span className={styles.chevron}>{regionalOpen ? '▼' : '▶'}</span>
        </div>
        {regionalOpen && (
          <div className={styles.sectionBody}>
            <BuilderRegionalData
              regional={regional?.exists !== false ? regional : null}
              aiConfigured={aiConfigured}
              loading={regionalLoading}
              onSave={handleSaveRegional}
              onFetchAI={handleFetchRegionalAI}
            />
          </div>
        )}
      </div>

      {/* ── Step 3: Generate & Results ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <span className={styles.stepLabel}>Step 3</span>
            Budget Recommendations
          </span>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.generateRow}>
            <select className={styles.monthSelect} value={monthsAhead}
              onChange={e => setMonthsAhead(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n} month{n > 1 ? 's' : ''} ahead</option>
              ))}
            </select>
            <button className={styles.btnPrimary} onClick={handleGenerate}
              disabled={!aiConfigured || generateLoading}>
              {generateLoading ? 'Generating…' : 'Generate'}
            </button>
            {generateLoading && <span className={styles.spinner} />}
          </div>

          {plan && (
            <BuilderResultsTable
              plan={plan}
              historicalData={{}}
              loading={applyLoading}
              onCellEdit={handleCellEdit}
              onSavePlan={handleSavePlan}
              onApply={handleApply}
              applyResult={applyResult}
            />
          )}
        </div>
      </div>
    </div>
  )
}
