import { describe, it, expect } from 'vitest'
import {
  fmtCompact,
  fmtFull,
  fmtDollar,
  fmtPct,
  fmtBudgetMonth,
  fmtDatetime,
  fmtDatetimeSecs,
  filterByRange,
  downsample,
  durationFinal,
  durationElapsed,
  formatDateLabel,
  sharedChartElements,
} from './chartUtils.jsx'

describe('fmtDollar', () => {
  it('formats a positive integer with comma separators', () => {
    expect(fmtDollar(1500)).toBe('$1,500')
  })

  it('formats a negative integer with parentheses', () => {
    expect(fmtDollar(-750)).toBe('($750)')
  })

  it('formats zero as $0', () => {
    expect(fmtDollar(0)).toBe('$0')
  })

  it('returns dash for null', () => {
    expect(fmtDollar(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(fmtDollar(undefined)).toBe('—')
  })

  it('rounds to the nearest dollar', () => {
    expect(fmtDollar(99.7)).toBe('$100')
  })
})

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

describe('formatDateLabel', () => {
  it('formats a standard mid-year date', () => {
    const result = formatDateLabel('2025-06-15')
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/25/)
  })

  it('formats a January date correctly (no year rollback)', () => {
    const result = formatDateLabel('2025-01-01')
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/25/)
  })

  it('formats a December date correctly (no year rollforward)', () => {
    const result = formatDateLabel('2024-12-31')
    expect(result).toMatch(/Dec/)
    expect(result).toMatch(/24/)
  })

  it('applies T00:00:00 suffix to prevent UTC offset date shifts', () => {
    const result = formatDateLabel('2025-03-01')
    expect(result).toMatch(/Mar/)
    expect(result).toMatch(/25/)
  })
})

describe('sharedChartElements', () => {
  it('returns an array of 4 elements', () => {
    const elements = sharedChartElements({ yAxisWidth: 60, tooltip: () => null })
    expect(elements).toHaveLength(4)
  })

  it('first element has key "grid" with vertical=false', () => {
    const elements = sharedChartElements({ yAxisWidth: 60, tooltip: () => null })
    expect(elements[0].key).toBe('grid')
    expect(elements[0].props.vertical).toBe(false)
  })

  it('second element has key "xaxis" with formatDateLabel as tickFormatter', () => {
    const elements = sharedChartElements({ yAxisWidth: 60, tooltip: () => null })
    expect(elements[1].key).toBe('xaxis')
    expect(elements[1].props.dataKey).toBe('date')
    expect(elements[1].props.tickFormatter).toBe(formatDateLabel)
  })

  it('third element has key "yaxis" and receives yAxisWidth', () => {
    const elements = sharedChartElements({ yAxisWidth: 80, tooltip: () => null })
    expect(elements[2].key).toBe('yaxis')
    expect(elements[2].props.width).toBe(80)
  })

  it('uses fmtCompact as YAxis tickFormatter', () => {
    const elements = sharedChartElements({ yAxisWidth: 60, tooltip: () => null })
    expect(elements[2].props.tickFormatter).toBe(fmtCompact)
  })

  it('fourth element has key "tooltip" and receives tooltip content', () => {
    const CustomTooltip = () => null
    const elements = sharedChartElements({ yAxisWidth: 60, tooltip: CustomTooltip })
    expect(elements[3].key).toBe('tooltip')
    expect(elements[3].props.content).toBe(CustomTooltip)
  })
})

describe('fmtPct', () => {
  it('formats positive percentage with + sign', () => {
    expect(fmtPct(8.2)).toBe('+8.2%')
  })

  it('formats negative percentage without + sign', () => {
    expect(fmtPct(-3.1)).toBe('-3.1%')
  })

  it('formats zero without + sign', () => {
    expect(fmtPct(0)).toBe('0.0%')
  })

  it('returns dash for null', () => {
    expect(fmtPct(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(fmtPct(undefined)).toBe('—')
  })
})
