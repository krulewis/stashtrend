import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import styles from './RetirementPanel.module.css'
import MilestoneEditor from './MilestoneEditor.jsx'
import RetirementSummary from './RetirementSummary.jsx'
import { computeNestEgg } from '../utils/retirementMath.js'

export default function RetirementPanel({ data, onSave, loading, error }) {
  const [currentAge, setCurrentAge] = useState('')
  const [targetAge, setTargetAge] = useState('')
  const [desiredIncome, setDesiredIncome] = useState('')
  const [monthlyContrib, setMonthlyContrib] = useState('')
  const [returnPct, setReturnPct] = useState('')
  const [ssAnnual, setSsAnnual] = useState('')
  const [withdrawalRate, setWithdrawalRate] = useState('4.0')
  const [milestones, setMilestones] = useState([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (data?.exists) {
      setCurrentAge(data.current_age ?? '')
      setTargetAge(data.target_retirement_age ?? '')
      setDesiredIncome(data.desired_annual_income ?? '')
      setMonthlyContrib(data.monthly_contribution ?? '')
      setReturnPct(data.expected_return_pct ?? '')
      setSsAnnual(data.social_security_annual ?? '')
      setWithdrawalRate(data.withdrawal_rate_pct ?? '4.0')
      setMilestones(data.milestones ?? [])
    }
  }, [data])

  const nestEgg = computeNestEgg(
    Number(desiredIncome) || null,
    Number(ssAnnual) || 0,
    Number(withdrawalRate) || 0,
  )

  const targetYear = currentAge && targetAge
    ? new Date().getFullYear() + (Number(targetAge) - Number(currentAge))
    : null

  function handleSave() {
    const parsedMilestones = milestones
      .filter((m) => m.amount !== '' && m.amount != null)
      .map((m) => ({ amount: Number(m.amount), label: m.label || '' }))

    const toNum = (v) => (v === '' || v == null ? null : Number(v))

    onSave({
      current_age: toNum(currentAge),
      target_retirement_age: toNum(targetAge),
      desired_annual_income: toNum(desiredIncome),
      monthly_contribution: toNum(monthlyContrib),
      expected_return_pct: toNum(returnPct),
      inflation_rate_pct: 2.5,
      social_security_annual: toNum(ssAnnual) ?? 0,
      withdrawal_rate_pct: toNum(withdrawalRate) ?? 4.0,
      milestones: parsedMilestones,
    })
  }

  return (
    <div className={styles.container} data-testid="retirement-panel">
      <h2 className={styles.title}>Retirement Target</h2>

      <div className={styles.grid}>
        <label className={styles.fieldLabel}>
          Current age
          <input
            type="number"
            className={styles.input}
            value={currentAge}
            onChange={(e) => setCurrentAge(e.target.value)}
            placeholder="35"
            min={1}
            max={120}
            aria-label="Current age"
          />
        </label>
        <label className={styles.fieldLabel}>
          Target retirement age
          <input
            type="number"
            className={styles.input}
            value={targetAge}
            onChange={(e) => setTargetAge(e.target.value)}
            placeholder="65"
            min={1}
            max={120}
            aria-label="Target retirement age"
          />
        </label>
        <label className={styles.fieldLabel}>
          Desired annual income ($)
          <input
            type="number"
            className={styles.input}
            value={desiredIncome}
            onChange={(e) => setDesiredIncome(e.target.value)}
            placeholder="80000"
            min={0}
          />
        </label>
        <label className={styles.fieldLabel}>
          Monthly contribution ($)
          <input
            type="number"
            className={styles.input}
            value={monthlyContrib}
            onChange={(e) => setMonthlyContrib(e.target.value)}
            placeholder="2000"
            min={0}
          />
        </label>
      </div>

      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? '▲ Hide advanced' : '▼ Advanced settings'}
      </button>

      {showAdvanced && (
        <div className={styles.grid}>
          <label className={styles.fieldLabel}>
            Expected annual return (%)
            <input
              type="number"
              className={styles.input}
              value={returnPct}
              onChange={(e) => setReturnPct(e.target.value)}
              placeholder="7.0"
              step={0.1}
              min={0}
              max={50}
            />
          </label>
          <label className={styles.fieldLabel}>
            Social Security annual ($)
            <input
              type="number"
              className={styles.input}
              value={ssAnnual}
              onChange={(e) => setSsAnnual(e.target.value)}
              placeholder="0"
              min={0}
            />
          </label>
          <label className={styles.fieldLabel}>
            Withdrawal rate (%)
            <input
              type="number"
              className={styles.input}
              value={withdrawalRate}
              onChange={(e) => setWithdrawalRate(e.target.value)}
              placeholder="4.0"
              step={0.1}
              min={0.1}
              max={100}
            />
          </label>
        </div>
      )}

      <MilestoneEditor milestones={milestones} onChange={setMilestones} />

      <RetirementSummary nestEgg={nestEgg} targetYear={targetYear} />

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.actions}>
        <button
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

RetirementPanel.propTypes = {
  data: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
}
