import styles from './StatsCards.module.css'
import { fmtFull } from './chartUtils.jsx'

const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)

const Arrow = ({ value }) => {
  if (value == null) return null
  return value >= 0 ? (
    <span style={{ color: '#34d399' }}>▲</span>
  ) : (
    <span style={{ color: '#f87171' }}>▼</span>
  )
}

const Card = ({ label, value, change, pct, sublabel }) => (
  <div className={styles.card}>
    <div className={styles.cardLabel}>{label}</div>
    <div className={styles.cardValue}>{fmtFull(value)}</div>
    {change != null && (
      <div className={styles.cardChange}>
        <Arrow value={change} />
        <span style={{ color: change >= 0 ? '#34d399' : '#f87171', marginLeft: 4 }}>
          {fmtFull(change)} ({fmtPct(pct)})
        </span>
        <span className={styles.cardSublabel}> vs {sublabel}</span>
      </div>
    )}
  </div>
)

export default function StatsCards({ stats }) {
  if (!stats) {
    return (
      <div className={styles.row}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`${styles.card} ${styles.skeleton}`} />
        ))}
      </div>
    )
  }

  return (
    <div className={styles.row}>
      <Card
        label="Net Worth Today"
        value={stats.current?.net_worth}
        change={null}
      />
      <Card
        label="Month-over-Month"
        value={stats.current?.net_worth}
        change={stats.mom?.change}
        pct={stats.mom?.pct_change}
        sublabel="last month"
      />
      <Card
        label="Year-over-Year"
        value={stats.current?.net_worth}
        change={stats.yoy?.change}
        pct={stats.yoy?.pct_change}
        sublabel="last year"
      />
    </div>
  )
}
