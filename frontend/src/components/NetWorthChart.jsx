import { useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, Legend } from 'recharts'
import styles from './NetWorthChart.module.css'
import { useResponsive } from '../hooks/useResponsive.js'
import RangeSelector from './RangeSelector.jsx'
import { fmtFull, filterByRange, downsample, GRID_STROKE, COMMON_RANGES, sharedChartElements, COLOR_ACCENT, COLOR_POSITIVE, COLOR_NEGATIVE } from './chartUtils.jsx'

const RANGES = [{ label: '1M', months: 1 }, ...COMMON_RANGES]

// Tooltip is rendered by recharts inside a portal — keep inline styles
const tooltipStyles = {
  wrap: { background: '#1e2130', border: `1px solid ${GRID_STROKE}`, borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  date: { color: '#94a3b8', marginBottom: 6, fontSize: 12 },
  row:  { display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 },
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={tooltipStyles.wrap}>
      <div style={tooltipStyles.date}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ ...tooltipStyles.row, color: p.color }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function NetWorthChart({ history }) {
  const [range, setRange] = useState('1Y')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const { isMobile } = useResponsive()

  const activeRange = RANGES.find((r) => r.label === range)
  const filtered = filterByRange(history || [], activeRange?.months)
  const data = downsample(filtered)

  // Chart props that can't be set via CSS
  const chartHeight = isMobile ? 220 : 340
  const yAxisWidth  = isMobile ? 52  : 72

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Net Worth Over Time</h2>
        <div className={styles.controls}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showBreakdown}
              onChange={(e) => setShowBreakdown(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Show assets / liabilities
          </label>
          <RangeSelector ranges={RANGES} activeRange={range} onSelect={setRange} />
        </div>
      </div>

      {!history ? (
        <div className={styles.loading}>Loading chart data…</div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLOR_ACCENT} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_POSITIVE} stopOpacity={0.25} />
                <stop offset="95%" stopColor={COLOR_POSITIVE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradLiab" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLOR_NEGATIVE} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLOR_NEGATIVE} stopOpacity={0} />
              </linearGradient>
            </defs>
            {sharedChartElements({ yAxisWidth, tooltip: <CustomTooltip /> })}
            {showBreakdown && (
              <>
                <Area
                  type="monotone"
                  dataKey="assets"
                  name="Assets"
                  stroke={COLOR_POSITIVE}
                  strokeWidth={1.5}
                  fill="url(#gradAssets)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="liabilities"
                  name="Liabilities"
                  stroke={COLOR_NEGATIVE}
                  strokeWidth={1.5}
                  fill="url(#gradLiab)"
                  dot={false}
                />
              </>
            )}
            <Area
              type="monotone"
              dataKey="net_worth"
              name="Net Worth"
              stroke={COLOR_ACCENT}
              strokeWidth={2.5}
              fill="url(#gradNW)"
              dot={false}
              activeDot={{ r: 5, fill: COLOR_ACCENT }}
            />
            {showBreakdown && <Legend iconType="line" wrapperStyle={{ color: '#94a3b8', fontSize: 13 }} />}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
