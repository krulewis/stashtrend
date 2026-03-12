/**
 * useMilestoneData — Custom hook that computes all derived milestone data
 * consumed by MilestoneCardsView.
 *
 * Uses useMemo to memoize expensive computations (series scans, projection generation).
 *
 * IMPORTANT: All useMemo calls must run unconditionally (Rules of Hooks). Guard checks
 * live at the END of the hook — each memo handles null/empty inputs safely.
 */
import { useMemo } from 'react'
import { computeNestEgg, generateProjectionSeries } from '../utils/retirementMath.js'
import {
  sortMilestones,
  computeInvestableCapital,
  buildInvestableSeries,
  classifyMilestones,
  findAchievementDate,
  findProjectedDate,
  buildMergedSeries,
} from '../utils/milestoneUtils.js'

/** Null-field shape returned when shouldRender=false. */
const NOT_READY = {
  shouldRender: false,
  investableCapital: 0,
  rawInvestableCapital: 0,
  investableSeries: [],
  milestones: [],
  achievedCount: 0,
  totalCount: 0,
  projectionSeries: null,
  mergedSeries: [],
  nestEgg: null,
}

/**
 * @param {object|null} typeData  - shape: {series: Array}
 * @param {object|null} retirement - retirement settings object from API
 * @returns {{
 *   shouldRender: boolean,
 *   investableCapital: number,
 *   rawInvestableCapital: number,
 *   investableSeries: Array<{date: string, value: number}>,
 *   milestones: Array,
 *   achievedCount: number,
 *   totalCount: number,
 *   projectionSeries: Array|null,
 *   mergedSeries: Array,
 *   nestEgg: number|null,
 * }}
 */
export function useMilestoneData(typeData, retirement) {
  // All hooks must be called unconditionally. Guard (shouldRender) is computed at the end.

  const rawInvestableCapital = useMemo(
    () => typeData?.series?.length ? computeInvestableCapital(typeData.series) : 0,
    [typeData]
  )

  // EC-9: negative IC treated as zero for progress calculations; raw value preserved for chart
  const investableCapital = useMemo(
    () => Math.max(0, rawInvestableCapital),
    [rawInvestableCapital]
  )

  const investableSeries = useMemo(
    () => typeData?.series?.length ? buildInvestableSeries(typeData.series) : [],
    [typeData]
  )

  const sortedMilestones = useMemo(
    () => retirement?.milestones?.length ? sortMilestones(retirement.milestones) : [],
    [retirement]
  )

  // API values are numeric; || null converts 0 to null for computeNestEgg
  const nestEgg = useMemo(
    () => !retirement?.exists ? null : computeNestEgg(
      Number(retirement.desired_annual_income) || null,
      Number(retirement.social_security_annual) || 0,
      Number(retirement.withdrawal_rate_pct) || 0,
    ),
    [retirement]
  )

  const projectionSeries = useMemo(() => {
    if (!retirement?.expected_return_pct) return null
    const yearsRemaining = Math.min(
      Number(retirement.target_retirement_age) - Number(retirement.current_age),
      50
    ) || 50
    return generateProjectionSeries({
      currentNetWorth: investableCapital,
      monthlyContribution: Number(retirement.monthly_contribution) || 0,
      annualReturnPct: Number(retirement.expected_return_pct),
      years: yearsRemaining,
    })
  }, [investableCapital, retirement])

  const achievementDates = useMemo(
    () => sortedMilestones.map((m) => findAchievementDate(investableSeries, m.amount)),
    [investableSeries, sortedMilestones]
  )

  const projectedDates = useMemo(() => {
    const items = nestEgg != null
      ? [...sortedMilestones, { amount: nestEgg }]
      : sortedMilestones
    return items.map((m) =>
      projectionSeries ? findProjectedDate(projectionSeries, m.amount) : null
    )
  }, [projectionSeries, sortedMilestones, nestEgg])

  const enrichedMilestones = useMemo(() => {
    const classified = classifyMilestones(sortedMilestones, investableCapital, nestEgg)
    return classified.map((m, i) => ({
      ...m,
      achievedDate: m.isNestEgg
        ? findAchievementDate(investableSeries, m.amount)
        : achievementDates[i],
      projectedDate: projectedDates[i] ?? null,
    }))
  }, [sortedMilestones, investableCapital, nestEgg, achievementDates, projectedDates, investableSeries])

  const achievedCount = useMemo(
    () => enrichedMilestones.filter((m) => m.state === 'achieved').length,
    [enrichedMilestones]
  )

  const mergedSeries = useMemo(
    () => buildMergedSeries(investableSeries, projectionSeries),
    [investableSeries, projectionSeries]
  )

  // Guard: EC-1 (no milestones), EC-2 (no retirement settings), EC-12 (no type data)
  if (!typeData?.series?.length || !retirement?.exists || !retirement?.milestones?.length) {
    return NOT_READY
  }

  return {
    shouldRender: true,
    investableCapital,
    rawInvestableCapital,
    investableSeries,
    milestones: enrichedMilestones,
    achievedCount,
    totalCount: enrichedMilestones.length,
    projectionSeries,
    mergedSeries,
    nestEgg,
  }
}
