/**
 * Shared test fixtures — canned API responses used across test files.
 */

export const MOCK_STATS = {
  current: { net_worth: 500000 },
  mom: { change: 5000, pct_change: 1.0 },
  yoy: { change: 50000, pct_change: 11.1 },
}

export const MOCK_HISTORY = [
  { date: '2024-01-01', net_worth: 450000, assets: 600000, liabilities: 150000 },
  { date: '2025-01-01', net_worth: 475000, assets: 625000, liabilities: 150000 },
  { date: '2026-01-01', net_worth: 500000, assets: 650000, liabilities: 150000 },
]

export const MOCK_ACCOUNTS = [
  { id: 1, name: 'Checking',  type: 'checking',  institution: 'Chase',       current_balance: 10000,   is_asset: 1 },
  { id: 2, name: 'Savings',   type: 'savings',   institution: 'Chase',       current_balance: 50000,   is_asset: 1 },
  { id: 3, name: 'Brokerage', type: 'investment', institution: 'Fidelity',   current_balance: 440000,  is_asset: 1 },
  { id: 4, name: 'Mortgage',  type: 'mortgage',  institution: 'Wells Fargo', current_balance: -200000, is_asset: 0 },
]

export const MOCK_GROUPS = [
  { id: 1, name: 'Liquid Cash', color: '#6366f1', account_ids: [1, 2] },
  { id: 2, name: 'Debt',        color: '#f87171', account_ids: [4] },
]

export const MOCK_HISTORY_DATA = {
  series: [
    { date: '2025-01-01', 'Liquid Cash': 55000, 'Debt': -200000 },
    { date: '2026-01-01', 'Liquid Cash': 60000, 'Debt': -180000 },
  ],
  groups_meta: {
    'Liquid Cash': { color: '#6366f1' },
    'Debt':        { color: '#f87171' },
  },
}

export const MOCK_SNAPSHOT = [
  { id: 1, name: 'Liquid Cash', color: '#6366f1', total: 60000,   account_count: 2 },
  { id: 2, name: 'Debt',        color: '#f87171', total: -180000, account_count: 1 },
]

export const MOCK_SYNC_LAST_STATUS = [
  { entity: 'accounts',        last_synced_at: '2026-02-23T10:00:00Z', total_records: 67   },
  { entity: 'account_history', last_synced_at: '2026-02-23T10:00:00Z', total_records: 32607 },
  { entity: 'categories',      last_synced_at: '2026-02-23T10:00:00Z', total_records: 102  },
  { entity: 'transactions',    last_synced_at: '2026-02-23T10:00:00Z', total_records: 964  },
  { entity: 'budgets',         last_synced_at: '2026-02-23T10:00:00Z', total_records: 1313 },
]

export const MOCK_SYNC_JOB = {
  id: 'job-1',
  started_at: '2026-02-23T10:00:00Z',
  finished_at: '2026-02-23T10:01:30Z',
  status: 'success',
  full_refresh: false,
  entities: ['accounts', 'transactions'],
  results: {
    accounts:     { status: 'success', count: 67,  new: 0 },
    transactions: { status: 'success', count: 964, new: 5 },
  },
}

export const MOCK_SETTINGS = {
  sync_interval_hours: 0,
}

export const MOCK_SYNC_HISTORY = [
  {
    id: 'job-1',
    started_at: '2026-02-23T10:00:00Z',
    finished_at: '2026-02-23T10:01:30Z',
    status: 'success',
    full_refresh: false,
    entities: ['accounts', 'transactions'],
    results: {
      accounts:     { status: 'success', count: 67,  new: 0 },
      transactions: { status: 'success', count: 964, new: 5 },
    },
  },
  {
    id: 'job-2',
    started_at: '2026-02-22T09:00:00Z',
    finished_at: '2026-02-22T09:02:00Z',
    status: 'partial',
    full_refresh: true,
    entities: ['accounts', 'transactions', 'budgets'],
    results: {
      accounts:     { status: 'success', count: 67,   new: 0 },
      transactions: { status: 'success', count: 964,  new: 0 },
      budgets:      { status: 'failed',  count: 0,    error: 'Timeout' },
    },
  },
]

export const MOCK_SETUP_STATUS = { configured: true }

/**
 * Set up global.fetch to return canned responses keyed by URL substring.
 * Call in beforeEach; pair with vi.restoreAllMocks() or afterEach cleanup.
 *
 * @param {Object} routes  e.g. { '/api/networth/stats': MOCK_STATS, ... }
 */
export function mockFetch(routes) {
  global.fetch = vi.fn((url) => {
    for (const [key, body] of Object.entries(routes)) {
      if (url.includes(key)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(body),
        })
      }
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
    })
  })
}
