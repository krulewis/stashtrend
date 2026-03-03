# Stashtrend

Self-hosted personal finance dashboard for [Monarch Money](https://monarchmoney.com) users.
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
Track your total net worth over time with a line chart, month-over-month and year-over-year changes, and a full account breakdown.

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
├── backend/          Flask API (Python 3.12)
│   ├── app.py        All endpoints
│   ├── wsgi.py       Gunicorn entry point
│   └── tests/
│       ├── test_helpers.py        Shared DDL fixtures (canonical schema imports)
│       ├── test_budgets.py        12 tests: budget history, income/expense split
│       ├── test_ai.py             12 tests: AI config, analyze endpoint
│       ├── test_budget_builder.py 27 tests: profile, regional, generate, plans, apply
│       ├── test_groups.py         55 tests: group CRUD, history, snapshot, configs
│       ├── test_sync.py           35 tests: sync jobs, worker logic, concurrency
│       ├── test_settings.py       36 tests: settings API, scheduler
│       ├── test_setup.py          15 tests: setup status, token validation
│       └── test_db_improvements.py 10 tests: WAL mode, context manager
├── frontend/         React + Vite
│   └── src/
│       ├── App.jsx                Root — tab shell + setup gate
│       ├── pages/
│       │   ├── SetupPage.jsx      First-run token wizard
│       │   ├── GroupsPage.jsx     Account group management
│       │   ├── BudgetPage.jsx     Budget vs Actuals (range picker + chart + table + AI)
│       │   ├── BudgetBuilderPage.jsx  AI budget builder (3-step workflow)
│       │   └── SyncPage.jsx       Sync controls + history + auto-sync settings
│       └── components/            StatsCards, NetWorthChart, AccountsBreakdown,
│                                  BudgetChart, BudgetTable, AIAnalysisPanel,
│                                  BuilderProfileForm, BuilderRegionalData,
│                                  BuilderResultsTable, GroupManager,
│                                  GroupsTimeChart, GroupsSnapshot,
│                                  GroupSnapshotControls, AutoSyncSettings,
│                                  RangeSelector, SyncControl, SyncJobStatus,
│                                  SyncHistory
├── pipeline/         Monarch Money API client (local package)
├── nginx/            nginx reverse-proxy config (production)
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
make test      # backend pytest + frontend vitest (~480 tests)
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
