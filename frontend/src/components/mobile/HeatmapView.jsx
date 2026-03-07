import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { groupExpenses, getBudgetZone, formatMonthLabel } from '../../utils/budgetUtils.js'
import WindowPicker from './WindowPicker.jsx'
import styles from './HeatmapView.module.css'

const WINDOW_SIZE = 6

const ZONE_CLASS_MAP = {
  safe:        styles.dotSafe,
  warning:     styles.dotWarning,
  over:        styles.dotOver,
  'no-budget': styles.dotMuted,
  'no-data':   styles.dotFaint,
}

function getDotAriaLabel(name, monthKey, actual, budgeted, zone) {
  const monthLabel = new Date(monthKey + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  if (zone === 'no-data') return `${name}, ${monthLabel}: no data`
  if (zone === 'no-budget') {
    return `${name}, ${monthLabel}: $${Math.round(actual ?? 0).toLocaleString('en-US')} spent, no budget set`
  }
  const pct = Math.round(((actual ?? 0) / budgeted) * 100)
  const zoneLabel = zone === 'over' ? 'over budget'
    : zone === 'warning' ? 'approaching limit'
    : 'within budget'
  return `${name}, ${monthLabel}: ${pct}% spent, ${zoneLabel}`
}

function HeatmapGroupRow({ group, months }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const groupId = group.groupName.toLowerCase().replace(/\s+/g, '-')

  const groupZones = months.map(m => {
    const groupActual = group.categories.reduce(
      (s, c) => s + (c.months?.[m]?.actual ?? 0), 0)
    const groupBudgeted = group.categories.reduce(
      (s, c) => s + (c.months?.[m]?.budgeted ?? 0), 0)
    const zone = getBudgetZone(groupActual, groupBudgeted)
    return { month: m, zone, actual: groupActual, budgeted: groupBudgeted }
  })

  return (
    <div className={styles.groupCard}>
      <div className={styles.groupHeaderRow} role="row">
        <div
          role="rowheader"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-controls={`heatmap-group-${groupId}-items`}
          onClick={() => setIsExpanded(prev => !prev)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIsExpanded(prev => !prev)
            }
          }}
          className={styles.groupLabel}
        >
          <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
                aria-hidden="true">
            ›
          </span>
          <span className={styles.groupName}>{group.groupName}</span>
        </div>
        {groupZones.map(({ month, zone, actual, budgeted }) => (
          <div key={month} role="gridcell" className={styles.dotCell}>
            <span
              className={`${styles.dot} ${ZONE_CLASS_MAP[zone] ?? styles.dotFaint}`}
              aria-label={getDotAriaLabel(group.groupName, month, actual, budgeted, zone)}
            />
          </div>
        ))}
      </div>

      <div
        id={`heatmap-group-${groupId}-items`}
        role="rowgroup"
        className={`${styles.groupContent} ${isExpanded ? styles.groupContentExpanded : ''}`}
      >
        <div className={styles.groupContentInner}>
          {group.categories.map(cat => (
            <div key={cat.category_id} className={styles.categoryRow} role="row">
              <div className={styles.categoryLabel} role="rowheader">
                {cat.category_name}
              </div>
              {months.map(m => {
                const actual = cat.months?.[m]?.actual ?? null
                const budgeted = cat.months?.[m]?.budgeted ?? null
                const zone = getBudgetZone(actual, budgeted)
                return (
                  <div key={m} role="gridcell" className={styles.dotCell}>
                    <span
                      className={`${styles.dotItem} ${ZONE_CLASS_MAP[zone] ?? styles.dotFaint}`}
                      aria-label={getDotAriaLabel(cat.category_name, m, actual, budgeted, zone)}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

HeatmapGroupRow.propTypes = {
  group: PropTypes.shape({
    groupName: PropTypes.string.isRequired,
    categories: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  months: PropTypes.arrayOf(PropTypes.string).isRequired,
}

export default function HeatmapView({ categories, customGroups, months }) {
  const [windowStart, setWindowStart] = useState(0)

  const windowMonths = useMemo(
    () => months.slice(windowStart, windowStart + WINDOW_SIZE),
    [months, windowStart]
  )
  const displayMonths = useMemo(
    () => [...windowMonths].reverse(),
    [windowMonths]
  )

  const canGoOlder = windowStart + WINDOW_SIZE < months.length
  const canGoNewer = windowStart > 0

  const groupedData = useMemo(
    () => groupExpenses(categories, customGroups),
    [categories, customGroups]
  )

  if (groupedData.length === 0) {
    return <p className={styles.empty}>No expense groups to display.</p>
  }

  return (
    <div className={styles.heatmap}>
      <WindowPicker
        displayMonths={displayMonths}
        canGoOlder={canGoOlder}
        canGoNewer={canGoNewer}
        onGoOlder={() => setWindowStart(w => w + 1)}
        onGoNewer={() => setWindowStart(w => w - 1)}
        hidden={months.length <= WINDOW_SIZE}
      />

      <div role="grid" aria-label="Budget heatmap, 6-month overview">
        <div className={styles.columnHeaders} role="row">
          <div className={styles.headerLabel} />
          {displayMonths.map(m => (
            <span key={m} role="columnheader" className={styles.headerMonth}>
              {formatMonthLabel(m)}
            </span>
          ))}
        </div>

        {groupedData.map(group => (
          <HeatmapGroupRow
            key={group.groupName}
            group={group}
            months={displayMonths}
          />
        ))}
      </div>
    </div>
  )
}

HeatmapView.propTypes = {
  categories:   PropTypes.arrayOf(PropTypes.object).isRequired,
  customGroups: PropTypes.object.isRequired,
  months:       PropTypes.arrayOf(PropTypes.string).isRequired,
}
