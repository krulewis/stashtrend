# Phase 6 Requirements -- Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Source:** PM Agent -- refined from locked-in requirements (investment-forecasting-requirements.md)
**Status:** Draft -- ready for research/architecture pipeline
**Size:** S
**Depends on:** Phase 3 (Investments page -- account-level performance + holdings drill-down)
**Priority:** Nice-to-have (lowest priority in the investment-forecasting roadmap)

---

## 1. Clarified Intent

The user wants to compare their investment portfolio and individual account returns against the S&P 500 benchmark, overlaid on the same performance chart already built in Phase 3. Separately, users who have a target asset allocation in mind should be able to set those targets and see how their actual allocation compares. This feature lives on the existing Investments page as an additive enhancement -- not a new page. The user is retirement-focused, checks dashboards periodically (not daily), and wants scannable results with zero manual data entry.

---

## 2. User Stories and Acceptance Criteria

### US-1: Portfolio vs S&P 500 Performance Overlay

**As a** retirement-focused investor
**I want to** see my total investment portfolio return plotted alongside the S&P 500 over the same time period
**So that** I can quickly tell if I am outperforming or underperforming the market.

**Acceptance Criteria:**
- AC-1.1: A "Benchmark" toggle on the Investments page performance chart adds an S&P 500 line to the existing chart.
- AC-1.2: Both lines use percentage-return normalization (not raw dollar values) starting from the same base date, so the comparison is meaningful regardless of portfolio size.
- AC-1.3: Supported time ranges match the existing chart range selector (1M, 3M, 6M, 1Y, 3Y, 5Y, ALL per existing `COMMON_RANGES` pattern). The S&P 500 line adjusts to the selected range.
- AC-1.4: Tooltip on hover shows both the portfolio return % and S&P 500 return % for the hovered date.
- AC-1.5: A summary stat card shows the return delta (portfolio return minus S&P 500 return) for the selected time range, with positive delta styled green and negative styled red per existing design tokens (`COLOR_POSITIVE` / `COLOR_NEGATIVE`).
- AC-1.6: S&P 500 data loads automatically from a local cache -- no manual entry, no external API call on page load.

### US-2: Single Account vs S&P 500

**As a** retirement-focused investor
**I want to** compare an individual account's return against the S&P 500
**So that** I can evaluate which accounts are pulling their weight.

**Acceptance Criteria:**
- AC-2.1: When viewing a single account's performance chart (from the account-level view in Phase 3), the same benchmark toggle is available.
- AC-2.2: The S&P 500 line normalizes to the same start date as the account's history within the selected range.
- AC-2.3: If the account has less than 1 month of history, the benchmark toggle is disabled with a tooltip explaining why ("Need at least 1 month of history to compare").

### US-3: Target vs Actual Asset Allocation

**As a** retirement-focused investor
**I want to** set a target asset allocation (e.g., 80% stocks / 15% bonds / 5% cash)
**So that** I can see at a glance whether my actual allocation matches my intended strategy.

**Acceptance Criteria:**
- AC-3.1: A "Set Target" button on the holdings drill-down (asset allocation section) opens an inline form or modal where the user enters percentage targets per asset class.
- AC-3.2: Asset classes match whatever taxonomy Phase 3 establishes for holdings (expected: Stocks, Bonds, Cash, Other -- to be confirmed by research agent).
- AC-3.3: Targets must sum to 100%. The form validates this inline and prevents saving if totals do not equal 100%.
- AC-3.4: Targets persist in the database and survive page reloads.
- AC-3.5: Once targets are set, the existing asset allocation chart shows a comparison view: actual vs target (design details deferred to frontend-designer).
- AC-3.6: Each asset class row in the allocation table shows: Actual % | Target % | Delta -- with color coding for drift severity.
- AC-3.7: If no targets are set, the allocation view looks exactly as Phase 3 built it -- no empty target UI cluttering the default state.
- AC-3.8: User can clear all targets to return to the default state.

### US-4: Data Freshness Indicator

**As a** user viewing benchmark data
**I want to** know how fresh the S&P 500 data is
**So that** I trust the comparison is current.

**Acceptance Criteria:**
- AC-4.1: A "Last updated: {date}" label displays near the benchmark toggle or in the chart footer.
- AC-4.2: If S&P 500 data is more than 3 calendar days old (accounting for weekends), a subtle warning indicator appears (amber text or dot).

---

## 3. Benchmark Comparison Requirements

### Metrics to Compare

| Metric | Portfolio Side | Benchmark Side |
|--------|---------------|----------------|
| **Cumulative return %** | Calculated from `account_history` balances, normalized to start of selected range | S&P 500 price return over same period |
| **Period return delta** | Portfolio return minus S&P 500 return | Displayed as +/- percentage in summary card |

**Note on return methodology:** Time-weighted return (TWR) is the ideal metric because it removes the effect of cash flows (contributions/withdrawals). If Phase 3 implements TWR, use it. If Phase 3 uses simple balance-based returns, that is acceptable for v1 with a footnote: "Returns include contribution effects." The research agent should check Phase 3's approach.

### Time Ranges

All ranges on the existing performance chart range selector. S&P 500 data must cover at least 5 years of history to support 5Y and ALL ranges.

### Visual Overlay

- S&P 500 line uses a distinct, muted color and a dashed line style so (a) the user's portfolio line remains visually dominant and (b) color is not the only differentiator (accessibility).
- Both lines start at 0% on the left axis for the selected range.
- Y-axis label: "Return %".
- Uses existing Recharts patterns from `chartUtils.jsx` (`sharedChartElements`, `TOOLTIP_STYLE`, `GRID_STROKE`, `AXIS_TICK`).
- Legend includes "S&P 500" entry when toggle is active.

---

## 4. Asset Allocation Target Requirements

### Setting Targets

- Targets are per-asset-class percentages that sum to 100%.
- Asset classes align with Phase 3's taxonomy (research agent must confirm what Phase 3 uses).
- Integer percentages only (0-100, no decimals). Minimum 0%, maximum 100%.
- User can clear all targets to revert to default (no-target) state.
- Single set of targets for the entire portfolio (not per-account).

### Storage

New database table:
```sql
allocation_targets (
    asset_class TEXT PRIMARY KEY,
    target_pct  INTEGER NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100)
)
```

Backend endpoints:
- `GET /api/investments/allocation-targets` -- returns current targets (empty array if none set)
- `POST /api/investments/allocation-targets` -- upsert all classes atomically; validates sum = 100; can also accept empty array to clear targets

### Comparison View

When targets are set, show actual vs target. Visual approach deferred to frontend-designer. Options include:
- Concentric donut rings (inner = target, outer = actual)
- Side-by-side donut charts
- Grouped bar chart with target line overlay

Drift color coding suggestions (frontend-designer may adjust thresholds):
- Green: within 2 percentage points of target
- Amber: 2-5pp drift
- Red: >5pp drift

---

## 5. Data Source Requirements -- S&P 500 Historical Prices

### Source Evaluation (for research agent)

| Source | Cost | Rate Limits | Notes |
|--------|------|-------------|-------|
| **Yahoo Finance (yfinance)** | Free | Unofficial, may break | Python library, no API key. Ticker: `^GSPC` |
| **Alpha Vantage** | Free tier | 25 req/day | Requires API key registration |
| **FRED** | Free | Generous | Index level only, no total return |
| **Tiingo** | Free tier | 500 req/day | Requires API key |

**Preference:** Free, no-API-key source if reliable. Research agent should evaluate `yfinance` stability and recommend a fallback strategy.

### Data Specification

- Daily closing prices for S&P 500 (price return index). Total return index preferred if available from the chosen free source.
- Minimum 5 years of history.
- Store locally in SQLite to avoid repeated API calls.

### Suggested Schema

```sql
benchmark_prices (
    ticker  TEXT NOT NULL,         -- e.g., "^GSPC"
    date    TEXT NOT NULL,
    close   REAL NOT NULL,
    PRIMARY KEY (ticker, date)
)
```

Keyed by ticker so additional benchmarks can be added in the future without schema changes.

### Refresh Strategy

- Fetch full history on first use (one-time backfill).
- Then append new days only during the regular Monarch sync cycle (`_run_sync_worker` pipeline).
- If external API is down, use cached data silently -- do not block page load or break sync.
- Track `last_fetched_at` in `sync_log` (entity: "benchmark_prices").

---

## 6. Edge Cases and Error States

| Scenario | Expected Behavior |
|----------|-------------------|
| **S&P 500 data fetch fails (API down/rate limited)** | Show chart without benchmark line. Subtle inline message: "Benchmark data unavailable." No error modals or toasts. |
| **S&P 500 data is stale (>3 calendar days)** | Show data with warning indicator (AC-4.2). Do not hide the chart. |
| **Account has < 1 month of history** | Disable benchmark toggle for that account with explanatory tooltip (AC-2.3). Portfolio-level comparison still works if other accounts have sufficient history. |
| **Account has no `account_history` rows** | No performance chart at all (Phase 3 handles this). Benchmark toggle not shown. |
| **Portfolio history starts mid-range** | Normalize both lines to the portfolio's earliest available date within the selected range. S&P line clips to match. |
| **Allocation targets do not sum to 100%** | Form validation prevents saving. Inline error: "Targets must sum to 100% (currently X%)." |
| **User has no holdings data** | Allocation target section is hidden entirely. |
| **Holdings lack `security_type`** | Those positions fall into "Other" for allocation purposes. Targets still work. |
| **Weekend/holiday gaps in S&P data** | Use last available closing price for alignment. No interpolation. |
| **User has no investment accounts** | Benchmark toggle hidden. No S&P data fetched or displayed. |
| **S&P API library/endpoint changes** | Graceful degradation -- benchmark feature becomes unavailable, rest of Investments page unaffected. Log warning server-side. |
| **Very short range (< 1 month) with volatile swings** | Display as-is. Daily granularity is expected to look choppy. No smoothing. |

---

## 7. Out of Scope / Anti-Goals

- **No other benchmarks** -- S&P 500 only for v1. No NASDAQ, no bond indices, no custom benchmark picker.
- **No risk-adjusted metrics** -- no Sharpe ratio, no alpha/beta, no standard deviation. Keep it simple.
- **No real-time/intraday S&P data** -- daily close only, consistent with the "not for day trading" project philosophy.
- **No per-holding benchmark comparison** -- benchmark is at account or portfolio level only.
- **No automatic rebalancing suggestions** -- showing the allocation delta is enough. No "sell X, buy Y" recommendations.
- **No paid data sources** -- must work with free-tier APIs, preferably no API key.
- **No manual S&P data entry** -- data comes from an external API automatically.
- **No separate Benchmark page** -- this is an enhancement to the existing Investments page.
- **No per-account allocation targets** -- single portfolio-wide target only.
- **No tax-adjusted returns** -- raw returns only.
- **No FIRE calculator** -- explicitly deferred per parent requirements doc.

---

## 8. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **S&P data freshness** | Updated daily during sync. Stale threshold: 3 calendar days. |
| **API rate limits** | Must not exceed free-tier limits. One fetch per sync cycle (not per page load). |
| **Page load impact** | Benchmark data served from local SQLite cache. Zero external API calls on page load. |
| **Failure isolation** | External API failure must not break the Investments page or the sync pipeline. Benchmark is strictly additive. |
| **Storage** | ~5 years of daily S&P data = ~1,260 rows. Negligible SQLite impact. |
| **UI consistency** | All new chart elements use `chartUtils.jsx` helpers, design tokens, existing Recharts patterns. Dark theme compatible. |
| **Accessibility** | Benchmark toggle is keyboard-accessible. Tooltip includes both values. Color is not the only line differentiator (use dashed vs solid line styles). |
| **Mobile** | Benchmark toggle and comparison view should be usable on mobile (follows existing `useResponsive` patterns). Allocation target form must not require horizontal scrolling. |

---

## 9. Deferred Decisions

| Item | Reason |
|------|--------|
| **Additional benchmark indices** | V1 is S&P 500 only. `benchmark_prices` table is keyed by ticker, so adding more indices later is straightforward. |
| **Risk-adjusted metrics** | Requires volatility calculations and risk-free rate data. Out of scope for an S-sized feature. |
| **TWR calculation** | Depends on Phase 3's return calculation approach. Use whatever Phase 3 provides. |
| **Per-account allocation targets** | Portfolio-wide only for now. Per-account adds complexity with limited value for retirement-focused users. |
| **Benchmark on Forecasting page** | Phase 4/5 may want projected returns vs historical S&P. Not part of Phase 6. |
| **Comparison view visual design** | Concentric donuts vs side-by-side vs bars -- deferred to frontend-designer agent. |
| **Drift notification thresholds** | Suggested 2pp/5pp bands may be adjusted by frontend-designer or user testing. |

---

## 10. Open Questions (for downstream agents)

1. **Phase 3 return calculation method:** Does Phase 3 implement time-weighted returns or simple balance-based returns? This affects how meaningful the S&P comparison is.
2. **Phase 3 asset class taxonomy:** What asset classes does Phase 3 derive from the `holdings` table's `security_type` field? Allocation targets must align.
3. **Phase 3 chart component API:** What props does the Phase 3 performance chart accept? The benchmark overlay needs to integrate with it.
4. **yfinance reliability:** Is `yfinance` stable enough for a self-hosted personal finance app, or should we require an API key for a more official source?
5. **S&P 500 Total Return vs Price Return:** Total return (dividends reinvested) is a fairer comparison. Is total return data available from free sources? (Ticker `^SP500TR` on Yahoo Finance may work.)
6. **Phase 3 status:** Phase 3 is listed as "Planned" in the index. This feature cannot be built until Phase 3 ships. The research agent should note any Phase 3 design decisions that constrain Phase 6.

---

## 11. Scope Summary

**Will be built:**

1. **Backend -- Benchmark data pipeline:**
   - S&P 500 price fetcher (external API) with local SQLite cache
   - `benchmark_prices` database table
   - Integration into sync pipeline (daily append)
   - API endpoint: `GET /api/investments/benchmark?ticker=^GSPC&start=YYYY-MM-DD&end=YYYY-MM-DD`

2. **Backend -- Allocation targets:**
   - `allocation_targets` database table
   - `GET /api/investments/allocation-targets`
   - `POST /api/investments/allocation-targets` (upsert with sum validation)

3. **Frontend -- Benchmark overlay:**
   - Benchmark toggle on Investments page performance chart
   - S&P 500 line overlay with percentage-return normalization
   - Dual-value tooltip (portfolio + S&P 500)
   - Return delta summary stat card
   - Data freshness indicator

4. **Frontend -- Allocation targets:**
   - "Set Target" allocation form (inline or modal)
   - Sum-to-100% validation
   - Actual vs target comparison view (chart + table with drift indicators)
   - Clear-targets flow

5. **Tests:**
   - Backend: benchmark fetcher, cache logic, benchmark API endpoint, allocation targets CRUD, edge cases (API failure, stale data)
   - Frontend: benchmark toggle, chart overlay rendering, return normalization, allocation target form validation, comparison view, error states
