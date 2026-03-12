import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'
import { fmtFull, fmtPct } from './chartUtils.jsx'
import styles from './AccountDetailHeader.module.css'

function relativeTime(isoStr) {
  if (!isoStr) return 'unknown'
  const diffMs = Date.now() - Date.parse(isoStr)
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 1) return 'just now'
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

function MetricItem({ label, children, className }) {
  return (
    <div className={`${styles.metric}${className ? ` ${className}` : ''}`}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{children}</div>
    </div>
  )
}

MetricItem.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
  className: PropTypes.string,
}

export default function AccountDetailHeader({ account, totals }) {
  // last_synced_at is read from the account object (set by the holdings endpoint)
  const isStale = account?.last_synced_at
    ? (Date.now() - Date.parse(account.last_synced_at)) / (1000 * 60 * 60 * 24) > 1
    : false

  const gainLoss = totals?.unrealized_gain_loss_dollars
  const gainLossPct = totals?.unrealized_gain_loss_pct

  return (
    <div className={styles.container}>
      <Link to="/investments" className={styles.backLink}>← Investments</Link>

      <div className={styles.accountIdentity}>
        <div>
          <div className={styles.accountName}>{account?.name}</div>
          <div className={styles.institution}>
            {account?.institution}
            {account?.bucket && (
              <span className={styles.bucketBadge}>{account.bucket}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.metricsRow}>
        <MetricItem label="CURRENT VALUE">
          {fmtFull(totals?.current_value)}
        </MetricItem>

        <MetricItem label="TOTAL RETURN">
          {gainLoss == null ? (
            <span className={styles.muted}>N/A</span>
          ) : (
            <span className={gainLoss >= 0 ? styles.positive : styles.negative}>
              {gainLoss > 0 ? '+' : ''}{fmtFull(gainLoss)}
              {gainLossPct != null && (
                <span className={styles.metricSub}>
                  {fmtPct(gainLossPct)}
                </span>
              )}
            </span>
          )}
        </MetricItem>

        <MetricItem label="COST BASIS">
          {totals?.total_cost_basis != null ? fmtFull(totals.total_cost_basis) : 'N/A'}
        </MetricItem>

        <MetricItem label="HOLDINGS" className={styles.desktopOnly}>
          {totals?.holdings_count != null ? `${totals.holdings_count} positions` : '—'}
        </MetricItem>
      </div>

      <div className={styles.lastSynced}>
        Last synced: {relativeTime(account?.last_synced_at)}
        {isStale && <span className={styles.staleBadge}>Stale</span>}
      </div>
    </div>
  )
}

AccountDetailHeader.propTypes = {
  account: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    institution: PropTypes.string,
    bucket: PropTypes.string,
    last_synced_at: PropTypes.string,
  }).isRequired,
  totals: PropTypes.shape({
    current_value: PropTypes.number,
    total_cost_basis: PropTypes.number,
    unrealized_gain_loss_dollars: PropTypes.number,
    unrealized_gain_loss_pct: PropTypes.number,
    holdings_count: PropTypes.number,
  }).isRequired,
}
