import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import styles from './BuilderRegionalData.module.css'

const FIELDS = [
  { key: 'food_cost_trend',  label: 'Food / Grocery Costs' },
  { key: 'childcare_cost',   label: 'Childcare Cost' },
  { key: 'gas_fuel_price',   label: 'Gas / Fuel Price' },
  { key: 'insurance_trend',  label: 'Insurance Trend' },
  { key: 'electricity_cost', label: 'Electricity Cost' },
]

export default function BuilderRegionalData({ regional, aiConfigured, loading, onSave, onFetchAI }) {
  const [values, setValues] = useState({})

  useEffect(() => {
    if (regional && regional.exists !== false) {
      const v = {}
      for (const f of FIELDS) v[f.key] = regional[f.key] ?? ''
      setValues(v)
    }
  }, [regional])

  const handleChange = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = () => {
    onSave({
      ...values,
      other_factors: regional?.other_factors ?? [],
    })
  }

  const hasData = regional && regional.exists !== false

  if (!hasData && !loading) {
    return (
      <div className={styles.container}>
        <p className={styles.empty}>No regional data yet. Fetch from AI or enter manually.</p>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onFetchAI}
            disabled={!aiConfigured || loading}>
            {loading ? 'Fetching…' : 'Fetch from AI'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {regional?.source && (
        <span className={regional.source === 'ai' ? styles.badge : styles.badgeUser}>
          {regional.source === 'ai' ? 'AI-generated' : 'User-edited'}
        </span>
      )}

      <div className={styles.grid}>
        {FIELDS.map(f => (
          <div key={f.key} className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`bb-r-${f.key}`}>{f.label}</label>
            <input id={`bb-r-${f.key}`} type="text" className={styles.fieldInput}
              value={values[f.key] ?? ''} onChange={e => handleChange(f.key, e.target.value)} />
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={onFetchAI}
          disabled={!aiConfigured || loading}>
          {loading ? 'Fetching…' : 'Fetch from AI'}
        </button>
        <button className={styles.btnGhost} onClick={handleSave} disabled={loading}>
          Save Changes
        </button>
      </div>
    </div>
  )
}

BuilderRegionalData.propTypes = {
  regional: PropTypes.object,
  aiConfigured: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onFetchAI: PropTypes.func.isRequired,
}
