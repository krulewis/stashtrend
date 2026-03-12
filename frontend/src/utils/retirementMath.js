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

/**
 * Extracts investable capital (Retirement + Brokerage) from the latest point
 * in typeData.series. Returns null if series is empty or missing.
 *
 * @param {object} typeData - Net worth by type data object with a series array
 * @returns {number|null} Sum of Retirement + Brokerage balances, or null
 */
export function getInvestableCapital(typeData) {
  if (!typeData?.series?.length) return null
  const latest = typeData.series[typeData.series.length - 1]
  return (latest?.Retirement ?? 0) + (latest?.Brokerage ?? 0)
}

/**
 * Compute a balance-weighted blended CAGR from typeData.cagr.
 * Picks the best available period for each bucket (5y > 3y > 1y).
 * Falls back to 7.0 if no CAGR data is available.
 *
 * @param {object} typeData - Net worth by type data object
 * @returns {number} Blended CAGR as a percentage (e.g. 7.0 for 7%)
 */
export function computeBlendedCAGR(typeData) {
  const pickBest = (cagrObj) =>
    cagrObj?.['5y'] ?? cagrObj?.['3y'] ?? cagrObj?.['1y'] ?? null

  const latest = typeData?.series?.[typeData?.series?.length - 1] ?? {}
  const retBal = latest?.Retirement ?? 0
  const brokBal = latest?.Brokerage ?? 0

  const retCAGR = pickBest(typeData?.cagr?.Retirement)
  const brokCAGR = pickBest(typeData?.cagr?.Brokerage)

  if (retCAGR == null && brokCAGR == null) return 7.0
  if (retCAGR == null) return brokCAGR
  if (brokCAGR == null) return retCAGR

  const totalBal = retBal + brokBal
  if (totalBal > 0) {
    return (retBal * retCAGR + brokBal * brokCAGR) / totalBal
  }
  // Edge case: both buckets have CAGR data but $0 balance — simple average
  return (retCAGR + brokCAGR) / 2
}

/**
 * Calculate the monthly contribution needed to reach a target nest egg by retirement.
 * Uses the closed-form future-value annuity formula to solve for payment.
 * Rounds up to the nearest $100 and applies a floor of currentContribution
 * (never suggests a contribution cut).
 *
 * @param {object} opts
 * @param {number} opts.currentNetWorth      - Current investable capital
 * @param {number} opts.currentContribution  - Current monthly contribution
 * @param {number} opts.annualReturnPct      - e.g. 7 for 7%
 * @param {number} opts.years                - Years until retirement
 * @param {number} opts.targetAmount         - Nest egg target
 * @returns {number|null} Suggested monthly contribution, or null if not applicable
 *
 * @note Uses simple monthly rate approximation (annualReturnPct / 100 / 12) for
 * consistency with generateProjectionSeries. Do not "fix" one without the other.
 */
export function calculateContributionToTarget({
  currentNetWorth,
  currentContribution,
  annualReturnPct,
  years,
  targetAmount,
}) {
  if (years <= 0 || targetAmount == null) return null

  const r = annualReturnPct / 100 / 12
  const n = years * 12

  if (r === 0) {
    const neededMonthly = (targetAmount - currentNetWorth) / n
    if (neededMonthly <= currentContribution) return currentContribution
    return Math.ceil(neededMonthly / 100) * 100
  }

  const fvLump = currentNetWorth * Math.pow(1 + r, n)
  const shortfall = targetAmount - fvLump
  if (shortfall <= 0) return currentContribution  // already on track from growth alone

  const neededContrib = shortfall * r / (Math.pow(1 + r, n) - 1)
  const result = Math.ceil(neededContrib / 100) * 100
  return Math.max(result, currentContribution)  // floor: never suggest a cut
}
