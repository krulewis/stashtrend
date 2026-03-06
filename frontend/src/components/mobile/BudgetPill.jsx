import PropTypes from 'prop-types'
import styles from './BudgetPill.module.css'
import { getBudgetZone, getPillAriaLabel } from '../../utils/budgetUtils.js'
import { fmtDollar } from '../chartUtils.jsx'

const ZONE_CLASS = {
  safe:     styles.safe,
  warning:  styles.warning,
  over:     styles.over,
  'no-budget': styles.noBudget,
  'no-data':   styles.noData,
}

export default function BudgetPill({ actual, budgeted, size, loading }) {
  if (loading) {
    const shimmerCls = [
      styles.pillLoading,
      size === 'summary' ? styles.pillLoadingSummary : '',
    ].filter(Boolean).join(' ')
    return <div className={shimmerCls} role="status" aria-label="Loading" />
  }

  const zone = getBudgetZone(actual, budgeted)
  const ariaLabel = getPillAriaLabel(actual, budgeted, zone)

  let displayText
  if (zone === 'no-data') {
    displayText = '---'
  } else if (zone === 'no-budget') {
    displayText = `${fmtDollar(actual ?? 0)} / ---`
  } else {
    displayText = `${fmtDollar(actual ?? 0)} / ${fmtDollar(budgeted)}`
  }

  const className = [
    styles.pill,
    ZONE_CLASS[zone],
    size === 'summary' ? styles.summary : '',
  ].filter(Boolean).join(' ')

  return (
    <div role="status" aria-label={ariaLabel} className={className}>
      {displayText}
    </div>
  )
}

BudgetPill.propTypes = {
  actual:   PropTypes.number,
  budgeted: PropTypes.number,
  size:     PropTypes.oneOf(['standard', 'summary']),
  loading:  PropTypes.bool,
}

BudgetPill.defaultProps = {
  size:    'standard',
  loading: false,
}
