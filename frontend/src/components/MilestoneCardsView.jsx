/**
 * MilestoneCardsView — Grid of milestone status cards.
 * Receives processed milestone array as prop. No internal state.
 *
 * Note: MilestoneCard is defined as an inner component here because it
 * has no independent consumers outside this file (intentional deviation
 * from architecture — see phase2.1-impl-plan-final.md finding #13).
 */
import PropTypes from 'prop-types'
import { fmtFull } from './chartUtils.jsx'
import styles from './MilestoneCardsView.module.css'

/** SVG checkmark icon for achieved state. aria-hidden since pill text communicates state. */
function CheckmarkIcon() {
  return (
    <svg
      className={styles.checkmark}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="8.5" fill="rgba(46,204,138,0.15)" stroke="rgba(46,204,138,0.4)" />
      <path
        d="M5.5 9L7.5 11L12.5 6.5"
        stroke="#2ECC8A"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Individual milestone card. Receives enriched milestone fields.
 */
function MilestoneCard({ label, amount, progress, state, achievedDate, projectedDate, isNestEgg }) {
  const pct = Math.round(progress * 100)

  // State-dependent colors and pill classes
  const stateColor = state === 'achieved'
    ? 'var(--color-positive)'
    : state === 'in-progress'
      ? 'var(--accent)'
      : 'var(--color-warning)'

  const pillClass = state === 'achieved'
    ? styles.pillGreen
    : state === 'in-progress'
      ? styles.pillCobalt
      : styles.pillAmber

  const pillText = state === 'achieved'
    ? '✓ Achieved'
    : state === 'in-progress'
      ? '◆ Next Goal'
      : '→ In Progress'

  const amountClass = state === 'achieved'
    ? styles.amountAchieved
    : state === 'in-progress'
      ? styles.amountInProgress
      : styles.amountFuture

  const fillClass = state === 'achieved'
    ? styles.fillAchieved
    : state === 'in-progress'
      ? styles.fillInProgress
      : styles.fillFuture

  // Card wrapper: base + state class + nestEggGlow last (wins specificity for border-color)
  const cardClass = [
    styles.card,
    state === 'achieved' ? styles.achieved : state === 'in-progress' ? styles.inProgress : styles.future,
    isNestEgg ? styles.nestEggGlow : '',
  ].filter(Boolean).join(' ')

  // Status line content
  let statusContent
  if (state === 'achieved') {
    statusContent = (
      <>
        Achieved{' '}
        <strong style={{ color: 'var(--color-positive)' }}>{achievedDate}</strong>
      </>
    )
  } else if (isNestEgg && state !== 'future' && !projectedDate) {
    // EC-5: nest egg card, all achieved
    statusContent = (
      <span style={{ color: 'var(--color-positive)' }}>Ahead of target</span>
    )
  } else if (projectedDate) {
    const formattedAmount = fmtFull(amount)
    const formattedCurrent = fmtFull(Math.round(progress * amount))
    statusContent = (
      <>
        {formattedCurrent} of {formattedAmount} · Proj.{' '}
        <strong style={{ color: stateColor }}>{projectedDate}</strong>
      </>
    )
  } else {
    // EC-6: no expected_return_pct set
    statusContent = (
      <span style={{ color: 'var(--text-faint)' }}>Set expected return for projections</span>
    )
  }

  return (
    <div className={cardClass}>
      {/* Header row: status pill + icon/percentage */}
      <div className={styles.cardHeader}>
        <span className={pillClass}>{pillText}</span>
        {state === 'achieved'
          ? <CheckmarkIcon />
          : (
            <span className={styles.percentage} style={{ color: stateColor }}>
              {pct}%
            </span>
          )
        }
      </div>

      {/* Eyebrow */}
      <p className={styles.eyebrow}>
        {isNestEgg ? 'Nest Egg Target' : 'Milestone'}
      </p>

      {/* Milestone label */}
      <p className={styles.milestoneLabel}>{label}</p>

      {/* Dollar amount */}
      <p className={`${styles.amount} ${amountClass}`}>{fmtFull(amount)}</p>

      {/* Progress bar */}
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label={`${label} — ${pct}% complete`}
      >
        <div
          className={`${styles.progressFill} ${fillClass}`}
          style={{ width: `max(4px, ${progress * 100}%)` }}
        />
      </div>

      {/* Status line */}
      <p className={styles.statusLine}>{statusContent}</p>
    </div>
  )
}

MilestoneCard.propTypes = {
  label: PropTypes.string.isRequired,
  amount: PropTypes.number.isRequired,
  progress: PropTypes.number.isRequired,
  state: PropTypes.oneOf(['achieved', 'in-progress', 'future']).isRequired,
  achievedDate: PropTypes.string,
  projectedDate: PropTypes.string,
  isNestEgg: PropTypes.bool,
}

/**
 * MilestoneCardsView — renders the 2-column grid of MilestoneCard components.
 */
export default function MilestoneCardsView({ milestones }) {
  return (
    <div className={styles.grid}>
      {milestones.map((m, i) => (
        <MilestoneCard
          key={`milestone-card-${i}`}
          label={m.label}
          amount={m.amount}
          progress={m.progress}
          state={m.state}
          achievedDate={m.achievedDate}
          projectedDate={m.projectedDate}
          isNestEgg={m.isNestEgg}
        />
      ))}
    </div>
  )
}

MilestoneCardsView.propTypes = {
  milestones: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      amount: PropTypes.number.isRequired,
      progress: PropTypes.number.isRequired,
      state: PropTypes.oneOf(['achieved', 'in-progress', 'future']).isRequired,
      achievedDate: PropTypes.string,
      projectedDate: PropTypes.string,
      isNestEgg: PropTypes.bool,
    })
  ).isRequired,
}
