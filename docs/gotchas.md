# Known Gotchas & Pitfalls — Stashtrend

## Backend

### conn.close() Omission Pattern (Partially resolved)
`get_db_connection()` context manager added to auto-close connections. Endpoints that use `get_db()` directly (budget-related, AI, budget-builder) still intentionally omit `conn.close()` because tests share a single in-memory connection across multiple `patch` blocks. Migration to `get_db_connection()` is incremental — endpoints need `get_db()` when tests mock the return value. The context manager is for new code and non-test-mocked endpoints. Exception: `ai_analyze()` uses `try/finally: conn.close()` because it was refactored to use `_call_ai()` and the connection must stay open through the AI call but close on all exit paths.

### Python 3.14: asyncio.get_event_loop() Removed
`asyncio.get_event_loop()` raises `RuntimeError` in Python 3.14 when no loop exists. Use `asyncio.run(coro)` in tests instead. Affects any test that calls async functions (e.g., `fetch_holdings`).

### Fresh Install 500 (Fixed)
`init_dashboard_schema()` now calls `pipeline_schema.init_db()` first.
Any new endpoint querying pipeline tables is safe — but don't break this init order.
See `docs/architecture.md` → DDL Init Order.

## Frontend Testing

### App.test.jsx Async Pattern
`configured` state is async; use `await screen.findBy*` (not `getBy*`) for content behind the setup gate.

### getByText Ambiguity
Use `getByRole('button', { name: /.../ })` when text appears in multiple elements.

### Integration Test Multi-Element Matches
In integration tests (real child components, no mocks), group/entity names like "Liquid Cash" appear in multiple children (e.g. snapshot controls AND manager cards). Use `getAllByText()` with `.length` assertions instead of `getByText()`, or query by a child-specific element (e.g. `getByText(/2 accts/)` to confirm GroupsSnapshot rendered).

### aria-label Sibling Ambiguity
When action buttons (rename, delete) are added alongside a named element, their `aria-label` values inherit the parent name — e.g. `aria-label="Rename Net Worth View"` and `aria-label="Delete Net Worth View"` both match `/Net Worth View/`. Existing tests using partial-name regexes break with "Found multiple elements". Fix: switch those tests to `getByTestId` or an exact-match regex (`/^Net Worth View$/`).

### Password Inputs
`type="password"` inputs have no accessible role `textbox`; use `getByLabelText(...)` to query them in tests.

### Split Text Nodes
JSX conditionals render separate text nodes; use a custom `el.textContent` function matcher instead of `getByText`.

---

## Bug Patterns

### null-as-All-Selected Bypasses Constraints
**Where:** `GroupsPage.jsx` — `selectedGroupIds` initialized as `null` meaning "show all."
**Symptom:** Conflicting groups both appeared in the chart on load. On the first chip click, `null` expanded into a `new Set(groups.map(g => g.id))` — including conflict pairs — then both conflicting chips became disabled (deadlock).
**Root cause:** `null` bypasses all constraint logic at render time and at the moment of first interaction.
**Fix:** Use `new Set()` (empty) as the initial state. The user selects explicitly; the chart starts empty.
**Rule:** Never use `null` to mean "all items selected" when the selection has constraints (conflicts, exclusions, limits). Use an explicit empty Set and let the user build their selection under the same rules as every subsequent interaction.

### isBlocked Deadlocking Already-Selected Items
**Where:** `GroupSnapshotControls.jsx` — `isBlocked()` returned `true` for a chip that was already in `selectedGroupIds`.
**Symptom:** If two mutually conflicting groups were both selected, both chips became permanently disabled — neither could be deselected.
**Root cause:** The conflict check ran before checking whether the chip was already selected, so a selected group could block itself (via its conflict partner also being selected).
**Fix:** Add `if (selectedGroupIds.has(groupId)) return false` as the first line — a selected item is never blocked.
**Rule:** A "block/disable" predicate must never prevent the user from undoing an action they already took. Check "is this already active?" before checking any external constraints.

### Diagnosing Conflict Reports — Check Data Before Changing Logic
**Where:** `conflictMap` computation in `GroupsPage.jsx`.
**Symptom:** User reported HSA group blocking Cash and Cash + Brokerage groups despite no intentional account overlap.
**Root cause:** After full code analysis (backend API, SQL queries, frontend computation), the conflict detection logic was confirmed correct. The actual cause was data — the user's groups shared an account in `account_group_members` that they didn't realize was duplicated.
**Rule:** Before modifying conflict/validation logic in response to a "false positive" report, verify the logic is actually wrong by inspecting the underlying data. The fix was a UX improvement (named tooltip), not a logic change.

### group_type vs category_type — Use group_type
**Where:** `BudgetPage.jsx` — filtering categories to sum income actuals.
**Symptom:** `incomeTotalsByMonth` was `null`; Income bar never rendered; tests caught it immediately.
**Root cause:** Filtered on `cat.category_type === 'income'` — field doesn't exist. The API returns `cat.group_type` (`'income'`, `'expense'`, `'transfer'`).
**Fix:** `cat.group_type === 'income'`
**Rule:** Category classification field is always `group_type`, not `category_type`. Tests against fixture data will catch this instantly since fixtures also use `group_type`.

### Global Error Handler Must Exclude HTTPException
**Where:** `@app.errorhandler(Exception)` in `app.py`
**Symptom:** Flask's built-in 400 Bad Request (e.g., malformed JSON body) gets swallowed and returns generic 500 instead.
**Root cause:** `@app.errorhandler(Exception)` catches ALL exceptions including `werkzeug.exceptions.HTTPException`. Flask uses HTTP exceptions for normal flow (400, 404, 405, etc.).
**Fix:** Re-raise `HTTPException` subclasses: `if isinstance(exc, HTTPException): return exc`
**Rule:** Global error handlers must always pass through `HTTPException` to preserve Flask's default HTTP status code behavior.

### AI Key in Docker — Never Delete from Settings Table
**Where:** `save_ai_config()` in `app.py`
**Symptom:** If you delete the AI key from the settings table after saving to keychain, Docker users (no keyring backend) lose their AI config permanently.
**Root cause:** Docker containers have no keyring backend. The SQLite settings table is the only storage available.
**Fix:** `save_ai_config()` tries keychain first, falls back to settings table on `KeyringError`. Never deletes existing key from settings table.
**Rule:** Always keep the settings table fallback for Docker compatibility.

### Catch KeyringError Base Class, Not Just NoKeyringError
**Where:** `auth.load_ai_key()` and `save_ai_config()` in `app.py`
**Symptom:** On systems with locked keychains, `keyring.errors.KeyringLocked` (not `NoKeyringError`) is raised, crashing the request.
**Root cause:** Different keyring backends raise different error subclasses. Only catching `NoKeyringError` misses locked/unavailable keychains.
**Fix:** Catch `keyring.errors.KeyringError` (base class) in both `load_ai_key()` and the `save_ai_config()` fallback.
**Rule:** Always catch the base `KeyringError`, not specific subclasses, for keyring fallback logic.

### profile_overrides Bypass — Sanitize at Prompt Time
**Where:** `generate_budget_plan()` accepts `profile_overrides` in request body.
**Symptom:** Malicious input could bypass `save_builder_profile` validation by passing directly via `profile_overrides`.
**Fix:** Apply `_sanitize_prompt_field()` at prompt construction time, not at save time. Both saved profile fields and overrides get sanitized.
**Rule:** Input sanitization for AI prompts must happen at the point of prompt construction, not at the point of data storage.

### desloppify False Positives for JSX Imports
**Where:** `desloppify scan` on `frontend/` directory.
**Symptom:** ~237 findings across `unused`, `orphaned`, and `test_coverage` detectors flagging JSX components as unused/untested.
**Root cause:** desloppify's import resolver doesn't track JSX imports (e.g. `<GroupsTimeChart />` isn't seen as a reference to `GroupsTimeChart.jsx`).
**Fix:** Resolve as false positives with `desloppify resolve false_positive "pattern" --attest "I have actually verified ... not gaming"`. These reopen on every rescan and must be re-resolved.

### StatsCards Hero Value — Show Delta, Not Repeated Net Worth
**Where:** `StatsCards.jsx` — MoM and YoY cards.
**Symptom:** All three cards showed the same `$500,000` net worth as the hero value, making the MoM/YoY cards redundant.
**Fix:** When a card has a `change` value, display the delta as the hero (e.g., `+$5,000`) instead of the current net worth. Percentage and sublabel remain below.
**Rule:** Comparison cards should lead with the comparison metric (the delta), not repeat the base value. The base value belongs on a single "current state" card.

### Generic Conflict Messages Create Investigation Overhead
**Where:** `GroupSnapshotControls.jsx` chip `title` attribute.
**Symptom:** Tooltip said "Shares an account with a selected group" — user couldn't tell which group conflicted with which, making group definition problems impossible to self-diagnose.
**Fix:** Changed to `"Shares accounts with: ${names.join(', ')}"` using a `conflictingNames()` helper that looks up the names of whichever selected groups the blocked chip conflicts with.
**Rule:** Conflict/error messages that reference specific data (groups, accounts, users) must name that data. "Something conflicts with something" sends the user on a blind investigation; "X conflicts with Y" lets them fix it immediately.
