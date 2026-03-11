import { useState } from 'react'
import PropTypes from 'prop-types'
import styles from './ForecastingSetup.module.css'

export default function ForecastingSetup({ onSave, loading, error }) {
  const [currentAge, setCurrentAge] = useState('')
  const [targetAge, setTargetAge] = useState('')
  const [desiredIncome, setDesiredIncome] = useState('')
  const [monthlyContrib, setMonthlyContrib] = useState('')
  const [returnPct, setReturnPct] = useState('')
  const [ssAnnual, setSsAnnual] = useState('')
  const [withdrawalRate, setWithdrawalRate] = useState('4.0')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [validationError, setValidationError] = useState(null)

  function handleSave() {
    if (!currentAge || !targetAge) {
      setValidationError('Current age and target retirement age are required.')
      return
    }
    if (Number(targetAge) <= Number(currentAge)) {
      setValidationError('Target retirement age must be greater than current age.')
      return
    }
    setValidationError(null)

    const toNum = (v) => (v === '' || v == null ? undefined : Number(v))
    const toFloat = (v) => (v === '' || v == null ? undefined : parseFloat(v))

    const formData = {
      current_age: parseInt(currentAge, 10),
      target_retirement_age: parseInt(targetAge, 10),
      desired_annual_income: toNum(desiredIncome),
      monthly_contribution: toNum(monthlyContrib),
    }

    if (returnPct !== '') formData.expected_return_pct = toFloat(returnPct)
    if (ssAnnual !== '') formData.social_security_annual = toNum(ssAnnual)
    if (withdrawalRate !== '') formData.withdrawal_rate_pct = toFloat(withdrawalRate)

    onSave(formData)
  }

  return (
    <div className={styles.container} data-testid="forecasting-setup">
      <h2 className={styles.title}>Set Up Retirement Projections</h2>
      <p className={styles.subtitle}>Enter your details to see your investable capital projection.</p>

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
        <div className={styles.gridThree}>
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

      {validationError && (
        <div className={styles.errorMsg} role="alert">{validationError}</div>
      )}

      {error && (
        <div className={styles.errorMsg} role="alert">{error}</div>
      )}

      <div className={styles.actions}>
        <button
          type="button"
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

ForecastingSetup.propTypes = {
  onSave: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
}

ForecastingSetup.defaultProps = {
  loading: false,
  error: null,
}
