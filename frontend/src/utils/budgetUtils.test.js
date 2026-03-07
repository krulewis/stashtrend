import { describe, it, expect } from 'vitest'
import { getBudgetZone, getPillAriaLabel, WARNING_THRESHOLD,
         groupExpenses, formatMonthLabel, formatGroupLabel } from './budgetUtils.js'

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

// ===========================================================================
// formatMonthLabel
// ===========================================================================

describe('formatMonthLabel', () => {
  it('formats a January date as Jan 26', () => {
    expect(formatMonthLabel('2026-01-01')).toBe("Jan '26")
  })

  it('formats a December date as Dec 25', () => {
    expect(formatMonthLabel('2025-12-01')).toBe("Dec '25")
  })

  it('does not shift to the previous month due to timezone', () => {
    // Bare new Date('2026-01-01') can roll back to Dec 31 in UTC-offset
    // environments. The T00:00:00 suffix prevents this.
    expect(formatMonthLabel('2026-01-01')).not.toBe("Dec '25")
  })
})

// ===========================================================================
// formatGroupLabel
// ===========================================================================

describe('formatGroupLabel', () => {
  it('returns name unchanged when it fits within maxLen (default 14)', () => {
    expect(formatGroupLabel('Housing')).toBe('Housing')
  })

  it('returns name unchanged when length equals maxLen exactly', () => {
    // "Food & Dining" = 13 chars, fits within 14
    expect(formatGroupLabel('Food & Dining')).toBe('Food & Dining')
  })

  it('uses shortmap for known long group names', () => {
    expect(formatGroupLabel('Auto & Transportation')).toBe('Auto & Transit')
    expect(formatGroupLabel('Gifts & Donations')).toBe('Gifts & Don.')
    expect(formatGroupLabel('Bills & Utilities')).toBe('Bills & Utils')
    expect(formatGroupLabel('Health & Wellness')).toBe('Health & Well.')
  })

  it('truncates at word boundary for multi-word names exceeding maxLen', () => {
    // "Auto & Transport" = 16 chars > 14 (not in shortmap)
    // Words: "Auto" (4) fits, "Auto &" (6) fits, "Auto & Transport" (16 > 14) stop
    expect(formatGroupLabel('Auto & Transport')).toBe('Auto &')
  })

  it('returns only the first word when adding the second word would exceed maxLen', () => {
    // "Entertainment" = 13 chars fits; "Entertainment Bill" = 18 chars
    expect(formatGroupLabel('Entertainment Bill')).toBe('Entertainment')
  })

  it('hard-truncates with ellipsis when first word alone exceeds maxLen', () => {
    const result = formatGroupLabel('Extraordinarily', 10)
    expect(result).toHaveLength(10)
    expect(result).toMatch(/…$/)
  })

  it('returns "Other" for null input', () => {
    expect(formatGroupLabel(null)).toBe('Other')
  })

  it('returns "Other" for undefined input', () => {
    // Finding 4: explicitly test undefined (falsy check covers it but test was missing)
    expect(formatGroupLabel(undefined)).toBe('Other')
  })

  it('returns "Other" for empty string input', () => {
    expect(formatGroupLabel('')).toBe('Other')
  })

  it('accepts a custom maxLen override', () => {
    const result = formatGroupLabel('Auto & Transport', 12)
    expect(result.length).toBeLessThanOrEqual(12)
  })
})

// ===========================================================================
// groupExpenses
// ===========================================================================

describe('groupExpenses', () => {
  // ── Shared fixtures ────────────────────────────────────────────────────────

  const cat1 = {
    category_id:   'cat_1',
    category_name: 'Groceries',
    group_type:    'expense',
    group_name:    'Food',
    months:        { '2026-01-01': { actual: 100, budgeted: 500 } },
  }
  const cat2 = {
    category_id:   'cat_2',
    category_name: 'Restaurants',
    group_type:    'expense',
    group_name:    'Food',
    months:        { '2026-01-01': { actual: 90, budgeted: 100 } },
  }
  const cat3 = {
    category_id:   'cat_3',
    category_name: 'Rent',
    group_type:    'expense',
    group_name:    'Housing',
    months:        {},
  }
  const cat4 = {
    category_id:   'cat_4',
    category_name: 'Salary',
    group_type:    'income',
    group_name:    'Income',
    months:        {},
  }
  const cat5 = {
    category_id:   'cat_5',
    category_name: 'CC Payment',
    group_type:    'transfer',
    group_name:    'Transfers',
    months:        {},
  }

  const CUSTOM_GROUPS = {
    'Dining':          [{ category_id: 'cat_2', sort_order: 0 }],
    'Groceries Group': [{ category_id: 'cat_1', sort_order: 0 }],
  }

  // ── Guard / edge cases ────────────────────────────────────────────────────

  it('returns empty array when categories is null', () => {
    expect(groupExpenses(null, {})).toEqual([])
  })

  it('returns empty array when categories is empty', () => {
    expect(groupExpenses([], {})).toEqual([])
  })

  it('returns empty array when all categories are income or transfer', () => {
    expect(groupExpenses([cat4, cat5], {})).toEqual([])
  })

  it('handles customGroups being null gracefully (treats as no custom groups)', () => {
    expect(() => groupExpenses([cat1], null)).not.toThrow()
    const result = groupExpenses([cat1], null)
    expect(result[0].groupName).toBe('Food')
  })

  // ── Filtering ─────────────────────────────────────────────────────────────

  it('filters out income categories', () => {
    const result = groupExpenses([cat1, cat4], {})
    const allIds = result.flatMap(g => g.categories.map(c => c.category_id))
    expect(allIds).not.toContain('cat_4')
  })

  it('filters out transfer categories', () => {
    const result = groupExpenses([cat1, cat5], {})
    const allIds = result.flatMap(g => g.categories.map(c => c.category_id))
    expect(allIds).not.toContain('cat_5')
  })

  // ── Grouping ──────────────────────────────────────────────────────────────

  it('groups expense categories by group_name when customGroups is empty', () => {
    const result = groupExpenses([cat1, cat2, cat3], {})
    const groupNames = result.map(g => g.groupName)
    expect(groupNames).toContain('Food')
    expect(groupNames).toContain('Housing')
    const foodGroup = result.find(g => g.groupName === 'Food')
    expect(foodGroup.categories.map(c => c.category_id)).toContain('cat_1')
    expect(foodGroup.categories.map(c => c.category_id)).toContain('cat_2')
  })

  it('applies custom group override over group_name', () => {
    const result = groupExpenses([cat1, cat2], CUSTOM_GROUPS)
    const groupNames = result.map(g => g.groupName)
    expect(groupNames).toContain('Dining')
    expect(groupNames).toContain('Groceries Group')
    expect(groupNames).not.toContain('Food')
  })

  it('falls back to "Other" when group_name is null and no custom group', () => {
    const catNoGroup = {
      category_id:   'cat_x',
      category_name: 'Mystery',
      group_type:    'expense',
      group_name:    null,
      months:        {},
    }
    const result = groupExpenses([catNoGroup], {})
    expect(result[0].groupName).toBe('Other')
  })

  it('returns groupName matching the effectiveGroup key', () => {
    const result = groupExpenses([cat1, cat2], CUSTOM_GROUPS)
    result.forEach(group => {
      group.categories.forEach(cat => {
        expect(cat.effectiveGroup).toBe(group.groupName)
      })
    })
  })

  // ── Sorting within groups ─────────────────────────────────────────────────

  it('sorts categories within a group by sort_order ascending', () => {
    const customGroups = {
      'Mixed': [
        { category_id: 'cat_1', sort_order: 1 },
        { category_id: 'cat_2', sort_order: 0 },
      ],
    }
    const result = groupExpenses([cat1, cat2], customGroups)
    const group  = result.find(g => g.groupName === 'Mixed')
    expect(group.categories[0].category_id).toBe('cat_2')  // sort_order 0 first
    expect(group.categories[1].category_id).toBe('cat_1')  // sort_order 1 second
  })

  it('sorts categories with equal sort_order by category_name (localeCompare)', () => {
    // cat1 = 'Groceries', cat2 = 'Restaurants' — same sort_order → alphabetical
    const customGroups = {
      'Shared': [
        { category_id: 'cat_1', sort_order: 0 },
        { category_id: 'cat_2', sort_order: 0 },
      ],
    }
    const result = groupExpenses([cat1, cat2], customGroups)
    const group  = result.find(g => g.groupName === 'Shared')
    // 'Groceries' < 'Restaurants' alphabetically
    expect(group.categories[0].category_name).toBe('Groceries')
    expect(group.categories[1].category_name).toBe('Restaurants')
  })

  it('places uncustomised categories (sort_order = Infinity) after customised ones', () => {
    // cat1 is in customGroups (sort_order 0), cat3 is not (sort_order Infinity)
    // Put them both in the same group by using only cat3's group_name
    const catUncustomised = {
      category_id:   'cat_u',
      category_name: 'Uncustomised',
      group_type:    'expense',
      group_name:    'Mixed',
      months:        {},
    }
    const catCustomised = {
      category_id:   'cat_c',
      category_name: 'Customised',
      group_type:    'expense',
      group_name:    'Other',  // would be 'Other' without custom override
      months:        {},
    }
    const customGroups = {
      'Mixed': [{ category_id: 'cat_c', sort_order: 0 }],
    }
    const result  = groupExpenses([catCustomised, catUncustomised], customGroups)
    const mixedGrp = result.find(g => g.groupName === 'Mixed')
    expect(mixedGrp.categories[0].category_id).toBe('cat_c')    // sort_order 0 first
    expect(mixedGrp.categories[1].category_id).toBe('cat_u')    // Infinity second
  })

  // ── Group-level sorting [SR-14] ───────────────────────────────────────────

  it('sorts groups by minimum sort_order ascending', () => {
    // Group A: min sort_order 5, Group B: min sort_order 2 → B before A
    const catA = {
      category_id:   'cat_a',
      category_name: 'Alpha',
      group_type:    'expense',
      group_name:    'Fallback',
      months:        {},
    }
    const catB = {
      category_id:   'cat_b',
      category_name: 'Beta',
      group_type:    'expense',
      group_name:    'Fallback',
      months:        {},
    }
    const customGroups = {
      'Group A': [{ category_id: 'cat_a', sort_order: 5 }],
      'Group B': [{ category_id: 'cat_b', sort_order: 2 }],
    }
    const result = groupExpenses([catA, catB], customGroups)
    expect(result[0].groupName).toBe('Group B')
    expect(result[1].groupName).toBe('Group A')
  })

  it('sorts groups alphabetically when all sort_orders are Infinity (no custom groups)', () => {
    // cat1 → 'Food', cat3 → 'Housing' — F < H alphabetically
    const result = groupExpenses([cat1, cat2, cat3], {})
    const groupNames = result.map(g => g.groupName)
    expect(groupNames.indexOf('Food')).toBeLessThan(groupNames.indexOf('Housing'))
  })

  // ── months object preservation [SR-12] ───────────────────────────────────

  it('preserves the full months object on each returned category', () => {
    const result = groupExpenses([cat1, cat2, cat3], {})
    const foodGroup = result.find(g => g.groupName === 'Food')
    const returnedCat1 = foodGroup.categories.find(c => c.category_id === 'cat_1')
    // Deep equality — months data must match the original
    expect(returnedCat1.months).toEqual(cat1.months)
  })
})
