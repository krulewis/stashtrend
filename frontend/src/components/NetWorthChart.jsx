import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import styles from './NetWorthChart.module.css'
import { useResponsive } from '../hooks/useResponsive'

const RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: 'All', months: null },
]

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n)

const fmtFull = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function filterByRange(data, months) {
  if (!months || !data.length) return data
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return data.filter((d) => d.date >= cutoffStr)
}

// Sample data down to ~200 points max to keep the chart fast
function sample(data, maxPoints = 200) {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

// Tooltip is rendered by recharts inside a portal — keep inline styles
const tooltipStyles = {
  wrap: { background: '#1e2130', border: '1px solid #2d3348', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
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
  const data = sample(filtered)

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
      </div>

      {!history ? (
        <div className={styles.loading}>Loading chart data…</div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAssets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradLiab" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={fmt}
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
            />
            <Tooltip content={<CustomTooltip />} />
            {showBreakdown && (
              <>
                <Area
                  type="monotone"
                  dataKey="assets"
                  name="Assets"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  fill="url(#gradAssets)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="liabilities"
                  name="Liabilities"
                  stroke="#f87171"
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
              stroke="#6366f1"
              strokeWidth={2.5}
              fill="url(#gradNW)"
              dot={false}
              activeDot={{ r: 5, fill: '#6366f1' }}
            />
            {showBreakdown && <Legend iconType="line" wrapperStyle={{ color: '#94a3b8', fontSize: 13 }} />}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
