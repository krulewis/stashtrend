# Phase B Research: Decomposing backend/app.py

**Date:** 2026-03-09
**Researcher:** Research Agent

---

## Problem Summary

`backend/app.py` is a 2,442-line Flask monolith. It contains route handlers, DB helpers, sync logic, AI integration, background scheduling, DDL, and startup code all in one file. The goal is to decompose it into well-bounded modules without breaking the existing test suite or changing observable API behavior.

---

## Codebase Context

### File structure

```
backend/
  app.py              # 2,442 lines — everything
  wsgi.py             # 9 lines — imports app + _startup(), Gunicorn entry point
  requirements.txt    # flask, flask-cors, apscheduler, anthropic, openai, -e ../pipeline
  tests/
    test_helpers.py       # shared fixture: make_test_db() — imports DASHBOARD_DDL from app
    test_sync.py          # imports DASHBOARD_DDL from app; re-implements helpers inline
    test_groups.py        # imports DASHBOARD_DDL from app; tests SQL logic directly
    test_settings.py      # imports app, get_setting, set_setting, _reschedule, DASHBOARD_DDL
    test_setup.py         # imports bootstrap_token_from_env, has_token from app
    test_budgets.py       # imports app (Flask test client)
    test_ai.py            # imports app (Flask test client)
    test_budget_builder.py# imports app (Flask test client)
    test_retirement.py    # imports app (Flask test client)
    test_networth_by_type.py # imports app, BUCKET_MAP, TYPE_MAP, BUCKET_ORDER, BUCKET_COLORS, _get_bucket
    test_security.py      # imports app, get_setting, set_setting, _get_ai_key, _sanitize_prompt_field
    test_custom_groups.py # imports app (Flask test client)
    test_db_improvements.py # patches app.DB_PATH, imports get_db, get_db_connection
    test_pipeline_holdings.py # imports make_test_db only — no direct app import
```

### Pipeline package (`pipeline/monarch_pipeline/`)

The `monarch_pipeline` package is installed as an editable dependency (`-e ../pipeline`). `app.py` imports from it at the top level:

```python
from monarch_pipeline import auth, fetchers, schema as pipeline_schema, storage
from monarch_pipeline.config import DB_PATH, TOKEN_PATH, SESSION_PATH, ensure_data_dir
```

`DB_PATH` is a module-level constant that propagates to all DB connections. Tests patch `app.DB_PATH` for isolation.

### External state (module-level globals in app.py)

| Symbol | Type | Role |
|--------|------|------|
| `app` | `Flask` | The application object |
| `scheduler` | `BackgroundScheduler` | APScheduler singleton, started at boot |
| `SYNC_JOB_ID` | `str` | Constant job ID for APScheduler |
| `_ai_cooldowns` | `dict` | In-process rate-limit state per AI endpoint |
| `_ai_cooldowns_lock` | `threading.Lock` | Guards `_ai_cooldowns` |
| `DASHBOARD_DDL` | `str` | 8-table SQL DDL string — imported by 5 test files |
| `BUCKET_MAP` | `dict` | Account type → display bucket mapping |
| `TYPE_MAP` | `dict` | Account subtype → display bucket override |
| `BUCKET_ORDER` | `list` | Ordered list of bucket names |
| `BUCKET_COLORS` | `dict` | Bucket → hex color |
| `ENTITY_TABLE_MAP` | `dict` | Entity name → table name |
| `ENTITY_RUN_ORDER` | `list` | Canonical sync order |
| `ENTITY_LABELS` | `dict` | Entity name → display label |

### DB access pattern

There is no ORM and no Flask-SQLAlchemy. All DB access is raw `sqlite3`:

- `get_db()` — opens a new connection to `DB_PATH`, sets WAL mode and foreign keys, returns connection. **Caller is responsible for closing.** Used directly in most route handlers.
- `get_db_connection()` — context-manager wrapper around `get_db()`, used in the two `budget_custom_groups` endpoints only.
- `_run_sync_worker()` — opens its own `sqlite3.connect(DB_PATH)` directly (background thread needs its own connection). Also opens a second `pipeline_conn` via `pipeline_schema.init_db(DB_PATH)`.

No Flask `g` object or `teardown_appcontext` is used. Connections are not pooled.

---

## Function Inventory

Line ranges are approximate (from the read chunks).

### Infrastructure / Bootstrap (lines 1–208)

| Function | Lines | Role |
|----------|-------|------|
| `handle_unexpected_error` | 59–65 | Global Flask error handler |
| `bootstrap_token_from_env` | 72–81 | One-shot startup: reads MONARCH_TOKEN env var → token file |
| `has_token` | 84–86 | Returns bool; calls `auth.load_token` |
| `get_db` | 183–188 | Opens SQLite connection with WAL + FK pragmas |
| `get_db_connection` | 191–198 | Context manager wrapping `get_db` |
| `init_dashboard_schema` | 201–207 | Creates all tables; safe to call repeatedly |
| `DASHBOARD_DDL` | 92–180 | 8-table DDL string (not a function) |

### Settings helpers (lines 213–227)

| Function | Lines | Role |
|----------|-------|------|
| `get_setting` | 214–217 | Read key from `settings` table |
| `set_setting` | 220–227 | Upsert key in `settings` table |

### Scheduler (lines 230–268)

| Function | Lines | Role |
|----------|-------|------|
| `run_scheduled_sync` | 234–250 | APScheduler callback — guards against double-run, launches thread |
| `_reschedule` | 253–267 | Replace APScheduler job with new interval (0 = disabled) |

### Sync helpers (lines 270–384)

| Function | Lines | Role |
|----------|-------|------|
| `_now` | 302–303 | UTC ISO timestamp string |
| `create_sync_job` | 306–312 | INSERT sync_jobs row, return id |
| `update_sync_job` | 315–320 | UPDATE sync_jobs status/results/error |
| `get_sync_job` | 323–332 | SELECT single job by id |
| `get_sync_history` | 335–347 | SELECT last N jobs |
| `get_running_job` | 350–359 | SELECT most recent running job |
| `count_entity_rows` | 362–366 | COUNT(*) for a given entity table |
| `snapshot_counts` | 369–370 | Dict of entity → row count |
| `compute_deltas` | 373–374 | Diff two count snapshots |
| `ordered_entities` | 377–379 | Sort entities by ENTITY_RUN_ORDER |
| `build_results` | 382–383 | Build per-entity result dict |

### Sync background worker (lines 386–538)

| Function | Lines | Role |
|----------|-------|------|
| `_run_sync_worker` | 390–538 | Runs in background thread. Opens its own DB connection. Contains nested `async def _sync()`. Calls all fetchers and storage functions from the pipeline package. Uses `_run_sync_worker.last_accounts` as a function attribute for inter-entity state passing. |

### Net Worth routes (lines 541–892)

| Function | Lines | Role |
|----------|-------|------|
| `networth_history` | 545–561 | GET /api/networth/history — aggregate query |
| `networth_stats` | 564–607 | GET /api/networth/stats — MoM/YoY comparisons |
| `accounts_summary` | 610–636 | GET /api/accounts/summary — calls `_get_bucket` |
| `_get_bucket` | 742–754 | Map account type+subtype → bucket string |
| `_compute_bucket_cagr` | 757–811 | CAGR calculation for a bucket's balance history |
| `networth_by_type` | 814–892 | GET /api/networth/by-type — complex aggregation + CAGR |

### Account Groups routes (lines 895–1140)

| Function | Lines | Role |
|----------|-------|------|
| `list_groups` | 899–919 | GET /api/groups |
| `create_group` | 922–952 | POST /api/groups |
| `update_group` | 955–992 | PUT /api/groups/<id> |
| `delete_group` | 995–1030 | DELETE /api/groups/<id> — also prunes group_configs setting |
| `get_group_configs` | 1037–1052 | GET /api/groups/configs |
| `save_group_configs` | 1055–1084 | POST /api/groups/configs |
| `groups_history` | 1091–1119 | GET /api/groups/history — pivot query |
| `groups_snapshot` | 1122–1139 | GET /api/groups/snapshot |

### Budget routes (lines 1142–1344)

| Function | Lines | Role |
|----------|-------|------|
| `budget_history` | 1146–1227 | GET /api/budgets/history — months param, variance sort |
| `get_budget_custom_groups` | 1234–1270 | GET /api/budgets/custom-groups — uses `get_db_connection` |
| `set_budget_custom_groups` | 1273–1343 | POST /api/budgets/custom-groups — full replace with validation |

### Sync routes (lines 1346–1420)

| Function | Lines | Role |
|----------|-------|------|
| `sync_start` | 1350–1386 | POST /api/sync/start — validates, launches thread |
| `sync_status` | 1389–1397 | GET /api/sync/status/<id> |
| `sync_history` | 1400–1406 | GET /api/sync/history |
| `sync_last_status` | 1409–1420 | GET /api/sync/last-status — reads pipeline sync_log table |

### Setup routes (lines 1422–1503)

| Function | Lines | Role |
|----------|-------|------|
| `setup_status` | 1427–1431 | GET /api/setup/status — calls `has_token` |
| `setup_token` | 1434–1451 | POST /api/setup/token — validates via Monarch API |
| `get_settings` | 1458–1467 | GET /api/settings |
| `update_settings` | 1470–1502 | POST /api/settings — validates, persists, calls `_reschedule` |

### AI routes & helpers (lines 1505–1738)

| Function | Lines | Role |
|----------|-------|------|
| `_check_ai_rate_limit` | 1517–1524 | In-process rate limit using `_ai_cooldowns` dict |
| `_sanitize_prompt_field` | 1527–1532 | Strip control chars, truncate |
| `_get_ai_key` | 1535–1540 | Load AI key: keychain first, then settings table |
| `get_ai_config` | 1543–1556 | GET /api/ai/config |
| `save_ai_config` | 1559–1580 | POST /api/ai/config |
| `ai_analyze` | 1583–1669 | POST /api/ai/analyze — builds prompt, calls AI, returns analysis |
| `_extract_json` | 1677–1701 | Parse JSON from AI response, strip markdown fences |
| `_call_ai` | 1704–1738 | Dispatch to Anthropic or OpenAI-compatible provider |

### Budget Builder routes & helpers (lines 1740–2279)

| Function | Lines | Role |
|----------|-------|------|
| `get_builder_profile` | 1743–1753 | GET /api/budget-builder/profile |
| `save_builder_profile` | 1756–1813 | POST /api/budget-builder/profile |
| `get_builder_regional` | 1818–1827 | GET /api/budget-builder/regional |
| `save_builder_regional` | 1830–1861 | POST /api/budget-builder/regional |
| `fetch_builder_regional_ai` | 1864–1946 | POST /api/budget-builder/regional/fetch — AI call |
| `_build_budget_prompt` | 1952–2080 | Assemble multi-page AI prompt from DB data |
| `_save_budget_plan` | 2083–2107 | INSERT budget_builder_plans row |
| `generate_budget_plan` | 2110–2152 | POST /api/budget-builder/generate — AI call + save |
| `list_builder_plans` | 2157–2163 | GET /api/budget-builder/plans |
| `get_builder_plan` | 2166–2174 | GET /api/budget-builder/plans/<id> |
| `update_builder_plan` | 2177–2201 | PUT /api/budget-builder/plans/<id> |
| `delete_builder_plan` | 2204–2209 | DELETE /api/budget-builder/plans/<id> |
| `apply_builder_plan` | 2214–2278 | POST /api/budget-builder/plans/<id>/apply — calls Monarch API |

### Retirement route (lines 2281–2415)

| Function | Lines | Role |
|----------|-------|------|
| `get_retirement` | 2285–2294 | GET /api/retirement |
| `save_retirement` | 2297–2415 | POST /api/retirement — heavy validation, upsert |

### Boot (lines 2418–2441)

| Function | Lines | Role |
|----------|-------|------|
| `_startup` | 2422–2436 | Initialise data dir, token, DB schema, scheduler |

---

## Dependency Graph

### Internal call chains

```
Routes → get_db() / get_db_connection()
Routes → get_setting() / set_setting()
Routes → _call_ai()
  _call_ai → _get_ai_key()
    _get_ai_key → get_setting()
Routes → _check_ai_rate_limit()
Routes → _get_bucket()
Routes → _compute_bucket_cagr()
Routes → _build_budget_prompt() → get_setting() + DB queries
Routes → _save_budget_plan() → DB insert
Routes → _extract_json()

sync_start → create_sync_job() → _run_sync_worker (thread)
_run_sync_worker → get_db() indirectly (sqlite3.connect directly)
_run_sync_worker → snapshot_counts() → count_entity_rows()
_run_sync_worker → compute_deltas() → build_results()
_run_sync_worker → ordered_entities()
_run_sync_worker → update_sync_job()
_run_sync_worker → pipeline: auth, fetchers, storage

run_scheduled_sync → get_running_job() → create_sync_job() → _run_sync_worker (thread)
update_settings → set_setting() → _reschedule() → scheduler

delete_group → get_setting() → set_setting()
_startup → init_dashboard_schema() → get_db()
_startup → get_setting() → _reschedule()
```

### Shared state dependencies

1. **`scheduler` global** — Created at module level. Used by `_reschedule()` and `run_scheduled_sync()`. If moved to a module, both callers must import from the same location to avoid two scheduler instances.

2. **`_ai_cooldowns` + `_ai_cooldowns_lock` globals** — In-process per-endpoint rate limiting. Ephemeral state — lost on restart. Coupled to the three AI-calling endpoints.

3. **`DB_PATH` (from `monarch_pipeline.config`)** — Module-level import. Tests patch `app.DB_PATH` directly. Every `sqlite3.connect(DB_PATH)` call in the worker thread bypasses this patching because the thread captures the variable at import time. This is a pre-existing test fragility.

4. **`DASHBOARD_DDL`** — Imported by `test_helpers.py` (used by all tests that call `make_test_db()`), `test_sync.py`, `test_groups.py`, and `test_settings.py` directly. Changing the import path of `DASHBOARD_DDL` requires updating all five importers.

5. **`app` object** — The Flask `app` instance is referenced inside `_run_sync_worker` and `_get_bucket` via `app.logger`. Any module that uses `app.logger` creates a circular-import risk if the module is imported before `app` is created.

---

## Natural Module Boundaries

Based on the function inventory and call graph, seven natural modules emerge:

| Proposed Module | Contents | Lines |
|-----------------|----------|-------|
| `db.py` | `DASHBOARD_DDL`, `get_db`, `get_db_connection`, `init_dashboard_schema`, `get_setting`, `set_setting` | ~115 |
| `sync.py` | Entity constants (`ENTITY_TABLE_MAP`, etc.), sync helper functions, `_run_sync_worker`, `run_scheduled_sync`, `_reschedule`, sync routes | ~540 |
| `networth.py` | Bucket maps/constants, `_get_bucket`, `_compute_bucket_cagr`, net worth routes, accounts summary | ~350 |
| `groups.py` | Account group CRUD routes, group config routes, group visualization routes | ~245 |
| `budgets.py` | Budget history route, custom groups routes | ~200 |
| `ai.py` | `_ai_cooldowns`, `_check_ai_rate_limit`, `_sanitize_prompt_field`, `_get_ai_key`, `_call_ai`, `_extract_json`, AI config routes, budget builder routes, `ai_analyze` | ~700 |
| `retirement.py` | Retirement GET/POST routes | ~130 |
| `setup.py` | `bootstrap_token_from_env`, `has_token`, setup routes, settings routes | ~85 |

The `app.py` residual (factory + blueprint registration + `_startup`) would shrink to ~50 lines.

---

## Existing Patterns

### Route structure

- All routes use `@app.route(...)` decorators directly on the `Flask` app instance — no Blueprints.
- No app factory (`create_app()`) is used. The `app` object is created at module level.
- CORS is configured at module level immediately after `app = Flask(__name__)`.
- The global error handler uses `@app.errorhandler(Exception)`.

### DB access

- No connection pool, no ORM, no `flask.g`.
- Two patterns coexist: manual `conn = get_db() ... conn.close()` (majority) and `with get_db_connection() as conn:` (only two routes). The two-pattern situation is a tech debt item already noted in existing code.
- The background sync worker opens its connection via `sqlite3.connect(DB_PATH)` directly, bypassing `get_db()`. This is intentional (thread needs its own connection) but ties the worker to `DB_PATH` as a module-global.

### Test isolation pattern

Tests patch `app.get_db` to return an in-memory `sqlite3.Connection` created by `make_test_db()`. `make_test_db()` imports `DASHBOARD_DDL` from `app` and `PIPELINE_DDL` from `monarch_pipeline.schema`. This is the canonical shared fixture. Some older tests in `test_sync.py` and `test_settings.py` duplicate DDL/helpers locally rather than using `make_test_db()`.

---

## Test Coupling Analysis

### Direct symbol imports from `app`

| Symbol | Imported by |
|--------|-------------|
| `app` (Flask object) | `test_budgets`, `test_ai`, `test_budget_builder`, `test_retirement`, `test_networth_by_type`, `test_security`, `test_custom_groups`, `test_settings` |
| `DASHBOARD_DDL` | `test_helpers`, `test_sync`, `test_groups`, `test_settings` |
| `BUCKET_MAP`, `TYPE_MAP`, `BUCKET_ORDER`, `BUCKET_COLORS`, `_get_bucket` | `test_networth_by_type` |
| `get_setting`, `set_setting` | `test_settings`, `test_security` |
| `_get_ai_key`, `_sanitize_prompt_field` | `test_security` |
| `bootstrap_token_from_env`, `has_token` | `test_setup` |
| `get_db`, `get_db_connection`, `DB_PATH` | `test_db_improvements` |
| `_reschedule` | `test_settings` (patched as `app._reschedule`) |

### Patch targets (strings) in tests

All `patch("app.X")` strings reference `app` as the module. If functions move to `app.sync`, tests patching `"app.get_db"` within sync-related routes will break unless the patch target is updated or re-exported from `app`.

Currently tests patch:
- `app.get_db` — used in 10+ test methods across 6 files
- `app.get_db_connection` — used in custom groups tests
- `app.auth.*` — mocking Monarch pipeline auth calls
- `app._reschedule` — scheduler tests
- `app.DB_PATH` — DB path tests
- `app._get_ai_key`, `app._sanitize_prompt_field`, `app.set_setting`, `app.get_setting` — security/settings tests

---

## Options Evaluated

### Option A: Flask Blueprints with re-export shim

**Description:** Split into domain modules (`networth.py`, `groups.py`, `budgets.py`, `ai.py`, `sync.py`, `retirement.py`, `setup.py`, `db.py`) using Flask Blueprints. Each module registers its own Blueprint. `app.py` becomes a thin factory that creates the Flask app, registers Blueprints, and calls `_startup()`. A `__init__.py` or shim re-exports symbols that tests currently import directly from `app` (e.g., `from app import DASHBOARD_DDL` continues to work via `app.py` importing and re-exporting from `db.py`).

**Pros:**
- Flask-idiomatic: Blueprints are the documented pattern for modular Flask apps
- Blueprints support per-Blueprint error handlers, URL prefixes (`url_prefix="/api/networth"`), and deferred URL registration
- Re-export shim makes the test suite changes minimal: only patch strings change on a per-test basis if needed
- Clear module ownership: each domain owns its Blueprint, its DB helpers, and its constants

**Cons:**
- Blueprints cannot use `@app.errorhandler` — the global error handler must stay in `app.py` or be registered via `app.register_error_handler`
- `app.logger` calls inside route modules now require importing `current_app` from Flask instead of `app` directly, introducing a small pattern change throughout
- The `scheduler` global remains in `app.py` or `sync.py`; if in `sync.py`, `app.py` must import it for startup, creating one level of import coupling
- Tests that do `patch("app.get_db")` inside a route now patching through a Blueprint still work IF the route module imports `get_db` from `db` and tests patch `"routes.networth.get_db"` instead — this requires test changes for every moved function

**Effort estimate:** Medium-High (3–4 days)

**Compatibility:** High — Blueprints are standard Flask. `wsgi.py` needs one line change (`from app import app` still works if factory returns the same object).

---

### Option B: Plain Python modules without Blueprints

**Description:** Extract helper functions and constants into plain Python modules (`db.py`, `sync_helpers.py`, `ai_helpers.py`, etc.) while keeping all `@app.route` decorators in `app.py`. The goal is to reduce `app.py` from 2,442 lines to ~800 lines by moving pure-logic code out. Routes stay in `app.py` to avoid Blueprint complexity.

**Pros:**
- Zero Flask API surface changes — routes still registered on the same `app` object
- `patch("app.get_db")` patches still work if routes import `get_db` from the helpers module AND `app.py` re-imports it: `from db import get_db` at the top of `app.py` means `patch("app.get_db")` still intercepts the name
- Lowest risk: no Flask architecture changes, just file-level refactoring
- `DASHBOARD_DDL` moves to `db.py`; `from app import DASHBOARD_DDL` still works if `app.py` re-exports it

**Cons:**
- `app.py` is still large (routes-only file of ~800–1,000 lines for 35+ routes)
- The extracted helper modules have no natural grouping pressure — a developer can still add a new route directly in `app.py`
- No enforcement of domain boundaries; future PRs likely drift back toward a monolith
- `app.logger` calls in helper modules still require importing the Flask `app` object, creating a potential circular import if helper modules are imported during `app` creation

**Effort estimate:** Low-Medium (1–2 days)

**Compatibility:** Very high — lowest disruption to tests and architecture.

---

### Option C: Flask Blueprints with route modules and shared `db.py`; tests updated at the import level

**Description:** Full decomposition into Blueprints similar to Option A, but instead of a re-export shim, update all `from app import X` statements in tests to import from the correct new module (`from db import DASHBOARD_DDL`, `from networth import BUCKET_MAP, _get_bucket`, etc.). Patch strings in tests become `patch("networth.get_db")` for the networth Blueprint, etc.

**Pros:**
- Cleanest long-term architecture — no re-export shims, no naming ambiguity
- Forces each module to own its symbols cleanly
- Blueprint `url_prefix` makes API structure explicit in code
- Easiest to reason about in code review — no surprise re-exports

**Cons:**
- Highest test churn: every `from app import X` and every `patch("app.X")` string must be updated
- Patch strings are particularly fragile: `patch("app.get_db")` works because Flask test client calls the real `app`, but after splitting, routes in the `networth` Blueprint call `networth.get_db` (the name bound in the networth module's namespace), so the patch must target `networth.get_db` — this requires knowing which module each route lives in
- Risk of missing a patch target and having tests pass against un-mocked code
- The `app` Flask object is still needed in all modules for `app.logger` — either use `current_app` (Flask context-dependent) or pass `app` as argument

**Effort estimate:** High (3–5 days, plus careful test audit)

**Compatibility:** Medium — correct result but high migration cost.

---

### Option D: Flask Application Factory pattern

**Description:** Introduce `create_app()` factory in `app.py`. Move all configuration, CORS, Blueprint registration, and scheduler startup into the factory. Modules become Blueprints imported inside `create_app()` to avoid circular imports. `wsgi.py` calls `create_app()`. This is the Flask canonical approach for large applications.

**Pros:**
- Enables proper testing isolation: each test can call `create_app(config="testing")` with overrides
- Eliminates the current `patch("app.get_db")` pattern entirely — tests can inject a test DB via config rather than monkey-patching
- Blueprint imports inside the factory body prevent circular import issues (`current_app` proxy works naturally)
- Industry-standard pattern; easiest for future contributors to understand

**Cons:**
- Largest migration scope: all 15 test files currently import `from app import app` and construct a test client from it; they would need to be updated to call `create_app()`
- `wsgi.py` changes; Docker/Gunicorn startup changes
- The `scheduler` singleton must be managed carefully — it must not be started during test imports
- `DASHBOARD_DDL` and other constants can no longer be imported before `create_app()` is called without a separate constants module
- Higher risk of introducing subtle bugs during the transition

**Effort estimate:** High (4–7 days including test rewrite)

**Compatibility:** Low short-term (breaks existing test patterns), High long-term.

---

## Recommendation

**Option B (plain Python modules, routes stay in `app.py`)** is the lowest-risk first step and should be the immediate target. The rationale:

1. The test suite patches `app.X` extensively. Keeping routes in `app.py` means re-importing helpers into `app.py`'s namespace (`from db import get_db, DASHBOARD_DDL`) preserves all existing patch targets at zero cost.

2. The biggest maintenance pain is the _logic_ density, not the route count. Moving `_run_sync_worker` (~150 lines), `_build_budget_prompt` (~130 lines), `_compute_bucket_cagr` (~55 lines), the BUCKET/TYPE maps (~85 lines), and DDL (~90 lines) into helpers drops `app.py` below 1,200 lines without touching any route decorator.

3. The sync worker's use of `app.logger` is the only real circular-import risk. This can be resolved by passing a logger reference into the worker, or by using `import logging; logging.getLogger(__name__)` in the helper module.

If the architecture goal is long-term maintainability, **Option A (Blueprints + re-export shim)** is the recommended second phase: it enforces domain boundaries and is what Flask recommends for apps of this size. The shim approach makes it safe — `app.py` re-exports every symbol that tests currently import, so test changes are deferred to a separate cleanup pass.

**Option D (app factory)** is the ideal end state but should not be attempted in the same change that decomposes the file — the combined scope is too large.

---

## Open Questions

1. **`app.logger` in worker threads** — `_run_sync_worker` calls `app.logger.exception(...)` inside a daemon thread. After decomposition, the sync module will need either a reference to the Flask `app` object (risking circular import) or a switch to `logging.getLogger(__name__)`. Which is preferred?

2. **Patch target migration** — If Blueprints are adopted (Option A or C), the architect needs to decide whether test patch strings are updated immediately or deferred. Deferring requires the re-export shim. This should be an explicit decision, not an afterthought.

3. **`_run_sync_worker.last_accounts` function attribute** — The sync worker uses `_run_sync_worker.last_accounts` to pass account data between the accounts and account_history sub-steps within a single sync run. This is an unusual pattern that does not survive if `_run_sync_worker` is renamed or wrapped. Should this be replaced with a local variable in the async closure during decomposition?

4. **`DASHBOARD_DDL` ownership** — Five test files import `DASHBOARD_DDL` from `app`. If it moves to `db.py`, the re-export shim handles tests transparently, but `test_settings.py` also constructs its own `make_db()` by importing `DASHBOARD_DDL` from `app` inline (not via `test_helpers`). The architect should confirm whether the shim approach is acceptable or whether a test cleanup pass should happen in the same PR.

5. **`get_db_connection` inconsistency** — Two routes use the context manager; 30+ routes use bare `get_db()`. Should decomposition enforce one pattern throughout, or preserve the inconsistency?

6. **Scheduler lifecycle** — `scheduler` is started in `_startup()` and referenced in `_reschedule()` and `run_scheduled_sync()`. If sync logic moves to `sync.py`, the scheduler must be importable there. The architect should specify whether the scheduler lives in `sync.py` or is passed in.
