import { useMemo, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  ComposedChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import RangeSelector from './RangeSelector.jsx'
import { useResponsive } from '../hooks/useResponsive.js'
import {
  fmtFull, fmtCompact, fmtPct,
  formatDateLabel, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, COLOR_ACCENT,
  downsample,
} from './chartUtils.jsx'
import styles from './InvestmentPerformanceChart.module.css'

const COLOR_AMBER = '#F5A623'
const ACCOUNT_COLORS = [
  '#4D9FFF', '#2ECC8A', '#F5A623', '#9B7FE8',
  '#FF5A7A', '#5EDDA8', '#7DBFFF', '#F5D76E',
]

const INVEST_RANGES = [
  { label: '3M',  value: '3m',  months: 3 },
  { label: '6M',  value: '6m',  months: 6 },
  { label: '1Y',  value: '1y',  months: 12 },
  { label: '3Y',  value: '3y',  months: 36 },
  { label: '5Y',  value: '5y',  months: 60 },
  { label: 'All', value: 'all', months: null },
]

const tooltipStyles = { ...TOOLTIP_STYLE }

function colorFor(id, accountIds) {
  if (id === '__total__') return ACCOUNT_COLORS[0]
  const idx = accountIds.indexOf(id)
  return ACCOUNT_COLORS[(idx + 1) % ACCOUNT_COLORS.length]
}

function CustomTooltip({ active, payload, label, yMode, showContribs }) {
  if (!active || !payload || payload.length === 0) return null
  const sorted = [...payload]
    .filter((p) => p.dataKey !== 'contribution')
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  const contribEntry = payload.find((p) => p.dataKey === 'contribution')

  return (
    <div style={tooltipStyles}>
      <div style={{ fontSize: 11, color: '#8BA8CC', marginBottom: 6 }}>{label}</div>
      {sorted.map((entry) => (
        entry.value != null && (
          <div key={entry.dataKey} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
            <span style={{ color: '#8BA8CC', flex: 1, fontSize: 12 }}>{entry.name}</span>
            <span style={{ color: '#F0F6FF', fontWeight: 500, fontSize: 12 }}>
              {yMode === 'pct' ? fmtPct(entry.value) : fmtFull(entry.value)}
            </span>
          </div>
        )
      ))}
      {showContribs && contribEntry?.value != null && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #1E2D4A' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_AMBER, flexShrink: 0 }} />
            <span style={{ color: '#8BA8CC', flex: 1, fontSize: 12 }}>Est. Contributions</span>
            <span style={{ color: '#F0F6FF', fontWeight: 500, fontSize: 12 }}>{fmtFull(contribEntry.value)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.string,
  yMode: PropTypes.string,
  showContribs: PropTypes.bool,
}

export default function InvestmentPerformanceChart({
  performance, loading, error, range, onRangeChange, perfLoading,
}) {
  const { isMobile } = useResponsive()
  const [yMode, setYMode] = useState('value')
  const [showContribs, setShowContribs] = useState(true)
  const [activeAccounts, setActiveAccounts] = useState(new Set(['__total__']))

  // When performance data arrives, initialize active accounts
  useEffect(() => {
    if (!performance?.account_names) return
    const ids = Object.keys(performance.account_names)
    setActiveAccounts(new Set(['__total__', ...ids]))
  }, [performance])

  const accountIds = useMemo(() => {
    if (!performance?.account_names) return []
    return Object.keys(performance.account_names)
  }, [performance])

  function toggleAccount(id) {
    setActiveAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Build contributions lookup map: { "YYYY-MM": totalAmount }
  const contribMap = useMemo(() => {
    const map = {}
    performance?.contributions?.forEach((c) => {
      map[c.month] = (map[c.month] || 0) + c.total
    })
    return map
  }, [performance])

  // Build chartData — merge contribution onto first day of each month
  const chartData = useMemo(() => {
    if (!performance?.series) return []
    const firstValues = {}
    const monthsSeen = new Set()
    const raw = performance.series.map((pt) => {
      const month = pt.date.slice(0, 7) // "YYYY-MM"
      const entry = { date: pt.date }
      const keys = ['total', ...accountIds]
      keys.forEach((k) => {
        const val = k === 'total' ? pt.total : pt.accounts?.[k]
        if (yMode === 'pct') {
          if (firstValues[k] == null && val != null) firstValues[k] = val
          entry[k] = firstValues[k] ? ((val - firstValues[k]) / firstValues[k]) * 100 : null
        } else {
          entry[k] = val ?? null
        }
      })
      // Attach contribution only on the first day of each month
      if (!monthsSeen.has(month)) {
        const contrib = contribMap[month]
        entry.contribution = contrib !== undefined ? contrib : undefined
        monthsSeen.add(month)
      }
      return entry
    })
    return downsample(raw, 200)
  }, [performance, yMode, accountIds, contribMap])

  const hasContribs = (performance?.contributions?.length ?? 0) > 0

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>Performance</span>
          <RangeSelector ranges={INVEST_RANGES} activeRange={range} onSelect={onRangeChange} />
        </div>
        <div className={styles.emptyChart}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Performance</span>
        <RangeSelector ranges={INVEST_RANGES} activeRange={range} onSelect={onRangeChange} />
      </div>

      <div className={styles.controls}>
        <div className={styles.yModeToggle}>
          <button
            className={yMode === 'value' ? styles.active : ''}
            onClick={() => setYMode('value')}
          >
            $ Value
          </button>
          <button
            className={yMode === 'pct' ? styles.active : ''}
            onClick={() => setYMode('pct')}
          >
            % Change
          </button>
        </div>
        <button
          className={styles.contribToggle}
          onClick={() => setShowContribs((v) => !v)}
          disabled={!hasContribs}
          title={!hasContribs ? 'No contribution data detected' : ''}
        >
          {showContribs ? '☑' : '☐'} Show contributions
        </button>
      </div>

      {!loading && accountIds.length > 0 && (
        <div className={styles.chips}>
          {['__total__', ...accountIds].map((id) => (
            <button
              key={id}
              onClick={() => toggleAccount(id)}
              className={activeAccounts.has(id) ? styles.chipActive : styles.chip}
              style={
                activeAccounts.has(id)
                  ? {
                      borderColor: colorFor(id, accountIds),
                      background: colorFor(id, accountIds) + '22',
                    }
                  : {}
              }
            >
              <span
                className={styles.chipDot}
                style={{ background: colorFor(id, accountIds) }}
              />
              {id === '__total__' ? 'All Combined' : performance.account_names[id]}
            </button>
          ))}
        </div>
      )}

      <figure aria-label="Investment performance chart">
        <figcaption className={styles.visuallyHidden}>
          Performance chart, {range} range, {activeAccounts.size} accounts selected.
        </figcaption>

        {loading && <div className={styles.skeleton} />}

        {!loading && perfLoading && chartData?.length > 0 && (
          <div className={styles.chartWrapper} style={{ opacity: 0.4 }}>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 340}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" width={isMobile ? 52 : 72} tickFormatter={yMode === 'pct' ? (n) => `${n.toFixed(1)}%` : fmtCompact} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Line yAxisId="left" type="monotone" dataKey="total" stroke={COLOR_ACCENT} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className={styles.refetchSpinner} />
          </div>
        )}

        {!loading && !perfLoading && (chartData?.length ?? 0) === 0 && (
          <div className={styles.emptyChart}>No performance data available for the selected range.</div>
        )}

        {!loading && !perfLoading && (chartData?.length ?? 0) > 0 && (
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 340}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                width={isMobile ? 52 : 72}
                tickFormatter={yMode === 'pct' ? (n) => `${n.toFixed(1)}%` : fmtCompact}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              {showContribs && hasContribs && (
                <YAxis
                  yAxisId="contributions"
                  orientation="right"
                  width={52}
                  tickFormatter={fmtCompact}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
              )}
              <Tooltip
                content={<CustomTooltip yMode={yMode} showContribs={showContribs} />}
                contentStyle={tooltipStyles}
              />
              {activeAccounts.has('__total__') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="total"
                  stroke={COLOR_ACCENT}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls
                  name="All Combined"
                />
              )}
              {accountIds.filter((id) => activeAccounts.has(id)).map((id, i) => (
                <Line
                  key={id}
                  yAxisId="left"
                  type="monotone"
                  dataKey={id}
                  stroke={ACCOUNT_COLORS[(i + 1) % ACCOUNT_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                  name={performance.account_names[id]}
                />
              ))}
              {showContribs && hasContribs && (
                <Bar
                  yAxisId="contributions"
                  dataKey="contribution"
                  fill={COLOR_AMBER}
                  opacity={0.4}
                  radius={[2, 2, 0, 0]}
                  name="Est. Contributions"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </figure>
    </div>
  )
}

InvestmentPerformanceChart.propTypes = {
  performance: PropTypes.shape({
    series: PropTypes.array,
    contributions: PropTypes.array,
    account_names: PropTypes.object,
  }),
  loading: PropTypes.bool,
  error: PropTypes.string,
  range: PropTypes.string.isRequired,
  onRangeChange: PropTypes.func.isRequired,
  perfLoading: PropTypes.bool,
}
