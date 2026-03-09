# Phase 6 Requirements — Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Source:** PM Agent — refined from locked-in requirements (investment-forecasting-requirements.md)
**Status:** Draft — ready for research/architecture pipeline
**Size:** S
**Depends on:** Phase 3 (Investments page — account-level performance + holdings drill-down)

---

## Summary

Add S&P 500 benchmark comparison to the Investments page so users can evaluate whether their accounts are beating the market. Optionally allow users to set target asset allocation and compare against actual allocation.

---

## User Stories

### US-1: Portfolio vs S&P 500 Performance Overlay
**As a** retirement-focused investor,
**I want to** see my portfolio/account returns plotted alongside the S&P 500 over the same period,
**So that** I can tell at a glance whether my investments are outperforming or underperforming the market benchmark.

**Acceptance Criteria:**
- Performance chart on the Investments page shows a toggleable S&P 500 line overlay
- Comparison uses percentage returns (not absolute dollars) so the scales are comparable
- Time ranges (3M, 6M, 1Y, 2Y, All) apply to both the portfolio line and the benchmark line
- The starting point of each line is normalized to 0% at the beginning of the selected range
- Tooltip shows both portfolio return % and S&P 500 return % on hover
- S&P 500 data loads automatically — no manual entry required

### US-2: Per-Account Benchmark Comparison
**As a** user with multiple investment accounts,
**I want to** compare any individual account's performance against the S&P 500,
**So that** I can identify which accounts are underperforming the benchmark.

**Acceptance Criteria:**
- When a single account is selected in the performance chart, the S&P 500 overlay compares against that specific account's returns
- When "All Accounts" is selected, the overlay compares the combined portfolio return vs S&P 500
- Account selection mechanism already exists from Phase 3 — reuse it

### US-3: Target vs Actual Asset Allocation (Optional/Stretch)
**As a** user who has a target asset allocation (e.g., 80/20 stocks/bonds),
**I want to** set my target allocation and see how my actual allocation compares,
**So that** I know when I need to rebalance.

**Acceptance Criteria:**
- User can set target allocation percentages per asset class (stocks, bonds, cash, other)
- A visual comparison (side-by-side bars or donut charts) shows target vs actual
- Allocation drift is highlighted when actual deviates from target by more than a configurable threshold (default 5%)
- Target allocation is persisted in the database
- This is a stretch goal — the S&P 500 overlay (US-1, US-2) is the primary deliverable

---

## Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| E1 | S&P 500 data unavailable (API down, rate limited) | Show chart without benchmark line; display subtle info message "Benchmark data unavailable" |
| E2 | Account has less history than S&P 500 data | Align comparison to the account's first data point; don't show benchmark before account existed |
| E3 | Account has zero returns (new account, no history) | Show flat line at 0%; S&P 500 line still renders for reference |
| E4 | User has no investment accounts | Benchmark toggle is hidden; no S&P 500 data fetched |
| E5 | S&P 500 data is stale (hasn't updated recently) | Show data as-is with a "Last updated: {date}" indicator |
| E6 | Very short time range (< 1 month) | Daily data points; percentage changes may look volatile — this is expected |
| E7 | Target allocation percentages don't sum to 100% | Validate on save; show error message, don't persist invalid data |

---

## Out of Scope

- **Other benchmarks** (NASDAQ, Total Bond Market, international indices) — S&P 500 only for Phase 6
- **Holdings-level benchmark comparison** (individual stock vs sector benchmark) — too granular for this phase
- **Real-time / intraday benchmark data** — daily close prices are sufficient
- **Benchmark data for non-investment accounts** — only applies to investment/brokerage/retirement accounts
- **Tax-adjusted returns comparison** — not in scope
- **FIRE calculator integration** — deferred per requirements doc

---

## Data Requirements

### S&P 500 Historical Data
- Need daily closing prices for S&P 500 index (^GSPC)
- Time range: at minimum, must cover the full range of the user's investment account history
- Update frequency: daily (can be fetched during sync or on-demand)
- Must be a free data source — no paid API keys required

### Derived Calculations
- Percentage return over period: `(end_value / start_value - 1) * 100`
- Both portfolio returns and S&P 500 returns normalized to same starting date for comparison
- TWRR (time-weighted rate of return) preferred over simple return for portfolio (accounts for contributions/withdrawals)

---

## UI Requirements (high-level — detailed in design spec)

- Toggle/checkbox to show/hide S&P 500 overlay on the existing performance chart
- S&P 500 line uses a distinct, muted color (e.g., dashed gray or amber) to differentiate from account lines
- Legend entry for "S&P 500" when overlay is active
- Tooltip includes S&P 500 data point when hovering
- Optional: summary card showing "vs S&P 500: +X.X% / -X.X%" outperformance/underperformance
- Target allocation view (US-3) is a separate section/tab below the performance chart

---

## Technical Notes

- Phase 3 (Investments page) must be complete before this work begins
- The `holdings` table and sync pipeline (Phase 0) already exist
- No new Monarch API calls needed — S&P 500 data comes from an external public source
- Backend needs a new endpoint to serve benchmark data
- Frontend extends existing performance chart component from Phase 3
