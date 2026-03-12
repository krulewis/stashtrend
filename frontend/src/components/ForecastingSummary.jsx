import PropTypes from 'prop-types'
import { fmtFull } from './chartUtils.jsx'
import styles from './ForecastingSummary.module.css'

export default function ForecastingSummary({
  investableCapital,
  nestEgg,
  projectedAtRetirement,
  targetYear,
  neededContribution,
  currentContribution,
  onEditSettings,
  hasSettings,
}) {
  const isOnTrack =
    projectedAtRetirement != null &&
    nestEgg != null &&
    projectedAtRetirement >= nestEgg

  const gapAmount =
    nestEgg != null && projectedAtRetirement != null
      ? Math.abs(nestEgg - projectedAtRetirement)
      : null

  const additionalNeeded =
    neededContribution != null ? neededContribution - currentContribution : null

  const showBadge = nestEgg != null && projectedAtRetirement != null

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <p className={styles.title}>Retirement Readiness</p>
        {showBadge && (
          <span className={isOnTrack ? styles.badgeOnTrack : styles.badgeOffTrack}>
            {isOnTrack ? '✓ On Track' : 'Off Track'}
          </span>
        )}
      </div>

      <div className={styles.cardsGrid}>
        {/* Card 1: Investable Capital Today */}
        <div className={styles.card}>
          <span className={styles.cardLabel}>Investable Capital Today</span>
          <span className={styles.cardValue}>
            {investableCapital != null ? fmtFull(investableCapital) : '—'}
          </span>
        </div>

        {/* Card 2: Nest Egg Needed */}
        <div className={styles.card}>
          <span className={styles.cardLabel}>Nest Egg Needed</span>
          <span className={styles.cardValue}>
            {nestEgg != null ? fmtFull(nestEgg) : hasSettings ? '—' : 'Set income goal →'}
          </span>
        </div>

        {/* Card 3: Projected at Retirement */}
        <div className={styles.card}>
          <span className={styles.cardLabel}>Projected at Retirement</span>
          <span className={styles.cardValue}>
            {projectedAtRetirement != null ? fmtFull(projectedAtRetirement) : '—'}
          </span>
        </div>

        {/* Card 4: Target Year */}
        <div className={styles.card}>
          <span className={styles.cardLabel}>Target Year</span>
          <span className={styles.cardValue}>
            {targetYear ?? '—'}
          </span>
        </div>
      </div>

      {/* Gap analysis */}
      {gapAmount != null && (
        isOnTrack ? (
          <p className={styles.gapPositive}>
            You are {fmtFull(gapAmount)} ahead of your target.
          </p>
        ) : (
          <p className={styles.gapNegative}>
            {additionalNeeded != null
              ? `You need ${fmtFull(gapAmount)} more. Increase contributions by ${fmtFull(additionalNeeded)}/month to close the gap.`
              : `You need ${fmtFull(gapAmount)} more to reach your target.`}
          </p>
        )
      )}

      {/* Setup prompt when no settings */}
      {!hasSettings && (
        <p className={styles.setupPrompt}>
          Set your desired retirement income in{' '}
          <button type="button" onClick={onEditSettings}>
            retirement settings
          </button>{' '}
          to see gap analysis.
        </p>
      )}

      {/* Edit settings link */}
      <button
        type="button"
        className={styles.editLink}
        onClick={onEditSettings}
      >
        Edit Retirement Settings
      </button>
    </div>
  )
}

ForecastingSummary.propTypes = {
  investableCapital: PropTypes.number,
  nestEgg: PropTypes.number,
  projectedAtRetirement: PropTypes.number,
  targetYear: PropTypes.number,
  neededContribution: PropTypes.number,
  currentContribution: PropTypes.number.isRequired,
  onEditSettings: PropTypes.func.isRequired,
  hasSettings: PropTypes.bool.isRequired,
}

ForecastingSummary.defaultProps = {
  investableCapital: null,
  nestEgg: null,
  projectedAtRetirement: null,
  targetYear: null,
  neededContribution: null,
}
