# Architecture — Stashtrend

## Stack
- **Backend:** `backend/app.py` — all Flask endpoints, port 5050
- **Frontend:** `frontend/` — React + Vite + Recharts, port 5173 (dev) / 80 (prod via nginx)
- **Pipeline:** `pipeline/monarch_pipeline/` — Monarch Money API client, schema, storage
- **DB:** SQLite at `~/.monarch_pipeline/monarch.db` (local) or `/data/monarch.db` (Docker volume), WAL mode enabled

## Features Implemented
- **Budget vs Actuals:** COMPLETE — all backend endpoints ✅ · `BudgetChart`, `BudgetTable`, `AIAnalysisPanel`, `BudgetPage` ✅ · wired into `App.jsx` as "💰 Budgets" tab ✅
- **Income bar in Budget Chart:** `BudgetPage` aggregates `group_type === 'income'` category actuals per month via `useMemo` → `incomeTotalsByMonth` prop → `BudgetChart` renders amber `<Bar dataKey="Income">` conditionally ✅
- **Stacked Groups charts:** `GroupsPage.module.css` always single-column (removed `3fr 2fr` tablet breakpoint) · `GroupsTimeChart` desktop height 380px · `GroupsSnapshot` non-mobile height 340px ✅
- **Group Snapshot controls:** saved configs, conflict detection, group toggle chips ✅
- **Budget Builder:** COMPLETE — AI-powered budget recommendation engine ✅
  - Backend: 3 new DB tables (`budget_builder_profile`, `budget_builder_regional`, `budget_builder_plans`), 11 endpoints under `/api/budget-builder/`, `_extract_json()` + `_call_ai()` helpers
  - Frontend: `BudgetBuilderPage` (3-step workflow), `BuilderProfileForm`, `BuilderRegionalData`, `BuilderResultsTable`, 11 API functions in `api.js`
  - Flow: profile → AI regional fetch → AI budget generation → editable table → apply to Monarch via `set_budget_amount`
  - Apply endpoint uses `asyncio.run()` pattern, processes months chronologically, `apply_to_future=False`, partial failure handling

## DDL Init Order (Critical)
Two DDLs — **init order matters:**
- `pipeline/monarch_pipeline/schema.py` → pipeline tables (accounts, account_history, categories, transactions, budgets, sync_log)
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

## Other Libraries
- **APScheduler:** optional dep — `try/except ImportError` in app.py, no-op stub if absent
- **Token:** stored in macOS Keychain via `keyring`; file fallback chmod 600

## AI Provider Routing
- `"anthropic"` → `anthropic` SDK (`messages.create`)
- `"openai_compatible"` → `openai` SDK (`chat.completions.create`) with optional `base_url`
- Key never returned by `GET /api/ai/config`
- Settings keys: `ai_provider`, `ai_api_key`, `ai_model`, `ai_base_url` — stored in `settings` table via `get_setting`/`set_setting`
