# Active Conventions — Stashtrend

## Data Boundaries
- **snake_case/camelCase:** backend always snake_case; frontend destructures with alias
  - e.g. `const { groups_meta: groupsMeta } = data`
- **Upsert pattern:** `ON CONFLICT(key) DO UPDATE SET value = excluded.value`
- **Singleton tables:** Use `CHECK (id = 1)` for single-row config tables (e.g. `budget_builder_profile`, `budget_builder_regional`). Upsert with `INSERT ... ON CONFLICT(id) DO UPDATE SET ...`.

## Design Tokens

All colors in CSS module files MUST use CSS custom properties defined in `index.css`. Never use hardcoded hex values. The token system includes:

- **Backgrounds:** `--bg-root`, `--bg-card`, `--bg-deep`, `--bg-sunken`, `--bg-hover`, `--bg-inset`, `--bg-raised`, `--bg-table-alt`
- **Borders:** `--border`, `--border-sub`, `--border-mid`, `--border-focus`, `--border-error`
- **Text:** `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`, `--text-bright`, `--text-subtle`
- **Accent:** `--accent`, `--accent-hover`, `--accent-light`, `--accent-wash`, `--accent-glow`
- **Semantic:** `--color-positive`/`--green`, `--color-negative`/`--red`, `--color-warning`/`--amber`, `--white`
- **Surfaces:** `--bg-error`, `--bg-error-subtle`
- **Spacing:** `--sp-1` through `--sp-12` (4px increments)
- **Radius:** `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px)
- **Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Transitions:** `--ease-default` (150ms), `--ease-slow` (300ms)

## Frontend
- **Named API exports:** All API calls go through named exports in `api.js` (e.g. `fetchGroups()`, `saveGroupsConfigs()`). Pages must never use raw `fetchJSON`/`postJSON` with URL strings — those are internal helpers.
- **Shared formatters in chartUtils.jsx:** Dollar/date formatters (`fmtDollar`, `fmtCompact`, `fmtFull`, `fmtBudgetMonth`, etc.) live in `chartUtils.jsx`. Don't duplicate formatting logic in component files.
- **PropTypes:** All components receiving props should have PropTypes validation.
- **Inline styles:** kept only for data-driven values (group colors, status badges, active/selected states, recharts tooltips, progress bar widths)
- **Progress bars in BudgetTable:** `CellValue` renders an absolutely-positioned bar `<div>` behind the text `<span>` for expense cells with `budgeted > 0 && actual > 0`. Three color zones: green (0–84%), amber (85–100%), red (>100%). `WARNING_THRESHOLD = 0.85` constant. ARIA `role="progressbar"` with `aria-valuenow` capped at 100. Use `color-mix()` for translucent bar backgrounds.
- **Recharts tooltips:** always `const tooltipStyles = {...}` at module level — recharts renders outside React tree, CSS Modules can't reach them

## Budget & Transfers
- **Category classification field:** always `group_type` (`'income'`, `'expense'`, `'transfer'`). The field `category_type` does not exist.
- **Transfer filtering:** Monarch transfers have `group_type = 'transfer'` in `categories` table. Budget queries must always include:
  ```sql
  AND (c.group_type IS NULL OR c.group_type <> 'transfer')
  ```
  Transfers are neutral (not expenses/income) — including them double-counts money movement.
- **Budget table layout:** Income section (categories + Total Income row) → Expenses section (categories grouped by group_name + Total Expenses row) → Net row (income − expenses). Bar chart uses expense-only `totals_by_month`.

## Testing
- **Backend test runner:** `./run_tests.sh` from `backend/` (auto-creates venv, installs deps, runs pytest)
- **Frontend test runner:** `./run_tests.sh` from `frontend/` (checks node_modules freshness, runs vitest)
- **Shared test DDL:** All backend tests use `test_helpers.make_test_db()` which imports canonical DDL from `pipeline/monarch_pipeline/schema.py` and `app.py DASHBOARD_DDL`. Never duplicate DDL in test files.
- **Recharts height testing:** to assert a numeric prop (e.g. `height`) on a mocked recharts component, the mock must be an explicit factory that renders it as an HTML attribute — e.g. `ResponsiveContainer: ({ height, children }) => <div data-height={String(height)}>{children}</div>`. An auto-mock (`vi.mock('recharts')` with no factory) returns `undefined` for all props and makes height untestable.
- **API endpoint contract tests:** Use `it.each()` in `api.test.js` to parametrize URL/method assertions across all wrapper functions. GET wrappers check URL only; mutating wrappers check URL + method.
- **Integration tests:** Create `*.integration.test.jsx` files that render real child components (no mocks) to verify parent→child data flow. Only mock recharts and `useResponsive`. Use `getAllByText` when names appear in multiple children.
- **Fake timer coupling:** Use `vi.advanceTimersToNextTimer()` instead of `vi.advanceTimersByTime(N)` to avoid coupling tests to implementation-detail interval values.

## Security
- **Error messages:** Never expose `str(exc)` to clients. Use generic messages + `app.logger.exception()`. The global `@app.errorhandler(Exception)` catches anything that slips through.
- **AI rate limiting:** Per-endpoint cooldowns via `_check_ai_rate_limit(endpoint)` with `_ai_cooldowns_lock` (`threading.Lock`) — add at the top of any new AI endpoint.
- **Prompt sanitization:** Always use `_sanitize_prompt_field(value, max_length)` on user-supplied fields at prompt construction time, NOT at save time (profile_overrides can bypass save validation).
- **AI key storage:** Use `_get_ai_key(conn)` to read (keychain → DB fallback). Never delete key from settings table — Docker has no keyring. Catch `keyring.errors.KeyringError` (base class), not just `NoKeyringError` — covers locked keychains too.
- **CORS:** Explicit localhost-only origins list. Add new origins only if needed (e.g., new dev port).

## Distribution & Docker
- **Self-hosted:** Docker Compose — each user runs locally, no data leaves their machine
- **Dockerfile.backend:** Filters `-e ../pipeline` from requirements.txt via grep — path doesn't resolve in Docker; pipeline installed as non-editable `pip install ./pipeline`
