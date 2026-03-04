/**
 * TypeStackedChart — Stacked area chart of NW by account-type bucket over time.
 * Includes a CAGR sidebar showing 1Y/3Y/5Y estimated returns per bucket.
 *
 * CAGR values are approximations. Tooltip reads:
 * "Estimated CAGR — actual returns may differ."
 */
import { useState } from 'react'
import PropTypes from 'prop-types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useResponsive } from '../hooks/useResponsive.js'
import RangeSelector from './RangeSelector.jsx'
import {
  fmtFull, fmtCompact, fmtPct, filterByRange, downsample,
  formatDateLabel, TOOLTIP_STYLE, COMMON_RANGES, AXIS_TICK, GRID_STROKE,
  COLOR_POSITIVE, COLOR_NEGATIVE,
} from './chartUtils.jsx'
import styles from './TypeStackedChart.module.css'

const RANGES = COMMON_RANGES

// Buckets with negative series values are plotted as absolute values on the right axis.
// The tooltip needs to negate them back for display.
const NEGATIVE_BUCKETS = new Set(['Debt'])

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 12 }}>{label}</div>
      {payload.map((p) => {
        const displayValue = NEGATIVE_BUCKETS.has(p.name) ? -Math.abs(p.value) : p.value
        return (
          <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2, color: p.color }}>
            <span>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>{fmtFull(displayValue)}</span>
          </div>
        )
      })}
    </div>
  )
}

function CagrCell({ value }) {
  if (value == null) {
    return <span className={styles.cagrNull}>--</span>
  }
  const color = value >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE
  return <span style={{ color }}>{fmtPct(value)}</span>
}

export default function TypeStackedChart({ data }) {
  const [range, setRange] = useState('All')
  const { isMobile } = useResponsive()

  if (!data) {
    return <div className={styles.loading}>Loading type breakdown…</div>
  }

  const { series, cagr, bucket_colors, bucket_order } = data

  const activeRange = RANGES.find((r) => r.label === range)
  // Apply range filter then downsample — always downsample before passing to recharts
  const filtered = filterByRange(series || [], activeRange?.months)
  const downsampled = downsample(filtered)

  // Convert negative bucket values to absolute for right-axis plotting (magnitude scales upward)
  const chartData = downsampled.map((d) => {
    const row = { ...d }
    for (const b of bucket_order) {
      if (NEGATIVE_BUCKETS.has(b) && row[b] != null) row[b] = Math.abs(row[b])
    }
    return row
  })

  const chartHeight = isMobile ? 220 : 300
  const yAxisWidth  = isMobile ? 52 : 72

  // Only render buckets that have at least one non-zero value in the filtered range
  const activeBuckets = bucket_order.filter((b) =>
    chartData.some((d) => d[b] !== 0)
  )
  const positiveBuckets = activeBuckets.filter((b) => !NEGATIVE_BUCKETS.has(b))
  const negativeBuckets = activeBuckets.filter((b) => NEGATIVE_BUCKETS.has(b))
  const hasRightAxis = negativeBuckets.length > 0

  return (
    <div className={styles.container} data-testid="type-stacked-chart">
      <div className={styles.header}>
        <h2 className={styles.title}>Net Worth by Type</h2>
        <RangeSelector ranges={RANGES} activeRange={range} onSelect={setRange} />
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={chartData} margin={{ top: 10, right: hasRightAxis ? 10 : 10, left: 10, bottom: 0 }}>
          <defs>
            {activeBuckets.map((bucket) => (
              <linearGradient key={bucket} id={`grad_${bucket}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={bucket_colors[bucket]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={bucket_colors[bucket]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatDateLabel} interval="preserveStartEnd" />
          <YAxis yAxisId="left" tickFormatter={fmtCompact} tick={AXIS_TICK} tickLine={false} axisLine={false} width={yAxisWidth} />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `-${fmtCompact(v)}`}
              tick={{ ...AXIS_TICK, fill: bucket_colors.Debt || COLOR_NEGATIVE }}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          {positiveBuckets.map((bucket) => (
            <Area
              key={bucket}
              type="monotone"
              dataKey={bucket}
              name={bucket}
              stroke={bucket_colors[bucket]}
              strokeWidth={1.5}
              fill={`url(#grad_${bucket})`}
              dot={false}
              stackId="nw"
              yAxisId="left"
            />
          ))}
          {negativeBuckets.map((bucket) => (
            <Area
              key={bucket}
              type="monotone"
              dataKey={bucket}
              name={bucket}
              stroke={bucket_colors[bucket]}
              strokeWidth={1.5}
              fill={`url(#grad_${bucket})`}
              dot={false}
              yAxisId="right"
            />
          ))}
          <Legend iconType="line" wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        </AreaChart>
      </ResponsiveContainer>

      {/* CAGR sidebar table */}
      <div className={styles.cagrSection}>
        <h3 className={styles.cagrTitle}>
          Estimated CAGR
          {/* Tooltip caveat per staff finding #8 */}
          <span className={styles.cagrCaveat} title="Estimated CAGR — actual returns may differ.">ⓘ</span>
        </h3>
        <table className={styles.cagrTable}>
          <thead>
            <tr>
              <th>Bucket</th>
              <th>1Y</th>
              <th>3Y</th>
              <th>5Y</th>
            </tr>
          </thead>
          <tbody>
            {bucket_order.map((bucket) => {
              const row = cagr?.[bucket] || { '1y': null, '3y': null, '5y': null }
              return (
                <tr key={bucket}>
                  <td>
                    <span
                      className={styles.bucketDot}
                      style={{ background: bucket_colors[bucket] }}
                    />
                    {bucket}
                  </td>
                  <td><CagrCell value={row['1y']} /></td>
                  <td><CagrCell value={row['3y']} /></td>
                  <td><CagrCell value={row['5y']} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

TypeStackedChart.propTypes = {
  data: PropTypes.shape({
    series:       PropTypes.array,
    cagr:         PropTypes.object,
    bucket_colors: PropTypes.object,
    bucket_order:  PropTypes.arrayOf(PropTypes.string),
  }),
}
