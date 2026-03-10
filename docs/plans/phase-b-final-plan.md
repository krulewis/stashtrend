# Phase B: Backend Modularization — Final Implementation Plan

## Changes from Initial Plan (Staff Review Resolutions)

### Finding 1 (Blocker): `DB_PATH` patch breaks `get_db()` after extraction
**Resolution:** `test_db_improvements.py` uses `patch("app.DB_PATH", ...)` and then imports `get_db` from `app`. After extraction, `get_db` in `db.py` reads `DB_PATH` from `db`'s own module namespace — patching `app.DB_PATH` has no effect. The only zero-logic-change resolution is a mechanical patch-target update in the test file. The plan now specifies: change all 6 occurrences of `patch("app.DB_PATH", ...)` in `test_db_improvements.py` to `patch("db.DB_PATH", ...)`. This is a mechanical import-path update, not a logic change, and is within the architecture constraint of "minimal, mechanical import-path updates only." `db.py` imports `DB_PATH` from `monarch_pipeline.config` at module level; patching `db.DB_PATH` replaces the name in `db`'s namespace, which is what `get_db()` and `get_db_connection()` actually read.

### Finding 2 (Blocker): `_ai_cooldowns` missing from shim re-exports
**Resolution:** Added `_ai_cooldowns`, `_AI_COOLDOWN_SECONDS`, and `_ai_cooldowns_lock` to the shim re-export block in the final `app.py` (Change 13). The re-export binds `app._ai_cooldowns` to the same dict object that lives in `ai.py` — `.clear()` on `app._ai_cooldowns` mutates the shared object, so tests continue to work correctly. The re-export reference table is updated accordingly.

### Finding 3 (Blocker): `_get_bucket` uses `app.logger` — will fail outside request context
**Resolution:** Change 9 (`routes/networth.py`) now specifies: add `import logging; logger = logging.getLogger(__name__)` at module level and use `logger.warning(...)` in `_get_bucket`. The plan also specifies a mechanical one-line test change in `test_networth_by_type.py` line 81: change `self.assertLogs(app.logger, level="WARNING")` to `self.assertLogs("routes.networth", level="WARNING")`. The logger name `"routes.networth"` matches `__name__` in that module.

### Finding 4 (Major): `_run_sync_worker` `DB_PATH` independence not documented
**Resolution:** Change 10 now explicitly documents that `routes/sync.py` imports `DB_PATH` directly from `monarch_pipeline.config` and this is independent of the `app.DB_PATH` shim re-export. No tests currently patch `app.DB_PATH` for sync worker behavior. No code change required — documentation only.

### Finding 5 (Major): `ai.py` missing `from flask import jsonify`
**Resolution:** Added `from flask import jsonify` to the import list for `ai.py` (Change 2). `_check_ai_rate_limit()` calls `jsonify(...)` and requires this import.

### Finding 6 (Major): `register_blueprints(app)` placement not specified
**Resolution:** Change 13 now explicitly states that `register_blueprints(app)` must be called in the final `app.py` shim AFTER all re-export lines, not at the top of the file. During intermediate steps (Changes 1–12), the call to `register_blueprints(app)` is added at the bottom of the existing `app.py`, after all function/constant definitions and before `_startup()`. This ensures that when route modules do `import app as _app`, the `app` module is already fully initialized with all re-exports defined.

### Finding 7 (Major): Plan was ambiguous about COPY vs MOVE during steps 1–12
**Resolution:** The plan now explicitly states: during Changes 1–12, all functions/constants are COPIED to the new module files. The originals remain in `app.py` untouched. Only in Change 13 (final slim-down) are the originals removed from `app.py` and replaced with the shim re-export block. This ensures `make test` passes at every intermediate step.

### Finding 8 (Blocker, combined with Finding 3): Route module import strategy breaks all `patch("app.X", ...)` mocking
**Resolution:** This is the most critical correction. The initial plan had route modules using `from db import get_db, get_setting` etc. — this binds the function to each route module's own namespace, so `patch("app.get_db", ...)` does not intercept calls inside route handlers.

The correct fix: **all route modules use `import app as _app` at the top and call `_app.get_db()`, `_app.get_setting()`, `_app._call_ai()`, etc. at call time**. This way, `patch("app.get_db", mock)` replaces `app.get_db` in `app`'s namespace, and `_app.get_db()` looks up the name on the `app` module object at call time — it sees the mock.

This pattern also handles `patch("app._reschedule", ...)` (test_settings.py line 235), `patch("app._get_ai_key", ...)`, `patch("app.set_setting", ...)`, and `patch.object(app_module, "scheduler", ...)` in `TestReschedule`.

Every route module's import section is updated to use this pattern. Infrastructure modules `db.py` and `ai.py` continue to import from each other directly (`ai.py` imports `get_setting` from `db`) since no tests mock those inter-module calls.

**Circular import concern:** This pattern (`import app as _app` inside route modules) is safe because `register_blueprints(app)` is called at the bottom of `app.py` after all definitions and re-exports are set. By the time Python imports any route module (triggered by `register_blueprints`), `app.py` is fully loaded. The `import app as _app` in a route module resolves to the already-loaded `app` module from `sys.modules` — no circular initialization occurs.

### Finding 9 (Minor): `_compute_bucket_cagr` not in shim — confirmed no action needed
**Resolution:** Confirmed: no test references `_compute_bucket_cagr`. Not added to shim. No change.

### Finding 10 (Minor): `run_scheduled_sync` missing from shim re-exports
**Resolution:** Added `run_scheduled_sync` to the shim re-export from `routes.sync` in Change 13.

### Finding 11 (Major): `auth` module re-export — confirmed correct
**Resolution:** The initial plan's approach is correct. `patch("app.auth.save_token", ...)` patches the attribute on the `monarch_pipeline.auth` module object itself. All references to `auth.save_token` anywhere (including in `routes/setup.py`) see the mock. No change needed.

### Finding 12 (Minor): `request` import in `routes/budgets.py` — confirmed correct
**Resolution:** `request` is already in the import list. No change needed.

### Finding 13 (Minor): Duplicate route registration during intermediate steps
**Resolution:** Confirmed safe. During steps 1–12, route handlers remain in `app.py` as `@app.route(...)` decorators AND are also registered as blueprint routes. Flask registers `@app.route` handlers at import time (before `register_blueprints` runs), so `app.route` handlers take precedence. Blueprint handlers are never reached during intermediate steps. This is the expected and safe behavior given the COPY strategy from Finding 7. Documented below.

### Finding 14 (Minor): `_startup()` references — confirmed correct
**Resolution:** `_startup()` stays in `app.py` and calls names via direct reference (since those names are in scope in `app.py` as re-exports or originals). No change.

---

## Overview

Split `backend/app.py` (2,442 lines) into a Blueprint-based module structure. Infrastructure modules (`db.py`, `ai.py`) are extracted first, then 9 Blueprint route files are created under `routes/`. The original `app.py` becomes a thin shim of ~90 lines.

**The shim re-export strategy and the `import app as _app` route-module pattern together ensure `patch("app.X", ...)` continues to intercept correctly in all 15 test files with only two mechanical test-file changes (6 lines in `test_db_improvements.py`, 1 line in `test_networth_by_type.py`).**

**Extraction order (strict — each step depends on the prior infrastructure):**

1. `db.py` (no internal deps)
2. `ai.py` (depends on db.py for `get_setting`)
3. `routes/__init__.py` (scaffold — created once, updated incrementally)
4. `routes/setup.py`
5. `routes/settings.py`
6. `routes/retirement.py`
7. `routes/groups.py`
8. `routes/budgets.py`
9. `routes/networth.py`
10. `routes/sync.py`
11. `routes/ai_routes.py`
12. `routes/budget_builder.py`
13. `app.py` final slim-down

**COPY strategy (steps 1–12):** All functions/constants are COPIED to new module files. Originals remain in `app.py`. Only step 13 removes originals from `app.py`.

---

## Changes

### Change 1: `backend/db.py`

```
File: /home/user/stashtrend/backend/db.py
Lines: new file
Action: CREATE
Parallelism: independent
```

**What is copied in:**
- `DASHBOARD_DDL` (lines 92–180) — the entire DDL string constant
- `get_db()` (lines 183–188)
- `get_db_connection()` (lines 191–198)
- `init_dashboard_schema()` (lines 201–207)
- `get_setting()` (lines 214–217)
- `set_setting()` (lines 220–227)

**Imports at top of `db.py`:**
```python
import contextlib
import sqlite3
from typing import Optional
from monarch_pipeline import schema as pipeline_schema
from monarch_pipeline.config import DB_PATH
```

`DB_PATH` is imported at module level. Tests that need to redirect `get_db()` to a test path will patch `db.DB_PATH` (not `app.DB_PATH`) — see test change in Change T1.

**After creation:** Add shim re-exports to `app.py` for all 6 db names PLUS `DB_PATH` in the SAME commit:
```python
from db import (
    DASHBOARD_DDL,
    get_db,
    get_db_connection,
    init_dashboard_schema,
    get_setting,
    set_setting,
)
from monarch_pipeline.config import DB_PATH  # re-export for legacy references
```

These lines are added to the bottom of `app.py` (before `_startup()`). The originals remain in `app.py` above — no code is removed yet.

---

### Change 2: `backend/ai.py`

```
File: /home/user/stashtrend/backend/ai.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What is copied in:**
- `_ai_cooldowns` (line 1510) — the dict global
- `_AI_COOLDOWN_SECONDS` (line 1511) — the float constant
- `_ai_cooldowns_lock` (line 1514) — the threading.Lock
- `_check_ai_rate_limit()` (lines 1517–1524)
- `_sanitize_prompt_field()` (lines 1527–1532)
- `_get_ai_key()` (lines 1535–1540)
- `_extract_json()` (lines 1677–1701)
- `_call_ai()` (lines 1704–1738)

**Imports at top of `ai.py`:**
```python
import json
import re
import threading
import time
from typing import Optional
from flask import jsonify
from db import get_setting
from monarch_pipeline import auth
```

Note: `_get_ai_key()` calls `get_setting(conn, "ai_api_key")`. This import is from `db` directly — this is the infrastructure layer importing from another infrastructure module, not a route module. No test patches `db.get_setting` or `ai.get_setting` — tests patch `app.get_setting` and then call via the route handler, which uses `_app.get_setting` at call time. The `_get_ai_key` call within `ai.py` is not intercepted by tests (tests mock the whole `_get_ai_key` function via `patch("app._get_ai_key", ...)`). Confirmed safe.

**After creation:** Add shim re-exports to `app.py` for all AI names in the SAME commit:
```python
from ai import (
    _call_ai,
    _get_ai_key,
    _check_ai_rate_limit,
    _sanitize_prompt_field,
    _extract_json,
    _ai_cooldowns,
    _AI_COOLDOWN_SECONDS,
    _ai_cooldowns_lock,
)
```

`_ai_cooldowns` re-export binds `app._ai_cooldowns` to the same dict object in `ai.py`. Tests that call `app_module._ai_cooldowns.clear()` mutate the shared object correctly.

---

### Change 3: `backend/routes/__init__.py`

```
File: /home/user/stashtrend/backend/routes/__init__.py
Lines: new file
Action: CREATE
Parallelism: independent (scaffold only; updated incrementally)
```

**Initial content:**
```python
def register_blueprints(app):
    pass
```

Add `from routes import register_blueprints; register_blueprints(app)` to the bottom of `app.py` immediately after the shim re-export block and before `_startup()`. This call is added in the same commit as this file.

**Final content (after all route files are created):**
```python
from routes.setup import bp as setup_bp
from routes.settings import bp as settings_bp
from routes.retirement import bp as retirement_bp
from routes.groups import bp as groups_bp
from routes.budgets import bp as budgets_bp
from routes.networth import bp as networth_bp
from routes.sync import bp as sync_bp
from routes.ai_routes import bp as ai_bp
from routes.budget_builder import bp as budget_builder_bp


def register_blueprints(app):
    app.register_blueprint(setup_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(retirement_bp)
    app.register_blueprint(groups_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(networth_bp)
    app.register_blueprint(sync_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(budget_builder_bp)
```

All blueprints use `url_prefix=""` (empty string). Route decorators keep their full `/api/...` paths.

**Intermediate step behavior:** During steps 4–12, route handlers exist in BOTH `app.py` (original `@app.route` decorators) and the new blueprint files. Flask registers `@app.route` handlers at module import time, before `register_blueprints` runs. The `@app.route` handlers take precedence and are matched first. Blueprint routes shadow but never execute during intermediate steps. This is correct and safe — tests use `patch("app.get_db", ...)` targeting `app`'s namespace, and the `@app.route` handlers read from `app`'s namespace directly. Mocks work normally throughout intermediate steps.

---

### Change 4: `backend/routes/setup.py`

```
File: /home/user/stashtrend/backend/routes/setup.py
Lines: new file
Action: CREATE
Parallelism: independent
```

**What is copied in:**
- `bootstrap_token_from_env()` (lines 72–81)
- `has_token()` (lines 84–86)
- `setup_status()` route (lines 1427–1431) — `GET /api/setup/status`
- `setup_token()` route (lines 1434–1451) — `POST /api/setup/token`

**Imports:**
```python
import asyncio
import os
from flask import Blueprint, jsonify, request, current_app
import app as _app
from monarch_pipeline.config import TOKEN_PATH

bp = Blueprint("setup", __name__)
```

**`import app as _app` usage in this module:**
- `bootstrap_token_from_env()` calls `auth.save_token(token.strip(), TOKEN_PATH)` — `auth` is imported from `monarch_pipeline` at module level here (not via `_app`) because `patch("app.auth.save_token", ...)` patches the attribute on the `monarch_pipeline.auth` module object directly. All references to `auth.save_token` anywhere see the mock. Route modules may import `auth` from `monarch_pipeline` directly.
- `has_token()` calls `auth.load_token(TOKEN_PATH)` — same reasoning.
- `setup_token()` uses `_app.auth.login_with_token(...)` — but since `auth` is a module object, patching `app.auth.login_with_token` replaces the attribute on the shared `auth` module. Route modules can import `auth` from `monarch_pipeline` directly and still see the mock.

**Revised import for setup.py:**
```python
import asyncio
import os
from flask import Blueprint, jsonify, request, current_app
from monarch_pipeline import auth
from monarch_pipeline.config import TOKEN_PATH

bp = Blueprint("setup", __name__)
```

`auth` attributes are patched on the module object itself, not through `app`'s namespace binding. Confirmed: `patch("app.auth.save_token", ...)` replaces `save_token` on the `monarch_pipeline.auth` module object — all `auth.save_token(...)` calls anywhere see the mock regardless of which module imported `auth`.

**`app.logger` fix:** `setup_token()` uses `app.logger.exception(...)` at line 1450. Replace with `current_app.logger.exception(...)`.

**After creation:** Update `routes/__init__.py` to import and register `setup_bp`.

---

### Change 5: `backend/routes/settings.py`

```
File: /home/user/stashtrend/backend/routes/settings.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What is copied in:**
- `get_settings()` route (lines 1458–1467) — `GET /api/settings`
- `update_settings()` route (lines 1470–1502) — `POST /api/settings`

**Imports:**
```python
from flask import Blueprint, jsonify, request
import app as _app

bp = Blueprint("settings", __name__)
```

**`import app as _app` usage:**
- `get_settings()` calls `_app.get_db()`, `_app.get_setting(conn, ...)` at call time
- `update_settings()` calls `_app.get_db()`, `_app.set_setting(conn, ...)`, `_app._reschedule(interval)` at call time

This means `patch("app.get_db", ...)`, `patch("app.set_setting", ...)`, and `patch("app._reschedule", ...)` all intercept correctly in tests.

**Note on `_reschedule` — no temporary import needed:** The initial plan had a temporary `from app import _reschedule` that was later updated to `from routes.sync import _reschedule`. With the `import app as _app` pattern, `_app._reschedule(interval)` always resolves through `app`'s namespace at call time. When `routes/sync.py` is created and its shim re-export is added to `app.py`, the `_app._reschedule` call automatically picks up the new binding. No two-step import change is needed. The `_reschedule` shim re-export in `app.py` must be added in the same commit as Change 10.

**After creation:** Update `routes/__init__.py` to import and register `settings_bp`.

---

### Change 6: `backend/routes/retirement.py`

```
File: /home/user/stashtrend/backend/routes/retirement.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What is copied in:**
- `get_retirement()` route (lines 2285–2294) — `GET /api/retirement`
- `save_retirement()` route (lines 2297–2415) — `POST /api/retirement`

**Imports:**
```python
import json
from flask import Blueprint, jsonify, request, current_app
import app as _app

bp = Blueprint("retirement", __name__)
```

**`import app as _app` usage:**
- Both handlers call `_app.get_db()` at call time

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

**What is copied in:**
- `list_groups()` route (lines 899–919) — `GET /api/groups`
- `create_group()` route (lines 922–952) — `POST /api/groups`
- `update_group()` route (lines 955–992) — `PUT /api/groups/<int:group_id>`
- `delete_group()` route (lines 995–1030) — `DELETE /api/groups/<int:group_id>`
- `get_group_configs()` route (lines 1037–1052) — `GET /api/groups/configs`
- `save_group_configs()` route (lines 1055–1084) — `POST /api/groups/configs`
- `groups_history()` route (lines 1091–1119) — `GET /api/groups/history`
- `groups_snapshot()` route (lines 1122–1139) — `GET /api/groups/snapshot`

**Imports:**
```python
import json
import sqlite3
from collections import defaultdict
from flask import Blueprint, jsonify, request
import app as _app

bp = Blueprint("groups", __name__)
```

**`import app as _app` usage:**
- All handlers call `_app.get_db()`, and some call `_app.get_setting(...)` / `_app.set_setting(...)` at call time

No `app.logger` calls in the groups handlers — no logger fix needed.

**After creation:** Update `routes/__init__.py` to import and register `groups_bp`.

---

### Change 8: `backend/routes/budgets.py`

```
File: /home/user/stashtrend/backend/routes/budgets.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What is copied in:**
- `budget_history()` route (lines 1146–1227) — `GET /api/budgets/history`
- `get_budget_custom_groups()` route (lines 1234–1270) — `GET /api/budgets/custom-groups`
- `set_budget_custom_groups()` route (lines 1273–1343) — `POST /api/budgets/custom-groups`

**Imports:**
```python
from flask import Blueprint, jsonify, request, current_app
import app as _app

bp = Blueprint("budgets", __name__)
```

**`import app as _app` usage:**
- `budget_history()` calls `_app.get_db()` at call time
- `get_budget_custom_groups()` calls `_app.get_db_connection()` at call time
- `set_budget_custom_groups()` calls `_app.get_db_connection()` at call time

This ensures `patch("app.get_db_connection", make_context_manager(db))` (used in 21 places in `test_custom_groups.py`) intercepts correctly.

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

**What is copied in:**
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

**Imports:**
```python
import logging
from collections import defaultdict
from datetime import datetime
from flask import Blueprint, jsonify, current_app
import app as _app

logger = logging.getLogger(__name__)

bp = Blueprint("networth", __name__)
```

**`import app as _app` usage:**
- All four route handlers call `_app.get_db()` at call time

**`_get_bucket` logger fix (critical):** Replace `app.logger.warning(...)` at line 753 with `logger.warning(...)` (using the module-level `logger = logging.getLogger(__name__)`). This is mandatory because `test_networth_by_type.py` calls `_get_bucket` directly outside a Flask request context (in `TestGetBucket.test_unknown_type_maps_to_other`). Using `current_app.logger` would raise `RuntimeError: Working outside of application context`. The module-level logger is safe in all call sites.

**After creation:** Update `routes/__init__.py` to import and register `networth_bp`.

---

### Change 10: `backend/routes/sync.py`

```
File: /home/user/stashtrend/backend/routes/sync.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py)
```

**What is copied in:**
- `BackgroundScheduler` try/except stub (lines 25–35)
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

**Imports:**
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
import app as _app
from monarch_pipeline import auth, fetchers, schema as pipeline_schema, storage
from monarch_pipeline.config import DB_PATH, SESSION_PATH, TOKEN_PATH

bp = Blueprint("sync", __name__)
logger = logging.getLogger(__name__)
```

**`import app as _app` usage in route handlers:**
- `sync_start()`, `sync_status()`, `sync_history()`, `sync_last_status()` call `_app.get_db()`, `_app.create_sync_job()`, `_app.get_sync_job()`, etc. at call time

**`scheduler` global — critical for `_reschedule` and `TestReschedule`:**
`_reschedule()` and `run_scheduled_sync()` reference `scheduler` (a module-level global in this file). `test_settings.py TestReschedule` uses `patch.object(app_module, "scheduler", mock_sched)` which patches `app.scheduler`. Since `app._reschedule` is re-exported from `routes.sync` (as a function object), calling `app_module._reschedule(6)` calls the function that lives in `routes/sync.py` — which reads `scheduler` from `routes.sync`'s namespace, not `app`'s.

**Fix:** `_reschedule()` and `run_scheduled_sync()` must look up `scheduler` through `_app` at call time:
```python
def _reschedule(interval_hours: int) -> None:
    import app as _app
    if _app.scheduler.get_job(SYNC_JOB_ID):
        _app.scheduler.remove_job(SYNC_JOB_ID)
    if interval_hours > 0:
        _app.scheduler.add_job(
            run_scheduled_sync,
            "interval",
            hours=interval_hours,
            id=SYNC_JOB_ID,
        )
```

Using a local `import app as _app` inside the function body avoids the module-level circular import issue that could arise if `routes/sync.py` does `import app as _app` at module level at the same time `app.py` is loading. A function-level import avoids this concern entirely since `_reschedule` is only called after `app.py` is fully loaded.

Alternatively, `import app as _app` at module level is safe because by the time `routes/sync.py` is imported (via `register_blueprints`), `app.py` is already in `sys.modules`. Either style works — function-level import is more explicit about the call-time lookup. Use function-level import for `_reschedule` and `run_scheduled_sync` specifically.

**`app.logger` fixes — background thread (critical):** `_run_sync_worker` runs outside a request context. Replace:
- Line 504: `app.logger.exception("Sync error for %s", entity)` → `logger.exception("Sync error for %s", entity)`
- Line 524: `app.logger.exception("Top-level sync error")` → `logger.exception("Top-level sync error")`

The module-level `logger = logging.getLogger(__name__)` (where `__name__` == `"routes.sync"`) is used here.

**`DB_PATH` independence note:** `_run_sync_worker` at line 397 does `conn = sqlite3.connect(DB_PATH)` using `DB_PATH` imported directly from `monarch_pipeline.config`. This is independent of `app.DB_PATH`. No tests patch `app.DB_PATH` for sync worker behavior — `test_sync.py` uses `make_test_db()` with in-memory DBs and overrides connection creation via helpers. No issue.

**After creation:** Add shim re-exports to `app.py` for `routes.sync` names in the same commit:
```python
from routes.sync import (
    ENTITY_TABLE_MAP,
    ENTITY_RUN_ORDER,
    ENTITY_LABELS,
    scheduler,
    SYNC_JOB_ID,
    _reschedule,
    run_scheduled_sync,
    _run_sync_worker,
)
```

Also update `routes/__init__.py` to import and register `sync_bp`.

---

### Change 11: `backend/routes/ai_routes.py`

```
File: /home/user/stashtrend/backend/routes/ai_routes.py
Lines: new file
Action: CREATE
Parallelism: depends-on: Change 1 (db.py), Change 2 (ai.py)
```

**What is copied in:**
- `get_ai_config()` route (lines 1543–1556) — `GET /api/ai/config`
- `save_ai_config()` route (lines 1559–1580) — `POST /api/ai/config`
- `ai_analyze()` route (lines 1583–1669) — `POST /api/ai/analyze`

**Imports:**
```python
import keyring.errors
from collections import defaultdict
from flask import Blueprint, jsonify, request, current_app
import app as _app
from monarch_pipeline import auth

bp = Blueprint("ai", __name__)
```

**`import app as _app` usage:**
- `get_ai_config()` calls `_app.get_db()`, `_app.get_setting(...)`, `_app.auth.load_ai_key()` — but `auth.load_ai_key` is on the module object; it can be called as `auth.load_ai_key()` directly
- `save_ai_config()` calls `_app.get_db()`, `_app.set_setting(...)`, `_app.auth.save_ai_key(...)`
- `ai_analyze()` calls `_app.get_db()`, `_app._get_ai_key(conn)`, `_app._check_ai_rate_limit(endpoint)`, `_app._call_ai(...)`

`patch("app._get_ai_key", return_value="test-key")` and `patch("app._call_ai", ...)` intercept correctly because handlers call `_app._get_ai_key(...)` and `_app._call_ai(...)` at call time.

`patch("app.auth.save_ai_key", ...)` and `patch("app.auth.load_ai_key", ...)` intercept on the module object — `auth.save_ai_key(...)` in any module sees the mock. Can use `auth.save_ai_key(...)` directly or `_app.auth.save_ai_key(...)` — both work.

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

**What is copied in:**
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

**Imports:**
```python
import asyncio
import json
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, current_app
import app as _app
from monarch_pipeline import auth
from monarch_pipeline.config import SESSION_PATH, TOKEN_PATH

bp = Blueprint("budget_builder", __name__)
```

**`import app as _app` usage:**
- All route handlers call `_app.get_db()`, `_app.get_setting(...)` at call time
- AI-calling handlers call `_app._call_ai(...)`, `_app._get_ai_key(conn)`, `_app._check_ai_rate_limit(endpoint)`, `_app._sanitize_prompt_field(...)`, `_app._extract_json(...)` at call time
- `apply_builder_plan()` also uses `_app.auth.get_client(...)` — but this can be called as `auth.get_client(...)` directly since `patch("app.auth.get_client", ...)` patches the attribute on the module object

**`app.logger` fixes:**
- `fetch_builder_regional_ai()`: two `app.logger.exception(...)` calls → `current_app.logger.exception(...)`
- `generate_budget_plan()`: two `app.logger.exception(...)` calls → `current_app.logger.exception(...)`
- `apply_builder_plan()`: three `app.logger.exception(...)` calls → `current_app.logger.exception(...)`

**After creation:** Update `routes/__init__.py` to import and register `budget_builder_bp`.

---

### Change 13: `backend/app.py` — Final Slim-Down

```
File: /home/user/stashtrend/backend/app.py
Lines: 1–2443 → replace entirely
Action: MODIFY (complete rewrite)
Parallelism: depends-on: all prior changes (1–12)
```

This is the only step that removes code. The final `app.py` is a ~95-line shim.

**Complete content of final `app.py`:**

```python
"""
Monarch Dashboard — Flask API Backend
Reads from the monarch_pipeline database and serves JSON to the React frontend.

The database path defaults to ~/.monarch_pipeline/monarch.db and can be
overridden via the MONARCH_DATA_DIR environment variable (used by Docker).
"""

import os

from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from monarch_pipeline import auth  # re-export for patch("app.auth.X", ...)
from monarch_pipeline.config import DB_PATH, ensure_data_dir  # DB_PATH re-export

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost",
    "http://localhost:80",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:80",
    "http://127.0.0.1:5173",
    "http://[::1]",
    "http://[::1]:80",
    "http://[::1]:5173",
])


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    if isinstance(exc, HTTPException):
        return exc
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Backward-compatible re-exports — allows `from app import X` and
# `patch("app.X", ...)` to continue working across all test files.
# ---------------------------------------------------------------------------
from db import (                                         # noqa: E402
    DASHBOARD_DDL,
    get_db,
    get_db_connection,
    init_dashboard_schema,
    get_setting,
    set_setting,
)
from ai import (                                         # noqa: E402
    _call_ai,
    _get_ai_key,
    _check_ai_rate_limit,
    _sanitize_prompt_field,
    _extract_json,
    _ai_cooldowns,
    _AI_COOLDOWN_SECONDS,
    _ai_cooldowns_lock,
)
from routes.sync import (                                # noqa: E402
    ENTITY_TABLE_MAP,
    ENTITY_RUN_ORDER,
    ENTITY_LABELS,
    scheduler,
    SYNC_JOB_ID,
    _reschedule,
    run_scheduled_sync,
    _run_sync_worker,
)
from routes.networth import (                            # noqa: E402
    BUCKET_MAP,
    TYPE_MAP,
    BUCKET_ORDER,
    BUCKET_COLORS,
    _get_bucket,
)
from routes.setup import bootstrap_token_from_env, has_token  # noqa: E402

# Blueprint registration — must come AFTER all re-exports above
from routes import register_blueprints                   # noqa: E402
register_blueprints(app)


def _startup() -> None:
    """
    Initialize the app — called from __main__ (dev) or wsgi.py (production).
    Creates the data directory, bootstraps the token from env, initialises the
    DB schema, starts the background scheduler, and restores the saved interval.
    """
    ensure_data_dir()
    bootstrap_token_from_env()
    init_dashboard_schema()
    if not scheduler.running:
        scheduler.start()
    conn = get_db()
    saved_interval = int(get_setting(conn, "sync_interval_hours", "0"))
    conn.close()
    _reschedule(saved_interval)


if __name__ == "__main__":
    _startup()
    print(f"Starting Monarch Dashboard API — reading from {DB_PATH}")
    app.run(host="0.0.0.0", port=5050, debug=os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true"))
```

**Key structural notes:**
- `register_blueprints(app)` is called AFTER all re-export lines. This ensures that when `routes/__init__.py` triggers imports of route modules, and those route modules do `import app as _app`, the `app` module is already in `sys.modules` with all re-exports defined.
- `auth` is imported at the top (before re-exports) to make `app.auth` available as a module reference for `patch("app.auth.X", ...)` patching.
- `DB_PATH` is imported from `monarch_pipeline.config` to keep `app.DB_PATH` available for any legacy references. Active test patching of `DB_PATH` is migrated to `db.DB_PATH` (see Change T1).
- `_startup()` references names that are now re-exports in `app`'s own namespace — this works because `_startup` is called after module initialization completes.

---

### Change T1: `backend/tests/test_db_improvements.py` — Mechanical Patch Target Update

```
File: /home/user/stashtrend/backend/tests/test_db_improvements.py
Lines: 24, 37, 46, 55, 63, 70
Action: MODIFY (mechanical patch target change)
Parallelism: depends-on: Change 1 (db.py must exist before this makes sense)
```

Change all 6 occurrences of `patch("app.DB_PATH", ...)` to `patch("db.DB_PATH", ...)`.

Specific lines:
- Line 24: `with patch("app.DB_PATH", tmp.name):` → `with patch("db.DB_PATH", tmp.name):`
- Line 37: `with patch("app.DB_PATH", ":memory:"):` → `with patch("db.DB_PATH", ":memory:"):`
- Line 46: `with patch("app.DB_PATH", ":memory:"):` → `with patch("db.DB_PATH", ":memory:"):`
- Line 55: `with patch("app.DB_PATH", tmp.name):` → `with patch("db.DB_PATH", tmp.name):`
- Line 63: `with patch("app.DB_PATH", ":memory:"):` → `with patch("db.DB_PATH", ":memory:"):`
- Line 70: `with patch("app.DB_PATH", ":memory:"):` → `with patch("db.DB_PATH", ":memory:"):`

Rationale: After extraction, `get_db()` and `get_db_connection()` read `DB_PATH` from `db`'s module namespace. `patch("db.DB_PATH", ...)` replaces the name in `db`'s namespace, which is what those functions actually read. `patch("app.DB_PATH", ...)` only replaces the name in `app`'s namespace and has no effect on `db`'s functions. Each test already imports `get_db` / `get_db_connection` from `app` (which re-exports them from `db`) — no import changes needed, only the patch target strings.

This is a mechanical import-path update, not a logic change. It is within the architecture constraint.

---

### Change T2: `backend/tests/test_networth_by_type.py` — Mechanical Logger Name Update

```
File: /home/user/stashtrend/backend/tests/test_networth_by_type.py
Lines: 81
Action: MODIFY (mechanical logger name change)
Parallelism: depends-on: Change 9 (routes/networth.py must exist)
```

Change line 81:
```python
with self.assertLogs(app.logger, level="WARNING") as cm:
```
to:
```python
with self.assertLogs("routes.networth", level="WARNING") as cm:
```

Rationale: After extraction, `_get_bucket` uses `logging.getLogger("routes.networth")` (module-level logger where `__name__ == "routes.networth"`). The test's `assertLogs` must listen on the same logger. `app.logger` is the Flask app logger (`"app"`), not `"routes.networth"`. This is a one-line mechanical change — the test logic, assertion, and call to `_get_bucket` are unchanged.

---

## Dependency Order

```
Group A (infrastructure — no deps, can be created in parallel):
  Change 1: db.py
  Change 3: routes/__init__.py (scaffold)

Group B (ai module — depends on db.py):
  Change 2: ai.py

Group C (route files — each depends on db.py; run after Group B completes):
  Independent within group (can be done in parallel by separate implementers):
    Change 4:  routes/setup.py
    Change 5:  routes/settings.py
    Change 6:  routes/retirement.py
    Change 7:  routes/groups.py
    Change 8:  routes/budgets.py
    Change 9:  routes/networth.py
    Change 10: routes/sync.py
  After Changes 1 and 2:
    Change 11: routes/ai_routes.py  (also depends on ai.py)
    Change 12: routes/budget_builder.py  (also depends on ai.py)

Group D (test mechanical fixes — can run in parallel with Group C):
  Change T1: test_db_improvements.py  (can run as soon as Change 1 is done)
  Change T2: test_networth_by_type.py  (can run as soon as Change 9 is done)

Group E (final cleanup — depends on all route files):
  Change 13: app.py final slim-down
```

**Gate rule:** Run `make test` after each Group C step before proceeding to the next. Any failure must be resolved before continuing.

---

## `app.py` Shim — Complete Re-Export Reference

All names currently imported or patched via `app` across the 15 test files:

| Name | Source module | How referenced in tests |
|------|--------------|------------------------|
| `app` (Flask instance) | `app.py` | `from app import app` |
| `DASHBOARD_DDL` | `db.py` → `app` shim | `from app import DASHBOARD_DDL` (test_helpers.py, test_groups.py) |
| `get_db` | `db.py` → `app` shim | `patch("app.get_db", ...)` (many test files) |
| `get_db_connection` | `db.py` → `app` shim | `patch("app.get_db_connection", ...)` (test_custom_groups.py) |
| `init_dashboard_schema` | `db.py` → `app` shim | used in startup |
| `get_setting` | `db.py` → `app` shim | `patch("app.get_setting", ...)` |
| `set_setting` | `db.py` → `app` shim | `patch("app.set_setting", ...)` (test_settings.py) |
| `DB_PATH` | `monarch_pipeline.config` → `app` shim | legacy re-export; active tests migrated to `db.DB_PATH` |
| `_call_ai` | `ai.py` → `app` shim | `patch("app._call_ai", ...)` |
| `_get_ai_key` | `ai.py` → `app` shim | `patch("app._get_ai_key", ...)` |
| `_check_ai_rate_limit` | `ai.py` → `app` shim | called via route handler |
| `_sanitize_prompt_field` | `ai.py` → `app` shim | called via route handler |
| `_extract_json` | `ai.py` → `app` shim | called via route handler |
| `_ai_cooldowns` | `ai.py` → `app` shim | `app_module._ai_cooldowns.clear()` (test_ai.py, test_budget_builder.py, test_security.py) |
| `_AI_COOLDOWN_SECONDS` | `ai.py` → `app` shim | available |
| `_ai_cooldowns_lock` | `ai.py` → `app` shim | available |
| `ENTITY_TABLE_MAP` | `routes/sync.py` → `app` shim | `from app import ENTITY_TABLE_MAP` |
| `ENTITY_RUN_ORDER` | `routes/sync.py` → `app` shim | `from app import ENTITY_RUN_ORDER` |
| `ENTITY_LABELS` | `routes/sync.py` → `app` shim | available |
| `scheduler` | `routes/sync.py` → `app` shim | `patch.object(app_module, "scheduler", ...)` (test_settings.py TestReschedule) |
| `SYNC_JOB_ID` | `routes/sync.py` → `app` shim | available |
| `_reschedule` | `routes/sync.py` → `app` shim | `patch("app._reschedule", ...)` (test_settings.py); `app_module._reschedule(6)` (TestReschedule) |
| `run_scheduled_sync` | `routes/sync.py` → `app` shim | available |
| `_run_sync_worker` | `routes/sync.py` → `app` shim | available |
| `BUCKET_MAP` | `routes/networth.py` → `app` shim | `from app import BUCKET_MAP` |
| `TYPE_MAP` | `routes/networth.py` → `app` shim | `from app import TYPE_MAP` |
| `BUCKET_ORDER` | `routes/networth.py` → `app` shim | `from app import BUCKET_ORDER` |
| `BUCKET_COLORS` | `routes/networth.py` → `app` shim | `from app import BUCKET_COLORS` |
| `_get_bucket` | `routes/networth.py` → `app` shim | `from app import _get_bucket` |
| `bootstrap_token_from_env` | `routes/setup.py` → `app` shim | `from app import bootstrap_token_from_env` |
| `has_token` | `routes/setup.py` → `app` shim | `patch("app.has_token", ...)` (test_security.py) |
| `auth` | `monarch_pipeline` | `patch("app.auth.X", ...)` — patches attribute on module object |
| `_startup` | `app.py` | `from app import _startup` (wsgi.py) |

---

## Testing Strategy

### Test files to modify (mechanical changes only)

1. `/home/user/stashtrend/backend/tests/test_db_improvements.py` — 6 lines changed (Change T1)
2. `/home/user/stashtrend/backend/tests/test_networth_by_type.py` — 1 line changed (Change T2)

All other 13 test files: zero changes required.

### Gating rule

Run `make test` after each of Changes 1–12 before proceeding. Any `ImportError` or test failure is a blocker. Do not proceed to Change 13 until all prior steps pass.

### Step-by-step test verification

**After Change 1 (db.py):** Run Change T1 immediately. Run `make test` — all 15 test files must pass. The shim re-exports `get_db`, `get_db_connection`, etc.; tests see identical behavior. The `patch("db.DB_PATH", ...)` change makes `test_db_improvements.py` pass correctly.

**After Change 2 (ai.py):** Run `make test`. Shim re-exports all AI names including `_ai_cooldowns`. Tests that call `app_module._ai_cooldowns.clear()` work correctly — `app._ai_cooldowns` is the same dict object as `ai._ai_cooldowns`.

**After Change 3 (routes/__init__.py scaffold + `register_blueprints` added to app.py):** Run `make test`. The `register_blueprints` stub does nothing yet — app behavior is unchanged.

**After each of Changes 4–12:** Run `make test`. During intermediate steps:
- Route handlers exist in BOTH `app.py` (original `@app.route`) AND the new blueprint
- `@app.route` handlers are registered first and take precedence
- Mocks target `app.X` names — intercepted by `@app.route` handlers reading from `app`'s namespace
- Tests pass with unchanged behavior

After Change 9 (networth.py), also run Change T2.

**After Change 13 (final slim-down):** This removes originals from `app.py`. Blueprint handlers are now the only registered handlers.
- Route handlers use `_app.get_db()` etc. — `_app` is the `app` module loaded from `sys.modules`
- `patch("app.get_db", mock)` replaces `app.get_db` in `app`'s namespace
- `_app.get_db()` at call time sees `mock` — interception works
- Run full `make test` — all 15 files must pass

### Happy path

All 15 existing test files must pass after each step. No new feature tests are needed — this refactor is purely structural.

### Edge cases to verify

- Blueprint URL routing: after Change 13, confirm no endpoint returns 404 by running `make test` against a live server (or via test client). All `@bp.route("/api/...")` paths must match the original `@app.route("/api/...")` paths exactly.
- `_ai_cooldowns.clear()` in test setUp: verify it clears the same dict that `_check_ai_rate_limit` in `routes/ai_routes.py` and `routes/budget_builder.py` reads. Both route modules call `_app._check_ai_rate_limit(endpoint)` which resolves to `ai._check_ai_rate_limit`, which reads from `ai._ai_cooldowns`. `app._ai_cooldowns` is the same dict object. Clear works correctly.
- `TestReschedule` (`test_settings.py`): verify `patch.object(app_module, "scheduler", mock_sched)` intercepts `_reschedule`'s use of `scheduler`. With `_reschedule` using `import app as _app; _app.scheduler.get_job(...)`, the patch works.
- `_startup()` in final slim-down: `scheduler`, `get_db`, `get_setting`, `bootstrap_token_from_env`, `init_dashboard_schema`, `_reschedule` are all in `app.py`'s namespace as re-exports — `_startup()` calls them by name, resolving correctly from `app`'s namespace.

---

## Rollback Notes

**Steps 1–12 are non-destructive** (COPY strategy): originals remain in `app.py`. Each step is revertable by:
1. Remove the newly-created file (or revert to its prior state)
2. Remove the corresponding blueprint import/registration from `routes/__init__.py`
3. Remove the corresponding shim re-export block from `app.py`
4. Remove the `register_blueprints` call from `app.py` if reverting step 3
5. Run `make test` to confirm revert is clean

**Step 13 (final slim-down) is the high-risk step.** Before executing:
- Confirm all prior `make test` runs are green
- Create a git tag at the pre-slim-down commit: `git tag phase-b-pre-slimdown`

If Change 13 causes failures:
1. `git checkout backend/app.py` to restore the pre-slim-down version
2. Blueprint files remain in place (additive, not destructive)
3. Diagnose which re-export is missing, which route module has a wrong `_app.X` call, or which blueprint registration is broken
4. Fix and retry

**Test file changes (T1, T2) are low-risk:** Two-line changes; revertable with `git checkout`. The original `patch("app.DB_PATH", ...)` calls can be restored if needed.

No database migrations are involved. This refactor is code-structure only — no schema changes, no data changes.
