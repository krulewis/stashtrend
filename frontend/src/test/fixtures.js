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

export const MOCK_NETWORTH_BY_TYPE = {
  series: [
    { date: '2024-01-01', Retirement: 200000, Brokerage: 180000, Cash: 55000, 'Real Estate': 0, Debt: -200000, Other: 0 },
    { date: '2025-01-01', Retirement: 220000, Brokerage: 200000, Cash: 58000, 'Real Estate': 0, Debt: -195000, Other: 0 },
    { date: '2026-01-01', Retirement: 240000, Brokerage: 200000, Cash: 60000, 'Real Estate': 0, Debt: -190000, Other: 0 },
  ],
  cagr: {
    Retirement:    { '1y': 9.1,  '3y': 8.2, '5y': 7.6 },
    Brokerage:     { '1y': 5.4,  '3y': 6.1, '5y': null },
    Cash:          { '1y': 4.2,  '3y': null, '5y': null },
    'Real Estate': { '1y': null, '3y': null, '5y': null },
    Debt:          { '1y': null, '3y': null, '5y': null },
    Other:         { '1y': null, '3y': null, '5y': null },
  },
  bucket_colors: {
    Retirement:    '#4D9FFF',
    Brokerage:     '#2ECC8A',
    Cash:          '#7DBFFF',
    'Real Estate': '#F5A623',
    Debt:          '#FF5A7A',
    Other:         '#8BA8CC',
  },
  bucket_order: ['Retirement', 'Brokerage', 'Cash', 'Real Estate', 'Debt', 'Other'],
}

export const MOCK_GROUPS = [
  { id: 1, name: 'Liquid Cash', color: '#4D9FFF', account_ids: [1, 2] },
  { id: 2, name: 'Debt',        color: '#FF5A7A', account_ids: [4] },
]

export const MOCK_HISTORY_DATA = {
  series: [
    { date: '2025-01-01', 'Liquid Cash': 55000, 'Debt': -200000 },
    { date: '2026-01-01', 'Liquid Cash': 60000, 'Debt': -180000 },
  ],
  groups_meta: {
    'Liquid Cash': { color: '#4D9FFF' },
    'Debt':        { color: '#FF5A7A' },
  },
}

export const MOCK_SNAPSHOT = [
  { id: 1, name: 'Liquid Cash', color: '#4D9FFF', total: 60000,   account_count: 2 },
  { id: 2, name: 'Debt',        color: '#FF5A7A', total: -180000, account_count: 1 },
]

export const MOCK_SYNC_LAST_STATUS = [
  { entity: 'accounts',        last_synced_at: '2026-02-23T10:00:00Z', total_records: 67   },
  { entity: 'account_history', last_synced_at: '2026-02-23T10:00:00Z', total_records: 32607 },
  { entity: 'holdings',        last_synced_at: '2026-02-23T10:00:00Z', total_records: 42   },
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

export const MOCK_BUDGET_HISTORY = {
  months: ['2025-11-01', '2025-12-01'],
  // expense-only totals (used by the bar chart)
  totals_by_month: {
    '2025-11-01': { budgeted: 1000, actual: 858 },  // 500+200+300, 523+215+120
    '2025-12-01': { budgeted: 1000, actual: 954 },  // 500+200+300, 489+185+280
  },
  categories: [
    {
      category_id: 'cat_income_1',
      category_name: 'Paycheck',
      group_name: 'Income',
      group_type: 'income',
      months: {
        '2025-11-01': { budgeted: 6000, actual: 6000, variance: 0 },
        '2025-12-01': { budgeted: 6000, actual: 6200, variance: -200 },
      },
    },
    {
      category_id: 'cat_1',
      category_name: 'Groceries',
      group_name: 'Food & Drink',
      group_type: 'expense',
      months: {
        '2025-11-01': { budgeted: 500, actual: 523, variance: -23 },
        '2025-12-01': { budgeted: 500, actual: 489, variance: 11 },
      },
    },
    {
      category_id: 'cat_2',
      category_name: 'Restaurants',
      group_name: 'Food & Drink',
      group_type: 'expense',
      months: {
        '2025-11-01': { budgeted: 200, actual: 215, variance: -15 },
        '2025-12-01': { budgeted: 200, actual: 185, variance: 15 },
      },
    },
    {
      category_id: 'cat_3',
      category_name: 'Entertainment',
      group_name: 'Fun',
      group_type: 'expense',
      months: {
        '2025-11-01': { budgeted: 300, actual: 120, variance: 180 },  // 40.0% — safe zone
        '2025-12-01': { budgeted: 300, actual: 280, variance: 20 },   // 93.3% — warning zone
      },
    },
  ],
}

export const MOCK_CONFIGS = [
  { id: 1, name: 'Net Worth View', group_ids: [1] },
  { id: 2, name: 'Full Picture',   group_ids: [1, 2] },
]

export const MOCK_CONFIGS_RESPONSE = {
  configs: MOCK_CONFIGS,
  active_config_id: 1,
}

export const MOCK_CONFIGS_EMPTY = {
  configs: [],
  active_config_id: null,
}

export const MOCK_AI_CONFIG_UNCONFIGURED = {
  configured: false,
  model: null,
  provider: null,
  base_url: '',
}

export const MOCK_AI_CONFIG_CONFIGURED = {
  configured: true,
  model: 'claude-opus-4-5',
  provider: 'anthropic',
  base_url: '',
}

// ── Budget Builder ────────────────────────────────────────────────────────
export const MOCK_BUILDER_PROFILE = {
  exists: true,
  expected_income: 6000,
  num_children: 2,
  children_ages: [4, 7],
  location: 'Austin, TX',
  housing_type: 'rent',
  upcoming_events: ['Spring soccer'],
  other_info: '',
}

export const MOCK_BUILDER_PROFILE_EMPTY = { exists: false }

export const MOCK_BUILDER_REGIONAL = {
  exists: true,
  food_cost_trend: '$950/mo, up 3%',
  childcare_cost: '$1,200-1,800/mo',
  gas_fuel_price: '$2.89/gal',
  insurance_trend: '$180/mo auto',
  electricity_cost: '$150/mo avg',
  other_factors: [],
  source: 'ai',
}

export const MOCK_BUILDER_REGIONAL_EMPTY = { exists: false }

export const MOCK_BUILDER_PLAN = {
  id: 1,
  name: 'March Plan',
  months_ahead: 3,
  summary: 'Budget $5,100/mo across all categories.',
  line_items: [
    {
      category_id: 'cat_1',
      category_name: 'Groceries',
      group_name: 'Food & Drink',
      rationale: '6-mo avg $510 + 3% inflation',
      months: { '2026-04-01': 525, '2026-05-01': 530, '2026-06-01': 530 },
    },
    {
      category_id: 'cat_2',
      category_name: 'Restaurants',
      group_name: 'Food & Drink',
      rationale: 'Trending down from $215 to $185',
      months: { '2026-04-01': 190, '2026-05-01': 190, '2026-06-01': 190 },
    },
  ],
  total_monthly_budget: { '2026-04-01': 5100, '2026-05-01': 5100, '2026-06-01': 5100 },
  ai_generated_at: '2026-03-01T12:00:00Z',
  user_edited_at: null,
  applied_at: null,
}

export const MOCK_BUILDER_PLANS_LIST = {
  plans: [
    { id: 1, name: 'March Plan', created_at: '2026-03-01', months_ahead: 3, applied_at: null },
  ],
}

export const MOCK_APPLY_RESULT = { applied: 6, failed: 0, errors: [] }
export const MOCK_APPLY_PARTIAL = { applied: 4, failed: 2, errors: [
  { category_id: 'cat_1', month: '2026-05-01', error: 'Timeout' },
  { category_id: 'cat_1', month: '2026-06-01', error: 'Timeout' },
]}

// ── Type Data (Net Worth by bucket) ──────────────────────────────────────
export const MOCK_TYPE_DATA = {
  bucket_order: ['Retirement', 'Brokerage', 'Cash', 'Real Estate', 'Debt', 'Other'],
  bucket_colors: {
    Retirement: '#6366f1', Brokerage: '#22c55e', Cash: '#38bdf8',
    'Real Estate': '#f59e0b', Debt: '#ef4444', Other: '#a78bfa',
  },
  series: [
    { date: '2024-01-01', Retirement: 200000, Brokerage: 50000, Cash: 20000, 'Real Estate': 100000, Debt: -30000, Other: 5000 },
    { date: '2024-06-01', Retirement: 220000, Brokerage: 55000, Cash: 22000, 'Real Estate': 105000, Debt: -28000, Other: 5000 },
    { date: '2025-01-01', Retirement: 240000, Brokerage: 60000, Cash: 25000, 'Real Estate': 110000, Debt: -25000, Other: 5000 },
  ],
  cagr: {
    Retirement: { '1y': 0.08, '3y': 0.07, '5y': null },
    Brokerage:  { '1y': 0.10, '3y': null, '5y': null },
    Cash:       { '1y': 0.04, '3y': null, '5y': null },
    'Real Estate': { '1y': 0.05, '3y': null, '5y': null },
    Debt:       { '1y': null, '3y': null, '5y': null },
    Other:      { '1y': null, '3y': null, '5y': null },
  },
}

// ── Retirement / Milestones ───────────────────────────────────────────────
export const MOCK_RETIREMENT_EMPTY = { exists: false }

export const MOCK_RETIREMENT = {
  exists: true,
  current_age: 35,
  target_retirement_age: 65,
  desired_annual_income: 80000,
  monthly_contribution: 2000,
  expected_return_pct: 7.0,
  inflation_rate_pct: 2.5,
  social_security_annual: 12000,
  withdrawal_rate_pct: 4.0,
  milestones: [
    { label: 'Half-Mil', amount: 500000 },
    { label: 'First Million', amount: 1000000 },
  ],
}
