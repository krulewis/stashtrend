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

function CellValue({ budgeted, actual, variance, isIncome }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>
  // For income: variance < 0 means earned more than budgeted (good = under)
  // For expenses: variance < 0 means spent more than budgeted (bad = over)
  const isOver = !isIncome && variance != null && variance < 0
  const isUnder = !isIncome && variance != null && variance > 0
  const cls = isOver ? styles.over : isUnder ? styles.under : styles.neutral
  return (
    <span className={cls}>
      {fmtDollar(actual)} / {fmtDollar(budgeted)}
    </span>
  )
}

function TotalCell({ months, categories, targetMonth, isIncome }) {
  const budgeted = categories.reduce((sum, cat) => sum + (cat.months?.[targetMonth]?.budgeted ?? 0), 0)
  const actual   = categories.reduce((sum, cat) => sum + (cat.months?.[targetMonth]?.actual   ?? 0), 0)
  return (
    <span className={styles.totalValue}>
      {fmtDollar(actual)} / {fmtDollar(budgeted)}
    </span>
  )
}

function CategoryGroup({ groupName, categories, months, isIncome }) {
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
                      isIncome={isIncome}
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

  const incomeCategories  = categories.filter(c => c.group_type === 'income')
  const expenseCategories = categories.filter(c => c.group_type !== 'income')

  // Group expense categories by group_name, preserving order
  const expenseGroups = {}
  for (const cat of expenseCategories) {
    const g = cat.group_name || 'Other'
    if (!expenseGroups[g]) expenseGroups[g] = []
    expenseGroups[g].push(cat)
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
            {/* ── Income section ── */}
            <tr className={styles.sectionHeader}>
              <td colSpan={months.length + 1}>Income</td>
            </tr>
            {incomeCategories.map(cat => (
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
                            isIncome={true}
                          />
                        : <span className={styles.empty}>—</span>
                      }
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td className={styles.totalLabel}>Total Income</td>
              {months.map(m => (
                <td key={m} className={styles.cell}>
                  <TotalCell categories={incomeCategories} targetMonth={m} />
                </td>
              ))}
            </tr>

            {/* ── Expenses section ── */}
            <tr className={styles.sectionHeader}>
              <td colSpan={months.length + 1}>Expenses</td>
            </tr>
            {Object.entries(expenseGroups).map(([groupName, cats]) => (
              <CategoryGroup
                key={groupName}
                groupName={groupName}
                categories={cats}
                months={months}
                isIncome={false}
              />
            ))}
            <tr className={styles.totalRow}>
              <td className={styles.totalLabel}>Total Expenses</td>
              {months.map(m => (
                <td key={m} className={styles.cell}>
                  <TotalCell categories={expenseCategories} targetMonth={m} />
                </td>
              ))}
            </tr>

            {/* ── Net row ── */}
            <tr className={styles.netRow}>
              <td className={styles.totalLabel}>Net</td>
              {months.map(m => {
                const incBudgeted = incomeCategories.reduce((s, c) => s + (c.months?.[m]?.budgeted ?? 0), 0)
                const incActual   = incomeCategories.reduce((s, c) => s + (c.months?.[m]?.actual   ?? 0), 0)
                const expBudgeted = expenseCategories.reduce((s, c) => s + (c.months?.[m]?.budgeted ?? 0), 0)
                const expActual   = expenseCategories.reduce((s, c) => s + (c.months?.[m]?.actual   ?? 0), 0)
                const netBudgeted = incBudgeted - expBudgeted
                const netActual   = incActual   - expActual
                return (
                  <td key={m} className={styles.cell}>
                    <span className={netActual >= 0 ? styles.netPositive : styles.netNegative}>
                      {fmtDollar(netActual)} / {fmtDollar(netBudgeted)}
                    </span>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
