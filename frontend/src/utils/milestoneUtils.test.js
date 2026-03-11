import { describe, it, expect } from 'vitest'
import {
  sortMilestones,
  computeInvestableCapital,
  buildInvestableSeries,
  classifyMilestones,
  findAchievementDate,
  findProjectedDate,
  formatDateShort,
  buildMergedSeries,
} from './milestoneUtils.js'

// ── sortMilestones ─────────────────────────────────────────────────────────

describe('sortMilestones', () => {
  it('sorts ascending by amount', () => {
    const input = [
      { label: 'Big', amount: 1000000 },
      { label: 'Small', amount: 500000 },
      { label: 'Medium', amount: 750000 },
    ]
    const result = sortMilestones(input)
    expect(result.map((m) => m.amount)).toEqual([500000, 750000, 1000000])
  })

  it('does not mutate the input array', () => {
    const input = [
      { label: 'B', amount: 2 },
      { label: 'A', amount: 1 },
    ]
    const original = [...input]
    sortMilestones(input)
    expect(input).toEqual(original)
  })

  it('handles empty array', () => {
    expect(sortMilestones([])).toEqual([])
  })

  it('handles single-item array', () => {
    const input = [{ label: 'Only', amount: 500000 }]
    expect(sortMilestones(input)).toEqual(input)
  })
})

// ── computeInvestableCapital ───────────────────────────────────────────────

describe('computeInvestableCapital', () => {
  it('returns Retirement + Brokerage from last series entry', () => {
    const series = [
      { date: '2024-01-01', Retirement: 100000, Brokerage: 50000 },
      { date: '2025-01-01', Retirement: 200000, Brokerage: 80000 },
    ]
    expect(computeInvestableCapital(series)).toBe(280000)
  })

  it('handles null Retirement (defaults to 0)', () => {
    const series = [{ date: '2025-01-01', Retirement: null, Brokerage: 50000 }]
    expect(computeInvestableCapital(series)).toBe(50000)
  })

  it('handles null Brokerage (defaults to 0)', () => {
    const series = [{ date: '2025-01-01', Retirement: 200000, Brokerage: null }]
    expect(computeInvestableCapital(series)).toBe(200000)
  })

  it('returns 0 for empty series', () => {
    expect(computeInvestableCapital([])).toBe(0)
  })

  it('returns 0 for null series', () => {
    expect(computeInvestableCapital(null)).toBe(0)
  })

  it('returns 0 for undefined series', () => {
    expect(computeInvestableCapital(undefined)).toBe(0)
  })
})

// ── buildInvestableSeries ──────────────────────────────────────────────────

describe('buildInvestableSeries', () => {
  it('maps all points to {date, value}', () => {
    const series = [
      { date: '2024-01-01', Retirement: 100000, Brokerage: 50000, Cash: 20000 },
      { date: '2025-01-01', Retirement: 200000, Brokerage: 80000, Cash: 25000 },
    ]
    const result = buildInvestableSeries(series)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ date: '2024-01-01', value: 150000 })
    expect(result[1]).toEqual({ date: '2025-01-01', value: 280000 })
  })

  it('value = Retirement + Brokerage (not Cash)', () => {
    const series = [{ date: '2025-01-01', Retirement: 100, Brokerage: 50, Cash: 9999 }]
    expect(buildInvestableSeries(series)[0].value).toBe(150)
  })

  it('handles missing fields with ?? 0', () => {
    const series = [{ date: '2025-01-01', Cash: 30000 }]
    expect(buildInvestableSeries(series)[0].value).toBe(0)
  })

  it('returns empty array for empty series', () => {
    expect(buildInvestableSeries([])).toEqual([])
  })
})

// ── classifyMilestones ─────────────────────────────────────────────────────

describe('classifyMilestones', () => {
  const milestones = [
    { label: 'Half-Mil', amount: 500000 },
    { label: 'Million', amount: 1000000 },
    { label: 'Two-Mil', amount: 2000000 },
  ]

  it('first unachieved is in-progress, all before are achieved, all after are future', () => {
    const result = classifyMilestones(milestones, 750000, null)
    expect(result[0].state).toBe('achieved')
    expect(result[1].state).toBe('in-progress')
    expect(result[2].state).toBe('future')
  })

  it('all achieved when IC >= all amounts', () => {
    const result = classifyMilestones(milestones, 3000000, null)
    expect(result.every((m) => m.state === 'achieved')).toBe(true)
  })

  it('all future (except first which is in-progress) when IC = 0', () => {
    const result = classifyMilestones(milestones, 0, null)
    expect(result[0].state).toBe('in-progress')
    expect(result[1].state).toBe('future')
    expect(result[2].state).toBe('future')
  })

  it('isNestEgg flag propagated correctly when nestEgg provided', () => {
    const result = classifyMilestones(milestones, 0, 1700000)
    const nestEggItem = result.find((m) => m.isNestEgg)
    expect(nestEggItem).toBeDefined()
    expect(nestEggItem.amount).toBe(1700000)
    expect(nestEggItem.label).toBe('Nest Egg')
  })

  it('no nest egg item when nestEgg is null', () => {
    const result = classifyMilestones(milestones, 750000, null)
    expect(result.some((m) => m.isNestEgg)).toBe(false)
    expect(result).toHaveLength(3)
  })

  it('progress capped at 1.0 for achieved milestones', () => {
    const result = classifyMilestones(milestones, 3000000, null)
    expect(result.every((m) => m.progress <= 1)).toBe(true)
    expect(result[0].progress).toBe(1)
  })

  it('progress = 0 when IC = 0', () => {
    const result = classifyMilestones(milestones, 0, null)
    expect(result[0].progress).toBe(0)
  })

  it('progress for partial completion (IC=250k, amount=500k → progress=0.5)', () => {
    const result = classifyMilestones([{ label: 'Test', amount: 500000 }], 250000, null)
    expect(result[0].progress).toBe(0.5)
  })

  it('handles single milestone', () => {
    const result = classifyMilestones([{ label: 'One', amount: 100000 }], 50000, null)
    expect(result).toHaveLength(1)
    expect(result[0].state).toBe('in-progress')
  })
})

// ── findAchievementDate ────────────────────────────────────────────────────

describe('findAchievementDate', () => {
  const series = [
    { date: '2023-01-01', value: 100000 },
    { date: '2023-06-01', value: 300000 },
    { date: '2024-01-01', value: 550000 },
    { date: '2024-06-01', value: 700000 },
  ]

  it('returns formatted "Jan \'24" for first crossing month', () => {
    const result = findAchievementDate(series, 500000)
    expect(result).toBe("Jan '24")
  })

  it('returns null when series never reaches amount', () => {
    expect(findAchievementDate(series, 10000000)).toBeNull()
  })

  it('returns first date when first point already exceeds amount', () => {
    // Note: if data starts above the amount, it may be import limitation not true achievement date
    const result = findAchievementDate(series, 50000)
    expect(result).toBe("Jan '23")
  })

  it('handles empty series', () => {
    expect(findAchievementDate([], 500000)).toBeNull()
  })
})

// ── findProjectedDate ──────────────────────────────────────────────────────

describe('findProjectedDate', () => {
  const projection = [
    { date: '2026-01-01', projected_net_worth: 100000 },
    { date: '2027-01-01', projected_net_worth: 300000 },
    { date: '2028-01-01', projected_net_worth: 600000 },
  ]

  it('returns "Mon \'YY" for first projection crossing', () => {
    const result = findProjectedDate(projection, 500000)
    expect(result).toBe("Jan '28")
  })

  it('returns "50+ yrs" when projection is capped and target not reached', () => {
    const result = findProjectedDate(projection, 9999999)
    expect(result).toBe('50+ yrs')
  })

  it('returns null for empty projection series', () => {
    expect(findProjectedDate([], 500000)).toBeNull()
  })

  it('returns null for null projection series', () => {
    expect(findProjectedDate(null, 500000)).toBeNull()
  })
})

// ── formatDateShort ────────────────────────────────────────────────────────

describe('formatDateShort', () => {
  it('"2024-01-01" → "Jan \'24"', () => {
    expect(formatDateShort('2024-01-01')).toBe("Jan '24")
  })

  it('"2025-12-01" → "Dec \'25"', () => {
    expect(formatDateShort('2025-12-01')).toBe("Dec '25")
  })

  it('uses T00:00:00 suffix to avoid timezone midnight rollover', () => {
    // This test verifies the result is stable regardless of TZ by using a mid-month date
    const result = formatDateShort('2024-06-15')
    expect(result).toMatch(/Jun '24/)
  })
})

// ── buildMergedSeries ──────────────────────────────────────────────────────

describe('buildMergedSeries', () => {
  const invSeries = [
    { date: '2024-01-01', value: 200000 },
    { date: '2025-01-01', value: 300000 },
  ]
  const projSeries = [
    { date: '2025-01-01', projected_net_worth: 310000 },
    { date: '2026-01-01', projected_net_worth: 400000 },
  ]

  it('historical points get investableCapital key, no projectedCapital', () => {
    const result = buildMergedSeries(invSeries, null)
    const pt = result.find((p) => p.date === '2024-01-01')
    expect(pt.investableCapital).toBe(200000)
    expect(pt.projectedCapital).toBeUndefined()
  })

  it('projection points get projectedCapital key, no investableCapital', () => {
    const result = buildMergedSeries(invSeries, projSeries)
    const pt = result.find((p) => p.date === '2026-01-01')
    expect(pt.projectedCapital).toBe(400000)
    expect(pt.investableCapital).toBeUndefined()
  })

  it('overlap dates get both keys', () => {
    const result = buildMergedSeries(invSeries, projSeries)
    const pt = result.find((p) => p.date === '2025-01-01')
    expect(pt.investableCapital).toBe(300000)
    expect(pt.projectedCapital).toBe(310000)
  })

  it('result is sorted ascending by date', () => {
    const result = buildMergedSeries(invSeries, projSeries)
    const dates = result.map((p) => p.date)
    expect(dates).toEqual([...dates].sort())
  })

  it('handles null projectionSeries (returns investableSeries mapped to {date, investableCapital})', () => {
    const result = buildMergedSeries(invSeries, null)
    expect(result).toHaveLength(2)
    expect(result[0].investableCapital).toBe(200000)
    expect(result[1].investableCapital).toBe(300000)
  })
})
