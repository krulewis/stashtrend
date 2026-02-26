import { useState } from 'react'
import styles from './BudgetTable.module.css'

function fmtMonth(m) {
  const d = new Date(m + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year = d.toLocaleDateString('en-US', { year: '2-digit' })
  return `${month} '${year}`
}

function fmtDollar(n) {
  if (n == null) return '—'
  return `$${Math.round(Math.abs(n)).toLocaleString()}`
}

function CellValue({ budgeted, actual, variance }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>
  const isOver = variance != null && variance < 0
  return (
    <span className={isOver ? styles.over : styles.under}>
      {fmtDollar(actual)} / {fmtDollar(budgeted)}
    </span>
  )
}

function CategoryGroup({ groupName, categories, months }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <tr className={styles.groupRow} onClick={() => setOpen(o => !o)}>
        <td colSpan={months.length + 1}>
          <span className={styles.groupToggle}>{open ? '▼' : '▶'}</span>
          {groupName}
        </td>
      </tr>
      {open && categories.map(cat => (
        <tr key={cat.category_id} className={styles.catRow}>
          <td className={styles.catName}>{cat.category_name}</td>
          {months.map(m => {
            const cell = cat.months?.[m]
            return (
              <td key={m} className={styles.cell}>
                {cell
                  ? <CellValue
                      budgeted={cell.budgeted}
                      actual={cell.actual}
                      variance={cell.variance}
                    />
                  : <span className={styles.empty}>—</span>
                }
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

export default function BudgetTable({ months, categories }) {
  if (!months || !categories) return null

  // Group categories by group_name, preserving order
  const groups = {}
  for (const cat of categories) {
    const g = cat.group_name || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(cat)
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Category Detail</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.catHeader}>Category</th>
              {months.map(m => (
                <th key={m} className={styles.monthHeader}>{fmtMonth(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([groupName, cats]) => (
              <CategoryGroup
                key={groupName}
                groupName={groupName}
                categories={cats}
                months={months}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
