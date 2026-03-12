import { describe, it, expect } from 'vitest'
import {
  computeNestEgg,
  generateProjectionSeries,
  mergeHistoryWithProjection,
  getInvestableCapital,
  computeBlendedCAGR,
  calculateContributionToTarget,
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

// ── getInvestableCapital ─────────────────────────────────────────────────────

describe('getInvestableCapital', () => {
  it('returns sum of Retirement + Brokerage from the latest series entry', () => {
    const typeData = {
      series: [
        { Retirement: 100000, Brokerage: 50000 },
        { Retirement: 120000, Brokerage: 60000 },
      ],
    }
    expect(getInvestableCapital(typeData)).toBe(180000)
  })

  it('returns null when typeData is null', () => {
    expect(getInvestableCapital(null)).toBeNull()
  })

  it('returns null when typeData.series is empty array', () => {
    expect(getInvestableCapital({ series: [] })).toBeNull()
  })

  it('returns null when typeData.series is undefined', () => {
    expect(getInvestableCapital({ series: undefined })).toBeNull()
  })

  it('returns 0 when latest entry has no Retirement or Brokerage keys', () => {
    const typeData = { series: [{ Cash: 10000 }] }
    expect(getInvestableCapital(typeData)).toBe(0)
  })

  it('handles missing Retirement (only Brokerage present)', () => {
    const typeData = { series: [{ Brokerage: 75000 }] }
    expect(getInvestableCapital(typeData)).toBe(75000)
  })

  it('handles missing Brokerage (only Retirement present)', () => {
    const typeData = { series: [{ Retirement: 200000 }] }
    expect(getInvestableCapital(typeData)).toBe(200000)
  })
})

// ── computeBlendedCAGR ───────────────────────────────────────────────────────

describe('computeBlendedCAGR', () => {
  it('returns balance-weighted blended CAGR when both buckets have data', () => {
    const typeData = {
      series: [{ Retirement: 200000, Brokerage: 100000 }],
      cagr: {
        Retirement: { '5y': 9.0 },
        Brokerage: { '5y': 6.0 },
      },
    }
    // (200000 * 9 + 100000 * 6) / 300000 = 2400000 / 300000 = 8.0
    expect(computeBlendedCAGR(typeData)).toBeCloseTo(8.0)
  })

  it('falls back to 7.0 when no CAGR data available (both null)', () => {
    const typeData = {
      series: [{ Retirement: 100000, Brokerage: 50000 }],
      cagr: {},
    }
    expect(computeBlendedCAGR(typeData)).toBe(7.0)
  })

  it('returns brokerage CAGR when retirement CAGR is null', () => {
    const typeData = {
      series: [{ Retirement: 100000, Brokerage: 50000 }],
      cagr: {
        Brokerage: { '5y': 6.5 },
      },
    }
    expect(computeBlendedCAGR(typeData)).toBe(6.5)
  })

  it('returns retirement CAGR when brokerage CAGR is null', () => {
    const typeData = {
      series: [{ Retirement: 100000, Brokerage: 50000 }],
      cagr: {
        Retirement: { '5y': 8.0 },
      },
    }
    expect(computeBlendedCAGR(typeData)).toBe(8.0)
  })

  it('picks best available period (5y > 3y > 1y)', () => {
    const typeData = {
      series: [{ Retirement: 100000, Brokerage: 0 }],
      cagr: {
        Retirement: { '3y': 7.5, '1y': 5.0 },
        Brokerage: { '1y': 4.0 },
      },
    }
    // Retirement picks 3y=7.5, Brokerage picks 1y=4.0
    // All balance in Retirement → result should be 7.5
    expect(computeBlendedCAGR(typeData)).toBeCloseTo(7.5)
  })

  it('uses simple average when both have CAGR but zero balance', () => {
    const typeData = {
      series: [{ Retirement: 0, Brokerage: 0 }],
      cagr: {
        Retirement: { '5y': 8.0 },
        Brokerage: { '5y': 6.0 },
      },
    }
    // (8.0 + 6.0) / 2 = 7.0
    expect(computeBlendedCAGR(typeData)).toBeCloseTo(7.0)
  })

  it('handles null/undefined typeData (should return 7.0)', () => {
    expect(computeBlendedCAGR(null)).toBe(7.0)
    expect(computeBlendedCAGR(undefined)).toBe(7.0)
  })
})

// ── calculateContributionToTarget ────────────────────────────────────────────

describe('calculateContributionToTarget', () => {
  it('returns currentContribution when already on track (growth alone covers target)', () => {
    // Large balance that grows past target without any additional contributions
    const result = calculateContributionToTarget({
      currentNetWorth: 2000000,
      currentContribution: 500,
      annualReturnPct: 7,
      years: 10,
      targetAmount: 1000000,
    })
    expect(result).toBe(500)
  })

  it('computes needed contribution when behind target', () => {
    const result = calculateContributionToTarget({
      currentNetWorth: 0,
      currentContribution: 0,
      annualReturnPct: 0,
      years: 10,
      targetAmount: 12000,
    })
    // neededMonthly = 12000 / 120 = 100 exactly — ceil(100/100)*100 = 100
    expect(result).toBe(100)
  })

  it('rounds up to nearest $100', () => {
    const result = calculateContributionToTarget({
      currentNetWorth: 0,
      currentContribution: 0,
      annualReturnPct: 0,
      years: 10,
      targetAmount: 13000,
    })
    // neededMonthly = 13000 / 120 ≈ 108.33 → ceil(108.33/100)*100 = 200
    expect(result).toBe(200)
  })

  it('never suggests less than currentContribution (floor)', () => {
    const result = calculateContributionToTarget({
      currentNetWorth: 0,
      currentContribution: 1000,
      annualReturnPct: 0,
      years: 10,
      targetAmount: 100,
    })
    // Target is tiny — needed is < currentContribution → should return currentContribution
    expect(result).toBe(1000)
  })

  it('returns null when years <= 0', () => {
    expect(
      calculateContributionToTarget({
        currentNetWorth: 0,
        currentContribution: 500,
        annualReturnPct: 7,
        years: 0,
        targetAmount: 1000000,
      })
    ).toBeNull()

    expect(
      calculateContributionToTarget({
        currentNetWorth: 0,
        currentContribution: 500,
        annualReturnPct: 7,
        years: -5,
        targetAmount: 1000000,
      })
    ).toBeNull()
  })

  it('returns null when targetAmount is null', () => {
    expect(
      calculateContributionToTarget({
        currentNetWorth: 0,
        currentContribution: 500,
        annualReturnPct: 7,
        years: 10,
        targetAmount: null,
      })
    ).toBeNull()
  })

  it('handles zero return rate (simple division)', () => {
    const result = calculateContributionToTarget({
      currentNetWorth: 0,
      currentContribution: 0,
      annualReturnPct: 0,
      years: 5,
      targetAmount: 60000,
    })
    // neededMonthly = 60000 / 60 = 1000 exactly
    expect(result).toBe(1000)
  })

  it('handles zero return rate when shortfall is negative (on track)', () => {
    const result = calculateContributionToTarget({
      currentNetWorth: 100000,
      currentContribution: 200,
      annualReturnPct: 0,
      years: 5,
      targetAmount: 50000,
    })
    // currentNetWorth already exceeds target → neededMonthly <= currentContribution → floor
    expect(result).toBe(200)
  })
})
