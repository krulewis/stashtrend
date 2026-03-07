/** Shared budget calculation constants and utilities. */

/**
 * Ratio threshold above which a category is considered "approaching limit".
 * Same value as WARNING_THRESHOLD formerly in BudgetTable.jsx and
 * referenced in chartUtils.jsx. Defined here (not in chartUtils.jsx) because
 * chartUtils.jsx is Recharts-specific; this module is budget-domain logic.
 * Value: 0.85 — categories spending >= 85% of budget show the warning zone.
 */
export const WARNING_THRESHOLD = 0.85

/**
 * Compute the status zone for a budget ratio.
 *
 * Zone rules:
 *   - Both actual AND budgeted are null/undefined → 'no-data'
 *     (distinct from 'no-budget': this means we have no data at all for
 *      this category in this month, not merely that a budget was not set)
 *   - budgeted is null, undefined, or 0 but actual has a value → 'no-budget'
 *     (spending recorded but no budget limit configured)
 *   - actual is null/undefined but budgeted > 0 → 'safe'
 *     (budget is set but nothing spent yet; $0 of $N = 0% = safe)
 *   - actual / budgeted > 1.0 → 'over'
 *   - actual / budgeted >= WARNING_THRESHOLD → 'warning'
 *   - otherwise → 'safe'
 *
 * @param {number|null|undefined} actual
 * @param {number|null|undefined} budgeted
 * @returns {'safe'|'warning'|'over'|'no-budget'|'no-data'}
 */
export function getBudgetZone(actual, budgeted) {
  const hasActual   = actual   != null
  const hasBudgeted = budgeted != null && budgeted !== 0

  if (!hasActual && !hasBudgeted) return 'no-data'
  if (!hasBudgeted) return 'no-budget'         // actual may or may not be present
  // budgeted > 0 from here on
  const safeActual = actual ?? 0               // null actual with real budget → treat as $0 spent
  const ratio = safeActual / budgeted
  if (ratio > 1.0)               return 'over'
  if (ratio >= WARNING_THRESHOLD) return 'warning'
  return 'safe'
}

/**
 * Build an accessible aria-label string for a pill element.
 * Uses fmtDollar-style formatting: "$1,234" with no cents (rounded).
 * @param {number|null} actual
 * @param {number|null} budgeted
 * @param {string} zone  — return value of getBudgetZone()
 * @returns {string}
 */
export function getPillAriaLabel(actual, budgeted, zone) {
  // Helper: format dollar amount as "$1,234" (no cents, locale-aware)
  const fmt = (n) => `$${Math.round(n ?? 0).toLocaleString('en-US')}`
  if (zone === 'no-data')   return 'No budget data'
  if (zone === 'no-budget') return `${fmt(actual)} spent, no budget set`
  const pct    = Math.round(((actual ?? 0) / budgeted) * 100)
  const status = zone === 'over'    ? 'over budget'
               : zone === 'warning' ? 'approaching limit'
               : 'within budget'
  return `${fmt(actual)} of ${fmt(budgeted)} budget, ${pct}%, ${status}`
}

/**
 * Format an ISO date string as a short month + 2-digit year label.
 * Appends 'T00:00:00' before constructing the Date to prevent timezone
 * shift (bare new Date('2026-01-01') can roll back to Dec in UTC-offset
 * environments).
 *
 * @param {string} monthKey - ISO date string e.g. '2026-01-01'
 * @returns {string} Formatted label e.g. "Sep '25"
 */
export function formatMonthLabel(monthKey) {
  const d = new Date(monthKey + 'T00:00:00')
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const year  = d.toLocaleDateString('en-US', { year: '2-digit' })
  return `${month} '${year}`
}

/**
 * Abbreviate a budget group/category name to fit within maxLen characters.
 * Strategy:
 *   1. null/undefined/empty → return "Other"
 *   2. name.length <= maxLen → return as-is (no-op)
 *   3. Try word-boundary truncation: accumulate whole words (space-joined)
 *      while total length stays within maxLen. If at least one word fits,
 *      return the joined words (no trailing ellipsis — clean word boundary).
 *   4. If the first word alone exceeds maxLen, truncate to maxLen-1 chars
 *      and append the unicode ellipsis character "\u2026".
 *
 * @param {string|null|undefined} name - The group or category name to abbreviate
 * @param {number} maxLen - Maximum character count (default 14)
 * @returns {string}
 */
export function formatGroupLabel(name, maxLen = 14) {
  if (!name) return 'Other'

  // Known abbreviations from design brief — checked before length test
  const SHORT_MAP = {
    'Auto & Transportation': 'Auto & Transit',
    'Gifts & Donations':     'Gifts & Don.',
    'Bills & Utilities':     'Bills & Utils',
    'Health & Wellness':     'Health & Well.',
  }
  const shortcut = SHORT_MAP[name]
  if (shortcut && shortcut.length <= maxLen) return shortcut

  if (name.length <= maxLen) return name

  const words = name.split(' ')
  let result = ''
  for (const word of words) {
    const candidate = result ? result + ' ' + word : word
    if (candidate.length <= maxLen) {
      result = candidate
    } else {
      break
    }
  }
  if (result) return result

  // First word alone exceeds maxLen — hard truncate
  return name.slice(0, maxLen - 1) + '\u2026'
}

/**
 * Group expense categories by their effective group name, applying optional
 * custom group overrides. Returns groups sorted by minimum sort_order
 * (alphabetical tiebreaker), with categories within each group sorted by
 * sort_order then category_name.
 *
 * @param {Array<{
 *   category_id: string,
 *   category_name: string,
 *   group_type: string,
 *   group_name: string|null,
 *   months: Record<string, { actual: number|null, budgeted: number|null }>
 * }>} categories - Raw API category objects
 * @param {Record<string, Array<{ category_id: string, sort_order: number }>>} customGroups
 *   - Custom group assignments shaped { "Group Name": [{ category_id, sort_order }] }
 * @returns {Array<{
 *   groupName: string,
 *   categories: Array<{
 *     category_id: string,
 *     category_name: string,
 *     effectiveGroup: string,
 *     sort_order: number,
 *     months: Record<string, { actual: number|null, budgeted: number|null }>
 *   }>
 * }>}
 */
export function groupExpenses(categories, customGroups) {
  if (!categories || categories.length === 0) return []

  const resolvedGroups = customGroups ?? {}

  // Step 1 — filter to expense categories only.
  const expenseCategories = categories.filter(
    cat => cat.group_type !== 'income' && cat.group_type !== 'transfer'
  )

  // Step 2 — build a flat lookup: category_id -> { custom_group, sort_order }
  // customGroups shape: { "Group Name": [{ category_id, sort_order }, ...] }
  const customLookup = {}
  Object.entries(resolvedGroups).forEach(([groupName, items]) => {
    items.forEach(item => {
      customLookup[item.category_id] = {
        custom_group: groupName,
        sort_order:   item.sort_order ?? 0,
      }
    })
  })

  // Step 3 — resolve effectiveGroup and preserve full months object.
  // Do NOT extract a single month's values — callers do that.
  const flatCategories = expenseCategories.map(cat => {
    const custom         = customLookup[cat.category_id]
    const effectiveGroup = custom?.custom_group ?? cat.group_name ?? 'Other'
    return {
      category_id:   cat.category_id,
      category_name: cat.category_name,
      effectiveGroup,
      sort_order:    custom?.sort_order ?? Infinity,  // uncustomised → end of list
      months:        cat.months,
    }
  })

  // Step 4 — group by effective group name.
  const groupMap = {}
  flatCategories.forEach(cat => {
    const g = cat.effectiveGroup
    if (!groupMap[g]) groupMap[g] = []
    groupMap[g].push(cat)
  })

  // Step 5 — sort within each group by sort_order, then category_name.
  Object.values(groupMap).forEach(items => {
    items.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.category_name.localeCompare(b.category_name)
    })
  })

  // Step 6 — [SR-14] sort groups by minimum sort_order ascending,
  // alphabetical groupName as tiebreaker (deterministic even when all Infinity).
  const groupEntries = Object.entries(groupMap)
  groupEntries.sort(([nameA, catsA], [nameB, catsB]) => {
    const minA = Math.min(...catsA.map(c => c.sort_order))
    const minB = Math.min(...catsB.map(c => c.sort_order))
    if (minA !== minB) return minA - minB
    return nameA.localeCompare(nameB)
  })

  return groupEntries.map(([groupName, cats]) => ({ groupName, categories: cats }))
}
