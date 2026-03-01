import { useState, useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import styles from './GroupsTimeChart.module.css'
import { useResponsive } from '../hooks/useResponsive.js'
import RangeSelector from './RangeSelector.jsx'
import { fmtFull, filterByRange, downsample, GRID_STROKE, COMMON_RANGES, sharedChartElements, TOOLTIP_STYLE } from './chartUtils.jsx'

// Tooltip rendered by recharts — keep inline
const tooltipStyles = {
  wrap: { ...TOOLTIP_STYLE, borderRadius: 8, padding: '10px 14px', minWidth: 200 },
  date: { color: '#94a3b8', marginBottom: 8, fontSize: 12, fontWeight: 600 },
  row:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 },
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const sorted = [...payload].sort((a, b) => b.value - a.value)
  return (
    <div style={tooltipStyles.wrap}>
      <div style={tooltipStyles.date}>{label}</div>
      {sorted.map((p) => (
        <div key={p.name} style={tooltipStyles.row}>
          <span style={{ color: p.color, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function GroupsTimeChart({ historyData }) {
  const [range, setRange] = useState('1Y')
  const [selectedGroups, setSelectedGroups] = useState(new Set())
  const { isMobile } = useResponsive()

  const { series, groups_meta: groupsMeta } = historyData ?? {}
  const groupNames = Object.keys(groupsMeta ?? {})
  const activeGroupNames = groupNames.filter((name) => selectedGroups.has(name))

  const toggleGroup = (name) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const activeRange  = COMMON_RANGES.find((r) => r.label === range) ?? COMMON_RANGES[0]
  const filtered = useMemo(() => filterByRange(series ?? [], activeRange.months), [series, activeRange])
  const data = useMemo(() => downsample(filtered), [filtered])

  // Chart props not settable via CSS
  const chartHeight = isMobile ? 220 : 300
  const yAxisWidth  = isMobile ? 52  : 72

  if (!historyData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading chart…</div>
      </div>
    )
  }

  if (groupNames.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          Create groups below to see them plotted here over time.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header row: title + range selector */}
      <div className={styles.header}>
        <h2 className={styles.title}>Group Balances Over Time</h2>
        <RangeSelector ranges={COMMON_RANGES} activeRange={range} onSelect={setRange} />
      </div>

      {/* Group toggle chips */}
      <div className={styles.chipsRow}>
        {groupNames.map((name) => {
          const color  = groupsMeta[name]?.color || '#6366f1'
          const active = selectedGroups.has(name)
          return (
            <button
              key={name}
              onClick={() => toggleGroup(name)}
              title={active ? `Hide ${name}` : `Show ${name}`}
              className={styles.chip}
              style={{
                background:  active ? `${color}22` : 'transparent',
                borderColor: active ? color         : GRID_STROKE,
                color:       active ? '#f1f5f9'     : '#64748b',
              }}
            >
              <span
                className={styles.chipDot}
                style={{ background: active ? color : GRID_STROKE }}
              />
              {name}
            </button>
          )
        })}
      </div>

      {/* Chart — or hint if nothing selected */}
      {activeGroupNames.length === 0 ? (
        <div className={styles.selectHint}>
          Select one or more groups above to plot them.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            {sharedChartElements({ yAxisWidth, tooltip: <CustomTooltip /> })}
            {activeGroupNames.map((name) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={groupsMeta[name]?.color || '#6366f1'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
