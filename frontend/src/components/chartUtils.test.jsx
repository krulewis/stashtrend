import { describe, it, expect } from 'vitest'
import {
  fmtCompact,
  fmtFull,
  fmtBudgetMonth,
  fmtDatetime,
  fmtDatetimeSecs,
  filterByRange,
  downsample,
  durationFinal,
  durationElapsed,
} from './chartUtils.jsx'

describe('fmtCompact', () => {
  it('formats large numbers with compact notation', () => {
    expect(fmtCompact(1500000)).toMatch(/\$1\.5M/)
  })

  it('returns dash for null', () => {
    expect(fmtCompact(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(fmtCompact(undefined)).toBe('—')
  })

  it('formats zero', () => {
    expect(fmtCompact(0)).toMatch(/\$0/)
  })

  it('formats negative values', () => {
    expect(fmtCompact(-50000)).toMatch(/-\$50K/)
  })
})

describe('fmtFull', () => {
  it('formats with full currency notation', () => {
    expect(fmtFull(1234567)).toMatch(/\$1,234,567/)
  })

  it('returns dash for null', () => {
    expect(fmtFull(null)).toBe('—')
  })

  it('formats zero', () => {
    expect(fmtFull(0)).toMatch(/\$0/)
  })
})

describe('fmtBudgetMonth', () => {
  it('formats a date string as abbreviated month and year', () => {
    const result = fmtBudgetMonth('2025-11-01')
    expect(result).toMatch(/Nov '25/)
  })
})

describe('fmtDatetime', () => {
  it('returns dash for falsy input', () => {
    expect(fmtDatetime(null)).toBe('—')
    expect(fmtDatetime('')).toBe('—')
  })

  it('formats a valid ISO string', () => {
    const result = fmtDatetime('2025-06-15T14:30:00Z')
    expect(typeof result).toBe('string')
    expect(result).not.toBe('—')
  })
})

describe('fmtDatetimeSecs', () => {
  it('returns dash for falsy input', () => {
    expect(fmtDatetimeSecs(null)).toBe('—')
  })

  it('formats a valid ISO string with seconds', () => {
    const result = fmtDatetimeSecs('2025-06-15T14:30:45Z')
    expect(typeof result).toBe('string')
    expect(result).not.toBe('—')
  })
})

describe('filterByRange', () => {
  // Use dates relative to now so tests don't break over time
  const now = new Date()
  const monthsAgo = (n) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - n)
    return d.toISOString().slice(0, 10)
  }
  const data = [
    { date: monthsAgo(12) },
    { date: monthsAgo(6) },
    { date: monthsAgo(3) },
    { date: monthsAgo(0) },
  ]

  it('returns all data when months is null', () => {
    expect(filterByRange(data, null)).toEqual(data)
  })

  it('returns empty array for empty input', () => {
    expect(filterByRange([], 6)).toEqual([])
  })

  it('filters data to the specified month window', () => {
    const result = filterByRange(data, 6)
    expect(result.length).toBeLessThanOrEqual(data.length)
    expect(result.length).toBeGreaterThan(0)
    // Should exclude the 12-month-ago entry
    expect(result.length).toBeLessThan(data.length)
  })
})

describe('downsample', () => {
  it('returns data unchanged when within maxPoints', () => {
    const data = [{ v: 1 }, { v: 2 }, { v: 3 }]
    expect(downsample(data, 10)).toEqual(data)
  })

  it('reduces data to approximately maxPoints', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ v: i }))
    const result = downsample(data, 10)
    expect(result.length).toBeLessThanOrEqual(15)
    expect(result.length).toBeGreaterThan(0)
  })

  it('always includes the last data point', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ v: i }))
    const result = downsample(data, 10)
    expect(result[result.length - 1]).toEqual({ v: 99 })
  })
})

describe('durationFinal', () => {
  it('returns dash when startedAt is missing', () => {
    expect(durationFinal(null, '2025-01-01T00:01:00Z')).toBe('—')
  })

  it('returns dash when finishedAt is missing', () => {
    expect(durationFinal('2025-01-01T00:00:00Z', null)).toBe('—')
  })

  it('computes duration in seconds', () => {
    expect(durationFinal('2025-01-01T00:00:00Z', '2025-01-01T00:00:30Z')).toBe('30s')
  })

  it('computes duration in minutes and seconds', () => {
    expect(durationFinal('2025-01-01T00:00:00Z', '2025-01-01T00:02:15Z')).toBe('2m 15s')
  })
})

describe('durationElapsed', () => {
  it('returns null when startedAt is missing', () => {
    expect(durationElapsed(null, null)).toBe(null)
  })

  it('uses finishedAt when provided', () => {
    const result = durationElapsed('2025-01-01T00:00:00Z', '2025-01-01T00:00:45Z')
    expect(result).toBe('45s')
  })

  it('uses Date.now() when finishedAt is absent', () => {
    const recent = new Date(Date.now() - 10000).toISOString()
    const result = durationElapsed(recent, null)
    expect(result).toMatch(/\d+s/)
  })
})
