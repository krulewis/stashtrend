import { useState, useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import { groupExpenses, getBudgetZone, formatMonthLabel, formatGroupLabel } from '../../utils/budgetUtils.js'
import WindowPicker from './WindowPicker.jsx'
import styles from './HeatmapView.module.css'

const WINDOW_SIZE = 5

const ZONE_CLASS_MAP = {
  safe:        styles.dotSafe,
  warning:     styles.dotWarning,
  over:        styles.dotOver,
  'no-budget': styles.dotMuted,
  'no-data':   styles.dotFaint,
}

const LEGEND_ITEMS = [
  { zone: 'safe',      label: 'Under 85%',      dotClass: styles.dotSafe },
  { zone: 'warning',   label: '85 \u2013 100%', dotClass: styles.dotWarning },
  { zone: 'over',      label: 'Over 100%',      dotClass: styles.dotOver },
  { zone: 'no-budget', label: 'No budget',      dotClass: styles.dotMuted },
  { zone: 'no-data',   label: 'No data',        dotClass: styles.dotFaint },
]

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
  // groupExpenses() guarantees unique groupName values (keyed by name in groupMap),
  // so sanitized IDs will be unique for practical budget group names.
  const groupId = group.groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const groupZones = useMemo(() => months.map(m => {
    const groupActual = group.categories.reduce(
      (s, c) => s + (c.months?.[m]?.actual ?? 0), 0)
    const groupBudgeted = group.categories.reduce(
      (s, c) => s + (c.months?.[m]?.budgeted ?? 0), 0)
    const zone = getBudgetZone(groupActual, groupBudgeted)
    return { month: m, zone, actual: groupActual, budgeted: groupBudgeted }
  }), [group, months])

  return (
    <div className={`${styles.groupCard} ${isExpanded ? styles.groupCardExpanded : ''}`}>
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
          <span className={styles.groupName}>{formatGroupLabel(group.groupName)}</span>
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
                {formatGroupLabel(cat.category_name, 12)}
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

  // Clamp windowStart if months array shrinks (e.g., during re-fetch).
  useEffect(() => {
    setWindowStart(prev => {
      const maxStart = Math.max(0, months.length - WINDOW_SIZE)
      return Math.min(prev, maxStart)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Intentional: only re-clamp when the length changes, not on every array reference change.
  }, [months.length])

  const windowMonths = useMemo(
    () => months.slice(windowStart, windowStart + WINDOW_SIZE),
    [months, windowStart]
  )
  const displayMonths = useMemo(
    () => [...windowMonths].reverse(),
    [windowMonths]
  )

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

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
        months={months}
        windowStart={windowStart}
        windowSize={WINDOW_SIZE}
        onWindowStartChange={setWindowStart}
      />

      <div role="grid" aria-label="Budget heatmap, 5-month overview">
        <div className={styles.columnHeaders} role="row">
          <div className={styles.headerLabel} />
          {displayMonths.map(m => (
            <span
              key={m}
              role="columnheader"
              className={`${styles.headerMonth} ${m === currentMonthKey ? styles.headerMonthCurrent : ''}`}
            >
              {formatMonthLabel(m)}
            </span>
          ))}
        </div>

        <div className={styles.legend} aria-label="Dot color legend" role="group">
          {LEGEND_ITEMS.map(item => (
            <span key={item.zone} className={styles.legendItem}>
              <span className={`${styles.legendDot} ${item.dotClass}`} aria-hidden="true" />
              <span className={styles.legendLabel}>{item.label}</span>
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
