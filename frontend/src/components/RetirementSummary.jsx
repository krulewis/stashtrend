import PropTypes from 'prop-types'
import styles from './RetirementSummary.module.css'
import { fmtFull } from './chartUtils.jsx'

export default function RetirementSummary({ nestEgg, projectedAtRetirement, targetYear }) {
  return (
    <div className={styles.container} data-testid="retirement-summary">
      <div className={styles.row}>
        <span className={styles.label}>Nest egg needed</span>
        <span className={styles.value} data-testid="nest-egg-value">
          {nestEgg != null ? fmtFull(nestEgg) : '—'}
        </span>
      </div>
      {projectedAtRetirement != null && (
        <div className={styles.row}>
          <span className={styles.label}>Projected at retirement</span>
          <span className={styles.value} data-testid="projected-value">
            {fmtFull(projectedAtRetirement)}
          </span>
        </div>
      )}
      <div className={styles.row}>
        <span className={styles.label}>Target year</span>
        <span className={styles.value} data-testid="target-year">
          {targetYear ?? '—'}
        </span>
      </div>
      {nestEgg != null && projectedAtRetirement != null && (
        <div
          className={`${styles.badge} ${projectedAtRetirement >= nestEgg ? styles.onTrack : styles.offTrack}`}
          data-testid="track-badge"
        >
          {projectedAtRetirement >= nestEgg ? 'On Track' : 'Off Track'}
        </div>
      )}
    </div>
  )
}

RetirementSummary.propTypes = {
  nestEgg: PropTypes.number,
  projectedAtRetirement: PropTypes.number,
  targetYear: PropTypes.number,
}
