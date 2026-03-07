import PropTypes from 'prop-types'
import { formatMonthLabel } from '../../utils/budgetUtils.js'
import styles from './WindowPicker.module.css'

export default function WindowPicker({
  displayMonths,
  canGoOlder,
  canGoNewer,
  onGoOlder,
  onGoNewer,
  hidden,
}) {
  if (hidden) return null

  return (
    <div className={styles.picker} aria-label="Select 6-month window">
      <button
        type="button"
        className={styles.arrow}
        onClick={onGoOlder}
        disabled={!canGoOlder}
        aria-label="Show older months"
      >
        ‹
      </button>
      <div className={styles.monthStrip} role="group" aria-label="Current window">
        {displayMonths.map(m => (
          <span key={m} className={styles.monthLabel}>
            {formatMonthLabel(m)}
          </span>
        ))}
      </div>
      <button
        type="button"
        className={styles.arrow}
        onClick={onGoNewer}
        disabled={!canGoNewer}
        aria-label="Show newer months"
      >
        ›
      </button>
    </div>
  )
}

WindowPicker.propTypes = {
  displayMonths: PropTypes.arrayOf(PropTypes.string).isRequired,
  canGoOlder:    PropTypes.bool.isRequired,
  canGoNewer:    PropTypes.bool.isRequired,
  onGoOlder:     PropTypes.func.isRequired,
  onGoNewer:     PropTypes.func.isRequired,
  hidden:        PropTypes.bool,
}

WindowPicker.defaultProps = {
  hidden: false,
}
