/**
 * Retirement projection math utilities.
 * Pure functions — no React, no side effects.
 */

/**
 * Compute the nest egg required to sustain desiredAnnualIncome in retirement.
 * Uses the safe withdrawal rate method (e.g. 4% rule).
 *
 * @param {number} desiredAnnualIncome  - Annual spending goal
 * @param {number} socialSecurityAnnual - Expected annual SS income
 * @param {number} withdrawalRatePct    - e.g. 4 for 4%
 * @returns {number|null} Required nest egg, or null if inputs insufficient
 */
export function computeNestEgg(desiredAnnualIncome, socialSecurityAnnual, withdrawalRatePct) {
  if (!withdrawalRatePct || withdrawalRatePct <= 0) return null
  if (desiredAnnualIncome == null) return null

  const incomeGap = desiredAnnualIncome - (socialSecurityAnnual ?? 0)
  if (incomeGap <= 0) return 0

  return Math.round((incomeGap / withdrawalRatePct) * 100)
}

/**
 * Generate a monthly projection series from startDate forward.
 * Uses new Date(year, month + i, 1) each iteration to avoid month-end drift.
 *
 * @param {object} opts
 * @param {number} opts.currentNetWorth      - Starting portfolio value
 * @param {number} opts.monthlyContribution  - Amount added each month
 * @param {number} opts.annualReturnPct      - e.g. 7 for 7%
 * @param {number} opts.years                - How many years to project
 * @param {Date}   opts.startDate            - Projection start (default: today)
 * @returns {Array<{date: string, projected_net_worth: number}>}
 */
export function generateProjectionSeries({
  currentNetWorth,
  monthlyContribution,
  annualReturnPct,
  years,
  startDate = new Date(),
}) {
  const monthlyRate = annualReturnPct / 100 / 12
  const totalMonths = years * 12
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth()

  let balance = currentNetWorth ?? 0
  const series = []

  for (let i = 0; i <= totalMonths; i++) {
    const d = new Date(startYear, startMonth + i, 1)
    const label = d.toISOString().slice(0, 10)

    series.push({ date: label, projected_net_worth: Math.round(balance) })

    balance = balance * (1 + monthlyRate) + (monthlyContribution ?? 0)
  }

  return series
}

/**
 * Merge historical NW series with projection series.
 * Overlap dates get both net_worth and projected_net_worth keys.
 *
 * @param {Array<{date: string, net_worth: number}>} history
 * @param {Array<{date: string, projected_net_worth: number}>} projection
 * @returns {Array} Sorted merged array
 */
export function mergeHistoryWithProjection(history, projection) {
  const map = new Map()
  for (const pt of history) map.set(pt.date, { ...pt })
  for (const pt of projection) {
    const existing = map.get(pt.date)
    if (existing) {
      existing.projected_net_worth = pt.projected_net_worth
    } else {
      map.set(pt.date, { date: pt.date, projected_net_worth: pt.projected_net_worth })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}
