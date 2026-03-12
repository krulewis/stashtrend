import PropTypes from 'prop-types'
import SliderInput from './SliderInput.jsx'
import styles from './ForecastingControls.module.css'

export default function ForecastingControls({
  contribution,
  returnRate,
  onContributionChange,
  onReturnRateChange,
  onReset,
  contributionMax,
  defaultsNote,
  cagrWarning,
}) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.title}>Projection Settings</p>
        <button type="button" className={styles.resetBtn} onClick={onReset}>
          Reset
        </button>
      </div>

      <div className={styles.slidersGrid}>
        <div>
          <SliderInput
            label="Monthly Contribution"
            value={contribution}
            onChange={onContributionChange}
            min={0}
            max={contributionMax}
            step={100}
            format={(v) => '$' + Math.round(v).toLocaleString()}
            ariaLabel="Monthly contribution amount"
          />
        </div>

        <div>
          <SliderInput
            label="Annual Return Rate"
            value={returnRate}
            onChange={onReturnRateChange}
            min={0}
            max={15}
            step={0.5}
            format={(v) => v.toFixed(1) + '%'}
            ariaLabel="Annual return rate percentage"
          />
          {defaultsNote && (
            <p className={styles.defaultsNote}>{defaultsNote}</p>
          )}
          {cagrWarning && (
            <p className={styles.cagrWarning}>{cagrWarning}</p>
          )}
        </div>
      </div>
    </div>
  )
}

ForecastingControls.propTypes = {
  contribution: PropTypes.number.isRequired,
  returnRate: PropTypes.number.isRequired,
  onContributionChange: PropTypes.func.isRequired,
  onReturnRateChange: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  contributionMax: PropTypes.number.isRequired,
  defaultsNote: PropTypes.string,
  cagrWarning: PropTypes.string,
}

ForecastingControls.defaultProps = {
  defaultsNote: null,
  cagrWarning: null,
}
