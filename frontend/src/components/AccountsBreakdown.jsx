import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import styles from './AccountsBreakdown.module.css'
import { useResponsive } from '../hooks/useResponsive.js'
import { fmtFull, TOOLTIP_STYLE } from './chartUtils.jsx'

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
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{d.name}</div>
      <div style={{ fontWeight: 600 }}>{fmtFull(d.value)}</div>
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
          <span className={styles.groupTotal}>{fmtFull(group.total)}</span>
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
              <div className={styles.accountBalance}>{fmtFull(acct.current_balance)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountSection({ label, total, totalColor, pieData, groups, colors, pieHeight, pieInnerRadius, pieOuterRadius }) {
  return (
    <div className={styles.column}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{label}</span>
        {/* Color is data-driven */}
        <span className={styles.sectionTotal} style={{ color: totalColor }}>{fmtFull(total)}</span>
      </div>
      {pieData.length > 0 && (
        <ResponsiveContainer width="100%" height={pieHeight}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={pieInnerRadius}
              outerRadius={pieOuterRadius}
              dataKey="value"
              labelLine={false}
              label={renderLabel}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className={styles.groupList}>
        {groups.map((g, i) => (
          <AccountGroup key={g.type} group={g} color={colors[i % colors.length]} />
        ))}
      </div>
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

  const isAsset     = (a) => Boolean(a.is_asset)
  const assets      = accounts.filter(isAsset)
  const liabilities = accounts.filter((a) => !isAsset(a))

  const assetGroups = groupAccounts(assets)
  const liabGroups  = groupAccounts(liabilities)

  const totalAssets = assets.reduce((s, a) => s + (a.current_balance || 0), 0)
  const totalLiab   = liabilities.reduce((s, a) => s + Math.abs(a.current_balance || 0), 0)

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
        <AccountSection
          label="Assets"
          total={totalAssets}
          totalColor="var(--color-positive)"
          pieData={assetPieData}
          groups={assetGroups}
          colors={ASSET_COLORS}
          pieHeight={pieHeight}
          pieInnerRadius={pieInnerRadius}
          pieOuterRadius={pieOuterRadius}
        />

        <div className={styles.divider} />

        <AccountSection
          label="Liabilities"
          total={totalLiab}
          totalColor="var(--color-negative)"
          pieData={liabPieData}
          groups={liabGroups}
          colors={LIAB_COLORS}
          pieHeight={pieHeight}
          pieInnerRadius={pieInnerRadius}
          pieOuterRadius={pieOuterRadius}
        />
      </div>
    </div>
  )
}
