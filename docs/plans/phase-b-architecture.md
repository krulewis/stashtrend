# Architecture Decision -- Phase B: Backend Modularization

## Decision Summary

Phase B splits `backend/app.py` (2,442 lines) into a flat Blueprint-based module structure under `backend/routes/`, with shared infrastructure extracted to `backend/db.py` and `backend/ai.py`. The original `app.py` file is retained as a thin shim that re-exports every public name and registers all Blueprints, so that all 15 test files and `wsgi.py` continue to work with zero changes to import paths or mock patch targets. The shim approach eliminates the highest-risk aspect of this refactor (silently broken mock patches) and can be removed incrementally in a future phase.

## Chosen Approach

### Module Structure (exact file names)

```
backend/
  app.py                  # SHIM: creates Flask app, registers blueprints,
                          #   re-exports every public name for backward compat
  db.py                   # Database: get_db, get_db_connection, DASHBOARD_DDL,
                          #   init_dashboard_schema, get_setting, set_setting
  ai.py                   # AI infrastructure: _call_ai, _get_ai_key,
                          #   _check_ai_rate_limit, _sanitize_prompt_field,
                          #   _extract_json, _ai_cooldowns, _ai_cooldowns_lock,
                          #   _AI_COOLDOWN_SECONDS
  routes/
    __init__.py           # Registers all blueprints onto the Flask app
    networth.py           # Blueprint "networth": /api/networth/*, /api/accounts/summary
                          #   Also owns BUCKET_MAP, TYPE_MAP, BUCKET_ORDER,
                          #   BUCKET_COLORS, _get_bucket, _compute_bucket_cagr
    groups.py             # Blueprint "groups": /api/groups/*
    budgets.py            # Blueprint "budgets": /api/budgets/*
    budget_builder.py     # Blueprint "budget_builder": /api/budget-builder/*
                          #   Also owns _build_budget_prompt, _save_budget_plan
    sync.py               # Blueprint "sync": /api/sync/*
                          #   Also owns ENTITY_TABLE_MAP, ENTITY_RUN_ORDER,
                          #   ENTITY_LABELS, sync helper functions,
                          #   _run_sync_worker, scheduler, SYNC_JOB_ID,
                          #   run_scheduled_sync, _reschedule
    setup.py              # Blueprint "setup": /api/setup/*
                          #   Also owns bootstrap_token_from_env, has_token
    settings.py           # Blueprint "settings": /api/settings/*
    retirement.py         # Blueprint "retirement": /api/retirement*
    ai_routes.py          # Blueprint "ai": /api/ai/*
  wsgi.py                 # Unchanged (imports from app)
```

### Target File Sizes

| File | Estimated Lines | Justification |
|------|----------------|---------------|
| `app.py` (shim) | ~80-100 | Imports + re-exports only |
| `db.py` | ~100 | DDL string + 5 functions |
| `ai.py` | ~120 | 5 functions + constants |
| `routes/networth.py` | ~360 | 4 endpoints + bucket maps + CAGR logic |
| `routes/groups.py` | ~200 | 6 endpoints |
| `routes/budgets.py` | ~210 | 4 endpoints (history + custom groups) |
| `routes/budget_builder.py` | ~400 | 11 endpoints + prompt builder + plan saver |
| `routes/sync.py` | ~350 | 4 endpoints + worker + helpers + scheduler |
| `routes/setup.py` | ~60 | 2 endpoints + 2 helpers |
| `routes/settings.py` | ~60 | 2 endpoints |
| `routes/retirement.py` | ~140 | 2 endpoints |
| `routes/ai_routes.py` | ~100 | 3 endpoints (config GET/POST, analyze) |

No file exceeds 400 lines. The target maximum is 450 lines per module.

### Flask Pattern: Global App (no factory)

The app continues to use the global `app = Flask(__name__)` pattern. An app factory is not warranted because:
- There is no multi-configuration requirement (no staging/prod variants)
- Tests already work by patching `get_db` rather than creating separate app instances
- `wsgi.py` imports `app` as a global -- changing to a factory would require wsgi changes, violating the constraint
- Factory pattern adds complexity with no payoff for a single-deployment personal finance app

### Shim Strategy

`app.py` becomes a compatibility shim. It:
1. Creates the Flask app instance and configures CORS (this stays here -- it is the app)
2. Registers the global error handler
3. Imports and registers all Blueprints via `routes/__init__.py`
4. Re-exports every name that tests or wsgi.py import, using explicit imports from the new modules

The shim re-export block looks like:

```python
# Backward-compatible re-exports -- allows `from app import X` and
# `patch("app.X", ...)` to continue working across all test files.
from db import (
    DASHBOARD_DDL, get_db, get_db_connection, init_dashboard_schema,
    get_setting, set_setting,
)
from ai import (
    _call_ai, _get_ai_key, _check_ai_rate_limit,
    _sanitize_prompt_field, _extract_json,
)
from routes.sync import (
    ENTITY_TABLE_MAP, ENTITY_RUN_ORDER, ENTITY_LABELS,
    scheduler, SYNC_JOB_ID, _reschedule, _run_sync_worker,
)
from routes.networth import (
    BUCKET_MAP, TYPE_MAP, BUCKET_ORDER, BUCKET_COLORS, _get_bucket,
)
from routes.setup import bootstrap_token_from_env, has_token
```

This means `patch("app.get_db", ...)` resolves to the `get_db` binding in `app.py`'s namespace, which points to the real function in `db.py`. Mocks intercept correctly because they replace the name in the `app` module namespace -- exactly the same mechanism as today.

### Shim Removal Strategy (future, not Phase B scope)

Shim removal is a separate task. When it happens:
1. Update test files one domain at a time to import from the real module
2. Update mock patch targets to match (e.g., `patch("db.get_db", ...)`)
3. Remove the corresponding re-export line from `app.py`
4. After all re-exports are gone, `app.py` is just the app + blueprint registration

This can be done incrementally per-domain with no coordination required.

### Layering Depth

One level only: route modules import directly from `db.py` and `ai.py`. There is no `services/` layer, no `repositories/` layer. Business logic stays inline in route handlers exactly as it is today. Introducing a services layer would require moving business logic out of handlers -- that is a refactoring of behavior, not structure, and violates the "no business logic refactoring" constraint.

## Rationale

The chosen approach (Blueprint split + shim) was selected because it uniquely satisfies all constraints simultaneously:

1. **Zero test changes** (SC-2): The shim re-exports mean every `from app import X` and `patch("app.X", ...)` continues to resolve correctly. No test file needs editing. This is the single most important property because test changes are high-risk for mock-patch silent breakage.

2. **New features = new files** (SC-1): Phase 3 (Investments) adds `routes/investments.py`, registers the blueprint in `routes/__init__.py`, and optionally adds a re-export line to `app.py` if tests need it. No existing route file is touched.

3. **Reasonable file sizes** (SC-3): No module exceeds 450 lines. The largest (`budget_builder.py` at ~400) is a single cohesive feature domain with no good split point.

4. **Navigability** (SC-4): The `routes/` directory maps 1:1 to API URL prefixes. A developer looking for net worth logic goes to `routes/networth.py`. Shared concerns are in `db.py` and `ai.py`.

5. **wsgi.py unchanged** (SC-5): `from app import app, _startup` continues to work because `app` is still the Flask instance created in `app.py`, and `_startup` is defined there or re-exported.

## Rejected Alternatives

### Option 1: Full Blueprint Split Without Shim (Option A from research)

**What it is:** Extract all domains into Blueprint modules and update `app.py` to only create the Flask app and register blueprints. Update all 15 test files to import from the new module locations and fix all mock patch targets.

**Why rejected:**
- Requires updating ~200+ `patch("app.X", ...)` calls across 15 test files. Each update is a potential silent breakage point: if a mock target string is wrong, the mock silently fails to intercept (unittest.mock does not error on patching a name that exists but isn't the one being called). This makes test changes high-risk despite being "mechanical."
- Violates SC-2 ("all existing backend tests pass without modification or with minimal, mechanical import-path updates only"). While "mechanical" is allowed, the sheer volume and the silent-failure risk of mock patches push this beyond "minimal."
- The shim approach achieves the same structural outcome with zero risk. There is no practical benefit to removing the shim in the same phase.

### Option 2: Layered Architecture (routes/services/db)

**What it is:** Three-layer split where route modules call service functions which call DB functions. Each domain gets three files (e.g., `routes/networth.py`, `services/networth.py`, `db/networth.py`).

**Why rejected:**
- The current code has no service layer -- business logic is inline in route handlers. Extracting a service layer requires moving and restructuring business logic, violating the "no business logic refactoring" constraint.
- Triples the file count without reducing complexity. For a personal finance dashboard with a single developer, the indirection of `route -> service -> db` adds navigation overhead with no benefit (no reuse across routes, no separate service consumers).
- Over-engineered for the actual use case. This codebase will never have a CLI or second API that calls the same services.

### Option 3: Minimal Split (extract only the two largest domains)

**What it is:** Extract only Budget Builder (~608 lines) and Net Worth (~353 lines) into separate files, leaving everything else in `app.py`.

**Why rejected:**
- Leaves `app.py` at ~1,400+ lines -- still a monolith, still violates SC-3.
- Does not satisfy SC-1: adding Phase 3 (Investments) would still mean editing the remaining monolithic `app.py` unless sync, groups, and AI are also extracted.
- Creates an inconsistent pattern: some domains are extracted, some are not. A developer cannot predict where code lives based on the file structure alone (violates SC-4).
- Saves modest effort compared to the full split (extracting 2 domains vs 8-9 modules), but the incremental work per domain is small since each extraction is independent.

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Circular imports between `routes/` modules and `db.py` or `ai.py` | Low | Medium | Dependency graph is strictly one-directional: route modules import from `db.py` and `ai.py`, never the reverse. `ai.py` imports from `db.py` (for `get_setting`). No cycles. Enforce this in PR review. |
| R2 | `_run_sync_worker` uses `app.logger` in background thread, fails after extraction | High (certain) | High | Explicitly change to `logging.getLogger(__name__)` inside `routes/sync.py`. This is a one-line change per call site (2 occurrences in `_run_sync_worker`, plus exception handlers in route functions that use `app.logger`). Within route handler functions, `current_app.logger` is available and is the correct Flask pattern for Blueprint code. |
| R3 | `_startup()` initialization order broken | Medium | High | `_startup()` stays in `app.py` and calls `init_dashboard_schema()` from `db.py` (which internally calls `pipeline_schema.init_db(DB_PATH)` first, then runs `DASHBOARD_DDL`). The function body is unchanged, only the import source of helpers changes. |
| R4 | Forgotten re-export in shim causes test failure | Low | Low | Run `make test` as the gating check after each module extraction. Any missing re-export will produce an `ImportError` -- this is a loud, immediate failure, not a silent one. |
| R5 | Blueprint URL routing conflicts or prefix issues | Low | Medium | Use empty string (`""`) as the `url_prefix` for all Blueprints, so route URLs are unchanged. Each route decorator keeps its full path (e.g., `@bp.route("/api/networth/history")`). This is the safest approach -- no URL rewriting needed. |
| R6 | Global mutable state (`scheduler`, `_ai_cooldowns`) shared incorrectly across modules | Medium | High | Each global is owned by exactly one module: `scheduler` and `SYNC_JOB_ID` live in `routes/sync.py`; `_ai_cooldowns` and `_ai_cooldowns_lock` live in `ai.py`. Other modules that need these import them. The shim re-exports them for test compatibility. |

## Sequencing / Phase 3 Dependency

**Phase B should complete before Phase 3 starts.** Rationale:

- Phase 3 (Investments page) will add new API endpoints. If Phase B is not done, those endpoints go into `app.py`, continuing the monolith problem and requiring a second round of extraction later.
- Phase B is purely structural with no feature changes, so it carries low risk and can be completed quickly (estimated 2-3 hours of implementation).
- Partial completion is not useful: the shim only works correctly when all domains are extracted (a half-extracted `app.py` still has route handlers mixed with re-exports, which is worse than the current state).

**Exception:** If Phase 3 is urgent, it could proceed in parallel by adding `routes/investments.py` directly (following the new pattern) while Phase B extracts the existing domains. The only coordination point is `routes/__init__.py` (blueprint registration), which is trivially mergeable.

## Open Questions Resolved

**OQ-1: Flask app factory vs global app?**
Global app. No factory. Reasons detailed in "Flask Pattern" section above. The app has a single configuration, tests use patching not app recreation, and wsgi.py expects a global.

**OQ-2: How deep should data-access separation go?**
One shared `db.py` with `get_db`, `get_db_connection`, `get_setting`, `set_setting`, and `DASHBOARD_DDL`. No per-domain DB modules. SQL stays inline in route handlers. This matches the current pattern and avoids business logic refactoring.

**OQ-3: Should all domains be extracted or only the largest?**
All domains. Partial extraction creates inconsistency and does not satisfy SC-1 or SC-3. The incremental effort per small domain (setup, settings, retirement) is minimal -- roughly 15 minutes each.

**OQ-4: Target max file size?**
450 lines. This accommodates the largest domain (Budget Builder at ~400 lines) without requiring an artificial split of a cohesive feature. For context, the current file is 2,442 lines.

**OQ-5: Should `_startup()` move to a separate module?**
No. `_startup()` stays in `app.py` because it orchestrates initialization across modules and wsgi.py imports it from `app`. Moving it to a separate module would require wsgi.py changes (violates SC-5) for no structural benefit.

**OQ-6: How to handle `app.logger` references in extracted modules?**
Two strategies depending on context:
- **Inside Flask request handlers** (Blueprint route functions): use `current_app.logger` -- this is the standard Flask Blueprint pattern and resolves to the same logger.
- **Outside request context** (specifically `_run_sync_worker` running in a background thread): use `logging.getLogger("routes.sync")` -- this avoids the `RuntimeError: Working outside of application context` that `current_app.logger` would raise in a thread.

## Implementation Notes for Engineer

### Extraction Order

Extract in this order. Each step is independently testable (run `make test` after each).

1. **`db.py`** -- Extract `DASHBOARD_DDL`, `get_db`, `get_db_connection`, `init_dashboard_schema`, `get_setting`, `set_setting`. Add re-exports to `app.py`. This is the foundation that all route modules depend on.

2. **`ai.py`** -- Extract `_call_ai`, `_get_ai_key`, `_check_ai_rate_limit`, `_sanitize_prompt_field`, `_extract_json`, `_ai_cooldowns`, `_ai_cooldowns_lock`, `_AI_COOLDOWN_SECONDS`. `ai.py` imports `get_setting` from `db`. Add re-exports to `app.py`.

3. **`routes/__init__.py`** -- Create the file. It will contain a `register_blueprints(app)` function called from `app.py`.

4. **`routes/setup.py`** -- Extract `bootstrap_token_from_env`, `has_token`, and 2 setup endpoints. Smallest domain, lowest risk -- validates the Blueprint pattern works.

5. **`routes/settings.py`** -- Extract 2 settings endpoints. Depends on `db.get_setting`, `db.set_setting`, and `sync._reschedule`.

6. **`routes/retirement.py`** -- Extract 2 retirement endpoints.

7. **`routes/groups.py`** -- Extract 6 group endpoints.

8. **`routes/budgets.py`** -- Extract 4 budget endpoints (history + custom groups).

9. **`routes/networth.py`** -- Extract 4 networth endpoints + `BUCKET_MAP`, `TYPE_MAP`, `BUCKET_ORDER`, `BUCKET_COLORS`, `_get_bucket`, `_compute_bucket_cagr`.

10. **`routes/sync.py`** -- Extract sync helpers, sync worker, scheduler, and 4 sync endpoints. Fix `app.logger` to `logging.getLogger("routes.sync")` in `_run_sync_worker`.

11. **`routes/ai_routes.py`** -- Extract 3 AI endpoints (config GET/POST, analyze).

12. **`routes/budget_builder.py`** -- Extract 11 budget builder endpoints + `_build_budget_prompt`, `_save_budget_plan`. This is the largest extraction, done last to minimize risk.

13. **Final cleanup of `app.py`** -- Remove all route handlers and helper functions that have been extracted. Verify only the shim remains: Flask app creation, CORS, error handler, Blueprint registration, `_startup()`, and re-exports.

### `app.logger` Handling in Extracted Modules

In each route module, add these imports:
```python
from flask import Blueprint, jsonify, request, current_app
```

Replace `app.logger.X(...)` with `current_app.logger.X(...)` in route handler functions.

In `routes/sync.py` specifically, for `_run_sync_worker` (runs outside request context):
```python
import logging
logger = logging.getLogger(__name__)
```
Replace `app.logger.exception(...)` with `logger.exception(...)` in the two places inside `_run_sync_worker` and `_sync()`.

### `wsgi.py` Handling

No changes to `wsgi.py`. The file imports `from app import app, _startup`. Both names remain available in `app.py`:
- `app` is the Flask instance, still created in `app.py`
- `_startup()` remains defined in `app.py`

### Blueprint URL Prefix Strategy

All Blueprints use `url_prefix=""` (empty string). Route decorators keep their full paths:
```python
bp = Blueprint("networth", __name__)

@bp.route("/api/networth/history")
def networth_history():
    ...
```

This is the zero-risk approach: no URL rewriting, no prefix math, and the routes read the same in the code as they appear in the API.

### `routes/__init__.py` Structure

```python
from routes.networth import bp as networth_bp
from routes.groups import bp as groups_bp
from routes.budgets import bp as budgets_bp
from routes.budget_builder import bp as budget_builder_bp
from routes.sync import bp as sync_bp
from routes.setup import bp as setup_bp
from routes.settings import bp as settings_bp
from routes.retirement import bp as retirement_bp
from routes.ai_routes import bp as ai_bp


def register_blueprints(app):
    app.register_blueprint(networth_bp)
    app.register_blueprint(groups_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(budget_builder_bp)
    app.register_blueprint(sync_bp)
    app.register_blueprint(setup_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(retirement_bp)
    app.register_blueprint(ai_bp)
```

### Dependency Graph (for verification)

```
app.py
  imports: db, ai, routes/__init__ (for register_blueprints)
  re-exports: everything tests need

db.py
  imports: monarch_pipeline.config, monarch_pipeline.schema
  no internal deps

ai.py
  imports: db (get_setting)
  imports: monarch_pipeline.auth (load_ai_key)

routes/setup.py
  imports: monarch_pipeline.auth, monarch_pipeline.config

routes/settings.py
  imports: db (get_db, get_setting, set_setting)
  imports: routes.sync (_reschedule)  [for apply-on-save]

routes/sync.py
  imports: db (get_db, get_setting)
  imports: monarch_pipeline.* (auth, fetchers, schema, storage, config)

routes/networth.py
  imports: db (get_db)

routes/groups.py
  imports: db (get_db, get_setting, set_setting)

routes/budgets.py
  imports: db (get_db, get_db_connection)

routes/ai_routes.py
  imports: db (get_db, get_setting)
  imports: ai (_call_ai, _get_ai_key, _check_ai_rate_limit)

routes/budget_builder.py
  imports: db (get_db, get_setting)
  imports: ai (_call_ai, _get_ai_key, _check_ai_rate_limit, _sanitize_prompt_field, _extract_json)
  imports: monarch_pipeline.auth (for apply endpoint)

routes/retirement.py
  imports: db (get_db)
```

No circular dependencies exist in this graph. The only cross-route import is `routes/settings.py` importing `_reschedule` from `routes/sync.py`, which is acceptable because settings must apply the sync interval immediately.
