# Architecture — Stashtrend

## Stack
- **Backend:** Blueprint-modularized Flask app (Phase B complete, PR #18). Port 5050.
  - **`backend/app.py`** — ~107-line shim with backward-compatible re-exports of all public names (DB_PATH, logger, routes, test mocks). Imports and registers blueprints from `routes/`.
  - **`backend/db.py`** — DB helpers: `get_db()`, `get_db_connection()`, `DB_PATH`, `init_dashboard_schema()`, DDL constants
  - **`backend/ai.py`** — AI helpers: `_call_ai()`, `_get_ai_key()`, `_check_ai_rate_limit()`, `_ai_cooldowns`/`_ai_cooldowns_lock`, `_extract_json()`
  - **`backend/routes/`** — 9 Flask Blueprints (one file each): `setup.py`, `settings.py`, `retirement.py`, `groups.py`, `budgets.py`, `networth.py`, `sync.py`, `ai_routes.py`, `budget_builder.py`. Route modules use `import app as _app` to preserve all `patch("app.X")` test mocks.
- **Frontend:** `frontend/` — React + Vite + Recharts, port 5173 (dev) / 80 (prod via nginx)
- **Pipeline:** `pipeline/monarch_pipeline/` — Monarch Money API client, schema, storage
- **DB:** SQLite at `~/.monarch_pipeline/monarch.db` (local) or `/data/monarch.db` (Docker volume), WAL mode enabled

## Features Implemented
- **Sidebar Navigation + URL Routing:** COMPLETE — react-router-dom v6, `<Sidebar>` (desktop) + `<BottomTabBar>` (mobile), `nav.js` single source of truth, `NetWorthPage` extracted from App, `AppShell` inner component for `useLocation` focus management, routes: `/networth`, `/groups`, `/budgets`, `/builder`, `/sync` with `/` and `*` redirects to `/networth` ✅
- **Budget vs Actuals:** COMPLETE — all backend endpoints ✅ · `BudgetChart`, `BudgetTable`, `AIAnalysisPanel`, `BudgetPage` ✅ · wired into `App.jsx` as "💰 Budgets" tab ✅
- **Mobile Budgets vs Actuals:** Group F wired (MobileBudgetPage + BudgetPage modification). `BudgetPage` conditionally renders `MobileBudgetPage` when `useResponsive().isMobile`. Mobile path: `Promise.all([fetchBudgetHistory(months), fetchCustomGroups()])` in a separate `useEffect([isMobile])`. Desktop path: existing `useEffect([months])` with `if (isMobile) return` guard (isMobile excluded from deps intentionally — adding it would re-fetch on every resize). `MobileBudgetPage` receives `budgetData`, `customGroups`, `loading`, `error`, `onGroupsSaved` as props — does NOT fetch independently. `onGroupsSaved` is `setCustomGroupsData` (updates parent state). `budget_custom_groups` table: `category_id PK, custom_group, sort_order`. Endpoints: `GET/POST /api/budgets/custom-groups`. Components: `BudgetPill`, `MonthDropdown`, `HorizontalSwipeContainer`, `BudgetLineItem`, `GroupAssignmentSheet`, `BudgetGroup`, `MonthDetailView`, `MonthlySummaryView` — all in `frontend/src/components/mobile/`.
- **Income bar in Budget Chart:** `BudgetPage` aggregates `group_type === 'income'` category actuals per month via `useMemo` → `incomeTotalsByMonth` prop → `BudgetChart` renders amber `<Bar dataKey="Income">` conditionally ✅. `incomeTotalsByMonth` useMemo now guards `if (isMobile)` to avoid unnecessary computation on mobile.
- **Stacked Groups charts:** `GroupsPage.module.css` always single-column (removed `3fr 2fr` tablet breakpoint) · `GroupsTimeChart` desktop height 380px · `GroupsSnapshot` non-mobile height 340px ✅
- **Group Snapshot controls:** saved configs, conflict detection, group toggle chips ✅
- **Budget Builder:** COMPLETE — AI-powered budget recommendation engine ✅
  - Backend: 3 new DB tables (`budget_builder_profile`, `budget_builder_regional`, `budget_builder_plans`), 11 endpoints under `/api/budget-builder/`, `_extract_json()` + `_call_ai()` helpers
  - Frontend: `BudgetBuilderPage` (3-step workflow), `BuilderProfileForm`, `BuilderRegionalData`, `BuilderResultsTable`, 11 API functions in `api.js`
  - Flow: profile → AI regional fetch → AI budget generation → editable table → apply to Monarch via `set_budget_amount`
  - Apply endpoint uses `asyncio.run()` pattern, processes months chronologically, `apply_to_future=False`, partial failure handling
- **NW by Account Type + CAGR:** COMPLETE — stacked area chart + CAGR sidebar ✅
  - Backend: `GET /api/networth/by-type` — `BUCKET_MAP`/`TYPE_MAP` constants, `_get_bucket()`, `_compute_bucket_cagr()`. Buckets: Retirement, Brokerage, Cash, Real Estate, Debt, Other. Filter: `include_in_net_worth=1` only (matches `networth_history`, no `is_hidden` filter)
  - Frontend: `TypeStackedChart.jsx` (stacked area + CAGR table, no milestone ReferenceLines since Phase 2.1), `AccountsBreakdown.jsx` simplified (pie charts removed, collapsible list retained), `fmtPct` moved to `chartUtils.jsx`
  - CAGR: aggregate-balance approximation `(end/start)^(1/years) - 1` for 1Y/3Y/5Y. Null for <30 days non-zero history. UI tooltip: "Estimated CAGR — actual returns may differ."
  - **Dual-axis chart:** Left YAxis for positive buckets (stacked), Right YAxis for Debt (absolute values, minus-prefixed ticks). `NEGATIVE_BUCKETS` Set in TypeStackedChart.jsx. CustomTooltip negates values back for display. As of the axis sync fix, both YAxes share a computed `axisDomain` of `[0, Math.max(leftMax, rightMax)]` where `leftMax` is the max stacked sum of positive buckets per data point and `rightMax` is the max absolute debt value per data point. This ensures tick marks mirror exactly: 1M on left aligns with −1M on right.
  - **AccountsBreakdown:** Groups by `bucket` field (from API) instead of raw Monarch `type`. API adds `bucket` via `_get_bucket()`.
- **Investments Page (Phase 3):** COMPLETE ✅
  - Backend: 3 new endpoints (`/api/investments/summary`, `/api/investments/accounts/<id>/holdings`, `/api/investments/performance`), batch CAGR computation (`_compute_all_cagrs`), security type normalization, contribution detection via transfer-categorized transactions, `python-dateutil` relativedelta for date arithmetic
  - Frontend: `InvestmentsPage` with dashboard/drill-down views, `InvestmentAccountsTable`, `InvestmentPerformanceChart` (ComposedChart with merged contribution bars), `AccountDetailHeader`, `HoldingsTable` (sortable/filterable), `AllocationChart` (donut)
  - Routing: `/investments` (dashboard) + `/investments/:accountId` (drill-down)
  - RangeSelector updated for value-based selection (backward compatible with label-based callers)
  - `fetchJSON` extended to attach `.status` on thrown errors
- **Forecasting Page (Phase 4):** COMPLETE ✅
  - Frontend-only: All projection math runs in the browser
  - Math: 3 new functions in `retirementMath.js` — `getInvestableCapital`, `computeBlendedCAGR`, `calculateContributionToTarget` (annuity formula with floor guard)
  - Components: `ForecastingPage`, `ForecastingChart` (historical + 3 projected lines + nest egg target), `ForecastingControls` (dual `SliderInput`), `ForecastingSummary` (readiness cards + gap analysis), `ForecastingSetup` (first-time inline form, purely presentational)
  - `SliderInput` reusable component (synced number input + range slider)
  - Routing: `/forecasting`
- **NW Milestones + Retirement Tracker (Phase 2):** COMPLETE ✅
  - Backend: `retirement_settings` singleton table (`CHECK (id = 1)`), `GET /api/retirement` + `POST /api/retirement` endpoints. Milestones stored as JSON text column, deserialized with `json.loads()` on GET. Validation: both ages required (positive int ≤120), target > current, withdrawal_rate ≤100, return_pct ≤50, milestones max 20 with positive amounts and labels ≤100 chars.
  - Frontend utility: `retirementMath.js` — `computeNestEgg()` (safe withdrawal rate with division-by-zero guard → returns null), `generateProjectionSeries()` (compound growth, fresh `new Date(year, month+i, 1)` per iteration to prevent drift), `mergeHistoryWithProjection()` (Map-based date-keyed merge).
  - Components: `RetirementPanel.jsx` (form container, useEffect hydration, onSave callback), `MilestoneEditor.jsx` (editable milestone rows, add/remove, max 20), `RetirementSummary.jsx` (nest egg, projected amount, on/off track badge with `color-mix()`).
  - Integration: `NetWorthPage.jsx` fetches retirement in `Promise.all` with `.catch(() => ({ exists: false }))` for graceful degradation.
  - Tests: 16 backend + 47 frontend = 63 new tests.
- **Phase 2.1 — Dual-View Milestone Hero Card:** COMPLETE (pending commit) ✅
  - Fixes the Phase 2 bug where milestones compared against total NW instead of investable capital.
  - **Investable capital:** `Retirement + Brokerage` bucket sum from `typeData.series` last point. Lives in `useMilestoneData` hook.
  - **`MilestoneHeroCard`:** Full-width card between `TypeStackedChart` and `AccountsBreakdown`. Two views toggled by `aria-pressed` button strip:
    - **MilestoneCardsView:** 2-column grid (1-column mobile) of milestone cards with state pills (Achieved/Next Goal/In Progress), progress bars (`role="progressbar"`), projected dates.
    - **MilestoneSkylineView:** Recharts AreaChart with historical investable capital (solid cobalt area) + dashed projection (`COLOR_ACCENT_LIGHT`), milestone horizontal ReferenceLines, TODAY vertical divider.
  - **`useMilestoneData` hook:** `frontend/src/hooks/useMilestoneData.js` — returns `{ shouldRender, investableCapital, rawInvestableCapital, milestones, achievedCount, totalCount, projectionSeries, mergedSeries, nestEgg }`. Guards EC-1 (no milestones), EC-2 (no retirement), EC-12 (no type data). Projection years capped at `min(target_age - current_age, 50)`.
  - **`milestoneUtils.js`:** `frontend/src/utils/milestoneUtils.js` — pure functions: `sortMilestones`, `computeInvestableCapital`, `buildInvestableSeries`, `classifyMilestones`, `findAchievementDate`, `findProjectedDate`, `formatDateShort`, `buildMergedSeries`.
  - **TypeStackedChart changes:** `milestones` prop removed, `ReferenceLine` import removed, milestone loop deleted.
  - **New CSS tokens:** `--green-tint` (rgba(46,204,138,0.12)), `--amber-tint` (rgba(245,166,35,0.12)) added to `index.css :root`.
  - **New chart constant:** `COLOR_ACCENT_LIGHT = '#7DBFFF'` added to `chartUtils.jsx`.
  - **ARIA pattern:** `aria-pressed` toggle buttons, `role="region"` on view container. Conditional rendering (not `display:none`).
  - **Test count:** ~75 new frontend tests across 5 new test files + 2 modified.

## Design System — Dark Cobalt
- **Logo:** SVG bar chart + trend arrow + "STASHTREND" wordmark at `frontend/src/assets/stashtrend-logo.svg`. Rendered as `<img>` in App.jsx and SetupPage.jsx. Header: 48px mobile / 64px desktop.
- **Palette:** `#0A0F1E` base, `#1C2333` cards, `#4D9FFF` cobalt accent, `#F0F6FF` text, `#2ECC8A` green, `#FF5A7A` red, `#F5A623` amber. Full token list: `docs/conventions.md` → Design System section.
- **CSS tokens:** All colors as custom properties in `index.css :root`. Components use `var(--token)` — never hardcoded hex.
- **Recharts exception:** SVG attrs can't use CSS vars. Constants in `chartUtils.jsx` (`COLOR_ACCENT`, `COLOR_POSITIVE`, `COLOR_ACCENT_LIGHT`, etc.) and backend `BUCKET_COLORS` in `app.py` must stay in sync.
- **Color doc:** `stashtrend-colors.html` (in Content dir) — full reference.

## DDL Init Order (Critical)
Two DDLs — **init order matters:**
- `pipeline/monarch_pipeline/schema.py` → pipeline tables (accounts, account_history, holdings, categories, transactions, budgets, sync_log)
- `DASHBOARD_DDL` in `app.py` → dashboard tables (account_groups, account_group_members, sync_jobs, settings, budget_builder_profile, budget_builder_regional, budget_builder_plans)
- `init_dashboard_schema()` must call `pipeline_schema.init_db(DB_PATH)` **FIRST** — otherwise fresh-install 500s

## Monarch API (monarchmoneycommunity v1.3.0)
```python
from monarchmoney import MonarchMoney
```
- Auth: `MonarchMoney(token=token)` — uses `Authorization: Token {token}` (not Bearer)
- `get_accounts()` → `{"accounts": [...]}`
- `get_account_history(id)` → flat list `[{"date", "signedBalance", "accountId", "accountName"}]`
- `get_transaction_categories()` → `{"categories": [...]}`
- `get_transactions()` → `{"allTransactions": {"totalCount", "results": [...]}}`
- `get_budgets()` → `{"budgetData": {"monthlyAmountsByCategory": [...]}}`
- `get_account_holdings(account_id)` → `{"portfolio": {"aggregateHoldings": {"edges": [{"node": {...}}]}}}` — one node per position, nested `security` + `holdings[]` sub-objects

## Sync Pipeline
- **Entity run order:** accounts → account_history → holdings → categories → transactions → budgets
- **Holdings sync:** Fetches per investment account (`type = 'investment'`), upserts with stale cleanup (DELETE + INSERT per account). 13-column `holdings` table (id, account_id, security_id, security_name, ticker, security_type, quantity, basis, total_value, current_price, is_manual, last_synced_at, synced_at). Uses `last_accounts` from prior accounts sync step for filtering.
- **Frontend:** Entity constants in `frontend/src/constants/syncEntities.js` (ORDER, LABELS, DESCS, SHORT)

## Other Libraries
- **APScheduler:** optional dep — `try/except ImportError` in app.py, no-op stub if absent
- **Token:** stored in macOS Keychain via `keyring`; file fallback chmod 600

## AI Provider Routing
- `"anthropic"` → `anthropic` SDK (`messages.create`)
- `"openai_compatible"` → `openai` SDK (`chat.completions.create`) with optional `base_url`
- Key never returned by `GET /api/ai/config`
- Settings keys: `ai_provider`, `ai_api_key`, `ai_model`, `ai_base_url` — stored in `settings` table via `get_setting`/`set_setting`
- AI API key: keychain-first via `auth.save_ai_key()`/`auth.load_ai_key()`, falls back to settings table (Docker has no keyring)
- All AI reads go through `_get_ai_key(conn)` helper; `ai_analyze()` refactored to use `_call_ai()` (no more inline provider branching)

## Security
- **Debug mode:** off by default; enabled via `FLASK_DEBUG=1` env var (set in `docker-compose.dev.yml`)
- **CORS:** restricted to localhost/127.0.0.1/[::1] origins (ports 80, 5173)
- **Nginx headers:** X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, CSP
- **Error sanitization:** all `except` blocks return generic messages + `app.logger.exception()`; global `@app.errorhandler(Exception)` as defense-in-depth
- **Rate limiting:** per-endpoint 2s cooldown on AI endpoints (`_ai_cooldowns` dict + `_check_ai_rate_limit()` + `_ai_cooldowns_lock` threading.Lock for thread safety)
- **Prompt injection:** `_sanitize_prompt_field()` strips control chars and truncates; applied at prompt construction time (not save time). `save_builder_profile` validates `location` ≤200 chars, `other_info` ≤1000 chars

## Claude Code Hooks
- **Edit-count detector:** `.claude/hooks/edit-count-detector.sh` — PostToolUse hook registered in `.claude/settings.json` for Edit/Write tools. Tracks per-file edit counts per session in `/tmp/edit_counts_${PPID}.json`. After 5 edits to the same file, warns: "You have edited '[filename]' N times this session. Step back and reconsider your approach before making further edits to this file." Prevents doom loops during implementation and debugging.
