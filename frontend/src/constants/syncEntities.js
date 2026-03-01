/** Shared sync entity metadata — single source of truth for all sync UI components. */

export const SYNC_ENTITY_ORDER = [
  'accounts',
  'account_history',
  'categories',
  'transactions',
  'budgets',
]

export const SYNC_ENTITY_LABELS = {
  accounts:        'Accounts',
  account_history: 'Account History',
  categories:      'Categories',
  transactions:    'Transactions',
  budgets:         'Budgets',
}

export const SYNC_ENTITY_DESCS = {
  accounts:        'Account names, balances, and metadata',
  account_history: 'Daily balance snapshots for all accounts',
  categories:      'Transaction category definitions',
  transactions:    'Individual transaction records',
  budgets:         'Monthly budget vs. actual data',
}

export const SYNC_ENTITY_SHORT = {
  accounts:        'Accounts',
  account_history: 'History',
  categories:      'Categories',
  transactions:    'Transactions',
  budgets:         'Budgets',
}

/** Maps job/entity status to display icon and CSS variable color. */
export const SYNC_STATUS_ICON = {
  pending: { icon: '●', color: 'var(--text-faint)' },
  running: { icon: '⟳', color: 'var(--amber)' },
  success: { icon: '✓', color: 'var(--color-positive)' },
  partial: { icon: '⚠', color: 'var(--amber)' },
  failed:  { icon: '✗', color: 'var(--color-negative)' },
}
