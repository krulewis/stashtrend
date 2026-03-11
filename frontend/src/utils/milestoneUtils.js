/**
 * milestoneUtils.js — Pure functions for milestone data derivation.
 * No React. Fully unit-testable in isolation.
 */

/**
 * Sort milestones ascending by amount. Does not mutate the input array.
 * @param {Array<{label: string, amount: number}>} milestones
 * @returns {Array<{label: string, amount: number}>}
 */
export function sortMilestones(milestones) {
  return [...milestones].sort((a, b) => a.amount - b.amount)
}

/**
 * Compute investable capital (Retirement + Brokerage) from the last series entry.
 * Cross-reference: RetirementPanel.jsx line 44 uses the same bucket sum.
 * @param {Array} series - typeData.series array
 * @returns {number}
 */
export function computeInvestableCapital(series) {
  if (!series || series.length === 0) return 0
  const latest = series[series.length - 1]
  return (latest.Retirement ?? 0) + (latest.Brokerage ?? 0)
}

/**
 * Build a per-point investable capital series from typeData.series.
 * @param {Array} series - typeData.series array
 * @returns {Array<{date: string, value: number}>}
 */
export function buildInvestableSeries(series) {
  if (!series || series.length === 0) return []
  return series.map((d) => ({
    date: d.date,
    value: (d.Retirement ?? 0) + (d.Brokerage ?? 0),
  }))
}

/**
 * Classify milestones into achieved / in-progress / future states.
 * Accepts sorted milestone array (optionally with a nest egg appended).
 *
 * @param {Array} sorted - sorted milestones, each {label, amount, ...}
 * @param {number} investableCapital - current investable capital (already Math.max(0, raw))
 * @param {number|null} nestEgg - computed nest egg target, or null
 * @returns {Array} enriched milestones with {progress, state, isNestEgg} added
 */
export function classifyMilestones(sorted, investableCapital, nestEgg) {
  const allItems = nestEgg != null
    ? [...sorted, { label: 'Nest Egg', amount: nestEgg, isNestEgg: true }]
    : sorted.map((m) => ({ ...m, isNestEgg: false }))

  let foundInProgress = false
  return allItems.map((m) => {
    const isNestEgg = m.isNestEgg ?? false
    const progress = m.amount > 0
      ? Math.min(1, investableCapital / m.amount)
      : (investableCapital > 0 ? 1 : 0)

    let state
    if (investableCapital >= m.amount) {
      state = 'achieved'
    } else if (!foundInProgress) {
      state = 'in-progress'
      foundInProgress = true
    } else {
      state = 'future'
    }

    return { ...m, progress, state, isNestEgg }
  })
}

/**
 * Format a short date string "Mon 'YY" from an ISO date string.
 * Uses T00:00:00 suffix to avoid timezone midnight rollover.
 * @param {string} isoDateStr - e.g. "2024-01-01"
 * @returns {string} e.g. "Jan '24"
 */
export function formatDateShort(isoDateStr) {
  const d = new Date(isoDateStr + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year = d.toLocaleDateString('en-US', { year: '2-digit' })
  return `${month} '${year}`
}

/**
 * Scan the investable series for the first point where value >= amount.
 * Returns formatted "Mon 'YY" or null if never reached.
 *
 * Note: if the first data point already exceeds the amount, returns that first
 * date — this may reflect account data imported mid-history rather than the
 * true achievement date.
 *
 * @param {Array<{date: string, value: number}>} investableSeries
 * @param {number} amount
 * @returns {string|null}
 */
export function findAchievementDate(investableSeries, amount) {
  if (!investableSeries || investableSeries.length === 0) return null
  for (const pt of investableSeries) {
    if (pt.value >= amount) {
      return formatDateShort(pt.date)
    }
  }
  return null
}

/**
 * Scan the projection series for the first point where projected_net_worth >= amount.
 * Returns "Mon 'YY" or null.
 * Returns "50+ yrs" when the series is capped at 50 years and no crossing is found.
 *
 * @param {Array<{date: string, projected_net_worth: number}>} projectionSeries
 * @param {number} amount
 * @returns {string|null}
 */
export function findProjectedDate(projectionSeries, amount) {
  if (!projectionSeries || projectionSeries.length === 0) return null
  for (const pt of projectionSeries) {
    if (pt.projected_net_worth >= amount) {
      return formatDateShort(pt.date)
    }
  }
  // Series did not reach the target — return sentinel indicating cap was reached
  return '50+ yrs'
}

/**
 * Map-merge investable series with projection series.
 * Same logic as mergeHistoryWithProjection in retirementMath.js but using
 * key names {date, investableCapital, projectedCapital} instead of
 * {date, net_worth, projected_net_worth}.
 *
 * Historical points: {date, investableCapital: value}
 * Projection points: {date, projectedCapital}
 * Overlap dates: both keys present.
 *
 * @param {Array<{date: string, value: number}>} investableSeries
 * @param {Array<{date: string, projected_net_worth: number}>|null} projectionSeries
 * @returns {Array<{date: string, investableCapital?: number, projectedCapital?: number}>}
 */
export function buildMergedSeries(investableSeries, projectionSeries) {
  const map = new Map()

  for (const pt of investableSeries) {
    map.set(pt.date, { date: pt.date, investableCapital: pt.value })
  }

  if (projectionSeries) {
    for (const pt of projectionSeries) {
      const existing = map.get(pt.date)
      if (existing) {
        existing.projectedCapital = pt.projected_net_worth
      } else {
        map.set(pt.date, { date: pt.date, projectedCapital: pt.projected_net_worth })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}
