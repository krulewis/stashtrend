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
│   ├── app.py        All endpoints — networth, accounts, sync, settings, setup
│   ├── wsgi.py       Gunicorn entry point
│   └── tests/
│       ├── test_groups.py   38 tests: group CRUD, history pivot, snapshot
│       ├── test_sync.py     35 tests: sync jobs, worker logic, concurrency
│       └── test_settings.py 51 tests: settings API, setup endpoints, scheduler
├── frontend/         React + Vite
│   └── src/
│       ├── App.jsx              Root — tab shell + setup gate
│       ├── pages/
│       │   ├── SetupPage.jsx    First-run token wizard
│       │   ├── GroupsPage.jsx   Account group management
│       │   └── SyncPage.jsx     Sync controls + history + auto-sync settings
│       └── components/          StatsCards, NetWorthChart, AccountsBreakdown,
│                                GroupManager, GroupsTimeChart, GroupsSnapshot,
│                                SyncControl, SyncJobStatus, SyncHistory
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
make test      # backend pytest + frontend vitest (all ~235 tests)
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
| GET | `/api/groups/history` | Time-series balance per group |
| GET | `/api/groups/snapshot` | Current balance per group |
| GET | `/api/sync/history` | Past sync job records |
| GET | `/api/sync/last-status` | Latest sync result per entity |
| POST | `/api/sync/start` | Start a sync job `{ entities, full_refresh }` |
| GET | `/api/sync/status/:id` | Poll a running sync job |
| GET | `/api/settings` | Read app settings (`sync_interval_hours`) |
| POST | `/api/settings` | Update app settings |
