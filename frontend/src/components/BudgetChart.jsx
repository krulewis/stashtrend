import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useResponsive } from '../hooks/useResponsive.js'
import styles from './BudgetChart.module.css'
import { GRID_STROKE, COLOR_ACCENT, COLOR_POSITIVE, fmtFull, fmtCompact, fmtBudgetMonth, TOOLTIP_STYLE } from './chartUtils.jsx'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{fmtBudgetMonth(label)}</div>
      {payload.map(p => (
        <div key={p.name}>{p.name}: {fmtFull(p.value)}</div>
      ))}
    </div>
  )
}

export default function BudgetChart({ months, totalsByMonth }) {
  const { isMobile } = useResponsive()

  if (!months || !totalsByMonth) {
    return <div className={styles.loading}>Loading chart…</div>
  }

  const data = months.map(m => ({
    month:  m,
    Budget: totalsByMonth[m]?.budgeted ?? 0,
    Actual: totalsByMonth[m]?.actual   ?? 0,
  }))

  const chartHeight = isMobile ? 220 : 300

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Monthly Totals</h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtBudgetMonth}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
          />
          <YAxis
            tickFormatter={fmtCompact}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 13 }} />
          <Bar dataKey="Budget" fill={COLOR_ACCENT}   radius={[3, 3, 0, 0]} />
          <Bar dataKey="Actual" fill={COLOR_POSITIVE} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
