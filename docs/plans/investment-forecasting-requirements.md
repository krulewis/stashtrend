# Requirements — Net Worth + Investments + Forecasting

**Date:** 2026-03-04
**Source:** PM Agent interview with Kelly
**Status:** Locked in — ready for research/planning pipeline

---

## User Profile

- **Investor type:** Retirement-focused (401k/IRA, long time horizon)
- **Interaction style:** Check periodically, not daily — wants scannable dashboards
- **Data source:** All data from Monarch Money sync — zero manual data entry for holdings/returns
- **Existing AI infra:** Anthropic + OpenAI-compatible providers via `_call_ai()` helper

---

## Anti-Goals

- **No manual data entry** for holdings or returns — everything from Monarch sync
- **No overwhelming dashboards** — clean and scannable, not a Bloomberg terminal
- **No real-time/intraday focus** — not for day trading, no live tickers
- **No FIRE calculator** (deferred to future roadmap)

---

## Feature Area 1: Enhanced Net Worth Page

**Location:** Existing Net Worth page (add sections/tabs)

### 1a. Net Worth by Account Type
- Break down NW into retirement, brokerage, cash, real estate, debt
- Stacked area chart showing how each type contributes over time
- Summary cards per type with current value + change

### 1b. CAGR Estimates
- Calculate CAGR for each investment account from account history
- Display alongside account type breakdown
- Time-weighted to account for contributions (auto-detected from transactions, with manual override)

### 1c. NW Milestones
- Predefined milestone targets ($500K, $1M, $2M) with projected hit dates
- Based on historical growth rate extrapolation
- Visual timeline or progress bar showing distance to next milestone

### 1d. Retirement Target Tracker
- **Minimal inputs (default):** Target retirement age + desired annual retirement income
- **Advanced dropdown (optional, none required):**
  - Expected Social Security income
  - Expected return rate
  - Inflation rate
  - Tax rate assumptions
  - Withdrawal strategy (e.g., 4% rule, dynamic)
- Output: "You need $X by age Y — you are on/off track" with a visual gauge
- If advanced inputs provided, incorporate them into the calculation

### 1e. Better Historical Analysis
- Rolling averages (3M, 6M, 12M) on NW chart
- Drawdown detection and recovery period tracking
- Peak-to-trough visualization

---

## Feature Area 2: New Investments Page

**Location:** New page in sidebar navigation

### 2a. Account-Level Performance (default view)
- Dashboard showing all investment accounts
- Per-account: current value, total return ($, %), CAGR, allocation weight
- Performance chart (selectable accounts, time ranges)
- Contribution tracking: auto-detect from transaction history (transfers into investment accounts), with manual override

### 2b. Holdings Drill-Down
- Click any account to see individual positions
- Per-holding: ticker, name, quantity, cost basis, current value, unrealized gain/loss ($, %), daily change
- Asset allocation pie/donut chart (stocks vs bonds vs cash vs other)
- Sortable/filterable table

### 2c. Benchmark Comparison (nice-to-have)
- Compare account/portfolio returns vs S&P 500
- Show target vs actual asset allocation if user sets a target
- Lower priority — build after core features

---

## Feature Area 3: New Forecasting Page

**Location:** New page in sidebar navigation

### Layer 1: Simple Projection (default)
- Compound growth curves based on historical CAGR + detected monthly contributions
- Show projected portfolio value at retirement age
- Interactive sliders: adjust contribution amount, return rate assumption
- Multiple lines: current trajectory, +10% contributions, -10% contributions

### Layer 2: Monte Carlo Simulation
- Run thousands of randomized scenarios using historical volatility
- Display probability bands: 10th/25th/50th/75th/90th percentile outcomes
- Show probability of hitting retirement target
- "Advanced" view — not the default

### Layer 3: AI Narrative Analysis
- Use existing AI infra (`_call_ai()`) to generate personalized commentary
- Interpret the projection and simulation results in plain English
- Highlight risks, suggest actions (increase contributions, rebalance, etc.)
- Same UX pattern as Budget AI analysis panel

### Retirement Planner (integrated into Forecasting page)
- Uses same minimal/advanced input pattern from Feature 1d
- Visualizes retirement readiness alongside projections
- Shows gap analysis: "You need $X more" or "You're $X ahead of target"

---

## Technical Prerequisites

### Phase 0: Holdings Sync Pipeline

**API available but unused:** Monarch's `get_account_holdings()` returns full per-security data.

**New DB tables needed:**

```sql
-- Holdings per account (one row per position per sync)
holdings (
    id INTEGER PRIMARY KEY,
    account_id TEXT NOT NULL,
    security_id TEXT,
    ticker TEXT,
    name TEXT,
    type TEXT,              -- stock, ETF, mutual fund, bond, etc.
    quantity REAL,
    cost_basis REAL,
    current_value REAL,
    unrealized_gain_loss REAL,
    one_day_change_pct REAL,
    one_day_change_dollars REAL,
    last_synced_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
)

-- Security price history (for forecasting volatility)
security_prices (
    id INTEGER PRIMARY KEY,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    UNIQUE(ticker, date)
)
```

**Pipeline changes:**
- Add `fetch_holdings()` to sync pipeline (call `get_account_holdings()` per investment account)
- Store/upsert into `holdings` table on each sync
- Optionally track price history in `security_prices` for Monte Carlo volatility inputs

**Contribution detection:**
- Query `transactions` table for transfers into investment accounts
- Aggregate by month per account
- Store detected contributions or calculate on-the-fly
- Allow manual override via a settings/config endpoint

---

## Build Order

| Phase | Scope | Size | Depends On |
|-------|-------|------|------------|
| **0** | Holdings sync pipeline + DB tables | M | — |
| **1** | NW by account type + CAGR | M | Phase 0 (CAGR needs holdings context; account type breakdown uses existing data) |
| **2** | NW milestones + retirement target tracker | M | Phase 1 (needs CAGR for projections) |
| **3** | Investments page (account perf + holdings drill-down) | L | Phase 0 |
| **4** | Forecasting page (simple projections + retirement planner) | L | Phase 1, 2 |
| **5** | Monte Carlo + AI narrative | M | Phase 4 |
| **6** | Benchmark comparison | S | Phase 3 |

Each phase ships as its own PR. Incremental delivery — usable after each phase.

---

## Success Criteria

- All investment data comes from Monarch sync — no manual entry required
- CAGR displayed for every investment account
- User can set a retirement target and see on/off track status at a glance
- NW milestones show projected dates based on real growth data
- Forecasting shows at minimum a simple projection curve with contribution assumptions
- Monte Carlo and AI layers add depth without cluttering the default view
- UI matches existing Stashtrend design language (dark theme, design tokens, clean layout)
