import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { fmtFull, fmtPct } from './chartUtils.jsx'
import styles from './HoldingsTable.module.css'

const TYPE_OPTIONS = ['All', 'Stock', 'ETF', 'Mutual Fund', 'Bond', 'Cash', 'Other']

const TYPE_COLORS = {
  Stock: '#4D9FFF',
  ETF: '#2ECC8A',
  Bond: '#F5A623',
  'Mutual Fund': '#9B7FE8',
  Cash: '#5EDDA8',
  Other: '#4A6080',
}

const COLUMNS = [
  { key: 'ticker',                      label: 'Ticker',     hideClass: null, alignRight: false },
  { key: 'security_name',               label: 'Name',       hideClass: 'hideBelow768', alignRight: false },
  { key: 'security_type',               label: 'Type',       hideClass: 'hideBelow768', alignRight: false },
  { key: 'quantity',                    label: 'Qty',        hideClass: 'hideBelow1024', alignRight: true },
  { key: 'cost_basis',                  label: 'Cost Basis', hideClass: 'hideBelow1024', alignRight: true },
  { key: 'current_value',               label: 'Value',      hideClass: null, alignRight: true },
  { key: 'unrealized_gain_loss_dollars', label: 'Gain/Loss $', hideClass: 'hideBelow768', alignRight: true },
  { key: 'unrealized_gain_loss_pct',    label: 'Gain/Loss %', hideClass: 'hideBelow768', alignRight: true },
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

function SkeletonRows({ n }) {
  return Array.from({ length: n }, (_, i) => (
    <tr key={i} className={styles.shimmerRow}>
      <td><div className={styles.shimmerCell} style={{ width: '60px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '140px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '80px' }} /></td>
      <td className={styles.hideBelow1024}><div className={styles.shimmerCell} style={{ width: '60px' }} /></td>
      <td className={styles.hideBelow1024}><div className={styles.shimmerCell} style={{ width: '80px' }} /></td>
      <td><div className={styles.shimmerCell} style={{ width: '80px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '70px' }} /></td>
      <td className={styles.hideBelow768}><div className={styles.shimmerCell} style={{ width: '70px' }} /></td>
    </tr>
  ))
}

SkeletonRows.propTypes = { n: PropTypes.number }

function getHideClass(hideClassKey) {
  if (!hideClassKey) return ''
  if (hideClassKey === 'hideBelow768') return styles.hideBelow768
  if (hideClassKey === 'hideBelow1024') return styles.hideBelow1024
  return ''
}

export default function HoldingsTable({ holdings, accountName, loading }) {
  const [sortCol, setSortCol] = useState('current_value')
  const [sortDir, setSortDir] = useState('desc')
  const [typeFilter, setTypeFilter] = useState('All')

  function handleSort(col) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const filteredHoldings = useMemo(() => {
    if (!holdings) return []
    if (typeFilter === 'All') return holdings
    return holdings.filter((h) => h.security_type === typeFilter)
  }, [holdings, typeFilter])

  const sortedHoldings = useMemo(() => {
    return [...filteredHoldings].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [filteredHoldings, sortCol, sortDir])

  const totals = useMemo(() => {
    if (!sortedHoldings.length) return {}
    const current_value = sortedHoldings.reduce((s, h) => s + (h.current_value ?? 0), 0)
    const cost_basis = sortedHoldings.every((h) => h.cost_basis == null)
      ? null
      : sortedHoldings.reduce((s, h) => s + (h.cost_basis ?? 0), 0)
    const gain_loss = cost_basis != null ? current_value - cost_basis : null
    const gain_loss_pct = cost_basis != null && cost_basis !== 0
      ? (gain_loss / cost_basis) * 100
      : null
    return { current_value, cost_basis, gain_loss, gain_loss_pct }
  }, [sortedHoldings])

  return (
    <div className={styles.container}>
      <div className={styles.controlsRow}>
        <span className={styles.tableTitle}>Holdings</span>
        <select
          aria-label="Filter by security type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={styles.typeSelect}
          disabled={loading}
        >
          {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className={styles.tableWrapper}>
        <table aria-label={`Holdings for ${accountName}`}>
          <caption className={styles.visuallyHidden}>
            Holdings sorted by {sortCol} {sortDir}, filtered by {typeFilter}
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={activeSortAttr(col.key, sortCol, sortDir)}
                  tabIndex={0}
                  className={[
                    getHideClass(col.hideClass),
                    col.alignRight ? styles.alignRight : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleSort(col.key)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort(col.key)}
                >
                  {col.label}{sortIcon(col.key, sortCol, sortDir)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows n={5} />
            ) : sortedHoldings.length === 0 ? (
              <tr className={styles.emptyRow}>
                <td colSpan={COLUMNS.length}>
                  {typeFilter !== 'All'
                    ? `No ${typeFilter} holdings in this account.`
                    : 'No holdings found.'}
                </td>
              </tr>
            ) : (
              sortedHoldings.map((h, idx) => {
                const type = h.security_type || 'Other'
                const typeColor = TYPE_COLORS[type] || TYPE_COLORS.Other
                return (
                  <tr key={idx}>
                    <td>
                      {h.ticker
                        ? <span className={styles.ticker}>{h.ticker}</span>
                        : <span className={styles.tickerNull}>N/A</span>
                      }
                      {h.is_manual === 1 && (
                        <span className={styles.manualBadge}>Manual</span>
                      )}
                    </td>
                    <td className={styles.hideBelow768}>
                      <span className={styles.securityName}>
                        {h.security_name || 'Unknown Security'}
                      </span>
                    </td>
                    <td className={styles.hideBelow768}>
                      <span
                        className={styles.typeBadge}
                        style={{
                          color: typeColor,
                          background: typeColor + '22',
                          border: `1px solid ${typeColor}55`,
                        }}
                      >
                        {type}
                      </span>
                    </td>
                    <td className={`${styles.hideBelow1024} ${styles.alignRight}`}>
                      {h.quantity != null ? h.quantity.toFixed(4) : '--'}
                    </td>
                    <td className={`${styles.hideBelow1024} ${styles.alignRight}`}>
                      {h.cost_basis != null ? fmtFull(h.cost_basis) : '--'}
                    </td>
                    <td className={styles.alignRight}>{fmtFull(h.current_value)}</td>
                    <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
                      {h.unrealized_gain_loss_dollars == null
                        ? <span className={styles.muted}>N/A</span>
                        : <span className={h.unrealized_gain_loss_dollars >= 0 ? styles.positive : styles.negative}>
                            {h.unrealized_gain_loss_dollars > 0 ? '+' : ''}{fmtFull(h.unrealized_gain_loss_dollars)}
                          </span>
                      }
                    </td>
                    <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
                      {h.unrealized_gain_loss_pct == null
                        ? <span className={styles.muted}>N/A</span>
                        : <span className={h.unrealized_gain_loss_pct >= 0 ? styles.positive : styles.negative}>
                            <Arrow value={h.unrealized_gain_loss_pct} /> {fmtPct(h.unrealized_gain_loss_pct)}
                          </span>
                      }
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {!loading && sortedHoldings.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className={styles.hideBelow768} />
                <td className={styles.hideBelow1024} />
                <td className={`${styles.hideBelow1024} ${styles.alignRight}`}>
                  {totals.cost_basis != null ? fmtFull(totals.cost_basis) : '--'}
                </td>
                <td className={styles.alignRight}>{fmtFull(totals.current_value)}</td>
                <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
                  {totals.gain_loss == null
                    ? <span className={styles.muted}>N/A</span>
                    : <span className={totals.gain_loss >= 0 ? styles.positive : styles.negative}>
                        {totals.gain_loss > 0 ? '+' : ''}{fmtFull(totals.gain_loss)}
                      </span>
                  }
                </td>
                <td className={`${styles.hideBelow768} ${styles.alignRight}`}>
                  {totals.gain_loss_pct == null
                    ? <span className={styles.muted}>N/A</span>
                    : <span className={totals.gain_loss_pct >= 0 ? styles.positive : styles.negative}>
                        <Arrow value={totals.gain_loss_pct} /> {fmtPct(totals.gain_loss_pct)}
                      </span>
                  }
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>
        {sortCol} sorted {sortDir}
      </div>
    </div>
  )
}

HoldingsTable.propTypes = {
  holdings: PropTypes.arrayOf(PropTypes.shape({
    ticker: PropTypes.string,
    security_name: PropTypes.string,
    security_type: PropTypes.string,
    quantity: PropTypes.number,
    cost_basis: PropTypes.number,
    current_value: PropTypes.number,
    unrealized_gain_loss_dollars: PropTypes.number,
    unrealized_gain_loss_pct: PropTypes.number,
    is_manual: PropTypes.number,
  })),
  accountName: PropTypes.string,
  loading: PropTypes.bool,
}
