/**
 * MilestoneSkylineView — Mountain Skyline Recharts area chart.
 * Shows investable capital history + dashed projection with milestone reference lines.
 * Receives all data via props. No internal state.
 */
import PropTypes from 'prop-types'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useResponsive } from '../hooks/useResponsive.js'
import {
  fmtCompact, formatDateLabel, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
  COLOR_ACCENT, COLOR_ACCENT_LIGHT, COLOR_POSITIVE, COLOR_AMBER,
} from './chartUtils.jsx'
import styles from './MilestoneSkylineView.module.css'

/** TODAY label rendered on the vertical reference line. */
function TodayLabel({ viewBox }) {
  if (!viewBox) return null
  const { x, y } = viewBox
  const text = 'TODAY'
  const rectW = 42
  const rectH = 16
  return (
    <g>
      <rect
        x={x - rectW / 2}
        y={y - rectH - 2}
        width={rectW}
        height={rectH}
        rx={3}
        fill="rgba(77,159,255,0.15)"
      />
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        fontSize={9}
        fontWeight={600}
        fill={COLOR_ACCENT}
        letterSpacing={1}
      >
        {text}
      </text>
    </g>
  )
}

TodayLabel.propTypes = {
  viewBox: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
}

/**
 * MilestoneLabel — custom label for horizontal ReferenceLine.
 * viewBox, x, y are injected by Recharts via element cloning into the label prop.
 */
function MilestoneLabel({ viewBox, x, y, milestone, index, isMobile }) {
  // viewBox/x/y are injected by Recharts via element cloning
  if (!viewBox && x == null) return null

  const labelX = viewBox ? viewBox.x : x
  const baseY = viewBox ? viewBox.y : y

  // Collision avoidance: alternate odd-index labels below the line by +14px
  const labelY = index % 2 === 1 ? baseY + 14 : baseY - 4

  const maxChars = isMobile ? 7 : 10
  const text = milestone.label.slice(0, maxChars)

  const color = milestone.state === 'achieved'
    ? COLOR_POSITIVE
    : milestone.isNestEgg
      ? COLOR_ACCENT
      : COLOR_AMBER

  const rectW = Math.min(text.length * 6 + 10, 80)
  const rectH = 14

  return (
    <g>
      <rect
        x={labelX}
        y={labelY - rectH}
        width={rectW}
        height={rectH}
        rx={3}
        fill={`rgba(${color === COLOR_POSITIVE ? '46,204,138' : color === COLOR_ACCENT ? '77,159,255' : '245,166,35'},0.15)`}
      />
      <text
        x={labelX + 5}
        y={labelY - 4}
        fontSize={9}
        fontWeight={600}
        fill={color}
      >
        {text}
      </text>
    </g>
  )
}

MilestoneLabel.propTypes = {
  viewBox: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
  x: PropTypes.number,
  y: PropTypes.number,
  milestone: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  isMobile: PropTypes.bool,
}

/** Custom tooltip for the skyline chart. */
function SkylineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const histPt = payload.find((p) => p.dataKey === 'investableCapital')
  const projPt = payload.find((p) => p.dataKey === 'projectedCapital')
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#8BA8CC', marginBottom: 6, fontSize: 12 }}>{label}</div>
      {histPt && histPt.value != null && (
        <div style={{ color: COLOR_ACCENT, fontSize: 13 }}>
          {fmtCompact(histPt.value)}
        </div>
      )}
      {projPt && projPt.value != null && (
        <div style={{ color: COLOR_ACCENT_LIGHT, fontSize: 13 }}>
          Proj: {fmtCompact(projPt.value)}
        </div>
      )}
    </div>
  )
}

SkylineTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.string,
}

/**
 * MilestoneSkylineView — Mountain Skyline area chart.
 * @param {Array} mergedSeries - merged {date, investableCapital?, projectedCapital?} array
 * @param {Array} milestones - enriched milestone objects
 * @param {number} investableCapital - current investable capital (for domain fallback)
 * @param {boolean} hasProjection - whether a projection series exists
 */
export default function MilestoneSkylineView({ mergedSeries, milestones, investableCapital, hasProjection }) {
  const { isMobile } = useResponsive()
  const chartHeight = isMobile ? 220 : 300
  const yAxisWidth = isMobile ? 52 : 72

  // Y-axis domain: 8% headroom above the highest milestone/nest egg target
  const highestTarget = milestones.length > 0
    ? Math.max(...milestones.map((m) => m.amount), 0) * 1.08
    : 0

  // Today divider: last point in mergedSeries with a defined investableCapital value
  const todayDate = (() => {
    for (let i = mergedSeries.length - 1; i >= 0; i--) {
      if (mergedSeries[i].investableCapital != null) {
        return mergedSeries[i].date
      }
    }
    return null
  })()

  return (
    <div className={styles.container}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart
          data={mergedSeries}
          margin={{ top: 20, right: isMobile ? 12 : 24, left: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="milestoneHistGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLOR_ACCENT} stopOpacity={0.25} />
              <stop offset="95%" stopColor={COLOR_ACCENT} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="milestoneProjGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR_ACCENT_LIGHT} stopOpacity={0.12} />
              <stop offset="100%" stopColor={COLOR_ACCENT_LIGHT} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />

          <XAxis
            dataKey="date"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatDateLabel}
            interval="preserveStartEnd"
          />

          <YAxis
            tickFormatter={fmtCompact}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={yAxisWidth}
            domain={[0, highestTarget || 'auto']}
          />

          <Tooltip content={<SkylineTooltip />} />

          {/* Historical area — renders only where investableCapital is defined */}
          <Area
            type="monotone"
            dataKey="investableCapital"
            stroke={COLOR_ACCENT}
            strokeWidth={2.5}
            fill="url(#milestoneHistGrad)"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* Projection area — rendered only when hasProjection */}
          {hasProjection && (
            <Area
              type="monotone"
              dataKey="projectedCapital"
              stroke={COLOR_ACCENT_LIGHT}
              strokeWidth={2}
              strokeDasharray="6 4"
              fill="url(#milestoneProjGrad)"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}

          {/* Today vertical divider */}
          {todayDate && (
            <ReferenceLine
              x={todayDate}
              stroke={COLOR_ACCENT}
              strokeWidth={1.5}
              strokeOpacity={0.4}
              label={<TodayLabel />}
            />
          )}

          {/* Milestone horizontal reference lines */}
          {milestones.map((m, i) => (
            <ReferenceLine
              key={`ms-${i}`}
              y={m.amount}
              stroke={
                m.state === 'achieved'
                  ? COLOR_POSITIVE
                  : m.isNestEgg
                    ? COLOR_ACCENT
                    : COLOR_AMBER
              }
              strokeWidth={1.5}
              strokeOpacity={m.state === 'achieved' ? 0.5 : 0.6}
              strokeDasharray={m.state === 'achieved' ? undefined : '4 3'}
              label={
                <MilestoneLabel
                  milestone={m}
                  index={i}
                  total={milestones.length}
                  isMobile={isMobile}
                />
              }
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* EC-6: no-projection notice when expected_return_pct not set */}
      {!hasProjection && (
        <p className={styles.noProjectionNotice}>
          Set expected return in Retirement Settings to see projected trajectory
        </p>
      )}
    </div>
  )
}

MilestoneSkylineView.propTypes = {
  mergedSeries: PropTypes.array.isRequired,
  milestones: PropTypes.array.isRequired,
  investableCapital: PropTypes.number.isRequired,
  hasProjection: PropTypes.bool.isRequired,
}
