# Phase 3: Investments Page — Detailed Requirements

**Date:** 2026-03-09
**Source:** PM Agent — refined from locked-in requirements (investment-forecasting-requirements.md)
**Status:** Ready for architecture + design

---

## Overview

Phase 3 introduces a new **Investments** page to the Stashtrend sidebar navigation. It provides an account-level performance dashboard (default view) and a holdings drill-down (click into any account). All data is sourced from the existing `holdings` table and `accounts` table populated by the Phase 0 holdings sync pipeline (PR #3, merged).

---

## User Stories

### US-1: View All Investment Accounts at a Glance
**As a** retirement-focused investor,
**I want** a single page showing all my investment accounts with key performance metrics,
**So that** I can quickly assess my portfolio without digging through individual accounts.

**Acceptance Criteria:**
- Page displays a card/row for every account where `type = 'investment'` (or matched by BUCKET_MAP to Retirement/Brokerage)
- Each account shows: account name, institution, current value, total return ($), total return (%), allocation weight (% of total portfolio)
- CAGR is displayed per account (calculated from `account_history` over the account's lifetime)
- Accounts are sorted by current value descending by default
- Total portfolio value is displayed prominently at the top

### US-2: View Performance Over Time
**As a** periodic investor,
**I want** a performance chart showing account values over selectable time ranges,
**So that** I can see how my investments have performed over different periods.

**Acceptance Criteria:**
- Line chart showing selected account(s) value over time
- Time range selector: 3M, 6M, 1Y, 2Y, All (reuse `RangeSelector` + `COMMON_RANGES` pattern)
- Multi-select: user can toggle individual accounts on/off
- "All Accounts" aggregate line is shown by default
- Chart uses existing design system (recharts, dark theme, shared chart elements)

### US-3: Track Contributions
**As a** retirement saver,
**I want** to see how much I've contributed vs. how much my investments have grown,
**So that** I can understand the split between my savings effort and market returns.

**Acceptance Criteria:**
- Contribution amounts auto-detected from `transactions` table (transfers into investment accounts)
- Aggregated by month per account
- Displayed as a summary stat: "Total Contributed" vs "Total Growth"
- Optionally shown on the performance chart as a separate series or shaded area
- Manual override capability (stored in a settings/config endpoint) — deferred to future if complexity is high

### US-4: Drill Down into Individual Holdings
**As an** investor,
**I want** to click on any account to see its individual positions,
**So that** I can review specific holdings, cost basis, and unrealized gains/losses.

**Acceptance Criteria:**
- Clicking an account navigates to / reveals a holdings drill-down view
- Each holding shows: ticker, security name, quantity, cost basis, current value, unrealized gain/loss ($), unrealized gain/loss (%), security type
- Table is sortable by any column (at minimum: value, gain/loss, ticker)
- Table is filterable by security type (stocks, ETFs, mutual funds, bonds, other)
- Current price per share is displayed

### US-5: View Asset Allocation
**As an** investor,
**I want** a visual breakdown of my asset allocation,
**So that** I can see my diversification at a glance.

**Acceptance Criteria:**
- Pie or donut chart showing allocation by security type (stocks vs bonds vs cash vs ETF vs other)
- Shown in the holdings drill-down view for a specific account
- Also available as a portfolio-level aggregate on the main investments page
- Percentages and dollar values shown in chart tooltips
- Clean, scannable — not cluttered

### US-6: Responsive Mobile Experience
**As a** mobile user,
**I want** the investments page to work well on small screens,
**So that** I can check my portfolio on my phone.

**Acceptance Criteria:**
- Account cards stack vertically on mobile
- Holdings table scrolls horizontally or uses a card layout on mobile
- Charts resize appropriately (use `useResponsive` hook)
- Drill-down navigation works via tap

---

## Edge Cases

| Case | Handling |
|------|----------|
| No investment accounts | Show empty state: "No investment accounts found. Sync your Monarch data to see investments." |
| Account with no holdings | Show the account card with $0 value and "No holdings synced" message in drill-down |
| Holdings never synced | Detect missing `holdings` rows; show "Holdings not yet synced — run a sync with Holdings enabled" |
| Stale data (last_synced_at > 24h old) | Show a subtle warning badge: "Last synced X hours ago" |
| Account with no transaction history | Contribution tracking shows "No contribution data available" — growth calc degrades gracefully to simple value change |
| Zero cost basis | Display "N/A" for return % to avoid division by zero; show absolute gain/loss only |
| Negative holdings (short positions) | Display quantity as negative; gain/loss math still works (unlikely for retirement accounts but handle gracefully) |
| Very large number of holdings (50+) | Paginate or virtualize the table; initial implementation can use client-side sort/filter with all data loaded |
| Mixed account types in drill-down | If a non-investment account has no holdings, drill-down shows empty state |

---

## Data Dependencies

### Existing (from Phase 0 — PR #3, merged):
- `holdings` table in SQLite (schema: id, account_id, security_id, security_name, ticker, security_type, quantity, basis, total_value, current_price, is_manual, last_synced_at, synced_at)
- `accounts` table with type, subtype, current_balance, institution, etc.
- `account_history` table with daily balance snapshots per account
- `transactions` table with transfer/deposit records
- Sync pipeline fetches holdings via `fetchers.fetch_holdings()` and upserts via `storage.upsert_holdings()`
- BUCKET_MAP in `app.py` maps account types to display buckets (Retirement, Brokerage, etc.)

### New (to be built in Phase 3):
- API endpoints for investment account summary, holdings per account, contribution detection, performance time series
- Frontend page, components, and route

---

## Calculations

### Total Return ($)
```
total_return = current_value - total_cost_basis
```
Where `total_cost_basis = SUM(holdings.basis)` for the account.

### Total Return (%)
```
return_pct = (current_value - total_cost_basis) / total_cost_basis * 100
```
Guard: if `total_cost_basis = 0`, return `null` / "N/A".

### CAGR (per account)
```
CAGR = (ending_value / beginning_value) ^ (1 / years) - 1
```
Calculated from `account_history` table: earliest and latest balance for the account.
Guard: if < 1 year of history, show simple return % instead.

### Allocation Weight
```
weight_pct = account_value / total_portfolio_value * 100
```

### Unrealized Gain/Loss (per holding)
```
gain_loss = total_value - basis
gain_loss_pct = (total_value - basis) / basis * 100
```

### Contribution Detection
```sql
SELECT date, amount FROM transactions
WHERE account_id = ? AND (category LIKE '%transfer%' OR category LIKE '%deposit%')
ORDER BY date
```
Aggregate monthly. Net contributions = sum of positive transfers in.

---

## Out of Scope (Phase 3)

- Benchmark comparison (Phase 6)
- Monte Carlo simulation (Phase 5)
- AI narrative analysis (Phase 5)
- Forecasting / projections (Phase 4)
- Manual contribution override (defer unless simple to implement)
- Real-time / intraday price updates
- Tax lot tracking
- Dividend tracking
- Transaction-level history per holding

---

## Success Criteria

1. New "Investments" nav item appears in sidebar between "Net Worth" and "Account Groups"
2. Default view shows all investment accounts with performance metrics
3. Performance chart with time range selection works smoothly
4. Clicking an account reveals holdings with sortable table
5. Asset allocation donut chart renders correctly
6. Empty states handle gracefully (no crashes, clear messaging)
7. Mobile-responsive layout
8. All data sourced from existing DB (no manual entry)
9. Page loads in < 2 seconds with typical data volume (5-10 accounts, 50-100 holdings)
