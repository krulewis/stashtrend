import { describe, it, expect } from 'vitest'
import {
  computeNestEgg,
  generateProjectionSeries,
  mergeHistoryWithProjection,
} from './retirementMath.js'

// ── computeNestEgg ──────────────────────────────────────────────────────────

describe('computeNestEgg', () => {
  it('returns null when withdrawalRatePct is 0 — Finding #5', () => {
    expect(computeNestEgg(80000, 0, 0)).toBeNull()
  })

  it('returns null when withdrawalRatePct is negative', () => {
    expect(computeNestEgg(80000, 0, -1)).toBeNull()
  })

  it('returns null when desiredAnnualIncome is null', () => {
    expect(computeNestEgg(null, 0, 4)).toBeNull()
  })

  it('computes correct nest egg with 4% rule', () => {
    // ($80k - $12k SS) / 4% = $1,700,000
    expect(computeNestEgg(80000, 12000, 4)).toBe(1700000)
  })

  it('returns 0 when SS covers all income', () => {
    expect(computeNestEgg(80000, 80000, 4)).toBe(0)
  })

  it('returns 0 when SS exceeds desired income', () => {
    expect(computeNestEgg(50000, 60000, 4)).toBe(0)
  })
})

// ── generateProjectionSeries ─────────────────────────────────────────────────

describe('generateProjectionSeries', () => {
  it('first point equals currentNetWorth', () => {
    const series = generateProjectionSeries({
      currentNetWorth: 500000,
      monthlyContribution: 0,
      annualReturnPct: 0,
      years: 1,
      startDate: new Date(2026, 0, 1),
    })
    expect(series[0].projected_net_worth).toBe(500000)
  })

  it('zero return with zero contribution keeps balance flat', () => {
    const series = generateProjectionSeries({
      currentNetWorth: 100000,
      monthlyContribution: 0,
      annualReturnPct: 0,
      years: 2,
      startDate: new Date(2026, 0, 1),
    })
    series.forEach((pt) => expect(pt.projected_net_worth).toBe(100000))
  })

  it('produces correct number of points (years * 12 + 1)', () => {
    const series = generateProjectionSeries({
      currentNetWorth: 0,
      monthlyContribution: 0,
      annualReturnPct: 0,
      years: 5,
      startDate: new Date(2026, 0, 1),
    })
    expect(series).toHaveLength(61) // 5 * 12 + 1
  })

  it('dates always land on the 1st — no month-end drift — Finding #2', () => {
    // Start Jan 31: setMonth drift would push Feb→Mar; fresh Date(y,m+i,1) avoids this
    const series = generateProjectionSeries({
      currentNetWorth: 0,
      monthlyContribution: 0,
      annualReturnPct: 0,
      years: 2,
      startDate: new Date(2026, 0, 31),
    })
    for (const pt of series) {
      expect(pt.date.endsWith('-01')).toBe(true)
    }
  })

  it('balance grows with positive return rate', () => {
    const series = generateProjectionSeries({
      currentNetWorth: 100000,
      monthlyContribution: 0,
      annualReturnPct: 12,
      years: 1,
      startDate: new Date(2026, 0, 1),
    })
    expect(series[series.length - 1].projected_net_worth).toBeGreaterThan(100000)
  })

  it('monthly contributions accumulate', () => {
    const series = generateProjectionSeries({
      currentNetWorth: 0,
      monthlyContribution: 1000,
      annualReturnPct: 0,
      years: 1,
      startDate: new Date(2026, 0, 1),
    })
    // After 12 months of $1000 contributions
    expect(series[series.length - 1].projected_net_worth).toBeGreaterThanOrEqual(11000)
  })
})

// ── mergeHistoryWithProjection ───────────────────────────────────────────────

describe('mergeHistoryWithProjection', () => {
  it('historical points retain net_worth key', () => {
    const history = [{ date: '2026-01-01', net_worth: 500000 }]
    const proj = [{ date: '2026-02-01', projected_net_worth: 510000 }]
    const merged = mergeHistoryWithProjection(history, proj)
    const h = merged.find((p) => p.date === '2026-01-01')
    expect(h.net_worth).toBe(500000)
  })

  it('projection points add projected_net_worth key', () => {
    const history = []
    const proj = [{ date: '2026-02-01', projected_net_worth: 510000 }]
    const merged = mergeHistoryWithProjection(history, proj)
    expect(merged[0].projected_net_worth).toBe(510000)
  })

  it('overlap date has both net_worth and projected_net_worth', () => {
    const history = [{ date: '2026-01-01', net_worth: 500000 }]
    const proj = [{ date: '2026-01-01', projected_net_worth: 500000 }]
    const merged = mergeHistoryWithProjection(history, proj)
    expect(merged).toHaveLength(1)
    expect(merged[0].net_worth).toBe(500000)
    expect(merged[0].projected_net_worth).toBe(500000)
  })

  it('result is sorted ascending by date', () => {
    const history = [{ date: '2026-03-01', net_worth: 520000 }]
    const proj = [{ date: '2026-01-01', projected_net_worth: 500000 }]
    const merged = mergeHistoryWithProjection(history, proj)
    expect(merged[0].date).toBe('2026-01-01')
    expect(merged[1].date).toBe('2026-03-01')
  })
})
