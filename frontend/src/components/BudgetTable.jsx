import { useState } from 'react'
import styles from './BudgetTable.module.css'
import { fmtBudgetMonth } from './chartUtils.jsx'

function fmtDollar(n) {
  if (n == null) return '—'
  const abs = `$${Math.round(Math.abs(n)).toLocaleString()}`
  return n < 0 ? `(${abs})` : abs
}

function CellValue({ budgeted, actual, variance, isIncome }) {
  if (budgeted == null) return <span className={styles.empty}>—</span>
  const isOver  = !isIncome && variance != null && variance < 0
  const isUnder = !isIncome && variance != null && variance > 0
  const cls = isOver ? styles.over : isUnder ? styles.under : styles.neutral
  return (
    <span className={cls}>
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

function SummaryTable({ months, incomeCategories, expenseCategories }) {
  const summaryByMonth = {}
  for (const m of months) {
    const incActual   = incomeCategories.reduce((s, c) => s + (c.months?.[m]?.actual   ?? 0), 0)
    const incBudgeted = incomeCategories.reduce((s, c) => s + (c.months?.[m]?.budgeted ?? 0), 0)
    const expActual   = expenseCategories.reduce((s, c) => s + (c.months?.[m]?.actual   ?? 0), 0)
    const expBudgeted = expenseCategories.reduce((s, c) => s + (c.months?.[m]?.budgeted ?? 0), 0)
    summaryByMonth[m] = { incActual, incBudgeted, expActual, expBudgeted }
  }

  return (
    <div className={styles.summaryWrap}>
      <table className={styles.summaryTable}>
        <thead>
          <tr>
            <th className={styles.summaryRowLabel} />
            {months.map(m => (
              <th key={m} className={styles.summaryMonthHeader}>
                <span className={styles.monthName}>{fmtBudgetMonth(m)}</span>
                <span className={styles.monthSubLabel}>actual / budget</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={styles.summaryRowLabel}>Total Income</td>
            {months.map(m => {
              const { incActual, incBudgeted } = summaryByMonth[m]
              return (
                <td key={m} className={styles.summaryCell}>
                  {fmtDollar(incActual)} / {fmtDollar(incBudgeted)}
                </td>
              )
            })}
          </tr>
          <tr>
            <td className={styles.summaryRowLabel}>Total Expenses</td>
            {months.map(m => {
              const { expActual, expBudgeted } = summaryByMonth[m]
              return (
                <td key={m} className={styles.summaryCell}>
                  {fmtDollar(expActual)} / {fmtDollar(expBudgeted)}
                </td>
              )
            })}
          </tr>
          <tr className={styles.summaryNetRow}>
            <td className={styles.summaryRowLabel}>Net</td>
            {months.map(m => {
              const { incActual, incBudgeted, expActual, expBudgeted } = summaryByMonth[m]
              const netActual   = incActual   - expActual
              const netBudgeted = incBudgeted - expBudgeted
              return (
                <td key={m} className={styles.summaryCell}>
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
  )
}

export default function BudgetTable({ months, categories }) {
  if (!months || !categories) return null

  const incomeCategories  = categories.filter(c => c.group_type === 'income')
  const expenseCategories = categories.filter(c => c.group_type !== 'income')

  const expenseGroups = {}
  for (const cat of expenseCategories) {
    const g = cat.group_name || 'Other'
    if (!expenseGroups[g]) expenseGroups[g] = []
    expenseGroups[g].push(cat)
  }

  return (
    <div className={styles.container}>
      {/* ── Summary ── */}
      <h3 className={styles.title}>Summary</h3>
      <SummaryTable
        months={months}
        incomeCategories={incomeCategories}
        expenseCategories={expenseCategories}
      />

      {/* ── Category detail ── */}
      <h3 className={styles.detailTitle}>Category Detail</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.catHeader}>Category</th>
              {months.map(m => (
                <th key={m} className={styles.monthHeader}>
                  <span className={styles.monthName}>{fmtBudgetMonth(m)}</span>
                  <span className={styles.monthSubLabel}>actual / budget</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
