import PropTypes from 'prop-types'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useResponsive } from '../hooks/useResponsive.js'
import { fmtFull, fmtCompact, fmtPct, TOOLTIP_STYLE } from './chartUtils.jsx'
import styles from './AllocationChart.module.css'

const SLICE_COLORS = {
  Stock: '#4D9FFF',
  ETF: '#2ECC8A',
  Bond: '#F5A623',
  'Mutual Fund': '#9B7FE8',
  Cash: '#5EDDA8',
  Other: '#4A6080',
}

const tooltipStyles = { ...TOOLTIP_STYLE }

function CustomPieTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0]?.payload
  if (!entry) return null
  return (
    <div style={tooltipStyles}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{entry.type}</div>
      <div style={{ fontSize: 12, color: '#8BA8CC' }}>{fmtFull(entry.value)}</div>
      <div style={{ fontSize: 12, color: '#8BA8CC' }}>{fmtPct(entry.pct)}</div>
    </div>
  )
}

CustomPieTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
}

export default function AllocationChart({ allocation, totals, accountName, loading }) {
  const { isMobile } = useResponsive()
  const innerRadius = isMobile ? 50 : 60
  const outerRadius = isMobile ? 80 : 95
  const chartHeight = isMobile ? 180 : 200

  return (
    <figure
      aria-label={`Asset allocation donut chart for ${accountName}`}
      className={styles.container}
    >
      <h3 className={styles.title}>Asset Allocation</h3>

      {loading && <div className={styles.skeletonCircle} />}

      {!loading && (!allocation || allocation.length === 0) && (
        <div className={styles.emptyState}>No allocation data available.</div>
      )}

      {!loading && allocation?.length > 0 && (
        <>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={allocation}
                  dataKey="value"
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                  paddingAngle={2}
                >
                  {allocation.map((entry) => (
                    <Cell
                      key={entry.type}
                      fill={SLICE_COLORS[entry.type] || SLICE_COLORS.Other}
                      aria-label={`${entry.type}: ${fmtFull(entry.value)}, ${entry.pct.toFixed(1)}%`}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} contentStyle={tooltipStyles} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centerLabel}>
              <div className={styles.centerValue}>{fmtCompact(totals?.current_value)}</div>
              <div className={styles.centerSub}>total</div>
            </div>
          </div>

          <ul role="list" className={styles.legend}>
            {allocation.map((item) => (
              <li key={item.type} className={styles.legendRow}>
                <span
                  className={styles.legendDot}
                  style={{ background: SLICE_COLORS[item.type] || SLICE_COLORS.Other }}
                />
                <span className={styles.legendName}>{item.type}</span>
                <span className={styles.legendValue}>{fmtFull(item.value)}</span>
                <span className={styles.legendPct}>{item.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>

          <figcaption className={styles.visuallyHidden}>
            Asset allocation: {allocation.map((a) => `${a.type} ${a.pct.toFixed(1)}%`).join(', ')}
          </figcaption>
        </>
      )}
    </figure>
  )
}

AllocationChart.propTypes = {
  allocation: PropTypes.arrayOf(PropTypes.shape({
    type: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    pct: PropTypes.number.isRequired,
  })),
  totals: PropTypes.shape({
    current_value: PropTypes.number,
  }),
  accountName: PropTypes.string,
  loading: PropTypes.bool,
}
