import { useState } from 'react'
import PropTypes from 'prop-types'
import styles from './BuilderResultsTable.module.css'
import { fmtDollar, fmtBudgetMonth } from './chartUtils.jsx'

function CategoryGroup({ groupName, items, months, onCellEdit }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <tr className={styles.groupRow} onClick={() => setOpen(o => !o)}>
        <td colSpan={months.length + 1}>
          <span className={styles.groupToggle}>{open ? '▼' : '▶'}</span>
          {groupName}
        </td>
      </tr>
      {open && items.map(item => (
        <tr key={item.category_id} className={styles.catRow} title={item.rationale}>
          <td>{item.category_name}</td>
          {months.map(m => {
            const val = item.months?.[m]
            return (
              <td key={m}>
                <input
                  type="number"
                  className={styles.cellInput}
                  value={val ?? ''}
                  onChange={e => {
                    const num = e.target.value === '' ? 0 : Number(e.target.value)
                    onCellEdit(item.category_id, m, num)
                  }}
                  onBlur={e => {
                    const num = e.target.value === '' ? 0 : Number(e.target.value)
                    onCellEdit(item.category_id, m, num)
                  }}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

CategoryGroup.propTypes = {
  groupName: PropTypes.string.isRequired,
  items: PropTypes.array.isRequired,
  months: PropTypes.array.isRequired,
  onCellEdit: PropTypes.func.isRequired,
}

export default function BuilderResultsTable({ plan, loading, onCellEdit, onSavePlan, onApply, applyResult }) {
  const [showConfirm, setShowConfirm] = useState(false)

  if (!plan) return null

  const lineItems = plan.line_items || []
  const months = lineItems.length > 0
    ? Object.keys(lineItems[0].months || {}).sort()
    : []

  // Group by group_name
  const groups = {}
  for (const item of lineItems) {
    const g = item.group_name || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(item)
  }

  // Totals per month
  const totals = {}
  for (const m of months) {
    totals[m] = lineItems.reduce((sum, item) => sum + (item.months?.[m] ?? 0), 0)
  }

  const totalItems = lineItems.reduce((sum, item) => sum + Object.keys(item.months || {}).length, 0)

  return (
    <div className={styles.container}>
      {plan.summary && (
        <div className={styles.summary}>{plan.summary}</div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.catHeader}>Category</th>
              {months.map(m => <th key={m}>{fmtBudgetMonth(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([groupName, items]) => (
              <CategoryGroup key={groupName} groupName={groupName} items={items}
                months={months} onCellEdit={onCellEdit} />
            ))}
            <tr className={styles.totalRow}>
              <td>Total</td>
              {months.map(m => <td key={m}>{fmtDollar(totals[m])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={onSavePlan} disabled={loading}>
          Save Plan
        </button>
        <button className={styles.btnSuccess} onClick={() => setShowConfirm(true)} disabled={loading}>
          Apply to Monarch
        </button>
      </div>

      {showConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setShowConfirm(false)}>
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmTitle}>Confirm Apply</div>
            <div className={styles.confirmBody}>
              This will push {totalItems} budget amounts to Monarch Money.
              This action updates your live budget data.
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnGhost} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className={styles.btnSuccess} onClick={() => { setShowConfirm(false); onApply() }}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {applyResult && (
        <div className={styles.applyResult}>
          <span className={styles.resultSuccess}>{applyResult.applied} applied</span>
          {applyResult.failed > 0 && (
            <>
              {' · '}
              <span className={styles.resultFailed}>{applyResult.failed} failed</span>
              <ul className={styles.errorList}>
                {applyResult.errors?.map((e, i) => (
                  <li key={i}>{e.category_id} ({e.month}): {e.error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

BuilderResultsTable.propTypes = {
  plan: PropTypes.object,
  historicalData: PropTypes.object,
  loading: PropTypes.bool.isRequired,
  onCellEdit: PropTypes.func.isRequired,
  onSavePlan: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  applyResult: PropTypes.object,
}
