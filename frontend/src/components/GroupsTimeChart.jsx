import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import styles from './GroupsTimeChart.module.css'
import { useResponsive } from '../hooks/useResponsive'

const RANGES = [
  { label: '3M',  months: 3  },
  { label: '6M',  months: 6  },
  { label: '1Y',  months: 12 },
  { label: '2Y',  months: 24 },
  { label: 'All', months: null },
]

const fmtCompact = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)

const fmtFull = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

function filterByRange(series, months) {
  if (!months || !series.length) return series
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return series.filter((d) => d.date >= cutoffStr)
}

function sample(data, maxPoints = 200) {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

// Tooltip rendered by recharts — keep inline
const tooltipStyles = {
  wrap: { background: '#1e2130', border: '1px solid #2d3348', borderRadius: 8, padding: '10px 14px', fontSize: 13, minWidth: 200 },
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

  const { series, groups_meta: groupsMeta } = historyData || { series: [], groups_meta: {} }
  const groupNames = Object.keys(groupsMeta || {})
  const activeGroupNames = groupNames.filter((name) => selectedGroups.has(name))

  const toggleGroup = (name) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const activeMonths = RANGES.find((r) => r.label === range)?.months
  const filtered = useMemo(() => filterByRange(series || [], activeMonths), [series, activeMonths])
  const data = useMemo(() => sample(filtered), [filtered])

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
        <div className={styles.rangeButtons}>
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`${styles.rangeBtn} ${range === r.label ? styles.rangeBtnActive : ''}`}
            >
              {r.label}
            </button>
          ))}
        </div>
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
                borderColor: active ? color         : '#2d3348',
                color:       active ? '#f1f5f9'     : '#64748b',
              }}
            >
              <span
                className={styles.chipDot}
                style={{ background: active ? color : '#2d3348' }}
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
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => {
                const dt = new Date(d + 'T00:00:00')
                return dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
            />
            <Tooltip content={<CustomTooltip />} />
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
