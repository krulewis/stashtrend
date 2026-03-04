/**
 * AccountsBreakdown — collapsible list of accounts grouped by type.
 *
 * NOTE: Pie charts were intentionally removed in Phase 1. The TypeStackedChart
 * component is now the primary account-type visualization. This component
 * provides the detail drill-down (expand/collapse) only.
 */
import { useState } from 'react'
import PropTypes from 'prop-types'
import styles from './AccountsBreakdown.module.css'
import { fmtFull } from './chartUtils.jsx'

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

function AccountGroup({ group }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.group}>
      <div className={styles.groupHeader} onClick={() => setOpen(!open)}>
        <span className={styles.groupName}>{group.type}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={styles.groupTotal}>{fmtFull(group.total)}</span>
          <span className={styles.expandIcon}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className={styles.accountList}>
          {group.accounts.map((acct) => (
            <div key={acct.id} className={styles.accountRow}>
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

function AccountSection({ label, totalColor, groups }) {
  const total = groups.reduce((s, g) => s + (g.is_asset ? g.total : -Math.abs(g.total)), 0)
  return (
    <div className={styles.column}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionTotal} style={{ color: totalColor }}>{fmtFull(Math.abs(total))}</span>
      </div>
      <div className={styles.groupList}>
        {groups.map((g) => (
          <AccountGroup key={g.type} group={g} />
        ))}
      </div>
    </div>
  )
}

export default function AccountsBreakdown({ accounts }) {
  if (!accounts) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading accounts…</div>
      </div>
    )
  }

  const assets      = accounts.filter((a) => Boolean(a.is_asset))
  const liabilities = accounts.filter((a) => !Boolean(a.is_asset))

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Account Breakdown</h2>
      <div className={styles.columns}>
        <AccountSection label="Assets"      totalColor="var(--color-positive)" groups={groupAccounts(assets)} />
        <div className={styles.divider} />
        <AccountSection label="Liabilities" totalColor="var(--color-negative)" groups={groupAccounts(liabilities)} />
      </div>
    </div>
  )
}

AccountsBreakdown.propTypes = {
  accounts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string,
    current_balance: PropTypes.number.isRequired,
    is_asset: PropTypes.number,
  })),
}
