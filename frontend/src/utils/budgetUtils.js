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
