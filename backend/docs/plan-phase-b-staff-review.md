# Phase B: Backend Modularization -- Staff Review

Reviewer: Staff Engineer Agent
Date: 2026-03-10
Inputs: `plan-phase-b-initial.md`, `architecture-decision-phase-b.md`, `app.py`, all 15 test files

---

## Finding 1: `DB_PATH` Patch Will Break `get_db()` After Extraction to `db.py`

**Severity: blocker**

`test_db_improvements.py` uses `patch("app.DB_PATH", tmp.name)` (lines 24, 37, 46, 55, 63, 71) and then calls `get_db()` / `get_db_connection()` imported from `app`. After extraction, `get_db()` lives in `db.py` and references `DB_PATH` from `db`'s own module namespace (`from monarch_pipeline.config import DB_PATH` at the top of `db.py`). Patching `app.DB_PATH` will replace the name in `app`'s namespace but will NOT affect `db.DB_PATH`, which is what `get_db()` actually reads at line 184: `sqlite3.connect(DB_PATH)`.

The plan correctly identifies this as a problem (section "The `DB_PATH` patch problem") but defers resolution to the implementer with three ambiguous options and says "the implementer must verify." This is insufficient -- a blocker must have a single concrete resolution in the plan.

Additionally, the same problem affects `_run_sync_worker` (line 397: `conn = sqlite3.connect(DB_PATH)`) and `init_dashboard_schema` (line 203: `pipeline_schema.init_db(DB_PATH)`). Both reference `DB_PATH` from `app.py`'s namespace today, but after extraction they will reference it from their own module namespaces (`db.DB_PATH` and `routes.sync.DB_PATH` respectively).

**Required change:** The plan must specify a single resolution. The correct fix without changing tests is: in `db.py`, do NOT import `DB_PATH` at module level. Instead, have `get_db()` and `init_dashboard_schema()` reference `DB_PATH` via a late-bound lookup:

```python
from monarch_pipeline import config as _pipeline_config

def get_db():
    conn = sqlite3.connect(_pipeline_config.DB_PATH)
    ...
```

This way, `patch("app.DB_PATH", ...)` is irrelevant -- but more importantly, `patch("monarch_pipeline.config.DB_PATH", ...)` controls the actual value. However, this still does not fix the tests since tests patch `app.DB_PATH`, not `monarch_pipeline.config.DB_PATH`.

The only zero-test-change fix: in `db.py`, import `DB_PATH` from `app` lazily at call time:

```python
def get_db():
    import app
    conn = sqlite3.connect(app.DB_PATH)
    ...
```

But this creates a circular import (`app` imports `db`, `db` imports `app`).

**Actual correct fix:** Modify `db.py` to accept `DB_PATH` from its own module global, and in `app.py`'s shim, after re-importing `get_db` from `db`, also patch `db.DB_PATH` at import time:

```python
# In app.py shim:
from monarch_pipeline.config import DB_PATH
import db as _db_module
_db_module.DB_PATH = DB_PATH  # Keep in sync -- but this is the default anyway
```

But this does not help because `patch("app.DB_PATH", ...)` patches only `app.DB_PATH`, not `db.DB_PATH`.

**Simplest correct resolution:** The plan must acknowledge this cannot be fixed without either (a) a one-line change to each affected test to patch `db.DB_PATH` instead of `app.DB_PATH`, or (b) making `get_db()` reference `DB_PATH` via a mutable container/function that the shim can redirect. The cleanest option is (a): update the 6 `patch("app.DB_PATH", ...)` calls in `test_db_improvements.py` to `patch("db.DB_PATH", ...)`. This is a mechanical test change (updating patch targets, not test logic) and falls within the architecture constraint of "minimal, mechanical import-path updates only." The plan must state this explicitly rather than deferring.

---

## Finding 2: `_ai_cooldowns` Re-Export Missing From Shim -- Tests Access It Directly

**Severity: blocker**

Multiple test files access `app_module._ai_cooldowns.clear()` directly via `import app as app_module`:
- `test_ai.py` line 111
- `test_budget_builder.py` lines 156, 254
- `test_security.py` lines 199, 212, 227, 278

After extraction, `_ai_cooldowns` lives in `ai.py`. The plan's shim re-export block (Change 13) does NOT include `_ai_cooldowns`, `_AI_COOLDOWN_SECONDS`, or `_ai_cooldowns_lock`. Without re-exporting `_ai_cooldowns`, `app_module._ai_cooldowns.clear()` will raise `AttributeError`.

**Required change:** Add `_ai_cooldowns`, `_AI_COOLDOWN_SECONDS`, and `_ai_cooldowns_lock` to the shim re-export block from `ai.py`:

```python
from ai import (
    _call_ai,
    _get_ai_key,
    _check_ai_rate_limit,
    _sanitize_prompt_field,
    _extract_json,
    _ai_cooldowns,          # ADD
    _AI_COOLDOWN_SECONDS,   # ADD
    _ai_cooldowns_lock,     # ADD
)
```

Also update the re-export reference table (section "app.py Shim -- Complete Re-Export Reference") to include these three names.

**Critical subtlety:** Even with re-export, `app_module._ai_cooldowns.clear()` must clear the SAME dict object that `_check_ai_rate_limit` in `ai.py` reads. Since `from ai import _ai_cooldowns` binds `app._ai_cooldowns` to the same dict object (not a copy), `.clear()` will mutate the shared object. This works correctly -- but only because the re-export is a reference to a mutable object, not a reassignment. The plan should note this.

---

## Finding 3: `_get_bucket` Uses `app.logger` -- Will Fail in Test `test_unknown_type_maps_to_other`

**Severity: blocker**

`test_networth_by_type.py` line 79-84 calls `_get_bucket("some_future_type", None)` directly (not through a route handler) and asserts on `self.assertLogs(app.logger, level="WARNING")`. After extraction, `_get_bucket` moves to `routes/networth.py` and the plan says to replace `app.logger` with `current_app.logger`.

However, `TestGetBucket` (lines 58-89 of `test_networth_by_type.py`) calls `_get_bucket` at class level -- not inside a test client request. There is no Flask request context active. `current_app.logger` will raise `RuntimeError: Working outside of application context`.

The plan identifies this issue (section "_get_bucket outside request context") and recommends using `logging.getLogger(__name__)`. But it does not update the plan's Change 9 description to specify this -- Change 9 says "Replace with `current_app.logger.warning(...)` -- this is safe because `_get_bucket` is always called from within a request handler." This contradicts the later section that correctly identifies the problem.

Additionally, the test at line 81 uses `self.assertLogs(app.logger, level="WARNING")` which expects logs on the Flask app logger. If `_get_bucket` uses `logging.getLogger("routes.networth")`, the test assertion will fail because it is listening on `app.logger`, not on the `routes.networth` logger.

**Required change:**
1. Change 9 must specify: use `logger = logging.getLogger(__name__)` at module level in `routes/networth.py`, and use `logger.warning(...)` in `_get_bucket` (not `current_app.logger`).
2. The plan must acknowledge that `test_networth_by_type.py` line 81 (`self.assertLogs(app.logger, level="WARNING")`) will break because it listens on the wrong logger. This requires a one-line test change: `self.assertLogs("routes.networth", level="WARNING")`. This is a mechanical test change (updating a logger name, not test logic). State this explicitly.

---

## Finding 4: `_run_sync_worker` References `DB_PATH` Directly -- Not Via `get_db()`

**Severity: major**

`_run_sync_worker` at line 397 does `conn = sqlite3.connect(DB_PATH)` and at line 410 does `pipeline_conn = pipeline_schema.init_db(DB_PATH)`. These reference `DB_PATH` from the current module namespace. After extraction to `routes/sync.py`, these will reference `routes.sync.DB_PATH` (imported from `monarch_pipeline.config`).

The plan's import list for `routes/sync.py` (Change 10) correctly includes `from monarch_pipeline.config import DB_PATH`, so this will work at runtime. However, it means `_run_sync_worker` is not using `get_db()` for its connection -- it creates its own raw `sqlite3.connect(DB_PATH)` with manual pragma setup. This is intentional (background thread needs its own connection), but the plan should explicitly note that `DB_PATH` in `routes/sync.py` is imported directly and any test that patches `app.DB_PATH` will not affect `routes/sync.py`'s `DB_PATH`.

No tests currently patch `DB_PATH` for sync worker tests (verified -- `test_sync.py` uses `make_test_db()` with in-memory DBs and defines its own helper functions), so this is not a test breakage. But the plan should document it for clarity.

**Required change:** Add a note to Change 10 stating that `DB_PATH` in `routes/sync.py` is imported from `monarch_pipeline.config` and is independent of the `app.DB_PATH` shim re-export. No test currently relies on patching `app.DB_PATH` for sync worker behavior.

---

## Finding 5: `_check_ai_rate_limit` Returns Flask `jsonify` Response -- Must Be Called Inside Request Context

**Severity: major**

`_check_ai_rate_limit()` (line 1517-1524) calls `jsonify({"error": "Please wait before retrying."})` which requires a Flask application context. After extraction to `ai.py`, this function will be called from route handlers in `routes/ai_routes.py` and `routes/budget_builder.py`, which have request context. So it works at runtime.

However, the plan's `ai.py` import list (Change 2) does NOT include `from flask import jsonify`. The function body calls `jsonify` but `ai.py` as specified has no Flask imports.

**Required change:** Add `from flask import jsonify` to the imports for `ai.py` (Change 2). Alternatively, refactor `_check_ai_rate_limit` to return a tuple `(dict, status_code)` instead of a Flask response, and have callers call `jsonify`. But the simpler fix is to add the import since the plan specifies zero-logic changes.

---

## Finding 6: `routes/settings.py` Circular Import During Step 5

**Severity: major**

At Step 5, `routes/settings.py` is created with `from app import _reschedule`. At this point in the extraction, `app.py` still contains `_reschedule` directly (it has not been extracted yet). However, `routes/__init__.py` has been updated (per Change 3/15) to import the settings blueprint: `from routes.settings import bp as settings_bp`. This import happens at `app.py` module load time when `register_blueprints` is called.

The import chain is: `app.py` loads -> calls `register_blueprints(app)` -> `routes/__init__.py` imports `routes.settings` -> `routes/settings.py` does `from app import _reschedule` -> this triggers `app` module import, which is already being loaded (partially initialized).

Python handles circular imports by returning the partially-initialized module. At the point `routes/settings.py` tries `from app import _reschedule`, the `app` module may or may not have defined `_reschedule` yet (depends on where `register_blueprints(app)` is called relative to `_reschedule`'s definition in `app.py`). Currently `_reschedule` is defined at line 253 and routes would need to be registered after that. But the plan's Change 13 (final slim-down) places `register_blueprints(app)` call early in the file.

**Required change:** The plan must specify exactly WHERE `register_blueprints(app)` is called in `app.py` relative to the definitions. During intermediate steps (before Change 13), `register_blueprints(app)` must be called AFTER all the functions that route modules import from `app`. The plan should state: "Add `from routes import register_blueprints; register_blueprints(app)` AFTER all function/constant definitions in `app.py`, immediately before `_startup()`." This ensures partially-initialized module has all names available when circular imports resolve.

---

## Finding 7: `test_helpers.py` Imports `DASHBOARD_DDL` From `app` -- Must Be in Shim

**Severity: major**

`test_helpers.py` line 15 does `from app import DASHBOARD_DDL`. This is correctly listed in the shim re-export table. However, during Step 1 (Change 1, `db.py` creation), the plan says to add shim re-exports immediately. The plan must be explicit: when `DASHBOARD_DDL` is extracted from `app.py` to `db.py`, a re-export `from db import DASHBOARD_DDL` must be added to `app.py` IN THE SAME COMMIT. If the extraction removes `DASHBOARD_DDL` from `app.py` before the re-export is added, `make test` will fail because `test_helpers.py` (used by almost every test) will get an `ImportError`.

The plan's "Rollback Notes" section mentions that "route handlers remain in `app.py` until step 13" which implies code is NOT removed during steps 1-12, only re-exports are added. But the plan's Change 1 says "What moves in" -- this is ambiguous about whether the code is MOVED (removed from app.py) or COPIED (left in app.py, also added to db.py).

**Required change:** The plan must state explicitly for Changes 1 and 2: "The functions/constants are COPIED to the new module. The originals remain in `app.py` during steps 1-12. Only in Change 13 (final slim-down) are the originals removed from `app.py` and replaced with re-exports." This is implied by the rollback section but is not stated in the change descriptions.

---

## Finding 8: `get_db_connection` Patch Target -- `test_custom_groups.py` Uses `patch("app.get_db_connection", ...)`

**Severity: minor**

`test_custom_groups.py` uses `patch("app.get_db_connection", ...)` extensively (21 occurrences). The shim re-export table correctly includes `get_db_connection` from `db.py`. After extraction, `get_budget_custom_groups()` and `set_budget_custom_groups()` in `routes/budgets.py` will import `get_db_connection` from `db` directly (`from db import get_db, get_db_connection`).

The test patches `app.get_db_connection`, which replaces the name in `app`'s namespace. But the route handler in `routes/budgets.py` references `db.get_db_connection` (or its local import), not `app.get_db_connection`. The patch will NOT intercept the actual call.

Wait -- let me reconsider. During steps 1-12, the route handlers are still in `app.py` and still reference `get_db_connection` from `app.py`'s local namespace. So `patch("app.get_db_connection", ...)` works during the intermediate steps. At step 13, when routes move out, `routes/budgets.py` does `from db import get_db_connection` and references `get_db_connection` from its own local namespace. The shim re-export in `app.py` makes `app.get_db_connection` exist, but the route handler does NOT read from `app.get_db_connection` -- it reads from `routes.budgets.get_db_connection` (which is `db.get_db_connection`).

**This is a blocker realization.** All `patch("app.get_db", ...)` and `patch("app.get_db_connection", ...)` calls in tests work today because the route handlers live in `app.py` and reference local names. After extraction, route handlers in `routes/*.py` will import from `db` directly. The patch target `"app.get_db"` will replace the shim re-export in `app`'s namespace, but the route handler in `routes/budgets.py` reads `get_db_connection` from its own module namespace (imported from `db`), not from `app`.

Actually, wait. I need to reconsider the execution model again. When tests do `patch("app.get_db", ...)`, they replace `app.get_db` in `app`'s module namespace. If the route handler in `routes/networth.py` does `from db import get_db` at the top, then `routes.networth.get_db` points to the real `db.get_db` function object -- patching `app.get_db` does NOT affect this.

This means the shim re-export strategy is fundamentally broken for any test that patches `app.get_db` or `app.get_db_connection` and then calls a route handler via the test client. The handler will use the unpatched `get_db` from `db.py`.

**Severity upgrade: blocker**

**Required change:** This is a fundamental architecture issue. The route modules must NOT import `get_db`, `get_db_connection`, `get_setting`, `set_setting` etc. from `db` directly. They must import them from `app` (or the route modules must be updated to use the same pattern).

There are two options:
- **Option A:** Route modules import from `app` instead of from `db`: `from app import get_db, get_setting`. This maintains the patch target but creates circular imports (route modules import from `app`, `app` imports route modules for blueprint registration).
- **Option B:** Route modules import from `db` directly (`from db import get_db`), and test patch targets must be updated to `patch("routes.networth.get_db", ...)`. This is a test change.
- **Option C (correct for zero-test-changes):** Route modules import from `db`, but the shim works by making route handlers resolve names through the `app` namespace at call time. This is not how Python imports work.
- **Option D:** Route modules import from `db`, but `db.get_db` is the actual function, so `patch("db.get_db", ...)` would work -- but tests use `patch("app.get_db", ...)`.

The correct solution for zero test changes: route modules must import `get_db` etc. from `app`, not from `db`. The circular import is resolved by using a late import inside the `register_blueprints` call (blueprint registration happens after `app.py` is fully loaded). Route module imports like `from app import get_db` work because by the time the route module is imported (during `register_blueprints`), `app.py`'s re-exports are already defined.

Wait -- re-examining the import chain: `app.py` is loaded -> it defines everything -> at some point calls `register_blueprints(app)` -> which imports route modules -> route modules do `from app import get_db` -> `app` module is already loaded, `app.get_db` exists (either as original definition during intermediate steps, or as re-export in final state). So `routes/networth.py` doing `from app import get_db` is NOT circular -- `app` is already fully loaded when route modules are imported.

BUT: this means `routes/networth.py` would reference `get_db` from its own module namespace (`routes.networth.get_db`), which was bound to the real function at import time. `patch("app.get_db", ...)` replaces `app.get_db` but NOT `routes.networth.get_db`. So this still doesn't work.

The ONLY way to make `patch("app.get_db", ...)` intercept calls in route handlers is if route handlers look up `get_db` from the `app` module at call time. This means either:
1. Route handlers do `import app; app.get_db()` instead of `from app import get_db; get_db()`
2. Route handlers use `from app import get_db` but the tests also patch the local binding

Actually, there is a simpler solution I overlooked: if routes import `get_db` from `db`, then `patch("db.get_db", ...)` would work. But `patch("app.get_db")` would not.

Let me re-examine what happens today. Today, `get_db` is defined in `app.py`. Route handlers are also in `app.py`. They reference the local `get_db` name. `patch("app.get_db", ...)` replaces that name in the `app` module, so calls within `app.py` see the mock. This works.

After extraction with the plan's approach (route modules do `from db import get_db`), `patch("app.get_db")` no longer intercepts. This is the fundamental breakage.

**The plan's import strategy for route modules is wrong.** Route modules should NOT import from `db` and `ai` directly. They should import from `app` to preserve patch targets. The plan must change all route module imports to use `from app import get_db, get_setting, set_setting` etc.

This makes the circular import concern real, but it works because `register_blueprints(app)` is called at the bottom of `app.py` after all names are defined. The route modules see the fully-loaded `app` module. And `from app import get_db` binds `routes.networth.get_db` to the same object as `app.get_db`. When a test does `patch("app.get_db", mock)`, it replaces `app.get_db` but NOT `routes.networth.get_db`.

So even this approach doesn't work!

The ONLY approach that works without changing test files is: keep the route handler code looking up `get_db` through the `app` module at call time. This means either:
1. Every route handler does `from app import get_db` inside the function body (late binding), or
2. The route module does `import app as _app` at the top and calls `_app.get_db()` everywhere

Option 2 is cleaner. Route modules would do:
```python
import app as _app

@bp.route("/api/networth/history")
def networth_history():
    conn = _app.get_db()
    ...
```

This way, `patch("app.get_db", mock)` replaces `app.get_db`, and `_app.get_db()` looks up `get_db` on the `app` module object at call time, seeing the mock. This works.

**Required change:** The plan must change the import strategy for ALL route modules. Instead of `from db import get_db, get_setting, set_setting`, route modules must use `import app as _app` and call `_app.get_db()`, `_app.get_setting()`, etc. Similarly for AI functions: `_app._call_ai()` instead of `from ai import _call_ai`. This preserves all existing `patch("app.X", ...)` targets without any test changes.

This is the single most important correction to the plan. Without it, the majority of tests will break silently (mocks fail to intercept, tests pass with real behavior or wrong data).

---

## Finding 9: `_compute_bucket_cagr` Missing From `networth.py` Import Note

**Severity: minor**

The shim re-export block in Change 13 does not include `_compute_bucket_cagr`. This is fine if no test imports or patches it. Verified: no test references `_compute_bucket_cagr` by name. No action needed -- this is informational only.

---

## Finding 10: `run_scheduled_sync` Missing From Shim Re-Export

**Severity: minor**

`run_scheduled_sync` is extracted to `routes/sync.py` but is not listed in the shim re-export block (Change 13). `_reschedule()` passes `run_scheduled_sync` as the callback to `scheduler.add_job()`. After extraction, both live in `routes/sync.py`, so the reference resolves locally. No test patches `run_scheduled_sync`. However, for completeness and to prevent future breakage if a test or `_startup` references it, it should be re-exported.

**Required change:** Add `run_scheduled_sync` to the shim re-export from `routes.sync` (minor, not blocking).

---

## Finding 11: `auth` Module Re-Export -- Tests Patch `app.auth.save_token` etc.

**Severity: major**

The plan correctly identifies that tests use `patch("app.auth.save_token", ...)`, `patch("app.auth.load_token", ...)`, `patch("app.auth.login_with_token", ...)`, `patch("app.auth.load_ai_key", ...)`, and `patch("app.auth.save_ai_key", ...)`.

Today these work because `app.py` does `from monarch_pipeline import auth` at the top, making `app.auth` a reference to the `monarch_pipeline.auth` module. `patch("app.auth.save_token", ...)` replaces `save_token` on the actual `auth` module object.

After extraction, `routes/setup.py` does `from monarch_pipeline import auth` and calls `auth.save_token(...)`. Since `patch("app.auth.save_token", ...)` patches the attribute on the `monarch_pipeline.auth` module object (not a copy), this works regardless of which module imported `auth` -- all references to `auth.save_token` see the mock.

This is correct and works. No issue here -- confirming the plan is right on this point.

---

## Finding 12: `budget_history()` Route in `routes/budgets.py` -- Missing `request` Import Check

**Severity: minor**

Change 8 lists imports for `routes/budgets.py` as `from flask import Blueprint, jsonify, request, current_app`. The `budget_history()` route uses `request.args.get("months", ...)` (line 1154). The plan includes `request` in the import -- this is correct. No issue.

---

## Finding 13: Incremental `routes/__init__.py` and Test Interaction During Steps 4-12

**Severity: minor**

During intermediate steps, route handlers exist in BOTH `app.py` (original) and `routes/X.py` (new blueprint). When the blueprint is registered via `register_blueprints(app)`, Flask will have two handlers for the same URL -- the `@app.route(...)` in `app.py` and the `@bp.route(...)` in the new file. Flask does not error on duplicate routes by default; the first registered route wins.

This means during intermediate steps, if the blueprint route is registered BEFORE the `@app.route` definition in `app.py`, the blueprint handler runs (reading from `db` directly, bypassing patches). If registered AFTER, the `app.py` handler runs (using `app`'s namespace, patches work).

Since `register_blueprints(app)` should be called AFTER all `@app.route` definitions (per Finding 6), the `@app.route` handlers in `app.py` will be registered first and will win. The blueprint routes will be shadows that never execute. This is safe for tests but may cause confusion.

Actually, checking Flask behavior: routes are matched in registration order. `app.route` decorators run at import time. `register_blueprints` runs later. So `@app.route` handlers are registered first and will match first. Blueprint handlers are never reached. This is safe during intermediate steps.

BUT: this only works if the code is COPIED (originals stay in `app.py`). See Finding 7 -- the plan must clarify this.

**Required change:** No additional action beyond Finding 7's clarification. But the plan should note that during intermediate steps, duplicate route registrations exist and the `@app.route` versions take precedence.

---

## Finding 14: `_startup()` References After Extraction

**Severity: minor**

`_startup()` calls `bootstrap_token_from_env()`, `init_dashboard_schema()`, `get_db()`, `get_setting()`, `_reschedule()`, and `scheduler.start()`. The plan says these all resolve through shim re-exports. This is correct IF `_startup()` stays in `app.py` and the re-exports are defined before `_startup()` is called. Since re-exports are at module level and `_startup()` is called from `__main__` or `wsgi.py`, this is fine.

However, with Finding 8's correction (route modules using `import app as _app`), the re-exports in `app.py` still need to exist for `_startup()` to reference them directly. This is consistent.

No action needed.

---

## Summary

**3 blockers, 3 major, 4 minor findings.**

### Blockers (must fix before implementation begins):

1. **Finding 1:** `DB_PATH` patch in `test_db_improvements.py` will not intercept `db.get_db()` after extraction. Plan must specify the fix: change 6 patch targets in that test file from `"app.DB_PATH"` to `"db.DB_PATH"`.

2. **Finding 2:** `_ai_cooldowns` (and `_AI_COOLDOWN_SECONDS`, `_ai_cooldowns_lock`) missing from shim re-exports. Tests directly access `app_module._ai_cooldowns.clear()`. Add to re-export block.

3. **Finding 3 + Finding 8 combined:** This is the critical architectural issue. The plan's import strategy (`from db import get_db` in route modules) breaks ALL `patch("app.get_db", ...)` test mocking. Route modules must use `import app as _app` and call `_app.get_db()` at call time so that `patch("app.get_db", mock)` is visible to route handlers. This affects every route module's import section and function bodies. The plan must be rewritten to reflect this.

### Major:

4. **Finding 5:** `ai.py` missing `from flask import jsonify` import for `_check_ai_rate_limit`.
5. **Finding 6:** `register_blueprints(app)` call placement must be specified (after all definitions).
6. **Finding 7:** Plan must clarify that code is COPIED during steps 1-12, not MOVED.

### Minor:

7. **Finding 3 (logger part):** `_get_bucket` must use `logging.getLogger(__name__)`, and `test_networth_by_type.py` line 81 needs a one-line mechanical change to listen on the correct logger name.
8. **Finding 4:** Document that `routes/sync.py`'s `DB_PATH` is independent of the shim.
9. **Finding 10:** Add `run_scheduled_sync` to shim re-exports for completeness.
10. **Finding 13:** Document duplicate route registration behavior during intermediate steps.
