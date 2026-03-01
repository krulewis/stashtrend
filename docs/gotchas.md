# Known Gotchas & Pitfalls — Stashtrend

## Backend

### conn.close() Omission Pattern
`GET /api/budgets/history` and `GET+POST /api/ai/config` intentionally omit `conn.close()`.
Tests for these endpoints share a single in-memory connection across multiple requests (within one `patch` block or across sibling `with patch(...)` blocks). Calling `conn.close()` after the first request kills the shared connection and breaks subsequent calls. The connection is GC'd normally.

### Fresh Install 500 (Fixed)
`init_dashboard_schema()` now calls `pipeline_schema.init_db()` first.
Any new endpoint querying pipeline tables is safe — but don't break this init order.
See `docs/architecture.md` → DDL Init Order.

## Frontend Testing

### App.test.jsx Async Pattern
`configured` state is async; use `await screen.findBy*` (not `getBy*`) for content behind the setup gate.

### getByText Ambiguity
Use `getByRole('button', { name: /.../ })` when text appears in multiple elements.

### Password Inputs
`type="password"` inputs have no accessible role `textbox`; use `getByLabelText(...)` to query them in tests.

### Split Text Nodes
JSX conditionals render separate text nodes; use a custom `el.textContent` function matcher instead of `getByText`.

## Tools

### Write Tool Requirement
Must `Read` a file in the same message batch immediately before `Write`; a token read (`offset:1, limit:1`) satisfies the requirement.

---

## Bug Patterns

Design mistakes introduced during AI-generated implementation. Captured so the pattern isn't repeated.

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

### Generic Conflict Messages Create Investigation Overhead
**Where:** `GroupSnapshotControls.jsx` chip `title` attribute.
**Symptom:** Tooltip said "Shares an account with a selected group" — user couldn't tell which group conflicted with which, making group definition problems impossible to self-diagnose.
**Fix:** Changed to `"Shares accounts with: ${names.join(', ')}"` using a `conflictingNames()` helper that looks up the names of whichever selected groups the blocked chip conflicts with.
**Rule:** Conflict/error messages that reference specific data (groups, accounts, users) must name that data. "Something conflicts with something" sends the user on a blind investigation; "X conflicts with Y" lets them fix it immediately.
