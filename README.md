# Stashtrend

Track net worth, spot budget patterns, plan your retirement — built on the [Monarch Money](https://monarchmoney.com) API.
Your data stays on your computer — no accounts, no cloud.

<!-- TODO: add screenshots (docs/screenshots/) once captured -->

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac / Windows / Linux) — free download
- A Monarch Money account

## Quick start

```bash
git clone https://github.com/krulewis/stashtrend.git
cd stashtrend
docker compose up
```

Open **http://localhost** — the setup wizard will guide you through connecting your Monarch Money account.

## How it works

Stashtrend pulls your account balances, transactions, and budgets from Monarch Money and stores them locally in a SQLite database inside a Docker volume. A Flask API serves the data to a React frontend — everything runs in two containers managed by Docker Compose. Nothing leaves your machine.

## Features

### Net Worth
Track your total net worth over time with a stacked area chart broken down by account type, month-over-month and year-over-year changes, and a full account breakdown. A Milestone Hero Card shows your progress toward custom financial goals, with toggle between milestone cards (with state pills and progress bars) and a Skyline chart (investable capital history + projection + milestones).

### Account Groups
Bundle accounts into custom groups (e.g. "Liquid Cash", "Retirement", "Debt") and track each group's balance history over time.

### Budget vs Actuals
Compare your monthly budgets against actual spending across all categories. Syncs budget data directly from Monarch Money.

- **Income section** — all income categories with a monthly total row
- **Expenses section** — expense categories grouped by Monarch group (Food & Drink, Transportation, etc.) with a monthly total row
- **Net row** — income minus expenses per month
- **Bar chart** — expense budget vs actual at a glance, switchable between 3, 6, or 12 months
- Transfers are excluded from all calculations

#### AI Analysis

The Budgets tab includes an optional AI analysis feature. Expand the **✦ Analyze with AI** panel at the bottom of the page to set it up.

**Supported providers:**

| Provider | Where to get an API key | Model examples |
|----------|------------------------|----------------|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) | `claude-opus-4-5`, `claude-sonnet-4-5` |
| OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) | `gpt-4o`, `gpt-4o-mini` |
| Any OpenAI-compatible API | Your provider's dashboard | Varies |

**Setup steps:**
1. Open the **Budgets** tab and click **✦ Analyze with AI** to expand the panel
2. Select your provider from the dropdown
3. Paste your API key
4. Enter the model name you want to use
5. *(OpenAI-compatible only)* Enter the base URL if your provider isn't OpenAI (e.g. `http://localhost:11434/v1` for Ollama)
6. Click **Save & Analyze** — your config is saved locally and the analysis runs immediately

After the initial setup, click **Run Analysis** to re-run at any time, or **Reconfigure** to change your provider or model. Your API key is stored in the local database and never sent anywhere except your chosen AI provider.

### Budget Builder
AI-powered budget recommendation engine that builds a personalized budget based on your financial profile and regional cost of living.

1. **Profile** — enter your income, location, household size, and financial goals
2. **Regional data** — AI fetches local cost-of-living benchmarks for your area
3. **Generate** — AI creates a recommended budget across all your Monarch categories
4. **Review & edit** — adjust any line item in the results table
5. **Apply** — push the final budget back to Monarch Money

Requires an AI provider configured in the Budgets tab (see AI Analysis setup above).

### Investments
Track your investment accounts with a performance dashboard and per-account holdings drill-down.
- Dashboard view: total invested value, CAGR estimates per account, allocation donut chart
- Drill-down view: per-account holdings table (ticker, quantity, cost basis, current value), contribution bars on the performance chart

### Forecasting
Project your investment portfolio's future growth with interactive controls.
- Historical investable capital (Retirement + Brokerage) with three projected scenarios
- Adjust assumed return rate and monthly contributions with sliders for instant feedback
- Gap analysis: required contribution to reach your retirement nest egg target
- Connects directly to your retirement settings and CAGR data

### Sync Data
Manually trigger a sync of any combination of entities (accounts, transactions, budgets, etc.), or configure auto-sync on a schedule.

## Keeping data fresh

Auto-syncs every 6 hours by default. Change the interval under the **Sync Data → Auto Sync** panel, or trigger a manual sync at any time from the same tab.

## Your data

Everything lives in a named Docker volume (`stashtrend_monarch_data`). To back it up:

```bash
docker run --rm \
  -v stashtrend_monarch_data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/stashtrend-backup.tar.gz /data
```

To restore, extract the archive into a fresh volume with `tar xzf`.

---

## For developers

### Architecture

```
stashtrend/
├── backend/              Flask API (Python 3.12)
│   ├── app.py            ~107-line shim — imports/registers all blueprints, re-exports public names
│   ├── db.py             DB helpers: get_db(), get_db_connection(), DB_PATH, init_dashboard_schema(), DDL
│   ├── ai.py             AI helpers: _call_ai(), _get_ai_key(), _check_ai_rate_limit(), _extract_json()
│   ├── wsgi.py           Gunicorn entry point
│   ├── routes/
│   │   ├── setup.py          Token validation + setup status
│   │   ├── settings.py        App settings (sync interval, etc.)
│   │   ├── networth.py        Net worth stats, history, by-type
│   │   ├── groups.py          Account group CRUD + history + snapshot
│   │   ├── budgets.py         Budget vs actuals + custom groups
│   │   ├── ai_routes.py       AI config + budget analysis
│   │   ├── budget_builder.py  AI budget builder (profile, regional, generate, plans, apply)
│   │   ├── investments.py     Investment summary, holdings, performance
│   │   ├── retirement.py      Retirement settings + milestones
│   │   └── sync.py            Sync jobs, worker, status
│   └── tests/
│       ├── test_helpers.py            Shared DDL fixtures (canonical schema imports)
│       ├── test_budgets.py            12 tests
│       ├── test_ai.py                 12 tests
│       ├── test_budget_builder.py     27 tests
│       ├── test_groups.py             55 tests
│       ├── test_sync.py               35 tests
│       ├── test_settings.py           36 tests
│       ├── test_setup.py              15 tests
│       ├── test_db_improvements.py    10 tests
│       ├── test_networth.py           ~50 tests
│       ├── test_investments.py        ~50 tests
│       └── test_retirement.py         ~16 tests
├── frontend/             React + Vite
│   └── src/
│       ├── App.jsx                Root — setup gate + AppShell (routes)
│       ├── nav.js                 NAV_ITEMS — single source of truth for sidebar + bottom tab
│       ├── pages/
│       │   ├── SetupPage.jsx          First-run token wizard
│       │   ├── NetWorthPage.jsx       Net worth stats + TypeStackedChart + MilestoneHeroCard + AccountsBreakdown + RetirementPanel
│       │   ├── InvestmentsPage.jsx    Investment dashboard + holdings drill-down
│       │   ├── ForecastingPage.jsx    Projection chart + sliders + gap analysis
│       │   ├── GroupsPage.jsx         Account group management + history + snapshot
│       │   ├── BudgetPage.jsx         Budget vs Actuals (desktop + mobile) + AI analysis
│       │   ├── BudgetBuilderPage.jsx  AI budget builder (3-step workflow)
│       │   └── SyncPage.jsx           Sync controls + history + auto-sync settings
│       ├── components/            (shared + feature-specific components)
│       ├── hooks/                 useMilestoneData, useResponsive, etc.
│       └── utils/                 budgetUtils.js, milestoneUtils.js, retirementMath.js, chartUtils.jsx
├── pipeline/             Monarch Money API client (local package)
├── nginx/                nginx reverse-proxy config (production)
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml          Production stack (port 80)
└── docker-compose.dev.yml      Dev overlay (hot reload, ports 5050 + 5173)
```

### Running without Docker

```bash
make install   # backend venv + frontend node_modules + git hooks
make run       # Flask on :5050 + Vite on :5173 (two processes)
```

Open **http://localhost:5173**.

### Hot-reload Docker dev stack

```bash
make dev
```

Runs `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`. Code changes in `backend/` and `frontend/` reflect immediately via volume mounts.

### Running tests

```bash
make test      # backend pytest + frontend vitest (~1140 tests)
```

Or individually:

```bash
make -C backend test    # pytest
make -C frontend test   # vitest
```

A git pre-commit hook runs the full test suite before every commit. Install it with `make install`.

### API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/setup/status` | `{ configured: bool }` — whether a token is saved |
| POST | `/api/setup/token` | Validate and save a Monarch Money API token |
| GET | `/api/networth/stats` | Current net worth + MoM / YoY changes |
| GET | `/api/networth/history` | Historical net worth series |
| GET | `/api/networth/by-type` | Net worth broken down by account bucket |
| GET | `/api/retirement` | Get retirement settings + milestones |
| POST | `/api/retirement` | Save retirement settings + milestones |
| GET | `/api/accounts/summary` | All accounts with current balances |
| GET | `/api/groups` | Account group definitions |
| POST | `/api/groups` | Create an account group |
| PUT | `/api/groups/:id` | Update an account group |
| DELETE | `/api/groups/:id` | Delete an account group |
| GET | `/api/groups/configs` | Saved group snapshot configurations |
| POST | `/api/groups/configs` | Save group snapshot configuration |
| GET | `/api/groups/history` | Time-series balance per group |
| GET | `/api/groups/snapshot` | Current balance per group |
| GET | `/api/budgets/history` | Budget vs actual per category, `?months=3\|6\|12` |
| GET | `/api/budgets/custom-groups` | Budget custom group assignments |
| POST | `/api/budgets/custom-groups` | Save budget custom group assignments |
| GET | `/api/ai/config` | AI provider config (key never returned) |
| POST | `/api/ai/config` | Save AI provider, model, and API key |
| POST | `/api/ai/analyze` | Run AI analysis on budget data |
| GET | `/api/sync/history` | Past sync job records |
| GET | `/api/sync/last-status` | Latest sync result per entity |
| POST | `/api/sync/start` | Start a sync job `{ entities, full_refresh }` |
| GET | `/api/sync/status/:id` | Poll a running sync job |
| GET | `/api/settings` | Read app settings (`sync_interval_hours`) |
| POST | `/api/settings` | Update app settings |
| GET | `/api/budget-builder/profile` | Get budget builder profile |
| POST | `/api/budget-builder/profile` | Save budget builder profile |
| GET | `/api/budget-builder/regional` | Get saved regional cost data |
| POST | `/api/budget-builder/regional` | Save regional cost data |
| POST | `/api/budget-builder/regional/fetch` | AI-fetch regional cost of living |
| POST | `/api/budget-builder/generate` | AI-generate budget recommendation |
| GET | `/api/budget-builder/plans` | List saved budget plans |
| GET | `/api/budget-builder/plans/:id` | Get a specific plan |
| PUT | `/api/budget-builder/plans/:id` | Update a plan |
| DELETE | `/api/budget-builder/plans/:id` | Delete a plan |
| POST | `/api/budget-builder/plans/:id/apply` | Apply plan to Monarch Money |
| GET | `/api/investments/summary` | Investment account summaries with CAGR |
| GET | `/api/investments/accounts/:id/holdings` | Holdings for a specific account |
| GET | `/api/investments/performance` | Portfolio performance time series |
