import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useResponsive } from '../hooks/useResponsive'
import styles from './BudgetChart.module.css'

const tooltipStyles = {
  wrap: {
    background: '#1e2130',
    border: '1px solid #2d3348',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#f1f5f9',
    fontSize: 13,
  },
}

function fmtMonth(m) {
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function fmtDollar(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n)
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={tooltipStyles.wrap}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{fmtMonth(label)}</div>
      {payload.map(p => (
        <div key={p.name}>{p.name}: {fmtDollar(p.value)}</div>
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
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
          <XAxis
            dataKey="month"
            tickFormatter={fmtMonth}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
          />
          <YAxis
            tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 13 }} />
          <Bar dataKey="Budget" fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Actual" fill="#34d399" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
