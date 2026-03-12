/**
 * NAV_ITEMS — single source of truth for sidebar and bottom tab bar.
 * Edit here to add, remove, or reorder nav items.
 *
 * Note: NavLink `end` prop may be needed on individual items if sub-routes
 * are ever introduced (e.g., /networth/details would also match /networth
 * without `end`). Not needed today since no routes share a prefix.
 */
export const NAV_ITEMS = [
  { path: '/networth',     label: 'Net Worth',      icon: '📈' },
  { path: '/investments',  label: 'Investments',    icon: '\uD83D\uDCBC' },
  { path: '/groups',       label: 'Account Groups', icon: '⬡'  },
  { path: '/budgets',  label: 'Budgets',        icon: '💰' },
  { path: '/builder',  label: 'Budget Builder', icon: '🏗'  },
  { path: '/milestones', label: 'Milestones', icon: '🎯' },
  { path: '/sync',     label: 'Sync Data',      icon: '🔄' },
]
