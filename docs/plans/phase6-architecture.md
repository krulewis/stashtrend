# Phase 6 Architecture — Benchmark Comparison vs S&P 500

**Date:** 2026-03-09
**Agent:** Architect Agent
**Inputs:** phase6-requirements.md, phase6-research.md
**Status:** Decision recorded

---

## Decision 1: S&P 500 Data Source

### Decision: Yahoo Finance via `yfinance` Python package, cached in SQLite

**Rationale:**
- Zero API key required — aligns with project's "no paid services" philosophy
- `yfinance` is the most popular Python financial data package (30K+ GitHub stars, actively maintained)
- The `security_prices` table already exists from Phase 0 — we store S&P 500 data with ticker `^GSPC` using the same schema
- Incremental fetch: on each sync, only request dates after the last stored date
- DB cache means the frontend reads from local SQLite, never waits on external API

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|-----------------|
| FRED API | Requires API key registration; SP500 series only goes back to ~2010; more setup friction |
| Alpha Vantage | 25 requests/day free tier is too restrictive for reliable daily updates |
| Static CSV bundle | Stale by definition; requires a separate update mechanism; `yfinance` + DB cache achieves the same result with automatic freshness |
| No caching (fetch on demand) | Adds latency to every page load; unreliable if Yahoo is down; wasteful repeated requests |

**Risks:**
- Yahoo Finance is an unofficial API — could break without notice
- **Mitigation:** Wrap fetch in try/except; if fetch fails, the dashboard shows existing cached data with a "last updated" indicator. The feature degrades gracefully, never crashes.

---

## Decision 2: Benchmark Data Sync Strategy

### Decision: Integrate into existing sync pipeline as an optional step

**Approach:**
- Add a `benchmark` entity to the sync pipeline (after holdings)
- During sync, call `yfinance.download("^GSPC", start=last_stored_date)` to fetch new data
- Upsert into `security_prices` table with ticker `^GSPC`
- If the fetch fails (network error, API issue), log a warning and continue — don't fail the sync

**Rationale:**
- Leverages existing sync infrastructure (job status tracking, logging, error handling)
- S&P 500 data updates daily — syncing alongside Monarch data keeps everything in lockstep
- No separate cron job or background task needed

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|-----------------|
| Separate background job / cron | Over-engineered for a daily data point; adds operational complexity |
| Frontend-initiated fetch | Violates backend-owns-data principle; adds latency to page load; CORS complications with Yahoo |
| Pre-populated seed data | Still need a mechanism for ongoing updates; doesn't solve the update problem |

---

## Decision 3: Performance Comparison Calculation

### Decision: Normalized percentage returns with simple return for v1

**Approach:**
- Both series (portfolio and S&P 500) normalized to the same starting date
- Formula: `return_pct = (value_on_date / value_on_start_date - 1) * 100`
- Starting date = first date of the selected time range
- Backend computes and returns pre-normalized series to minimize frontend logic

**Rationale:**
- Simple return is accurate for S&P 500 (no cash flows)
- For portfolio returns, simple return is an approximation (doesn't account for contributions), but is directionally correct and matches user expectations ("I started with $X, now I have $Y")
- TWRR would be more accurate for accounts with contributions, but adds significant complexity. Can be upgraded in a future iteration without API changes (the backend can switch to TWRR internally).

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|-----------------|
| TWRR from day one | Requires accurate contribution detection from transactions, which may not be fully reliable. Over-scoped for an S-sized change. |
| Absolute dollar comparison | Meaningless — a $500K portfolio and S&P 500 are at entirely different scales. Percentage return is the only sensible comparison. |
| Frontend-computed returns | Moves computation to the client; requires shipping raw price data; harder to test; inconsistent with backend-computes pattern |

---

## Decision 4: API Design

### Decision: Single new endpoint with query parameters

```
GET /api/benchmark/comparison?account_id={id|all}&range={3m|6m|1y|2y|all}
```

**Response shape:**
```json
{
  "portfolio": [
    {"date": "2025-03-01", "return_pct": 0.0},
    {"date": "2025-03-02", "return_pct": 0.3},
    ...
  ],
  "benchmark": [
    {"date": "2025-03-01", "return_pct": 0.0},
    {"date": "2025-03-02", "return_pct": 0.15},
    ...
  ],
  "summary": {
    "portfolio_return": 12.5,
    "benchmark_return": 10.2,
    "outperformance": 2.3,
    "period_label": "1Y"
  },
  "benchmark_last_updated": "2026-03-08"
}
```

**Rationale:**
- Single endpoint returns both series aligned to the same dates — no client-side date alignment needed
- Summary object gives the headline numbers without client computation
- `benchmark_last_updated` supports the staleness indicator in the UI
- Query params for account and range match existing API patterns

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|-----------------|
| Separate `/api/benchmark/sp500` and `/api/investments/performance` endpoints | Requires frontend to align dates, handle mismatched date ranges, duplicate range logic. More error-prone. |
| GraphQL | Project doesn't use GraphQL anywhere; adding it for one endpoint is inappropriate |
| WebSocket streaming | Overkill for daily data; project has no WebSocket infrastructure |

---

## Decision 5: Target Allocation Storage

### Decision: New `target_allocation` table

```sql
CREATE TABLE IF NOT EXISTS target_allocation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_class TEXT NOT NULL UNIQUE,
    target_pct REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Rationale:**
- Separate table is cleaner than adding columns to `retirement_settings`
- Asset classes map to holdings `type` field: Stocks, Bonds, Cash, Other
- `UNIQUE` on `asset_class` ensures one target per class
- Simple CRUD: `GET /api/allocation/target`, `POST /api/allocation/target`

**Scope note:** Target allocation (US-3) is a stretch goal. The table and endpoints should be designed now but may not be implemented in the initial PR if time is tight.

---

## Decision 6: Frontend Integration Pattern

### Decision: Extend Phase 3's performance chart with a toggleable benchmark overlay

**Approach:**
- Add a checkbox/toggle: "Compare to S&P 500" (default: off)
- When enabled, fetch `/api/benchmark/comparison` and render an additional `<Line>` on the existing Recharts chart
- S&P 500 line: dashed stroke, `COLOR_AMBER (#F5A623)`, 1.5px width — visually distinct from portfolio areas
- Extend the existing tooltip to include the S&P 500 value when the overlay is active

**Rationale:**
- Minimal disruption to Phase 3's chart — adding a `<Line>` to an existing `<AreaChart>` or `<ComposedChart>` is trivial in Recharts
- Toggle default off: doesn't clutter the default view (matches "clean, scannable" anti-goal)
- Amber color is already in the token set and unused by existing chart series

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|-----------------|
| Separate benchmark-only chart | Wastes vertical space; harder to visually compare when not overlaid |
| Always-on benchmark line | Clutters default view; violates "clean and scannable" requirement |
| Dropdown to select benchmark | Over-engineered when there's only one benchmark (S&P 500). Can add more benchmarks later by promoting to dropdown. |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                        │
│                                                          │
│  InvestmentsPage (Phase 3)                               │
│    └─ PerformanceChart                                   │
│         ├─ Portfolio Area/Line (Phase 3)                  │
│         ├─ S&P 500 Line (Phase 6) ← toggle              │
│         └─ Tooltip (extended for benchmark)               │
│    └─ BenchmarkSummaryCard (Phase 6)                     │
│         "Your portfolio: +12.5% | S&P 500: +10.2%"      │
│    └─ TargetAllocationPanel (Phase 6 stretch)            │
│         Target vs Actual donut/bar comparison             │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  API Layer (Flask)                                        │
│                                                          │
│  GET /api/benchmark/comparison                           │
│    → Reads account_history + security_prices             │
│    → Normalizes both to percentage returns               │
│    → Returns aligned series + summary                    │
│                                                          │
│  GET /api/allocation/target  (stretch)                   │
│  POST /api/allocation/target (stretch)                   │
│    → CRUD for target_allocation table                    │
│                                                          │
│  GET /api/allocation/actual  (stretch)                   │
│    → Aggregates holdings by type, computes percentages   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Sync Pipeline                                            │
│                                                          │
│  Existing sync → accounts → holdings → [benchmark]       │
│    benchmark step: yfinance ^GSPC → security_prices      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Database (SQLite)                                        │
│                                                          │
│  security_prices (existing)                               │
│    → ticker='^GSPC', date, price                         │
│                                                          │
│  target_allocation (new, stretch)                         │
│    → asset_class, target_pct                              │
│                                                          │
│  account_history (existing, read-only)                   │
│    → daily balance snapshots per account                  │
└─────────────────────────────────────────────────────────┘
```

---

## Risk Register

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | Yahoo Finance API breaks/changes | Benchmark data stops updating | Graceful degradation: show cached data + "last updated" indicator. Can swap to FRED as fallback. |
| R2 | Phase 3 chart implementation differs from assumptions | Frontend overlay approach needs rework | All Recharts charts support adding `<Line>` components; pattern is chart-agnostic. Low risk. |
| R3 | S&P 500 data dates don't align with account history dates (weekends, holidays) | Gaps or misalignment in comparison chart | Backend aligns dates: for each account history date, use the most recent S&P 500 close price (forward-fill). |
| R4 | Simple return misleads users with large contributions | User thinks they beat the market when contributions inflated returns | Add caveat text: "Returns include contributions. Benchmark comparison is approximate." Future: upgrade to TWRR. |
| R5 | `yfinance` not installed in Docker image | Import error at runtime | Add to `requirements.txt` in the same PR. Small package, minimal dependency footprint. |
