# Phase B: Backend Modularization — Initial Implementation Plan

## Overview

Split `backend/app.py` (2,442 lines) into a Blueprint-based module structure. Infrastructure modules (`db.py`, `ai.py`) are extracted first, then 9 Blueprint route files are created under `routes/`. The original `app.py` becomes a thin shim of ~90 lines that creates the Flask app, registers blueprints, keeps `_startup()`, and re-exports every public name needed by the 15 test files and `wsgi.py`.

The shim re-export strategy ensures `patch("app.X", ...)` and `from app import X` continue to work in all tests with zero changes to test files. `make test` runs after each extraction step as the gating check.

**Extraction order (strict — each step depends on the prior infrastructure being in place):**

1. `db.py` (no internal deps)
2. `ai.py` (depends on db.py for `get_setting`)
3. `routes/__init__.py` (empty scaffold — created before any blueprint)
4. `routes/setup.py` (no route deps; validates blueprint pattern)
5. `routes/settings.py` (depends on db.py; cross-imports `_reschedule` from routes/sync.py — see note below)
6. `routes/retirement.py` (depends on db.py)
7. `routes/groups.py` (depends on db.py)
8. `routes/budgets.py` (depends on db.py)
9. `routes/networth.py` (depends on db.py)
10. `routes/sync.py` (depends on db.py; `app.logger` fix here)
11. `routes/ai_routes.py` (depends on db.py, ai.py)
12. `routes/budget_builder.py` (depends on db.py, ai.py)
13. `app.py` final slim-down (depends on all route files existing)

**Note on settings/sync circular dependency:** `routes/settings.py` calls `_reschedule` from `routes/sync.py`. This is a one-way import (settings imports sync, sync does not import settings), so it is not circular. However, `routes/sync.py` is extracted at step 10, after `routes/settings.py` at step 5. To handle this: in step 5, `routes/settings.py` imports `_reschedule` from the still-live `app.py` shim (`from app import _reschedule`). When `routes/sync.py` is created in step 10, the settings module is updated to import from `routes.sync` instead. This keeps each step independently testable.

---

## Changes

### Change 1: `backend/db.py`

```
File: /home/user/stashtrend/backend/db.py
Lines: new file
Action: CREATE
Parallelism: independent
```

**What moves in:**
- `DASHBOARD_DDL` (lines 92–180) — the entire DDL string constant
- `get_db()` (lines 183–188)
- `get_db_connection()` (lines 191–198)
- `init_dashboard_schema()` (lines 201–207)
- `get_setting()` (lines 214–217)
- `set_setting()` (lines 220–227)

**Imports needed at top of `db.py`:**
```python
import contextlib
import sqlite3
from typing import Optional
from monarch_pipeline import schema as pipeline_schema
from monarch_pipeline.config import DB_PATH
```

**What does NOT move:** `DB_PATH` stays in `monarch_pipeline.config` and is imported there. `db.py` imports it from `monarch_pipeline.config`.

**Note:** `init_dashboard_schema()` currently calls `pipeline_schema.init_db(DB_PATH)` then runs the DDL. This call order is preserved exactly.

---

### Change 2: `backend/ai.py`

```
File: /home/user/stashtrend/backend/ai.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What moves in:**
- `_ai_cooldowns` (line 1510) — the dict global
- `_AI_COOLDOWN_SECONDS` (line 1511) — the float constant
- `_ai_cooldowns_lock` (line 1514) — the threading.Lock
- `_check_ai_rate_limit()` (lines 1517–1524)
- `_sanitize_prompt_field()` (lines 1527–1532)
- `_get_ai_key()` (lines 1535–1540)
- `_call_ai()` (lines 1704–1738)
- `_extract_json()` (lines 1677–1701)

**Imports needed at top of `ai.py`:**
```python
import json
import re
import threading
import time
from typing import Optional
from db import get_setting
from monarch_pipeline import auth
```

**Note:** `_extract_json` appears after `_call_ai` in `app.py` (line 1677 precedes `_call_ai` at 1704 — actually `_extract_json` is at 1677 and `_call_ai` at 1704). In `ai.py` these can be placed in any order as long as `_call_ai` is defined before it is called. Keep original top-to-bottom order.

---

### Change 3: `backend/routes/__init__.py`

```
File: /home/user/stashtrend/backend/routes/__init__.py
Lines: new file
Action: CREATE
Parallelism: independent (can be created as empty scaffold immediately; filled after all blueprint files exist)
```

**Initial content (scaffold — empty `register_blueprints` stub):**
```python
def register_blueprints(app):
    pass
```

This stub is called from `app.py` immediately and allows `make test` to pass at each intermediate step. Each route extraction step updates this file to add the new blueprint.

**Final content after all routes are extracted:**
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

All blueprints use `url_prefix=""` (empty string). Route decorators keep their full `/api/...` paths.

---

### Change 4: `backend/routes/setup.py`

```
File: /home/user/stashtrend/backend/routes/setup.py
Lines: new file
Action: CREATE
Parallelism: independent (no deps on other new route files)
```

**What moves in:**
- `bootstrap_token_from_env()` (lines 72–81)
- `has_token()` (lines 84–86)
- `setup_status()` route (lines 1427–1431) — `GET /api/setup/status`
- `setup_token()` route (lines 1434–1451) — `POST /api/setup/token`

**Imports needed:**
```python
import asyncio
import os
from flask import Blueprint, jsonify, request, current_app
from monarch_pipeline import auth
from monarch_pipeline.config import TOKEN_PATH

bp = Blueprint("setup", __name__)
```

**`app.logger` fix:** `setup_token()` uses `app.logger.exception(...)` at line 1450. Replace with `current_app.logger.exception(...)`.

**After creation:** Update `routes/__init__.py` to import and register `setup_bp`.

---

### Change 5: `backend/routes/settings.py`

```
File: /home/user/stashtrend/backend/routes/settings.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py), Change 4 (routes/setup.py must exist so routes/__init__ is stable)
```

**What moves in:**
- `get_settings()` route (lines 1458–1467) — `GET /api/settings`
- `update_settings()` route (lines 1470–1502) — `POST /api/settings`

**Imports needed:**
```python
from flask import Blueprint, jsonify, request
from db import get_db, get_setting, set_setting
from app import _reschedule  # temporary — updated to routes.sync in step 10

bp = Blueprint("settings", __name__)
```

**Important:** `update_settings()` calls `_reschedule(interval)` at line 1501. At the time this file is created (step 5), `_reschedule` still lives in `app.py`. Import it as `from app import _reschedule`. This import is updated in step 10 when `routes/sync.py` is created. At that point change the import to `from routes.sync import _reschedule`.

**After creation:** Update `routes/__init__.py` to import and register `settings_bp`.

---

### Change 6: `backend/routes/retirement.py`

```
File: /home/user/stashtrend/backend/routes/retirement.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What moves in:**
- `get_retirement()` route (lines 2285–2294) — `GET /api/retirement`
- `save_retirement()` route (lines 2297–2415) — `POST /api/retirement`

**Imports needed:**
```python
import json
from flask import Blueprint, jsonify, request, current_app
from db import get_db

bp = Blueprint("retirement", __name__)
```

**`app.logger` fix:** `save_retirement()` uses `app.logger.exception(...)` at line 2414. Replace with `current_app.logger.exception(...)`.

**After creation:** Update `routes/__init__.py` to import and register `retirement_bp`.

---

### Change 7: `backend/routes/groups.py`

```
File: /home/user/stashtrend/backend/routes/groups.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What moves in:**
- `list_groups()` route (lines 899–919) — `GET /api/groups`
- `create_group()` route (lines 922–952) — `POST /api/groups`
- `update_group()` route (lines 955–992) — `PUT /api/groups/<int:group_id>`
- `delete_group()` route (lines 995–1030) — `DELETE /api/groups/<int:group_id>`
- `get_group_configs()` route (lines 1037–1052) — `GET /api/groups/configs`
- `save_group_configs()` route (lines 1055–1084) — `POST /api/groups/configs`
- `groups_history()` route (lines 1091–1119) — `GET /api/groups/history`
- `groups_snapshot()` route (lines 1122–1139) — `GET /api/groups/snapshot`

**Imports needed:**
```python
import json
import sqlite3
from collections import defaultdict
from flask import Blueprint, jsonify, request
from db import get_db, get_setting, set_setting

bp = Blueprint("groups", __name__)
```

**Note:** No `app.logger` calls in the groups handlers — no logger fix needed here.

**After creation:** Update `routes/__init__.py` to import and register `groups_bp`.

---

### Change 8: `backend/routes/budgets.py`

```
File: /home/user/stashtrend/backend/routes/budgets.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What moves in:**
- `budget_history()` route (lines 1146–1227) — `GET /api/budgets/history`
- `get_budget_custom_groups()` route (lines 1234–1270) — `GET /api/budgets/custom-groups`
- `set_budget_custom_groups()` route (lines 1273–1343) — `POST /api/budgets/custom-groups`

**Imports needed:**
```python
from flask import Blueprint, jsonify, request, current_app
from db import get_db, get_db_connection

bp = Blueprint("budgets", __name__)
```

**`app.logger` fixes:**
- `get_budget_custom_groups()`: line 1269 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `set_budget_custom_groups()`: line 1342 `app.logger.exception(...)` → `current_app.logger.exception(...)`

**After creation:** Update `routes/__init__.py` to import and register `budgets_bp`.

---

### Change 9: `backend/routes/networth.py`

```
File: /home/user/stashtrend/backend/routes/networth.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What moves in:**
- `BUCKET_MAP` (lines 647–694) — dict constant
- `TYPE_MAP` (lines 700–728) — dict constant
- `BUCKET_ORDER` (line 730) — list constant
- `BUCKET_COLORS` (lines 732–739) — dict constant
- `_get_bucket()` (lines 742–754)
- `_compute_bucket_cagr()` (lines 757–811)
- `networth_history()` route (lines 545–561) — `GET /api/networth/history`
- `networth_stats()` route (lines 564–607) — `GET /api/networth/stats`
- `accounts_summary()` route (lines 610–636) — `GET /api/accounts/summary`
- `networth_by_type()` route (lines 814–892) — `GET /api/networth/by-type`

**Imports needed:**
```python
from collections import defaultdict
from datetime import datetime
from flask import Blueprint, jsonify, current_app
from db import get_db

bp = Blueprint("networth", __name__)
```

**`app.logger` fix:** `_get_bucket()` calls `app.logger.warning(...)` at line 753. This helper is called both from route handlers (inside request context) and potentially in tests. Replace with `current_app.logger.warning(...)` — this is safe because `_get_bucket` is always called from within a request handler. If called outside a request context (e.g., in tests), the call site must supply an app context. Check existing tests for `_get_bucket` calls; if tests call it directly outside a request context, wrap with `with app.app_context():`.

**After creation:** Update `routes/__init__.py` to import and register `networth_bp`.

---

### Change 10: `backend/routes/sync.py`

```
File: /home/user/stashtrend/backend/routes/sync.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What moves in:**
- `BackgroundScheduler` try/except stub (lines 25–35) — move the entire try/import/except stub
- `scheduler` global (line 55)
- `SYNC_JOB_ID` constant (line 56)
- `ENTITY_TABLE_MAP` (lines 274–281)
- `ENTITY_RUN_ORDER` (lines 283–290)
- `ENTITY_LABELS` (lines 292–299)
- `_now()` (lines 302–303)
- `create_sync_job()` (lines 306–312)
- `update_sync_job()` (lines 315–320)
- `get_sync_job()` (lines 323–332)
- `get_sync_history()` (lines 335–347)
- `get_running_job()` (lines 350–359)
- `count_entity_rows()` (lines 362–366)
- `snapshot_counts()` (lines 369–370)
- `compute_deltas()` (lines 373–374)
- `ordered_entities()` (lines 377–379)
- `build_results()` (lines 382–383)
- `run_scheduled_sync()` (lines 234–250)
- `_reschedule()` (lines 253–267)
- `_run_sync_worker()` (lines 390–538)
- `sync_start()` route (lines 1350–1386) — `POST /api/sync/start`
- `sync_status()` route (lines 1389–1397) — `GET /api/sync/status/<int:job_id>`
- `sync_history()` route (lines 1400–1406) — `GET /api/sync/history`
- `sync_last_status()` route (lines 1409–1420) — `GET /api/sync/last-status`

**Imports needed:**
```python
import asyncio
import json
import logging
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Optional

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:
    class BackgroundScheduler:  # type: ignore[no-redef]
        """No-op stub used when APScheduler is not installed."""
        running = False
        def __init__(self, **kwargs): pass
        def start(self): self.running = True
        def get_job(self, job_id): return None
        def add_job(self, *args, **kwargs): pass
        def remove_job(self, job_id): pass

from flask import Blueprint, jsonify, request
from db import get_db, get_setting
from monarch_pipeline import auth, fetchers, schema as pipeline_schema, storage
from monarch_pipeline.config import DB_PATH, SESSION_PATH, TOKEN_PATH

bp = Blueprint("sync", __name__)
logger = logging.getLogger(__name__)
```

**`app.logger` fixes — critical (background thread):** `_run_sync_worker` runs outside a request context. Two `app.logger` calls must be replaced:
- Line 504: `app.logger.exception("Sync error for %s", entity)` → `logger.exception("Sync error for %s", entity)`
- Line 524: `app.logger.exception("Top-level sync error")` → `logger.exception("Top-level sync error")`

The module-level `logger = logging.getLogger(__name__)` provides the logger. `__name__` will be `routes.sync`.

**After creation:** Update `routes/__init__.py` to import and register `sync_bp`. Also update `routes/settings.py` to change `from app import _reschedule` to `from routes.sync import _reschedule`.

---

### Change 11: `backend/routes/ai_routes.py`

```
File: /home/user/stashtrend/backend/routes/ai_routes.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py), Change 2 (ai.py)
```

**What moves in:**
- `get_ai_config()` route (lines 1543–1556) — `GET /api/ai/config`
- `save_ai_config()` route (lines 1559–1580) — `POST /api/ai/config`
- `ai_analyze()` route (lines 1583–1669) — `POST /api/ai/analyze`

**Imports needed:**
```python
import keyring.errors
from collections import defaultdict
from flask import Blueprint, jsonify, request, current_app
from db import get_db, get_setting, set_setting
from ai import _call_ai, _get_ai_key, _check_ai_rate_limit
from monarch_pipeline import auth

bp = Blueprint("ai", __name__)
```

**`app.logger` fix:** `ai_analyze()` at line 1664 uses `app.logger.exception(...)`. Replace with `current_app.logger.exception(...)`.

**After creation:** Update `routes/__init__.py` to import and register `ai_bp`.

---

### Change 12: `backend/routes/budget_builder.py`

```
File: /home/user/stashtrend/backend/routes/budget_builder.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py), Change 2 (ai.py)
```

**What moves in:**
- `_build_budget_prompt()` (lines 1952–2080) — helper function
- `_save_budget_plan()` (lines 2083–2107) — helper function
- `get_builder_profile()` route (lines 1743–1753) — `GET /api/budget-builder/profile`
- `save_builder_profile()` route (lines 1756–1813) — `POST /api/budget-builder/profile`
- `get_builder_regional()` route (lines 1818–1827) — `GET /api/budget-builder/regional`
- `save_builder_regional()` route (lines 1830–1861) — `POST /api/budget-builder/regional`
- `fetch_builder_regional_ai()` route (lines 1864–1946) — `POST /api/budget-builder/regional/fetch`
- `generate_budget_plan()` route (lines 2110–2152) — `POST /api/budget-builder/generate`
- `list_builder_plans()` route (lines 2157–2163) — `GET /api/budget-builder/plans`
- `get_builder_plan()` route (lines 2166–2174) — `GET /api/budget-builder/plans/<int:plan_id>`
- `update_builder_plan()` route (lines 2177–2201) — `PUT /api/budget-builder/plans/<int:plan_id>`
- `delete_builder_plan()` route (lines 2204–2209) — `DELETE /api/budget-builder/plans/<int:plan_id>`
- `apply_builder_plan()` route (lines 2214–2278) — `POST /api/budget-builder/plans/<int:plan_id>/apply`

**Imports needed:**
```python
import asyncio
import json
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, current_app
from db import get_db, get_setting
from ai import _call_ai, _get_ai_key, _check_ai_rate_limit, _sanitize_prompt_field, _extract_json
from monarch_pipeline import auth
from monarch_pipeline.config import SESSION_PATH, TOKEN_PATH

bp = Blueprint("budget_builder", __name__)
```

**`app.logger` fixes:**
- `fetch_builder_regional_ai()`: line 1901 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `fetch_builder_regional_ai()`: line 1907 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `generate_budget_plan()`: line 2137 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `generate_budget_plan()`: line 2148 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `apply_builder_plan()`: line 2254 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `apply_builder_plan()`: line 2267 `app.logger.exception(...)` → `current_app.logger.exception(...)`
- `apply_builder_plan()`: line 2268 `app.logger.exception(...)` → `current_app.logger.exception(...)`

**After creation:** Update `routes/__init__.py` to import and register `budget_builder_bp`.

---

### Change 13: `backend/app.py` — Final Slim-Down

```
File: /home/user/stashtrend/backend/app.py
Lines: 1–2443 → replace entirely with ~90-line shim
Action: MODIFY (complete rewrite)
Parallelism: depends-on: all prior changes (1–12)
```

**What the final `app.py` contains:**

1. Module docstring (keep original)
2. Imports: `os`, `logging`, `Flask`, `CORS`, `werkzeug.exceptions`, `monarch_pipeline.config` (for `DB_PATH`, `ensure_data_dir`)
3. Flask app creation + CORS config (lines 42–53 — identical content)
4. Global error handler (lines 59–65 — identical, keep `app.logger` here since this IS `app.py`)
5. Call to `register_blueprints(app)` (new)
6. `_startup()` function (lines 2422–2436 — identical content, but now imports helpers from new modules)
7. `__main__` block (lines 2439–2442 — identical)
8. Shim re-export block (new)

**`_startup()` update:** The function body stays identical. Its local references to `bootstrap_token_from_env`, `init_dashboard_schema`, `get_db`, `get_setting`, and `_reschedule` all resolve through the shim re-exports (which are defined at module level in `app.py`).

**Shim re-export block (complete list derived from test analysis):**

```python
# ---------------------------------------------------------------------------
# Backward-compatible re-exports — allows `from app import X` and
# `patch("app.X", ...)` to continue working across all test files.
# ---------------------------------------------------------------------------
from db import (
    DASHBOARD_DDL,
    get_db,
    get_db_connection,
    init_dashboard_schema,
    get_setting,
    set_setting,
)
from monarch_pipeline.config import DB_PATH  # re-export for patch("app.DB_PATH", ...)
from ai import (
    _call_ai,
    _get_ai_key,
    _check_ai_rate_limit,
    _sanitize_prompt_field,
    _extract_json,
)
from routes.sync import (
    ENTITY_TABLE_MAP,
    ENTITY_RUN_ORDER,
    ENTITY_LABELS,
    scheduler,
    SYNC_JOB_ID,
    _reschedule,
    _run_sync_worker,
)
from routes.networth import (
    BUCKET_MAP,
    TYPE_MAP,
    BUCKET_ORDER,
    BUCKET_COLORS,
    _get_bucket,
)
from routes.setup import bootstrap_token_from_env, has_token
from monarch_pipeline import auth  # re-export for patch("app.auth.X", ...)
```

**Why `DB_PATH` re-export:** `test_db_improvements.py` uses `patch("app.DB_PATH", ...)`. `DB_PATH` is imported from `monarch_pipeline.config` at the top of `db.py`. To keep `patch("app.DB_PATH", ...)` working, `app.py` must import `DB_PATH` into its own namespace. Note: this patch only affects `app.DB_PATH`, not `db.DB_PATH`. The `get_db()` function in `db.py` references `DB_PATH` from its own module namespace. Tests that use `patch("app.DB_PATH", ...)` must be inspected — if `get_db` in `db.py` reads `DB_PATH` at call time (not import time), the patch on `app.DB_PATH` will NOT affect `db.get_db()`. See Testing Strategy section for the required test inspection.

**Why `auth` re-export:** Multiple test files use `patch("app.auth.save_token", ...)`, `patch("app.auth.load_ai_key", ...)`, `patch("app.auth.login_with_token", ...)`, etc. `auth` is a module reference; re-exporting it as `from monarch_pipeline import auth` places the module object in `app`'s namespace so `patch("app.auth.X", ...)` continues to resolve.

**What is removed from `app.py`:** All route handlers, all helper functions, `DASHBOARD_DDL`, `BUCKET_MAP`, `TYPE_MAP`, `BUCKET_ORDER`, `BUCKET_COLORS`, `_get_bucket`, `_compute_bucket_cagr`, `ENTITY_TABLE_MAP`, `ENTITY_RUN_ORDER`, `ENTITY_LABELS`, `_now`, `create_sync_job`, `update_sync_job`, `get_sync_job`, `get_sync_history`, `get_running_job`, `count_entity_rows`, `snapshot_counts`, `compute_deltas`, `ordered_entities`, `build_results`, `run_scheduled_sync`, `_reschedule`, `_run_sync_worker`, `_ai_cooldowns`, `_AI_COOLDOWN_SECONDS`, `_ai_cooldowns_lock`, `_check_ai_rate_limit`, `_sanitize_prompt_field`, `_get_ai_key`, `_call_ai`, `_extract_json`, `_build_budget_prompt`, `_save_budget_plan`, `bootstrap_token_from_env`, `has_token`, `get_db`, `get_db_connection`, `init_dashboard_schema`, `get_setting`, `set_setting`, `scheduler`, `SYNC_JOB_ID`.

---

### Change 14: `backend/routes/settings.py` — Import Update

```
File: /home/user/stashtrend/backend/routes/settings.py
Lines: import line for _reschedule (~line 5)
Action: MODIFY
Parallelism: depends-on: Change 10 (routes/sync.py)
```

Change the temporary import:
```python
from app import _reschedule
```
to:
```python
from routes.sync import _reschedule
```

This is the only change to this file. It is applied in the same commit as step 10 (routes/sync.py creation).

---

### Change 15: `backend/routes/__init__.py` — Incremental Updates

```
File: /home/user/stashtrend/backend/routes/__init__.py
Lines: entire file
Action: MODIFY (incremental, one update per extraction step)
Parallelism: depends-on: whichever route file was just created
```

Updated once per step (steps 4–12), adding one blueprint import + registration line each time. Final content shown in Change 3 above.

---

## Dependency Order

The following serialized order must be respected. Steps within the same group can technically overlap but given the sequential nature of `app.py` cleanup, serial execution is safer:

```
Group A (infrastructure — no deps):
  Change 1: db.py
  Change 3: routes/__init__.py (scaffold only)

Group B (ai module — depends on db.py):
  Change 2: ai.py

Group C (route files — each depends on db.py; run after Group B):
  Change 4:  routes/setup.py
  Change 5:  routes/settings.py (with temporary from-app import)
  Change 6:  routes/retirement.py
  Change 7:  routes/groups.py
  Change 8:  routes/budgets.py
  Change 9:  routes/networth.py
  Change 10: routes/sync.py  ← also triggers Change 14 (settings.py import update)
  Change 11: routes/ai_routes.py (depends also on ai.py)
  Change 12: routes/budget_builder.py (depends also on ai.py)

Group D (final cleanup — depends on all route files):
  Change 13: app.py final slim-down
```

Within Group C, steps 4–9 can be done in parallel by separate implementers since they do not depend on each other. Steps 10–12 can proceed in parallel as well (sync, ai_routes, budget_builder have no inter-route dependencies).

---

## `app.py` Shim — Complete Re-Export Reference

All names currently imported or patched via `app` across the 15 test files:

| Name | Source module | How referenced in tests |
|------|--------------|------------------------|
| `app` (Flask instance) | `app.py` | `from app import app` |
| `DASHBOARD_DDL` | `db.py` | `from app import DASHBOARD_DDL` |
| `get_db` | `db.py` | `patch("app.get_db", ...)` |
| `get_db_connection` | `db.py` | `patch("app.get_db_connection", ...)` |
| `init_dashboard_schema` | `db.py` | (used in helpers) |
| `get_setting` | `db.py` | `from app import get_setting` |
| `set_setting` | `db.py` | `patch("app.set_setting", ...)` |
| `DB_PATH` | `monarch_pipeline.config` | `patch("app.DB_PATH", ...)` |
| `_call_ai` | `ai.py` | `patch("app._call_ai", ...)` |
| `_get_ai_key` | `ai.py` | `patch("app._get_ai_key", ...)` |
| `_check_ai_rate_limit` | `ai.py` | (patched indirectly) |
| `_sanitize_prompt_field` | `ai.py` | (used by budget_builder) |
| `_extract_json` | `ai.py` | (used by budget_builder) |
| `ENTITY_TABLE_MAP` | `routes/sync.py` | `from app import ENTITY_TABLE_MAP` |
| `ENTITY_RUN_ORDER` | `routes/sync.py` | `from app import ENTITY_RUN_ORDER` |
| `ENTITY_LABELS` | `routes/sync.py` | (available for tests) |
| `scheduler` | `routes/sync.py` | (available for tests) |
| `SYNC_JOB_ID` | `routes/sync.py` | (available for tests) |
| `_reschedule` | `routes/sync.py` | `patch("app._reschedule", ...)` |
| `_run_sync_worker` | `routes/sync.py` | (available for tests) |
| `BUCKET_MAP` | `routes/networth.py` | `from app import BUCKET_MAP` |
| `TYPE_MAP` | `routes/networth.py` | `from app import TYPE_MAP` |
| `BUCKET_ORDER` | `routes/networth.py` | `from app import BUCKET_ORDER` |
| `BUCKET_COLORS` | `routes/networth.py` | `from app import BUCKET_COLORS` |
| `_get_bucket` | `routes/networth.py` | `from app import _get_bucket` |
| `bootstrap_token_from_env` | `routes/setup.py` | `from app import bootstrap_token_from_env` |
| `has_token` | `routes/setup.py` | `from app import has_token` |
| `auth` | `monarch_pipeline` | `patch("app.auth.X", ...)` |
| `_startup` | `app.py` | `from app import _startup` (wsgi.py) |

---

## Testing Strategy

### Gating rule
Run `make test` after each extraction step (each Group C step). Any `ImportError` or test failure must be resolved before proceeding. This means no step is merged without a green test run.

### Step-by-step test verification

**After Change 1 (db.py):** No tests yet import from `db.py` directly, so no test changes needed. But `app.py` must immediately add shim re-exports for all 6 db names (`DASHBOARD_DDL`, `get_db`, `get_db_connection`, `init_dashboard_schema`, `get_setting`, `set_setting`, `DB_PATH`). Run `make test` — all 15 test files must pass.

**After Change 2 (ai.py):** Add shim re-exports for ai names to `app.py`. Run `make test` — all tests pass.

**After each route file (Changes 4–12):** The route handlers are moved but the shim re-exports keep test patches working. Run `make test` after each step. Since route handler code is removed from `app.py` incrementally, verify that the newly-created blueprint file has been registered in `routes/__init__.py` before running tests (otherwise those endpoints return 404).

**After Change 13 (final slim-down):** Full `make test` run. This is the final validation.

### The `DB_PATH` patch problem — requires investigation

`test_db_improvements.py` uses `patch("app.DB_PATH", ":memory:")` and then imports `get_db` from `app`. After extraction, `get_db` lives in `db.py` and references `DB_PATH` from `db`'s own module namespace (not `app`'s). The `patch("app.DB_PATH", ...)` will update `app.DB_PATH` but NOT `db.DB_PATH`.

Before implementing Change 1, the implementer must read `test_db_improvements.py` in full to verify exactly how `get_db` is imported in those tests. If tests do `from app import get_db` inside the `with patch(...)` block, then after extraction the patched `app.DB_PATH` won't propagate to `db.get_db()` (which reads `db.DB_PATH`).

**Resolution options (choose one):**
- Option A: In `db.py`, have `get_db()` reference `DB_PATH` via a function parameter with a default that reads from the module global at call time (no change needed if the current code already reads the module global `DB_PATH` at call time).
- Option B: The shim re-exports `DB_PATH` but `db.py` also imports `DB_PATH` at module level. `patch("app.DB_PATH", ...)` replaces `app.DB_PATH`; `patch("db.DB_PATH", ...)` would replace the one `get_db()` actually uses. Since the architecture decision explicitly forbids test file changes, the implementer must verify this edge case.

The implementer must run `test_db_improvements.py` in isolation after step 1 and verify `patch("app.DB_PATH", ...)` still intercepts correctly. If it does not, this is a blocker that requires an architecture adjustment (likely: keep `get_db` calling `DB_PATH` via a module-level lookup so patching `db.DB_PATH` works, and update `test_db_improvements.py` patch targets — but this conflicts with the no-test-changes constraint).

**Safest resolution:** In `db.py`, `get_db()` can be written to import `DB_PATH` lazily or reference it from `db` module globals. Since `patch("app.DB_PATH", ...)` sets `app.DB_PATH`, and `get_db` is imported into `app` namespace via `from db import get_db`, and `get_db` reads `DB_PATH` from `db`'s own closure — the patch will NOT intercept. This must be flagged to the staff reviewer.

### `_get_bucket` outside request context

`test_networth_by_type.py` imports `_get_bucket` directly (`from app import _get_bucket`) and may call it outside a Flask request context. After extraction, `_get_bucket` uses `current_app.logger.warning(...)`. If tests call `_get_bucket` directly (not through an HTTP request), this will raise `RuntimeError: Working outside of application context`.

The implementer must check `test_networth_by_type.py` for direct `_get_bucket(...)` calls outside a test client request context. If found, two options:
- Wrap the logger call in a try/except that falls back to `logging.getLogger(__name__).warning(...)` if outside context.
- Use a module-level `logger = logging.getLogger(__name__)` for `_get_bucket` specifically (consistent with the sync.py pattern).

**Recommendation:** Use `logging.getLogger(__name__)` in `_get_bucket` since it is a pure utility function called from within route handlers. Route handlers have `current_app` available; `_get_bucket` does not need to propagate logging via Flask's app logger.

### Happy path tests (all existing, no new tests needed)

The refactor is purely structural. No new business logic is introduced. The test strategy is:
1. All 15 existing test files must pass unchanged after each extraction step
2. After final slim-down, run `make test` one final time to confirm clean state

### Edge cases to verify manually

- Blueprint URL routing: after registering all blueprints with `url_prefix=""`, confirm no 404 responses on endpoints that were working before (integration check with a running server, not just unit tests)
- `scheduler` global: confirm `_startup()` in `app.py` still calls `scheduler.start()` and `_reschedule()` correctly after extraction — `scheduler` is now in `routes/sync.py` but re-exported through `app.py`'s shim

---

## Rollback Notes

Each extraction step is independently revertable because `app.py` is only modified by adding re-exports (steps 1–12), not by removing code. The route handlers remain in `app.py` until step 13 (final slim-down).

If any step fails:
1. Remove the newly-created file (or revert to its prior state)
2. Remove the corresponding blueprint import from `routes/__init__.py`
3. Remove the corresponding re-export block from `app.py`
4. Run `make test` to confirm revert is clean

The final slim-down (Change 13) is the highest-risk step because it removes all the original code from `app.py`. Before executing Change 13, ensure all prior `make test` runs are green. If Change 13 causes failures:

1. `git checkout backend/app.py` to restore the pre-slim-down version
2. The blueprint files remain in place (they are additive, not destructive)
3. Diagnose which re-export is missing or which blueprint registration is broken
4. Fix and retry

No database migrations are involved. This refactor is code-structure only — no schema changes, no data changes.
