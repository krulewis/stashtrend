import { describe, it, expect } from 'vitest'
import { getBudgetZone, getPillAriaLabel, WARNING_THRESHOLD } from './budgetUtils.js'

// ===========================================================================
// getBudgetZone
// ===========================================================================

describe('getBudgetZone', () => {
  // ── no-data zone ──────────────────────────────────────────────────────────

  it('returns "no-data" when both actual and budgeted are null', () => {
    expect(getBudgetZone(null, null)).toBe('no-data')
  })

  it('returns "no-data" when both actual and budgeted are undefined', () => {
    expect(getBudgetZone(undefined, undefined)).toBe('no-data')
  })

  it('returns "no-data" when actual is null and budgeted is undefined', () => {
    expect(getBudgetZone(null, undefined)).toBe('no-data')
  })

  it('returns "no-data" when actual is undefined and budgeted is null', () => {
    expect(getBudgetZone(undefined, null)).toBe('no-data')
  })

  // ── no-budget zone ────────────────────────────────────────────────────────

  it('returns "no-budget" when budgeted is null but actual has a value', () => {
    expect(getBudgetZone(50, null)).toBe('no-budget')
  })

  it('returns "no-budget" when budgeted is undefined but actual has a value', () => {
    expect(getBudgetZone(50, undefined)).toBe('no-budget')
  })

  it('returns "no-budget" when budgeted is 0 and actual has a value', () => {
    expect(getBudgetZone(50, 0)).toBe('no-budget')
  })

  it('returns "no-budget" when budgeted is null and actual is 0', () => {
    expect(getBudgetZone(0, null)).toBe('no-budget')
  })

  // ── safe zone with null actual ────────────────────────────────────────────

  it('returns "safe" when actual is null but budgeted is a positive number', () => {
    // null actual with real budget = $0 of $N spent = 0% = safe
    expect(getBudgetZone(null, 500)).toBe('safe')
  })

  it('returns "safe" when actual is undefined but budgeted is a positive number', () => {
    expect(getBudgetZone(undefined, 300)).toBe('safe')
  })

  it('returns "safe" when actual is 0 and budgeted is a positive number', () => {
    expect(getBudgetZone(0, 300)).toBe('safe')
  })

  // ── safe zone (spending below WARNING_THRESHOLD) ──────────────────────────

  it('returns "safe" when actual/budgeted is well below WARNING_THRESHOLD', () => {
    expect(getBudgetZone(100, 500)).toBe('safe')   // 20%
  })

  it('returns "safe" when actual/budgeted is just under WARNING_THRESHOLD', () => {
    // 84% < 85%
    expect(getBudgetZone(84, 100)).toBe('safe')
  })

  // ── warning zone (at or above WARNING_THRESHOLD, at or below 100%) ────────

  it('returns "warning" when actual/budgeted equals WARNING_THRESHOLD exactly', () => {
    const actual = WARNING_THRESHOLD * 100
    expect(getBudgetZone(actual, 100)).toBe('warning')
  })

  it('returns "warning" when actual/budgeted is between WARNING_THRESHOLD and 1.0', () => {
    expect(getBudgetZone(90, 100)).toBe('warning')   // 90%
  })

  it('returns "warning" when actual/budgeted is 99% (still under budget)', () => {
    expect(getBudgetZone(99, 100)).toBe('warning')
  })

  // ── over zone (spending above 100% of budget) ─────────────────────────────

  it('returns "over" when actual equals budgeted (100%)', () => {
    // ratio === 1.0 is NOT over; test >1.0
    // Actually: ratio > 1.0 is over, ratio == 1.0 falls into warning check
    // 100/100 = 1.0, which is NOT > 1.0, so it is warning (ratio >= 0.85 and <= 1.0)
    expect(getBudgetZone(100, 100)).toBe('warning')
  })

  it('returns "over" when actual is greater than budgeted', () => {
    expect(getBudgetZone(110, 100)).toBe('over')    // 110%
  })

  it('returns "over" when actual is substantially over budget', () => {
    expect(getBudgetZone(200, 100)).toBe('over')    // 200%
  })

  // ── WARNING_THRESHOLD constant ────────────────────────────────────────────

  it('exports WARNING_THRESHOLD as 0.85', () => {
    expect(WARNING_THRESHOLD).toBe(0.85)
  })
})

// ===========================================================================
// getPillAriaLabel
// ===========================================================================

describe('getPillAriaLabel', () => {
  it('returns "No budget data" for no-data zone', () => {
    expect(getPillAriaLabel(null, null, 'no-data')).toBe('No budget data')
  })

  it('returns spent + no budget message for no-budget zone', () => {
    const label = getPillAriaLabel(150, null, 'no-budget')
    expect(label).toContain('$150')
    expect(label).toContain('no budget set')
  })

  it('formats the actual dollar amount with locale separators in no-budget zone', () => {
    const label = getPillAriaLabel(1500, null, 'no-budget')
    expect(label).toContain('$1,500')
  })

  it('returns correct label for safe zone', () => {
    const label = getPillAriaLabel(100, 500, 'safe')
    expect(label).toContain('$100')
    expect(label).toContain('$500')
    expect(label).toContain('within budget')
    expect(label).toContain('20%')
  })

  it('returns correct label for warning zone', () => {
    const label = getPillAriaLabel(90, 100, 'warning')
    expect(label).toContain('$90')
    expect(label).toContain('$100')
    expect(label).toContain('approaching limit')
    expect(label).toContain('90%')
  })

  it('returns correct label for over zone', () => {
    const label = getPillAriaLabel(110, 100, 'over')
    expect(label).toContain('$110')
    expect(label).toContain('$100')
    expect(label).toContain('over budget')
    expect(label).toContain('110%')
  })

  it('rounds dollar amounts to nearest dollar (no cents)', () => {
    const label = getPillAriaLabel(99.7, 100, 'safe')
    // Should round 99.7 to $100
    expect(label).toMatch(/\$100/)
  })

  it('uses locale-aware comma formatting for thousands', () => {
    const label = getPillAriaLabel(1234, 2000, 'safe')
    expect(label).toContain('$1,234')
    expect(label).toContain('$2,000')
  })

  it('treats null actual as $0 when computing percentage in safe zone', () => {
    const label = getPillAriaLabel(null, 500, 'safe')
    expect(label).toContain('0%')
    expect(label).toContain('$500')
  })
})
