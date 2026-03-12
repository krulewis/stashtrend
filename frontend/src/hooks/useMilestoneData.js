/**
 * useMilestoneData — Custom hook that computes all derived milestone data
 * consumed by MilestoneCardsView.
 *
 * Uses useMemo to memoize expensive computations (series scans, projection generation).
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
  // Guard: EC-1 (no milestones), EC-2 (no retirement settings), EC-12 (no type data)
  if (!typeData?.series?.length || !retirement?.exists || !retirement?.milestones?.length) {
    return NOT_READY
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const rawInvestableCapital = useMemo(
    () => computeInvestableCapital(typeData.series),
    [typeData]
  )

  // EC-9: negative IC treated as zero for progress calculations; raw value preserved for chart
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const investableCapital = useMemo(
    () => Math.max(0, rawInvestableCapital),
    [rawInvestableCapital]
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const investableSeries = useMemo(
    () => buildInvestableSeries(typeData.series),
    [typeData]
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sortedMilestones = useMemo(
    () => sortMilestones(retirement.milestones),
    [retirement]
  )

  // API values are numeric; || null converts 0 to null for computeNestEgg
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const nestEgg = useMemo(
    () => computeNestEgg(
      Number(retirement.desired_annual_income) || null,
      Number(retirement.social_security_annual) || 0,
      Number(retirement.withdrawal_rate_pct) || 0,
    ),
    [retirement]
  )

  // Projection years: capped at remaining years to retirement age, max 50 (EC-14)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const projectionSeries = useMemo(() => {
    if (!retirement.expected_return_pct) return null
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const achievementDates = useMemo(
    () => sortedMilestones.map((m) => findAchievementDate(investableSeries, m.amount)),
    [investableSeries, sortedMilestones]
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const projectedDates = useMemo(() => {
    const items = nestEgg != null
      ? [...sortedMilestones, { amount: nestEgg }]
      : sortedMilestones
    return items.map((m) =>
      projectionSeries ? findProjectedDate(projectionSeries, m.amount) : null
    )
  }, [projectionSeries, sortedMilestones, nestEgg])

  // eslint-disable-next-line react-hooks/rules-of-hooks
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const achievedCount = useMemo(
    () => enrichedMilestones.filter((m) => m.state === 'achieved').length,
    [enrichedMilestones]
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const mergedSeries = useMemo(
    () => buildMergedSeries(investableSeries, projectionSeries),
    [investableSeries, projectionSeries]
  )

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
