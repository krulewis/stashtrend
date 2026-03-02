import PropTypes from 'prop-types'
import styles from './RangeSelector.module.css'

/**
 * Reusable range-selector button strip shared by NetWorthChart and GroupsTimeChart.
 * Accepts an optional className for layout overrides from the parent.
 */
export default function RangeSelector({ ranges, activeRange, onSelect, className }) {
  return (
    <div className={`${styles.rangeButtons}${className ? ` ${className}` : ''}`}>
      {ranges.map((r) => (
        <button
          key={r.label}
          onClick={() => onSelect(r.label)}
          className={`${styles.rangeBtn} ${activeRange === r.label ? styles.rangeBtnActive : ''}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

RangeSelector.propTypes = {
  ranges: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    months: PropTypes.number,
  })).isRequired,
  activeRange: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  className: PropTypes.string,
}
