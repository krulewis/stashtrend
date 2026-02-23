# Monarch Dashboard

A local personal finance dashboard that reads from your `monarch-pipeline` SQLite database and renders an interactive React frontend. No cloud services, no third-party accounts — all data stays on your machine.

---

## Quick Start

You need **two terminals** running simultaneously.

### Prerequisites

- Python 3.10+
- Node.js 18+
- `monarch-pipeline` has been run at least once (`monarch-pipeline sync`)

### Terminal 1 — Backend API

```bash
cd "Personal Finance/monarch-dashboard/backend"
make run
```

The first time this runs it will create a virtual environment and install dependencies automatically. You should see:

```
Starting Monarch Dashboard API — reading from /Users/you/.monarch_pipeline/monarch.db
 * Running on http://127.0.0.1:5050
```

> **Without make:** `python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py`

### Terminal 2 — Frontend

```bash
cd "Personal Finance/monarch-dashboard/frontend"
npm install        # first time only
npm run dev
```

You should see:

```
  VITE v5.x.x  ready in Xms
  ➜  Local:   http://localhost:5173/
```

### Open the dashboard

Go to **http://localhost:5173** in your browser.

### Keeping data fresh

Use the **🔄 Sync Data** tab to pull the latest data from Monarch Money directly from the dashboard, or run `monarch-pipeline sync` from the terminal.

---

## Running the Tests

### Backend tests

#### Quickest way

```bash
cd "Personal Finance/monarch-dashboard/backend"
./run_tests.sh
```

On first run this will create a virtual environment, install all dependencies, and run the full test suite. Every subsequent run just runs the tests.

#### With make

```bash
make test
```

#### Filtering tests

`run_tests.sh` passes any extra arguments through to pytest:

```bash
./run_tests.sh -k test_sync          # run only sync tests
./run_tests.sh -k test_groups        # run only group tests
./run_tests.sh -x                    # stop on first failure
./run_tests.sh -v --tb=short         # verbose with short tracebacks
```

#### Backend test suite overview

73 tests across two files:

| File | Tests | Covers |
|------|-------|--------|
| `tests/test_groups.py` | 38 | Schema creation, group CRUD, member management, history pivot, snapshot, group toggle selection |
| `tests/test_sync.py` | 35 | sync_jobs schema, job creation/status/history endpoints, worker logic, partial failure, 409 concurrency guard |

#### Other backend make commands

```bash
make install   # create venv + install deps (without running tests)
make run       # start the Flask development server
make clean     # delete the venv (forces a clean reinstall next time)
```

---

### Frontend tests

#### Quickest way

```bash
cd "Personal Finance/monarch-dashboard/frontend"
./run_tests.sh
```

On first run this will install npm dependencies if needed, then run the full test suite.

#### With make

```bash
make test
```

#### Watch mode (re-runs on file save)

```bash
npm run test:watch
```

#### Filtering tests

`run_tests.sh` passes extra arguments through to vitest:

```bash
./run_tests.sh -t "renders"          # run tests whose name matches "renders"
./run_tests.sh --reporter=verbose    # verbose output
./run_tests.sh SyncPage              # run only tests in SyncPage.test.jsx
```

#### Frontend test suite overview

~97 tests across 12 files:

| File | Tests | Covers |
|------|-------|--------|
| `src/App.test.jsx` | 8 | Tab navigation, default tab, tab switching, API error state, Refresh button |
| `src/components/StatsCards.test.jsx` | 7 | Skeleton state, three stat labels, currency format, up/down arrows, percentages |
| `src/components/NetWorthChart.test.jsx` | 8 | Loading state, range buttons, breakdown toggle, chart container |
| `src/components/AccountsBreakdown.test.jsx` | 8 | Loading state, asset/liability labels, type grouping, expand/collapse drilldown |
| `src/components/GroupsTimeChart.test.jsx` | 9 | Loading, empty states, toggle chips, chart visibility after selection, range buttons |
| `src/components/GroupsSnapshot.test.jsx` | 7 | Loading, empty state, bar chart, group names in table, account counts |
| `src/components/GroupManager.test.jsx` | 10 | Empty state, group list, edit form, new group form, account picker, search, save/cancel/delete |
| `src/pages/GroupsPage.test.jsx` | 4 | API calls on mount, section headings, error state, group names after loading |
| `src/components/SyncControl.test.jsx` | 11 | Entity labels, checkboxes, mode buttons, start button states, onSyncStarted callback |
| `src/components/SyncJobStatus.test.jsx` | 11 | Empty state, status badge, entity rows, counts, "+N new", elapsed time, duration |
| `src/components/SyncHistory.test.jsx` | 8 | Empty states, column headers, history rows, Full/Incremental labels, row click callback |
| `src/pages/SyncPage.test.jsx` | 6 | Panel titles, fetch on mount, history rows, empty status state |

#### Other frontend make commands

```bash
make install   # npm install
make run       # start the Vite dev server
make build     # production build
make clean     # delete node_modules (forces a clean reinstall next time)
```

---

## Architecture

The dashboard is split into two independent processes that communicate over HTTP.

```
monarch-dashboard/
├── backend/
│   ├── app.py                  # Flask API server (port 5050)
│   ├── requirements.txt        # flask, flask-cors, pytest
│   ├── Makefile                # test / run / install / clean targets
│   ├── run_tests.sh            # self-contained test runner (creates venv automatically)
│   ├── venv/                   # virtual environment (gitignored)
│   └── tests/
│       ├── test_groups.py      # 38 tests: groups + history + snapshot
│       └── test_sync.py        # 35 tests: sync jobs + worker logic
└── frontend/
    ├── src/
    │   ├── App.jsx                     # Root component + tab navigation
    │   ├── index.css                   # Global CSS reset + design tokens
    │   ├── hooks/
    │   │   └── useResponsive.js        # Mobile/tablet/desktop breakpoint hook
    │   ├── components/
    │   │   ├── StatsCards.jsx          # Net worth stat cards
    │   │   ├── NetWorthChart.jsx       # Area chart over time
    │   │   ├── AccountsBreakdown.jsx   # Asset/liability pie charts
    │   │   ├── GroupManager.jsx        # Group CRUD UI
    │   │   ├── GroupsTimeChart.jsx     # Line chart for groups
    │   │   ├── GroupsSnapshot.jsx      # Bar chart for groups
    │   │   ├── SyncControl.jsx         # Entity checkboxes + sync trigger
    │   │   ├── SyncJobStatus.jsx       # Live per-entity sync progress
    │   │   └── SyncHistory.jsx         # Table of past sync runs
    │   └── pages/
    │       ├── GroupsPage.jsx          # Account Groups tab layout
    │       └── SyncPage.jsx            # Sync Data tab layout + polling
    ├── index.html
    ├── package.json
    └── vite.config.js          # Proxies /api/* → localhost:5050
```

### How the pieces connect

```
Your Mac
│
├── ~/.monarch_pipeline/monarch.db   ← SQLite database (source of truth)
│
├── backend/app.py  (port 5050)      ← Flask reads the DB, serves JSON
│
└── frontend/       (port 5173)      ← React fetches from /api/*
                                        Vite proxies → port 5050
```

The Vite dev server proxies all `/api/` requests to the Flask backend, so the frontend never needs to know what port the backend is on, and there are no CORS issues.

### Data flow

```
Monarch Money  →  monarch-pipeline sync  →  monarch.db  →  Flask API  →  React UI
                       (or Sync Data tab)
```

The dashboard is **read-only** with respect to your Monarch Money account data — it never writes to `account_history`, `accounts`, `transactions`, etc. The only writes it makes are to tables it owns: `account_groups`, `account_group_members`, and `sync_jobs`.

---

## Features

### Tab 1: Net Worth

**Stats Cards**
Three cards at the top showing your current net worth, month-over-month change (dollar + percent), and year-over-year change. The comparison is made by looking up the closest available date in your account history.

**Net Worth Chart**
An area chart of your total net worth over time, built from the `account_history` table. Range selector lets you zoom to 1M / 3M / 6M / 1Y / 2Y / All. A toggle overlays separate lines for total assets and total liabilities. Data is downsampled to ~200 points for performance on large histories.

**Account Breakdown**
Two donut charts side by side — one for assets, one for liabilities — showing how your balance is distributed across account types (checking, investment, mortgage, etc.). Click any slice group to expand it and see individual account names, institutions, and balances.

---

### Tab 2: Account Groups

This feature lets you create custom named buckets of accounts and visualize them over time and as a point-in-time snapshot.

**Group Balances Over Time (line chart)**
One colored line per group, plotted from `account_history`. Useful for tracking buckets like "Liquid Cash", "Retirement", or "Debt" independently over time. Range selector (3M / 6M / 1Y / 2Y / All) applies to all lines simultaneously. Toggle chips above the chart let you show/hide individual groups. Shows a friendly empty state until you create your first group.

**Current Snapshot (bar chart)**
A bar chart showing each group's current balance using `accounts.current_balance` — the most recently synced value. Bars are colored by group. A summary table below shows the dollar amount and percentage of the combined total for each group.

**Group Manager**
The panel below the charts is where you create and manage groups. The left side lists your existing groups; clicking the edit (✎) or delete (✕) buttons acts on that group. The right side shows an inline form when creating or editing:
- **Name** — free text
- **Color** — 8 preset swatches (indigo, emerald, amber, red, sky, violet, orange, green)
- **Accounts** — a searchable, scrollable list of all your accounts, grouped by account type. You can select/deselect an entire type at once using the type-level checkbox, or pick individual accounts. The count of selected accounts is shown in real time.

After saving, both charts refresh automatically.

---

### Tab 3: Sync Data

This tab lets you pull fresh data from Monarch Money without leaving the dashboard.

**Sync Control**
Choose which entities to sync (Accounts, Account History, Categories, Transactions, Budgets) and pick a mode:
- **Incremental** — only fetches records newer than your last sync (fast)
- **Full Refresh** — re-fetches everything (slower, use when data looks wrong)

The Start Sync button is disabled while a sync is already running to prevent concurrent jobs.

**Live Sync Status**
Shows real-time per-entity progress as the sync runs — each entity cycles through ● pending → ⟳ syncing → ✓ count (with a "+N new" delta) or ✗ error. The panel updates every 2 seconds while a job is running and shows the elapsed time.

**Sync History**
A table of the last 10 sync runs showing timestamp, status, mode, entities synced, total records, and duration. Click any row to inspect its per-entity details in the status panel above.

---

## API Reference

### Net Worth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/networth/history` | Daily net worth, assets, and liabilities — all dates |
| GET | `/api/networth/stats` | Current NW + MoM and YoY comparisons |
| GET | `/api/accounts/summary` | All non-hidden accounts with balances and types |

### Account Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | List all groups with their member account IDs |
| POST | `/api/groups` | Create a group `{name, color, account_ids}` |
| PUT | `/api/groups/<id>` | Update a group's name, color, and members |
| DELETE | `/api/groups/<id>` | Delete a group (members removed automatically) |
| GET | `/api/groups/history` | Time-series for all groups, recharts-ready format |
| GET | `/api/groups/snapshot` | Current balance per group using `current_balance` |

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/start` | Start a sync job `{entities, full_refresh}` — returns `job_id` |
| GET | `/api/sync/status/<id>` | Poll a job's current status and per-entity results |
| GET | `/api/sync/history` | Last 10 completed or running sync jobs |
| GET | `/api/sync/last-status` | Most recent job (used on tab load) |

---

## Database

The dashboard reads from `~/.monarch_pipeline/monarch.db` (managed by `monarch-pipeline`). It adds three tables of its own on startup — safe to run repeatedly:

```sql
account_groups        -- id, name, color, created_at
account_group_members -- group_id, account_id (ON DELETE CASCADE)
sync_jobs             -- id, started_at, finished_at, status, entities (JSON),
                      --   full_refresh, results (JSON), error
```

All three are created with `CREATE TABLE IF NOT EXISTS`, so restarting the backend never overwrites your data.
