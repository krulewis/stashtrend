# Unit Test Coverage Plan — 80%+ Per-File Coverage

**Feature:** Add comprehensive unit tests across entire codebase
**Size:** L
**Date:** 2026-03-12

---

## Overview

This plan achieves 80%+ per-file coverage in four phases:

1. **Tooling** — install coverage packages, configure thresholds with an allowlist for currently-uncovered files, add `.coveragerc`, update Makefiles, update `.gitignore`.
2. **Backend gap-fill** — write new test cases in existing test files to cover branches that are currently untested (ai.py branches, budget_builder partial-failure apply, networth empty-data and CAGR edge cases).
3. **Frontend new test files** — create `.test.jsx` files for the 5 untested components/pages (`GroupAssignmentSheet`, `MonthDetailView`, `MonthlySummaryView`, `BudgetLineItem`, `MobileBudgetPage`).
4. **Allowlist removal** — once each file reaches 80%, remove it from the per-file exclusion list and lock the threshold.

No application source files are changed. Only tooling configuration files (Makefiles, vite.config.js, package.json, .coveragerc, .gitignore) and test files are modified. All new test files follow existing project conventions: `patch("app.X", ...)` for backend, colocated `.test.jsx` for frontend, `make_test_db()` from `test_helpers.py` for in-memory SQLite.

The architect's open question ("should `make test` run coverage, or a separate `make coverage`?") is resolved in favor of a **separate `make coverage` target** so the default `make test` run stays fast. Coverage enforcement (with `--cov-fail-under`) only runs in CI via `make coverage`.

---

## Deviations from Architecture

| # | Architect Decision | Plan Deviation | Reason |
|---|---|---|---|
| 1 | "`make test` always runs with coverage, or separate `make coverage` target?" (open question) | Plan adds a **separate `make coverage` target** in both backend and root Makefiles. `make test` remains unchanged. | Running `--cov` on every `make test` adds 2–5 s of overhead on each iteration cycle. Separating it keeps TDD fast and avoids changing the CI contract from passing currently. |
| 2 | Vitest `perFile: true` will fail on uncovered files immediately | Plan adds a `coverageThreshold.perFile` block but also adds an `exclude` list in `vite.config.js` so files below 80% are skipped initially. The `exclude` list is trimmed as tests are written. | This is exactly the architect's "phased with allowlist" strategy; the deviation is only that the exclusion is expressed inside `vite.config.js` `coverage.exclude` rather than a separate config file. |
| 3 | Excluded frontend files: `main.jsx`, `nav.js`, `syncEntities.js` | Plan confirms these three files are permanently excluded via the Vitest coverage `exclude` array. They are not given test files. | `main.jsx` is a React entry point with `ReactDOM.createRoot` — testing it provides no value. `nav.js` and `syncEntities.js` are pure constant/data files with no logic branches. |
| 4 | Excluded backend files: `wsgi.py`, `__init__.py` files | Plan confirms permanent exclusion in `.coveragerc` `omit` list. | These files contain no testable logic. |

---

## Changes

### Phase 1 — Coverage Tooling (all independent)

---

```
File: /home/user/stashtrend/backend/requirements.txt
Lines: append after line 4
Parallelism: independent
Description: Add pytest-cov dependency for coverage measurement.
Details:
  - Append line: pytest-cov>=5.0.0
```

---

```
File: /home/user/stashtrend/backend/.coveragerc
Lines: new file
Parallelism: independent
Description: Configure pytest-cov with branch coverage, fail_under=80, and permanent omit list.
Details:
  - [run] section: branch = true, source = .
  - [run] omit list:
      wsgi.py
      venv/*
      tests/*
      */__init__.py
  - [report] section:
      fail_under = 80
      show_missing = true
      skip_covered = false
  - [report] exclude_lines for pragma: no cover, if __name__ == .__main__., raise NotImplementedError, pass
  - Note: per-file enforcement is handled by --cov-fail-under at the aggregate level.
    Individual files that are still below 80% during the allowlist phase are listed in
    [report] omit temporarily (see Phase 4 for removal schedule).
  - Temporary per-file omit additions (removed as tests are written, Phase 4):
      routes/sync.py     (complex async scheduler — deferred)
    All other backend files are expected to reach 80% via Phase 2 tests.
```

---

```
File: /home/user/stashtrend/backend/Makefile
Lines: after line 18 (after existing test target block)
Parallelism: independent
Description: Add a `coverage` target that runs pytest with coverage reporting and fail_under enforcement.
Details:
  - Add new target after `test`:
    ## Run tests with coverage report (enforces 80% threshold)
    coverage: install
    	$(PYTEST) tests/ -v --cov=. --cov-config=.coveragerc --cov-report=term-missing --cov-report=html
  - Do NOT modify the existing `test` target.
```

---

```
File: /home/user/stashtrend/frontend/package.json
Lines: 10-12 (scripts section) and devDependencies
Parallelism: independent
Description: Add @vitest/coverage-v8 dev dependency and a coverage script.
Details:
  - In "scripts", add: "coverage": "vitest run --coverage"
  - In "devDependencies", add: "@vitest/coverage-v8": "^2.0.0"
  - Do NOT modify the existing "test" or "test:watch" scripts.
```

---

```
File: /home/user/stashtrend/frontend/vite.config.js
Lines: 15-19 (test block)
Parallelism: independent
Description: Add a coverage configuration block inside the existing test config.
Details:
  - Extend the `test` block to add a `coverage` sub-object:
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        // Only line coverage enforced per CLAUDE.md
        lines: 80,
        perFile: true,
      },
      exclude: [
        // Permanent exclusions (no testable logic)
        'src/main.jsx',
        'src/nav.js',
        'src/constants/syncEntities.js',
        // Test infrastructure
        'src/test/**',
        // Vite/vitest config itself
        'vite.config.js',
        // Coverage output
        'coverage/**',
      ],
    }
  - The `perFile: true` with the exclude list above means only files that have
    tests will be checked for the per-file threshold. Files below 80% that are
    not yet excluded will fail `make coverage` — implementers must add them to the
    exclude list temporarily if they are not yet addressed.
```

---

```
File: /home/user/stashtrend/frontend/Makefile
Lines: 10 (after existing `test` target)
Parallelism: independent
Description: Add a `coverage` target for frontend coverage.
Details:
  - Add after the test target:
    ## Run frontend tests with coverage report (enforces 80% threshold)
    coverage: install
    	npm run coverage
  - Do NOT modify the existing `test` target.
```

---

```
File: /home/user/stashtrend/Makefile
Lines: 14-16 (after existing `test` target)
Parallelism: independent
Description: Add a root-level `coverage` target that runs both backend and frontend coverage.
Details:
  - Add after the test target:
    ## Run full coverage suite (backend + frontend, enforces 80% per-file)
    coverage:
    	$(MAKE) -C backend coverage
    	$(MAKE) -C frontend coverage
  - Do NOT modify the existing `test` target.
```

---

```
File: /home/user/stashtrend/.gitignore
Lines: append
Parallelism: independent
Description: Add frontend coverage output directory to .gitignore (htmlcov/ already present).
Details:
  - .coveragerc is already not in gitignore — keep it tracked.
  - htmlcov/ is already gitignored (line present).
  - Add: frontend/coverage/
  - The .coverage file is already gitignored.
```

---

### Phase 2 — Backend Gap-Fill Tests (can run in parallel within phase)

All backend test additions follow the existing `patch("app.X", ...)` convention and use `make_test_db()`.

---

```
File: /home/user/stashtrend/backend/tests/test_ai.py
Lines: append after line 225 (after existing TestAIAnalyze class)
Parallelism: independent
Description: Add unit tests for _extract_json and _check_ai_rate_limit branches in ai.py.
  The existing file covers AI config and analyze endpoints. Missing: _extract_json branch tests
  and rate-limit cooldown enforcement.
Details:
  New class TestExtractJson:
    Import: from app import _extract_json
    - test_plain_json_no_fences: plain JSON string → parsed dict returned correctly
    - test_json_with_backtick_fences: "```json\n{...}\n```" → parsed, fences stripped
    - test_json_with_plain_fences: "```\n{...}\n```" → parsed, fences stripped
    - test_invalid_json_raises: "not json" → raises json.JSONDecodeError
    - test_valid_category_ids_filter_keeps_valid: result has "recommendations" with valid + invalid id;
      valid_category_ids={"cat_1"} → only cat_1 kept, hallucinated filtered
    - test_valid_category_ids_none_skips_filter: valid_category_ids=None → recommendations untouched
    - test_valid_category_ids_empty_set_filters_all: valid_category_ids=set() → all recommendations removed
    - test_discarded_count_logged: patch builtins.print, verify discard count message printed when items filtered
      # Coupled to print() in ai.py:66 — update if changed to logging

  New class TestCheckAIRateLimit:
    Import: import app as app_module; from app import _check_ai_rate_limit
    setUp: app_module._ai_cooldowns.clear()
    - test_first_call_returns_none: first call for new endpoint → None returned (not blocked)
    - test_second_call_within_cooldown_returns_429: call twice rapidly → second returns 429 tuple
    - test_call_after_cooldown_elapsed_returns_none: patch time.monotonic to advance past 2.0 s → None returned
    - test_different_endpoints_are_independent: call endpoint A, then endpoint B → B not blocked

  New class TestCallAI:
    Import: from app import _call_ai
    Setup: use make_test_db() so the settings table exists (required by _get_ai_key).
      Apply DASHBOARD_DDL to the connection before calling _call_ai.
    Mock targets: patch "anthropic.Anthropic" and "openai.OpenAI" at the top-level module
      (not app.anthropic.Anthropic) because ai.py imports them at module level.
    - test_missing_api_key_returns_none_triple: DB with no api_key setting, auth.load_ai_key=None → (None, None, None)
    - test_unknown_provider_raises_valueerror: DB with provider="bad_provider" → raises ValueError
    - test_anthropic_provider_calls_sdk: mock anthropic.Anthropic, verify messages.create called with correct args
    - test_openai_compatible_with_base_url: mock openai.OpenAI, verify base_url passed to constructor
    - test_openai_compatible_no_base_url: base_url="" → base_url kwarg NOT passed to OpenAI()
```

---

```
File: /home/user/stashtrend/backend/tests/test_budget_builder.py
Lines: already has comprehensive tests. Append after line 603.
Parallelism: independent
Description: Add missing branch tests for _build_budget_prompt, _save_budget_plan, and edge cases.
Details:
  New class TestBuildBudgetPrompt:
    Import: from routes.budget_builder import _build_budget_prompt, _save_budget_plan
    Note: _build_budget_prompt executes SQL queries — tests must use make_test_db() and seed
      relevant tables before calling. No HTTP client needed.
    - test_prompt_contains_future_months: call _build_budget_prompt with months_ahead=2 → returned prompt
      string contains two future month keys in "YYYY-MM-01" format
    - test_prompt_excludes_transfer_categories: db has a transfer category → cat_list in prompt
      does NOT contain the transfer id
    - test_prompt_with_regional_data: db has budget_builder_regional row → regional_text block appears in prompt
    - test_prompt_without_regional_data: no regional row → regional_text block absent from prompt
    - test_children_ages_as_list: profile has children_ages as a Python list → serialized correctly in prompt
    - test_children_ages_as_json_string: profile has children_ages as JSON string → deserialized + sanitized in prompt
    - test_children_ages_invalid_json: profile has children_ages = "bad[json" → falls back to empty list, no crash
    - test_upcoming_events_as_list: similar to children_ages list case
    - test_upcoming_events_invalid_json: falls back to empty list
    - test_max_tokens_scales_with_category_count: add >30 categories → max_tokens > 4096

  New class TestSaveBudgetPlan:
    - test_save_returns_plan_dict: call _save_budget_plan with test db and valid data → returned dict
      has id, name, line_items, summary, months_ahead, ai_generated_at, total_monthly_budget
    - test_save_inserts_db_row: after _save_budget_plan, SELECT from budget_builder_plans → 1 row exists
    - test_save_plan_name_includes_date: plan_name matches "AI Plan — " + date pattern
```

---

```
File: /home/user/stashtrend/backend/tests/test_networth_by_type.py
Lines: already has comprehensive tests. Append after line 277.
Parallelism: independent
Description: Add missing edge-case tests for _compute_bucket_cagr standalone unit tests, and
  endpoint edge cases for empty series and single data point.
Details:
  New class TestComputeBucketCagr (standalone unit tests):
    Import: from routes.networth import _compute_bucket_cagr
    - test_empty_dict_returns_all_null: _compute_bucket_cagr({}) → {"1y": None, "3y": None, "5y": None}
    - test_fewer_than_30_nonzero_days_returns_null: dict with 29 non-zero entries → all null
    - test_exactly_30_nonzero_days_computes: dict with exactly 30 non-zero entries (same value) → 1y may be
      None (not enough range) but no crash
    - test_leap_day_handling: today_str = "2024-02-29" (a real leap day), years=1 → does not raise ValueError
      (the try/except replace(day=28) path is hit)
    - test_single_nonzero_point_returns_null: only 1 non-zero entry after stripping → all null
    - test_start_bal_zero_returns_null_for_period: history where all entries 1Y ago are zero but recent are
      non-zero → 1y returns None because start_bal <= 0
    - test_cagr_positive_growth: 400 days of data, bal doubles → 1y ≈ 100% growth (verify > 0 and < 200)

  New class TestNetworthHistoryEndpoint:
    Setup: each test must create a fresh DB via make_test_db() because the endpoint calls conn.close().
      Use the same setUp/tearDown pattern as the existing TestNetworthByTypeEndpoint class.
    - test_empty_db_returns_empty_list: GET /api/networth/history with empty db → 200, []
    - test_returns_sorted_by_date: seed 3 history rows out of order → response dates are sorted asc

  New class TestNetworthStatsEndpoint:
    Setup: each test must create a fresh DB via make_test_db() because the endpoint calls conn.close().
      Use the same setUp/tearDown pattern as the existing TestNetworthByTypeEndpoint class.
    - test_empty_db_returns_null_values: GET /api/networth/stats with empty db → 200,
      current.net_worth = None, mom.change = None, yoy.change = None
    - test_zero_prior_net_worth_pct_change_null: mom_nw = 0 → mom.pct_change = None (divide-by-zero guard)
    - test_stats_with_data: seed accounts + history, verify current/mom/yoy non-null
    - test_mom_exists_but_current_none_does_not_crash: seed a mom history row but no current-month row
      → documents edge case behavior (expected: may TypeError or return None — record actual behavior
      and assert accordingly; do not mask the bug if it exists)

  New class TestAccountsSummaryEndpoint:
    Setup: each test must create a fresh DB via make_test_db() because the endpoint calls conn.close().
      Use the same setUp/tearDown pattern as the existing TestNetworthByTypeEndpoint class.
    - test_empty_db_returns_empty_list: GET /api/accounts/summary with empty db → 200, []
    - test_excludes_hidden_accounts: is_hidden=1 account not returned
    - test_excludes_not_in_net_worth: include_in_net_worth=0 account not returned
    - test_bucket_field_added: each returned account has "bucket" field
    - test_asset_sorting: is_asset=1 accounts appear before is_asset=0
```

---

```
File: /home/user/stashtrend/backend/tests/test_retirement.py
Lines: already comprehensive. Append after line 219.
Parallelism: independent
Description: Add remaining validation edge cases for retirement POST — numeric field bounds
  and type checks that are currently covered only by happy-path tests.
Details:
  New additions to TestRetirementPost:
    - test_post_expected_return_exceeds_50: expected_return_pct=51 → 400
    - test_post_inflation_rate_exceeds_100: inflation_rate_pct=101 → 400
    - test_post_monthly_contribution_exceeds_limit: monthly_contribution=1_000_001 → 400
    - test_post_desired_income_exceeds_limit: desired_annual_income=10_000_001 → 400
    - test_post_string_withdrawal_rate_returns_400: withdrawal_rate_pct="four" → 400, error mentions 'number'
    - test_post_negative_contribution_returns_400: monthly_contribution=-1 → 400
    - test_post_milestones_not_list_returns_400: milestones="not a list" → 400, error mentions 'list'
    - test_post_milestone_not_dict_returns_400: milestones=[42] → 400, error mentions 'object'
    - test_post_db_error_returns_500: patch get_db to raise Exception inside the try block → 500

  Note: test_post_db_error requires patching at the conn.execute level inside the try block.
  Use patch.object on the conn returned by make_db, or patch "app.get_db" to return a mock
  that raises on execute.
```

---

```
File: /home/user/stashtrend/backend/tests/test_ai_routes.py (new file)
Lines: new file
Parallelism: independent
Description: New dedicated test file for routes/ai_routes.py — covers only the 2 tests that are
  genuinely new at the HTTP route level and not already covered in test_ai.py:
  the rate-limit 429 integration path and the exception-to-500 path.
Details:
  - Import: from app import app, _ai_cooldowns; from tests.test_helpers import make_test_db
  - setUp: _ai_cooldowns.clear()
  - test_analyze_rate_limit_blocks_rapid_second_call: POST /api/ai/analyze twice in rapid succession
    → second call returns 429
  - test_analyze_exception_returns_500: patch _call_ai to raise RuntimeError → 500, "failed" in error
```

---

```
File: /home/user/stashtrend/backend/tests/test_db.py (new file)
Lines: new file
Parallelism: independent
Description: New test file for db.py — currently untested. Tests get_setting, set_setting,
  get_db_connection context manager, and init_dashboard_schema idempotency.
Details:
  - Import: from db import get_setting, set_setting, get_db_connection, init_dashboard_schema, DASHBOARD_DDL
  - Use an in-memory sqlite3 connection for all tests.
  - class TestGetSetting:
    setUp: create an in-memory connection and apply DASHBOARD_DDL via conn.executescript(DASHBOARD_DDL)
      so the settings table exists before calling get_setting/set_setting.
    - test_returns_default_when_key_missing: empty settings table → get_setting(conn, "missing", "default") == "default"
    - test_returns_none_default_when_not_provided: get_setting(conn, "missing") is None
    - test_returns_stored_value: insert row, get_setting → value returned
  - class TestSetSetting:
    setUp: create an in-memory connection and apply DASHBOARD_DDL via conn.executescript(DASHBOARD_DDL).
    - test_inserts_new_key: set_setting(conn, "k", "v") → SELECT returns "v"
    - test_upserts_existing_key: set twice with different values → second value wins
    - test_commit_persists: after set_setting, reconnect to same in-memory db (same conn) → value readable
  - class TestGetDbConnection:
    Note: TestGetDbConnection and TestInitDashboardSchema do NOT need DASHBOARD_DDL applied —
      they test the connection/schema helpers themselves, not settings operations.
    - test_context_manager_yields_connection: with get_db_connection() as conn: conn is not None
    - test_context_manager_closes_on_exit: after with block, conn is unusable (execute raises)
    - Note: cannot easily test the real DB path (requires MONARCH_DATA_DIR); mock DB_PATH via patch
      to a tmp file path using tmp_path fixture approach or patch("db.DB_PATH", ":memory:")
  - class TestInitDashboardSchema:
    - test_idempotent_double_call: call init_dashboard_schema twice → no error (CREATE TABLE IF NOT EXISTS)
    - Note: this test needs a real temp file path or deep mocking; may be marked with
      @unittest.skip("requires filesystem") if too costly. Alternative: test that DASHBOARD_DDL
      is valid SQL by applying it to an in-memory conn.
```

---

### Phase 3 — Frontend New Test Files (all independent of each other)

All frontend tests use `@testing-library/react`, `vitest`, and the existing setup in `src/test/setup.js`. CSS modules are auto-mocked by jsdom (class names come through as undefined or the raw string). The `@dnd-kit` sortable hook used by `BudgetLineItem` must be mocked since it requires a DnD context.

---

```
File: /home/user/stashtrend/frontend/src/components/mobile/BudgetLineItem.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for BudgetLineItem — the smallest untested component (87 lines).
  Covers normal display, reorder mode, drag handle visibility, and move button behavior.
Details:
  Mock @dnd-kit/sortable: vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({
      attributes: {}, listeners: {}, setNodeRef: () => {},
      transform: null, transition: null, isDragging: false,
    }),
  }))
  Mock @dnd-kit/utilities: vi.mock('@dnd-kit/utilities', () => ({
    CSS: { Transform: { toString: () => '' } },
  }))

  Fixtures: import MOCK_BUDGET_HISTORY from '../test/fixtures.js' (for category data shape reference)

  Tests:
  - test renders category name: render with categoryName="Groceries" → "Groceries" in document
  - test renders BudgetPill with actual and budgeted: render → BudgetPill receives props (spy or query)
  - test hides drag handle when not in reorder mode: isReorderMode=false → no element containing the
    drag handle's visual content (query for data-testid="drag-handle" or the "⠿" braille dots character)
  - test shows drag handle when in reorder mode: isReorderMode=true → drag handle element is visible
    (query for data-testid="drag-handle" or the "⠿" character; do NOT rely on aria-roledescription
    which is provided by the mocked @dnd-kit/sortable attributes object)
  - test shows move button when in reorder mode: isReorderMode=true → button with aria-label containing "Move"
  - test hides move button when not in reorder mode: isReorderMode=false → no move button
  - test move button calls onMoveRequest with categoryId: click move button → onMoveRequest("cat_1") called
  - test move button aria-label includes category name: label = "Move Groceries to a different group"
  - test null actual renders without crash: actual=null → no throw, component renders
  - test isDragging applies dragging class: mock useSortable to return isDragging=true → row has dragging class
```

---

```
File: /home/user/stashtrend/frontend/src/components/mobile/MonthlySummaryView.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for MonthlySummaryView — 97 lines. Covers range dropdown, month filtering,
  expense-only totals, and empty state.
Details:
  Fixtures: import MOCK_BUDGET_HISTORY from '../../test/fixtures.js'
  Months array: MOCK_BUDGET_HISTORY.months reversed (most-recent first) = ['2025-12-01', '2025-11-01']

  Tests:
  - test renders empty state when no months: render with months=[] → "No budget data available" visible
  - test renders range dropdown with options 3, 6, 12: dropdown has 3 options
  - test default range shows 6 months: months array with 8 items, default = 6 → only 6 rows rendered
    (set up array of 8 fake months, count summary rows)
  - test changing range to 3 hides older months: change select to "3 months" → only 3 rows visible
  - test formatMonthLabel renders correctly: "2025-12-01" → "December 2025" visible in document
  - test expense categories included: MOCK_BUDGET_HISTORY categories include expense types → totals non-zero
  - test income categories excluded from totals: Paycheck category (group_type=income) → its amounts
    do NOT appear in the totals (verify by checking that total is less than income + expense combined)
  - test transfer categories excluded: add a category with group_type=transfer → it is not counted
  - test month with no data returns null row: a month in displayMonths with no matching cat data → no row rendered
  - test BudgetPill rendered for each visible month: 2 months with data → 2 BudgetPill elements present
```

---

```
File: /home/user/stashtrend/frontend/src/components/mobile/GroupAssignmentSheet.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for GroupAssignmentSheet — the largest untested component (312 lines).
  Covers open/close, radio selection, new group creation, move action, keyboard navigation,
  swipe-to-dismiss, and backdrop click.
Details:
  jsdom does not support HTMLDialogElement.showModal() natively — stub it in beforeEach:
    beforeEach(() => {
      HTMLDialogElement.prototype.showModal = vi.fn()
      HTMLDialogElement.prototype.close = vi.fn()
    })

  Default props factory:
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      categoryName: 'Groceries',
      currentGroup: 'Food & Drink',
      availableGroups: ['Food & Drink', 'Housing', 'Transport'],
      onMove: vi.fn(),
      triggerRef: null,
    }

  Tests:
  - test renders category name in title: "Move" and "Groceries" visible in heading
  - test renders all available groups as radio items: 3 groups → 3 role=radio elements
  - test current group marked with (current): "Food & Drink (current)" visible
  - test renders Create new group button: "Create new group" button visible
  - test clicking group selects it: click "Housing" radio → aria-checked=true on Housing
  - test clicking current group does not enable Move (same selection): Move button disabled when
    selectedGroup === currentGroup
  - test clicking different group enables Move button: click "Housing" → Move button enabled
  - test clicking Move calls onMove with selected group: click Housing, click Move → onMove("Housing")
  - test clicking Cancel calls onClose: click Cancel → onClose called
  - test clicking Create new group shows input: click create button → input with placeholder "Group name" appears
  - test typing in new group input and clicking Move: type "New Group", click Move → onMove("New Group")
  - test Move disabled when new group name is empty: isCreatingNew=true, input empty → Move disabled
  - test Enter in new group input triggers Move: type "New Group", press Enter → onMove called
  - test backdrop click calls onClose: simulate click on dialog element directly (e.target === dialog)
    → onClose called
  - test Escape via cancel event calls onClose and prevents default: fire 'cancel' event on dialog →
    onClose called
  - test swipe down > 80px calls onClose: locate the indicator element (div with className styles.indicator
    or aria-hidden="true" within the dialog), fire touchstart at y=100 and touchend at y=185 (delta=85)
    on that indicator element → onClose called
  - test swipe down < 80px does NOT call onClose: fire touch events on the indicator element with delta=50
    → onClose not called
  - test isOpen=false does not call showModal: render with isOpen=false → showModal not called
  - test dialog.close called when isOpen changes to false: start with isOpen=true, rerender with
    isOpen=false → dialog.close called
```

---

```
File: /home/user/stashtrend/frontend/src/components/mobile/MonthDetailView.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for MonthDetailView — 307 lines. Covers rendering, totals computation,
  reorder mode entry/exit, cross-group move, and save error display.
Details:
  Mock dependencies:
    vi.mock('./MonthDropdown.jsx', () => ({ default: ({ onSelect }) =>
      <button onClick={() => onSelect('2025-11-01')}>MonthDropdown</button> }))
    vi.mock('./BudgetGroup.jsx', () => ({ default: ({ groupName, onMoveRequest }) =>
      <div data-testid={`group-${groupName}`}>
        <button onClick={() => onMoveRequest?.('cat_1')}>MoveBtn</button>
      </div> }))
    vi.mock('./BudgetPill.jsx', () => ({ default: ({ actual, budgeted }) =>
      <span data-testid="budget-pill">{actual}/{budgeted}</span> }))
    vi.mock('./GroupAssignmentSheet.jsx', () => ({ default: ({ isOpen, onMove, onClose }) =>
      isOpen ? <div data-testid="sheet">
        <button onClick={() => onMove('Housing')}>MoveToHousing</button>
        <button onClick={onClose}>CloseSheet</button>
      </div> : null }))
    vi.mock('../../utils/budgetUtils.js', () => ({ groupExpenses: vi.fn() }))

  Import groupExpenses mock and configure in beforeEach to return a standard grouped structure.

  Default props factory uses MOCK_BUDGET_HISTORY data:
    months: ['2025-12-01', '2025-11-01']
    categories: MOCK_BUDGET_HISTORY.categories
    customGroups: {}
    selectedMonth: '2025-11-01'
    onMonthChange: vi.fn()
    isReorderMode: false
    onEnterReorder: vi.fn()
    onExitReorder: vi.fn()
    isSaving: false

  Tests:
  - test renders MonthDropdown: mock visible
  - test renders BudgetGroup for each group: groupExpenses returns 2 groups → 2 group elements
  - test renders Edit Groups button when not in reorder mode: "Edit Groups" visible
  - test clicking Edit Groups calls onEnterReorder: click → onEnterReorder called
  - test renders Done button when in reorder mode: isReorderMode=true → "Done" visible
  - test shows spinner when isSaving: isSaving=true, isReorderMode=true → spinner element visible
  - test expense totals computed: groupExpenses returns cats with actual/budgeted → totals shown in BudgetPill
  - test income totals excluded from expense totals: income category in categories → income BudgetPill
    exists separately
  - test sheet opens when onMoveRequest triggered: click MoveBtn in BudgetGroup mock → sheet visible
  - test sheet closes on handleSheetClose: open sheet, click CloseSheet → sheet gone
  - test cross-group move updates draftGroups: in reorder mode, open sheet, click MoveToHousing →
    sheet closes (setSheetOpen(false) called)
  - test handleDone calls onExitReorder with draftGroups: enter reorder mode, click Done →
    onExitReorder called with draftGroups snapshot
  - test save error shown on onExitReorder rejection: onExitReorder rejects → role=alert visible with error text
  - test no save error initially: no role=alert element on initial render
  - test entering reorder mode snapshots customGroups: customGroups={Food: [{category_id:"c1",sort_order:0}]},
    enter reorder mode → draftGroups initialized from customGroups
```

---

```
File: /home/user/stashtrend/frontend/src/pages/MobileBudgetPage.test.jsx
Lines: new file
Parallelism: independent
Description: Tests for MobileBudgetPage — 129 lines. Covers loading, error, empty, content states,
  month auto-selection, handleDone flow, and view composition.
Details:
  Mock dependencies:
    vi.mock('../api.js', () => ({ saveCustomGroups: vi.fn() }))
    vi.mock('../components/mobile/HorizontalSwipeContainer.jsx', () => ({
      default: ({ children }) => <div data-testid="swipe-container">{children}</div>
    }))
    vi.mock('../components/mobile/MonthDetailView.jsx', () => ({
      default: ({ onExitReorder, onEnterReorder, isSaving }) => (
        <div data-testid="month-detail">
          <button onClick={onEnterReorder}>EnterReorder</button>
          <button onClick={() => onExitReorder({ TestGroup: [] })}>Done</button>
          {isSaving && <span data-testid="saving">saving</span>}
        </div>
      )
    }))
    vi.mock('../components/mobile/MonthlySummaryView.jsx', () => ({
      default: () => <div data-testid="monthly-summary" />
    }))
    vi.mock('../components/mobile/HeatmapView.jsx', () => ({
      default: () => <div data-testid="heatmap-view" />
    }))

  Import saveCustomGroups mock.

  Tests:
  - test shows loading spinner when loading=true: "Loading budget data" text visible
  - test shows error state when error prop set: error="Network error" → "Error loading budget data" and
    "Network error" visible
  - test shows empty state when no budget data: budgetData=null → "No budget data found" visible
  - test shows empty state when budgetData.months is empty: budgetData={months:[], categories:[]} →
    empty state shown
  - test renders all three views when data present: MOCK_BUDGET_HISTORY passed → heatmap, month-detail,
    monthly-summary all present
  - test auto-selects most recent month: budgetData.months=['2025-11-01','2025-12-01'] →
    MonthDetailView receives selectedMonth='2025-12-01'
  - test monthsDesc is reversed: MOCK_BUDGET_HISTORY.months oldest-first → MonthDetailView months prop is newest-first
  - test handleDone calls saveCustomGroups: click Done in mock → saveCustomGroups called with { groups: {...} }
  - test handleDone calls onGroupsSaved on success: saveCustomGroups resolves → onGroupsSaved called with finalGroups
  - test handleDone sets isSaving true during save and false after: during await → saving indicator visible;
    after resolve → gone
  - test handleDone re-throws on saveCustomGroups failure: saveCustomGroups rejects → error propagates
    (MonthDetailView mock would see the rejection)
  - test handleDone sets isReorderMode false on success: after Done completes → EnterReorder button reappears
    (i.e., Done button replaced)
```

---

### Phase 4 — Allowlist Cleanup (depends on Phase 3 completion)

Once all test files from Phases 2–3 are written and `make coverage` shows per-file results, remove files from the allowlist exclusions:

```
File: /home/user/stashtrend/frontend/vite.config.js
Lines: coverage.exclude array
Parallelism: depends-on: Phase 3 frontend test files all passing
Description: Remove files from the temporary exclusion list as they reach 80%.
Details:
  - After GroupAssignmentSheet.test.jsx passes: no exclusion needed (it was never added as temporary)
  - After MonthDetailView.test.jsx passes: no exclusion needed
  - After MonthlySummaryView.test.jsx passes: no exclusion needed
  - After BudgetLineItem.test.jsx passes: no exclusion needed
  - After MobileBudgetPage.test.jsx passes: no exclusion needed
  - Permanent exclusions remain: src/main.jsx, src/nav.js, src/constants/syncEntities.js,
    src/test/**, vite.config.js, coverage/**
  - Note: If during Phase 3 implementation any file fails the perFile threshold, add it
    temporarily to the exclude list. The implementer is authorized to add temporary exclusions
    and must document them in a comment alongside the entry.
```

---

```
File: /home/user/stashtrend/backend/.coveragerc
Lines: [run] omit section
Parallelism: depends-on: Phase 2 backend test additions all passing
Description: Remove temporary omit entries as each backend file reaches 80%.
Details:
  - After Phase 2 is complete, remove routes/sync.py from omit if its coverage reaches 80%.
    If routes/sync.py remains below 80%, keep it omitted and note it as a deferred file.
  - The implementer should run `make coverage` after each Phase 2 file addition to verify
    no regression and track per-file coverage progress.
```

---

## Dependency Order

```
Phase 1 (all parallel):
  backend/requirements.txt
  backend/.coveragerc
  backend/Makefile (coverage target)
  frontend/package.json
  frontend/vite.config.js
  frontend/Makefile (coverage target)
  root Makefile (coverage target)
  .gitignore

Phase 2 (all parallel, no cross-dependencies; requires Phase 1 .coveragerc):
  backend/tests/test_ai.py (additions)
  backend/tests/test_ai_routes.py (new file)
  backend/tests/test_budget_builder.py (additions)
  backend/tests/test_networth_by_type.py (additions)
  backend/tests/test_retirement.py (additions)
  backend/tests/test_db.py (new file)

Phase 3 (all parallel, no cross-dependencies; requires Phase 1 vite.config.js):
  frontend/src/components/mobile/BudgetLineItem.test.jsx
  frontend/src/components/mobile/MonthlySummaryView.test.jsx
  frontend/src/components/mobile/GroupAssignmentSheet.test.jsx
  frontend/src/components/mobile/MonthDetailView.test.jsx
  frontend/src/pages/MobileBudgetPage.test.jsx

Phase 4 (depends-on Phase 2 + Phase 3 all passing):
  frontend/vite.config.js cleanup
  backend/.coveragerc cleanup
```

---

## Test Strategy

### Backend

**Happy path coverage (already exists — do not break):**
- `test_budgets.py`: 12 tests covering budget history shape, sorting, filtering
- `test_budget_builder.py`: profile CRUD, regional CRUD, generate, plans CRUD, apply
- `test_networth_by_type.py`: bucket mapping, CAGR, endpoint integration
- `test_retirement.py`: GET/POST round-trips, milestone validation
- `test_ai.py`: config CRUD, analyze endpoint

**New edge cases to cover:**

| File | Gap | New Tests |
|---|---|---|
| `ai.py` | `_extract_json` fences, filter, `_check_ai_rate_limit` cooldown, `_call_ai` provider paths | 12 new tests in test_ai.py |
| `routes/ai_routes.py` | rate-limit 429 at HTTP level, exception→500 path | 2 new tests in test_ai_routes.py |
| `routes/budget_builder.py` | `_build_budget_prompt` helper branches (SQL-executing, requires make_test_db), `_save_budget_plan` | 13 new tests in test_budget_builder.py |
| `routes/networth.py` | `_compute_bucket_cagr` unit tests (empty, leap day, zero-bal), stats/history/accounts empty DB, mixed-None edge case | 16 new tests in test_networth_by_type.py |
| `routes/retirement.py` | numeric field upper bounds, string type check, DB exception→500 | 9 new tests in test_retirement.py |
| `db.py` | get_setting, set_setting, context manager, schema idempotency | 10 new tests in test_db.py |

**Total new backend tests: 62** (across 6 files; custom-groups tests are NOT included here — they already exist in test_custom_groups.py)

**Tests that may break from Phase 1 tooling changes only:** None. `requirements.txt` only adds a new package; no existing test imports change.

**Tests that could flake:**
- Rate-limit tests in `test_ai.py` and `test_ai_routes.py` rely on `_ai_cooldowns.clear()` in setUp. If test isolation is missed, the second-call test may fail intermittently. Each test class that uses cooldowns must call `app_module._ai_cooldowns.clear()` in setUp.

### Frontend

**New test files (5):**

| File | Lines | Key test areas |
|---|---|---|
| `BudgetLineItem.test.jsx` | ~60 lines | dnd-kit mock, reorder mode, move button |
| `MonthlySummaryView.test.jsx` | ~70 lines | range filter, expense-only totals, empty state |
| `GroupAssignmentSheet.test.jsx` | ~120 lines | dialog mock, radio group, new-group flow, swipe (on indicator element), keyboard |
| `MonthDetailView.test.jsx` | ~140 lines | groupExpenses mock, reorder lifecycle, move sheet, error |
| `MobileBudgetPage.test.jsx` | ~100 lines | loading/error/empty/content states, handleDone |

**Key mocking decisions:**
- `HTMLDialogElement.prototype.showModal` and `.close` must be stubbed in `GroupAssignmentSheet.test.jsx` because jsdom does not implement them.
- `@dnd-kit/sortable` and `@dnd-kit/utilities` must be mocked in `BudgetLineItem.test.jsx`.
- `groupExpenses` from `budgetUtils.js` is mocked in `MonthDetailView.test.jsx` so the test is isolated from that utility's logic.
- CSS modules are auto-handled by jsdom (class names pass through as undefined strings but do not throw).
- Swipe tests in `GroupAssignmentSheet.test.jsx` must target the `.indicator` div (div with className styles.indicator or aria-hidden="true" within the dialog), not the dialog root element.

**Existing tests at risk:** None — all 5 new files are for components that have zero existing tests. No existing test file is modified. The only risk is if the new vite.config.js `coverage` block causes an import error (it should not since coverage is only active when `--coverage` flag is passed).

**Edge cases required in frontend tests:**
- `null` / `undefined` `actual` and `budgeted` in `BudgetLineItem` (renders without crash)
- Empty months array in `MonthlySummaryView` (empty state branch)
- `onExitReorder` rejection in `MonthDetailView` (error alert branch)
- `budgetData = null` vs `budgetData.months = []` in `MobileBudgetPage` (two different empty branches)
- `saveCustomGroups` rejection in `MobileBudgetPage` (re-throw path)
- Swipe delta exactly 80 (boundary: not dismissed) vs 81 (dismissed) in `GroupAssignmentSheet`

---

## Rollback Notes

- **Phase 1 (tooling):** All changes are additive. Rollback = revert the `coverage` target additions to Makefiles, remove `@vitest/coverage-v8` from package.json, remove the `coverage` block from vite.config.js, delete `.coveragerc`, remove `pytest-cov` from requirements.txt. No production code was touched.
- **Phase 2 (backend tests):** Pure test additions. Rollback = `git revert` the individual commits to each test file. Existing tests are unaffected.
- **Phase 3 (frontend tests):** Pure new files. Rollback = delete the 5 new `.test.jsx` files.
- **Phase 4 (allowlist cleanup):** Rollback = re-add the removed exclusions. The threshold is the only enforcement mechanism — no structural changes made.
- **Data migration:** Not applicable (no schema changes).
- **Dependency conflict risk:** Adding `@vitest/coverage-v8@^2.0.0` must match the installed `vitest@^2.0.0`. The major version is pinned to 2.x on both. If there is a conflict, pin to exact matching versions (e.g., `"@vitest/coverage-v8": "2.0.5"`).
