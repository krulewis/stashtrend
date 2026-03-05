import PropTypes from 'prop-types'
import styles from './MilestoneEditor.module.css'

export default function MilestoneEditor({ milestones = [], onChange }) {
  const add = () => {
    if (milestones.length >= 20) return
    onChange([...milestones, { amount: '', label: '' }])
  }

  const remove = (i) => onChange(milestones.filter((_, idx) => idx !== i))

  const update = (i, field, val) => {
    const next = milestones.map((m, idx) =>
      idx === i ? { ...m, [field]: val } : m
    )
    onChange(next)
  }

  return (
    <div className={styles.editor} data-testid="milestone-editor">
      <div className={styles.header}>
        <span className={styles.sectionLabel}>
          Milestones
          <span
            className={styles.infoIcon}
            title="Projected date when net worth first crosses this amount."
            aria-label="Milestone info"
          >
            ?
          </span>
        </span>
        <button
          type="button"
          className={styles.addBtn}
          onClick={add}
          disabled={milestones.length >= 20}
        >
          + Add
        </button>
      </div>
      {milestones.length === 0 && (
        <p className={styles.empty}>No milestones yet. Add one to track progress.</p>
      )}
      {milestones.map((m, i) => (
        <div key={i} className={styles.row}>
          <input
            type="number"
            className={styles.amountInput}
            value={m.amount}
            onChange={(e) => update(i, 'amount', e.target.value)}
            placeholder="500000"
            aria-label={`Milestone ${i + 1} amount`}
            min={1}
          />
          <input
            type="text"
            className={styles.labelInput}
            value={m.label}
            onChange={(e) => update(i, 'label', e.target.value)}
            placeholder="e.g. Half Million"
            aria-label={`Milestone ${i + 1} label`}
            maxLength={100}
          />
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => remove(i)}
            aria-label={`Remove milestone ${i + 1}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

MilestoneEditor.propTypes = {
  milestones: PropTypes.arrayOf(PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    label: PropTypes.string,
  })),
  onChange: PropTypes.func.isRequired,
}
