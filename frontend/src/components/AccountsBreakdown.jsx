import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import styles from './AccountsBreakdown.module.css'
import { useResponsive } from '../hooks/useResponsive'

const fmt = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Group accounts by type and compute totals
function groupAccounts(accounts) {
  const groups = {}
  for (const acct of accounts) {
    const key = acct.type || 'Other'
    if (!groups[key]) groups[key] = { type: key, is_asset: acct.is_asset, total: 0, accounts: [] }
    groups[key].total += acct.current_balance || 0
    groups[key].accounts.push(acct)
  }
  return Object.values(groups).sort((a, b) => b.total - a.total)
}

const ASSET_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#4f46e5', '#3730a3']
const LIAB_COLORS  = ['#f87171', '#fca5a5', '#fecaca', '#ef4444', '#dc2626']

// Tooltip rendered by recharts — keep inline
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{ background: '#1e2130', border: '1px solid #2d3348', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: '#f1f5f9', fontWeight: 600 }}>{fmt(d.value)}</div>
    </div>
  )
}

const RADIAN = Math.PI / 180
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  )
}

function AccountGroup({ group, color }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.group}>
      <div className={styles.groupHeader} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Color dot is data-driven — keep inline */}
          <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span className={styles.groupName}>{group.type}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={styles.groupTotal}>{fmt(group.total)}</span>
          <span style={{ color: '#64748b', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className={styles.accountList}>
          {group.accounts.map((acct) => (
            <div key={acct.name} className={styles.accountRow}>
              <div>
                <div className={styles.accountName}>{acct.name}</div>
                {acct.institution && <div className={styles.accountInst}>{acct.institution}</div>}
              </div>
              <div className={styles.accountBalance}>{fmt(acct.current_balance)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AccountsBreakdown({ accounts }) {
  const { isMobile } = useResponsive()

  if (!accounts) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading accounts…</div>
      </div>
    )
  }

  const assets      = accounts.filter((a) => a.is_asset === 1)
  const liabilities = accounts.filter((a) => a.is_asset === 0)

  const assetGroups = groupAccounts(assets)
  const liabGroups  = groupAccounts(liabilities)

  const totalAssets = assets.reduce((s, a) => s + (a.current_balance || 0), 0)
  const totalLiab   = liabilities.reduce((s, a) => s + (a.current_balance || 0), 0)

  const assetPieData = assetGroups.map((g) => ({ name: g.type, value: g.total }))
  const liabPieData  = liabGroups.map((g) => ({ name: g.type, value: Math.abs(g.total) }))

  // Pie chart dimensions — JS props not settable in CSS
  const pieHeight      = isMobile ? 150 : 180
  const pieInnerRadius = isMobile ? 40  : 50
  const pieOuterRadius = isMobile ? 65  : 80

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Account Breakdown</h2>
      <div className={styles.columns}>
        {/* ASSETS */}
        <div className={styles.column}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Assets</span>
            {/* Color is data-driven */}
            <span className={styles.sectionTotal} style={{ color: '#34d399' }}>{fmt(totalAssets)}</span>
          </div>
          {assetPieData.length > 0 && (
            <ResponsiveContainer width="100%" height={pieHeight}>
              <PieChart>
                <Pie
                  data={assetPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={pieInnerRadius}
                  outerRadius={pieOuterRadius}
                  dataKey="value"
                  labelLine={false}
                  label={renderLabel}
                >
                  {assetPieData.map((_, i) => (
                    <Cell key={i} fill={ASSET_COLORS[i % ASSET_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className={styles.groupList}>
            {assetGroups.map((g, i) => (
              <AccountGroup key={g.type} group={g} color={ASSET_COLORS[i % ASSET_COLORS.length]} />
            ))}
          </div>
        </div>

        {/* Vertical divider */}
        <div className={styles.divider} />

        {/* LIABILITIES */}
        <div className={styles.column}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Liabilities</span>
            {/* Color is data-driven */}
            <span className={styles.sectionTotal} style={{ color: '#f87171' }}>{fmt(totalLiab)}</span>
          </div>
          {liabPieData.length > 0 && (
            <ResponsiveContainer width="100%" height={pieHeight}>
              <PieChart>
                <Pie
                  data={liabPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={pieInnerRadius}
                  outerRadius={pieOuterRadius}
                  dataKey="value"
                  labelLine={false}
                  label={renderLabel}
                >
                  {liabPieData.map((_, i) => (
                    <Cell key={i} fill={LIAB_COLORS[i % LIAB_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className={styles.groupList}>
            {liabGroups.map((g, i) => (
              <AccountGroup key={g.type} group={g} color={LIAB_COLORS[i % LIAB_COLORS.length]} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
