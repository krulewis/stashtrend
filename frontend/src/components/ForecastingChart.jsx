import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  LineChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import {
  sharedChartElements,
  filterByRange,
  downsample,
  fmtCompact,
  fmtFull,
  COLOR_ACCENT,
  COLOR_POSITIVE,
  COLOR_AMBER,
  TOOLTIP_STYLE,
} from './chartUtils.jsx'
import RangeSelector from './RangeSelector.jsx'
import { useResponsive } from '../hooks/useResponsive.js'
import styles from './ForecastingChart.module.css'

const FORECASTING_RANGES = [
  { label: '5Y',  months: 60  },
  { label: '10Y', months: 120 },
  { label: '20Y', months: 240 },
  { label: 'All', months: null },
]

const tooltipStyles = {
  wrap: { ...TOOLTIP_STYLE, minWidth: 200 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4 },
  swatch: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 6 },
  label: { color: '#8BA8CC', fontSize: 12 },
  value: { fontWeight: 500 },
}

const SERIES = [
  { key: 'net_worth',          name: 'Historical',         color: COLOR_ACCENT  },
  { key: 'projected_net_worth', name: 'Baseline',          color: COLOR_ACCENT  },
  { key: 'projected_plus10',   name: '+10% Contribution',  color: COLOR_POSITIVE },
  { key: 'projected_minus10',  name: '-10% Contribution',  color: COLOR_AMBER   },
]

function ForecastingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const byKey = {}
  for (const p of payload) byKey[p.dataKey] = p.value

  return (
    <div style={tooltipStyles.wrap}>
      <div style={{ color: '#8BA8CC', fontSize: 11, marginBottom: 6 }}>{label}</div>
      {SERIES.map(({ key, name, color }) =>
        byKey[key] != null ? (
          <div key={key} style={tooltipStyles.row}>
            <span style={tooltipStyles.label}>
              <span style={{ ...tooltipStyles.swatch, background: color }} />
              {name}
            </span>
            <span style={tooltipStyles.value}>{fmtFull(byKey[key])}</span>
          </div>
        ) : null
      )}
    </div>
  )
}

ForecastingTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.string,
}

export default function ForecastingChart({
  chartData,
  nestEgg,
  showVariants,
  retirementYear,
  srSummary,
}) {
  const [range, setRange] = useState('All')
  const { isMobile, isDesktop } = useResponsive()

  const chartHeight = isMobile ? 240 : isDesktop ? 420 : 320
  const yAxisWidth = isMobile ? 56 : 72

  const activeRange = FORECASTING_RANGES.find((r) => r.label === range) ?? FORECASTING_RANGES[FORECASTING_RANGES.length - 1]

  const filtered = useMemo(
    () => filterByRange(chartData ?? [], activeRange.months),
    [chartData, activeRange]
  )
  const data = useMemo(() => downsample(filtered), [filtered])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Investable Capital Projection</h2>
        <RangeSelector ranges={FORECASTING_RANGES} activeRange={range} onSelect={setRange} />
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 10, bottom: 0 }}>
          {sharedChartElements({ yAxisWidth, tooltip: <ForecastingTooltip /> })}

          {/* Historical line — solid */}
          <Line
            type="monotone"
            dataKey="net_worth"
            name="Historical"
            stroke={COLOR_ACCENT}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />

          {/* Baseline projection — dashed, same color */}
          <Line
            type="monotone"
            dataKey="projected_net_worth"
            name="Baseline"
            stroke={COLOR_ACCENT}
            strokeWidth={2}
            strokeDasharray="8 4"
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />

          {/* +10% variant — dotted green */}
          {showVariants && (
            <Line
              type="monotone"
              dataKey="projected_plus10"
              name="+10% Contribution"
              stroke={COLOR_POSITIVE}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          )}

          {/* -10% variant — dotted amber */}
          {showVariants && (
            <Line
              type="monotone"
              dataKey="projected_minus10"
              name="-10% Contribution"
              stroke={COLOR_AMBER}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          )}

          {/* Nest egg reference line — horizontal dashed */}
          {nestEgg != null && (
            <ReferenceLine
              y={nestEgg}
              stroke={COLOR_AMBER}
              strokeDasharray="6 3"
              label={{
                value: `Target: ${fmtCompact(nestEgg)}`,
                fill: COLOR_AMBER,
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
          )}

          {/* Retirement year reference line — vertical */}
          {retirementYear != null && (
            <ReferenceLine
              x={`${retirementYear}-01-01`}
              stroke={COLOR_AMBER}
              strokeDasharray="4 4"
              label={{
                value: `Retire ${retirementYear}`,
                fill: COLOR_AMBER,
                fontSize: 11,
                position: 'insideTopLeft',
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Screen reader summary */}
      <p className={styles.srOnly} aria-live="polite">{srSummary}</p>
    </div>
  )
}

ForecastingChart.propTypes = {
  chartData: PropTypes.array,
  nestEgg: PropTypes.number,
  showVariants: PropTypes.bool,
  retirementYear: PropTypes.number,
  srSummary: PropTypes.string,
}

ForecastingChart.defaultProps = {
  chartData: [],
  nestEgg: null,
  showVariants: false,
  retirementYear: null,
  srSummary: '',
}
