import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { fmtFull, fmtPct } from './chartUtils.jsx'
import styles from './InvestmentAccountsTable.module.css'

const COLUMNS = [
  { key: 'name',                   label: 'Account',        hideClass: null },
  { key: 'current_value',          label: 'Value',          hideClass: null, alignRight: true },
  { key: 'total_return_dollars',   label: 'Return $',       hideClass: styles.hideBelow768, alignRight: true },
  { key: 'total_return_pct',       label: 'Return %',       hideClass: styles.hideBelow768, alignRight: true },
  { key: 'cagr_pct',               label: 'CAGR',           hideClass: styles.hideBelow1024, alignRight: true },
  { key: 'allocation_weight_pct',  label: 'Allocation',     hideClass: styles.hideBelow768, alignRight: true },
]

function Arrow({ value }) {
  if (value == null) return null
  return value > 0
    ? <span style={{ color: 'var(--color-positive)' }}>▲</span>
    : <span style={{ color: 'var(--color-negative)' }}>▼</span>
}

Arrow.propTypes = { value: PropTypes.number }

function sortIcon(col, sortCol, sortDir) {
  if (col !== sortCol) return <span aria-hidden="true"> ↕</span>
  return <span aria-hidden="true">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
}

function activeSortAttr(col, sortCol, sortDir) {
  if (col !== sortCol) return undefined
  return sortDir === 'asc' ? 'ascending' : 'descending'
}

function SkeletonRows() {
  return Array.from({ length: 4 }, (_, i) => (
    <tr key={i} className={styles.shimmerRow}>
      <td><div className={styles.shimmerCell} style={{ width: '140px' }} /></td>
      <td><div className={styles.shimmerCell} style={{ width: '90px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '80px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '70px' }} /></td>
      <td className={styles.hideBelow1024}><div className={styles.shimmerCell} style={{ width: '60px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '70px' }} /></td>
    </tr>
  ))
}

export default function InvestmentAccountsTable({ accounts, loading }) {
  const navigate = useNavigate()
  const [sortCol, setSortCol] = useState('current_value')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(col) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const sortedAccounts = useMemo(() => {
    if (!accounts) return []
    return [...accounts].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [accounts, sortCol, sortDir])

  const grouped = useMemo(() => {
    const retirement = sortedAccounts.filter((a) => a.bucket === 'Retirement')
    const brokerage  = sortedAccounts.filter((a) => a.bucket !== 'Retirement')
    return { retirement, brokerage }
  }, [sortedAccounts])

  const totals = useMemo(() => {
    if (!accounts) return {}
    const current_value = accounts.reduce((s, a) => s + (a.current_value ?? 0), 0)
    const total_return_dollars = accounts.every((a) => a.total_return_dollars == null)
      ? null
      : accounts.reduce((s, a) => s + (a.total_return_dollars ?? 0), 0)
    const basis = accounts.reduce((s, a) => s + (a.total_cost_basis ?? 0), 0)
    const total_return_pct = basis > 0 && total_return_dollars != null
      ? (total_return_dollars / basis) * 100
      : null
    return { current_value, total_return_dollars, total_return_pct }
  }, [accounts])

  function renderAccountRow(acct) {
    return (
      <tr
        key={acct.id}
        className={styles.accountRow}
        tabIndex={0}
        role="row"
        onClick={() => navigate(`/investments/${acct.id}`)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/investments/${acct.id}`)}
      >
        <td>
          <div className={styles.accountName}>{acct.name}</div>
          <div className={styles.institution}>{acct.institution}</div>
          {acct.is_stale && acct.stale_days < 7 && (
            <div className={styles.staleBadge}>Synced {acct.stale_days}d ago</div>
          )}
        </td>
        <td className={styles.alignRight}>{fmtFull(acct.current_value)}</td>
        <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
          {acct.total_return_dollars == null
            ? <span className={styles.muted}>N/A</span>
            : <span className={acct.total_return_dollars >= 0 ? styles.positive : styles.negative}>
                {acct.total_return_dollars > 0 ? '+' : ''}{fmtFull(acct.total_return_dollars)}
              </span>
          }
        </td>
        <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
          {acct.total_return_pct == null
            ? <span className={styles.muted}>N/A</span>
            : <span className={acct.total_return_pct >= 0 ? styles.positive : styles.negative}>
                <Arrow value={acct.total_return_pct} /> {fmtPct(acct.total_return_pct)}
              </span>
          }
        </td>
        <td className={`${styles.hideBelow1024} ${styles.alignRight}`}>
          {acct.cagr_pct == null
            ? <span className={styles.muted}>—</span>
            : <span className={acct.cagr_pct >= 0 ? styles.positive : styles.negative}>
                {fmtPct(acct.cagr_pct)}
              </span>
          }
        </td>
        <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
          {acct.allocation_weight_pct == null
            ? <span className={styles.muted}>—</span>
            : <span className={styles.secondary}>{acct.allocation_weight_pct.toFixed(1)}%</span>
          }
        </td>
      </tr>
    )
  }

  function renderGroupRows() {
    const rows = []
    if (grouped.retirement.length > 0) {
      rows.push(
        <tr key="group-retirement" className={styles.groupHeader}>
          <td colSpan={COLUMNS.length}>Retirement</td>
        </tr>
      )
      grouped.retirement.forEach((acct) => rows.push(renderAccountRow(acct)))
    }
    if (grouped.brokerage.length > 0) {
      rows.push(
        <tr key="group-brokerage" className={styles.groupHeader}>
          <td colSpan={COLUMNS.length}>Brokerage</td>
        </tr>
      )
      grouped.brokerage.forEach((acct) => rows.push(renderAccountRow(acct)))
    }
    if (rows.length === 0) {
      rows.push(
        <tr key="empty" className={styles.emptyRow}>
          <td colSpan={COLUMNS.length}>No investment accounts found.</td>
        </tr>
      )
    }
    return rows
  }

  return (
    <div className={styles.container}>
      <div className={styles.tableTitle}>Accounts</div>
      <div className={styles.tableWrapper}>
        <table aria-label="Investment accounts">
          <caption className={styles.visuallyHidden}>
            Investment accounts sorted by {sortCol} {sortDir}
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={activeSortAttr(col.key, sortCol, sortDir)}
                  tabIndex={0}
                  className={[col.hideClass, col.alignRight ? styles.alignRight : ''].filter(Boolean).join(' ')}
                  onClick={() => handleSort(col.key)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort(col.key)}
                >
                  {col.label}{sortIcon(col.key, sortCol, sortDir)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <SkeletonRows /> : renderGroupRows()}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={styles.alignRight}>{fmtFull(totals.current_value)}</td>
              <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
                {totals.total_return_dollars == null
                  ? <span className={styles.muted}>N/A</span>
                  : <span className={totals.total_return_dollars >= 0 ? styles.positive : styles.negative}>
                      {totals.total_return_dollars > 0 ? '+' : ''}{fmtFull(totals.total_return_dollars)}
                    </span>
                }
              </td>
              <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
                {totals.total_return_pct == null
                  ? <span className={styles.muted}>N/A</span>
                  : <span className={totals.total_return_pct >= 0 ? styles.positive : styles.negative}>
                      <Arrow value={totals.total_return_pct} /> {fmtPct(totals.total_return_pct)}
                    </span>
                }
              </td>
              <td className={styles.hideBelow1024} />
              <td className={styles.hideBelow768} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

InvestmentAccountsTable.propTypes = {
  accounts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    institution: PropTypes.string,
    bucket: PropTypes.string,
    current_value: PropTypes.number,
    total_cost_basis: PropTypes.number,
    total_return_dollars: PropTypes.number,
    total_return_pct: PropTypes.number,
    cagr_pct: PropTypes.number,
    allocation_weight_pct: PropTypes.number,
    is_stale: PropTypes.bool,
    stale_days: PropTypes.number,
  })),
  loading: PropTypes.bool,
}
