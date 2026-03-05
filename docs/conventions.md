# Active Conventions — Stashtrend

## Data Boundaries
- **snake_case/camelCase:** backend always snake_case; frontend destructures with alias
  - e.g. `const { groups_meta: groupsMeta } = data`
- **Upsert pattern:** `ON CONFLICT(key) DO UPDATE SET value = excluded.value`
- **Singleton tables:** Use `CHECK (id = 1)` for single-row config tables (e.g. `budget_builder_profile`, `budget_builder_regional`, `retirement_settings`). Upsert with `INSERT ... ON CONFLICT(id) DO UPDATE SET ...`.
- **JSON text columns:** Store structured data (e.g. milestones) as JSON text. Deserialize with `json.loads()` on GET, serialize with `json.dumps()` on POST. Always handle `None`/empty → `[]` on read.
- **Null-safe math functions:** Functions like `computeNestEgg()` return `null` for invalid inputs (e.g. division by zero when withdrawalRate ≤ 0) rather than throwing. Callers render "—" for null results.

## Design System — Dark Cobalt

**Palette:** Dark navy backgrounds with cobalt blue (`#4D9FFF`) as the primary accent. Full color doc: `stashtrend-colors.html` (in Content dir).

**Logo:** SVG bar chart with trend arrow + "STASHTREND" wordmark. Source: `frontend/src/assets/stashtrend-logo.svg`. Rendered as `<img>` in `App.jsx` and `SetupPage.jsx`.

**Typography weight system (PR1):**
- 400: values, headlines, form labels, data amounts
- 500: section titles, table headers, card titles
- 600: buttons, badges, status indicators only

**Button standard (PR2):** All primary buttons use `color: var(--bg-root)` (dark text on cobalt), `text-transform: uppercase`, `letter-spacing: 1.5px`. Toggle buttons (`.rangeBtnActive`, `.saveConfirm`) get only the color change, not uppercase/letter-spacing.

**Input focus standard (PR2):** `border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); outline: none;` with `@media (forced-colors: active) { outline: 2px solid; }` fallback. Exceptions: inline-edit inputs (`.cellInput`, `.saveInput`) use border-color only, no box-shadow.

**Input styling:** `background: var(--bg-card)`, `border-radius: var(--radius-md)`, `padding: 11px 14px` for standard inputs. Compact inline inputs keep original padding.

**Form labels:** `9px / weight 400 / uppercase / letter-spacing 2px / var(--text-muted)` eyebrow style.

All colors in CSS module files MUST use CSS custom properties defined in `index.css`. Never use hardcoded hex values. The token system includes:

- **Backgrounds:** `--bg-root` (#0A0F1E), `--bg-card` (#1C2333), `--bg-deep`, `--bg-sunken`, `--bg-hover`, `--bg-inset`, `--bg-raised` (#1E2D4A), `--bg-surface` (#111827), `--bg-table-active`, `--bg-glass` (rgba --bg-root at 90% for frosted glass), `--bg-frosted` (alias for frosted glass backgrounds)
- **Borders:** `--border` (#1E2D4A), `--border-sub`, `--border-mid`, `--border-focus` (#4D9FFF), `--border-error`
- **Text:** `--text-primary` (#F0F6FF), `--text-secondary` (#8BA8CC), `--text-muted` (#4A6080), `--text-faint` (#2B4060), `--text-bright`, `--text-subtle`
- **Accent:** `--accent` (#4D9FFF), `--accent-hover`/`--accent-600` (#2B7FE0), `--accent-light`/`--accent-300` (#7DBFFF), `--accent-wash`/`--accent-200` (#99CCFF), `--accent-glow`
- **Semantic:** `--color-positive`/`--green` (#2ECC8A), `--color-negative`/`--red` (#FF5A7A), `--color-warning`/`--amber` (#F5A623), `--white`
- **Surfaces:** `--bg-error`, `--bg-error-subtle`
- **Spacing:** `--sp-1` through `--sp-12` (4px increments)
- **Radius:** `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px)
- **Shadows:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Transitions:** `--ease-quick` (150ms), `--ease-default` (200ms), `--ease-smooth` (300ms)
- **Radius (new):** `--radius-btn-lg` (10px), `--radius-feature` (14px), `--radius-pill` (9999px)
- **Accent scale aliases:** `--accent-200` (→accent-wash), `--accent-300` (→accent-light), `--accent-600` (→accent-hover)
- **Accent tint:** `--accent-tint` (rgba(77,159,255,0.12))
- **Accent border hover:** `--accent-border-hover` (rgba(77,159,255,0.25)) — card hover glow

**Recharts hardcoded hex:** Charts use raw hex because SVG attrs don't support CSS vars. Constants in `chartUtils.jsx`: `COLOR_ACCENT` (#4D9FFF), `COLOR_POSITIVE` (#2ECC8A), `COLOR_NEGATIVE` (#FF5A7A), `COLOR_AMBER` (#F5A623), `AXIS_TICK` (`{ fill: '#4A6080', fontSize: 11 }`), `GRID_STROKE` (#1E2D4A), `TOOLTIP_STYLE` bg (#1C2333). Backend `BUCKET_COLORS` in `app.py` must stay in sync. All chart axis ticks must use `AXIS_TICK` (not hardcoded `#94a3b8`) — `BudgetChart` corrected in PR3.

**Custom Recharts tick renderers:** When per-tick styling is needed (e.g. highlighting current month in cobalt), use a custom `tick={<ComponentFn />}` prop instead of `tickFormatter`. The component receives `{ x, y, payload }` and returns SVG `<text>`. Drop `tickFormatter` when using a custom tick component — the component handles both formatting and coloring. See `MonthTick` in `BudgetChart.jsx` as the reference implementation.

**Frosted glass backgrounds (PR3):** Apply backdrop blur with `backdrop-filter: blur(16px)` on elements with `background: var(--bg-frosted)`. Use for floating headers or layered UI that sits atop content. Example: `App.module.css` `.header`.

**AI pulse dot animation (PR3):** Add animated indicator dots to AI panels. Use `@keyframes pulse` (0%: opacity 1, 50%: opacity 0.5, 100%: opacity 1) with 2s duration. Apply via `::before` pseudo-element on the flex container: `content: ''`, `width/height: 8px`, `border-radius: 50%`, `background: var(--accent-tint)`, `box-shadow: 0 0 4px var(--accent)`. Example: `AIAnalysisPanel.module.css` `.header::before`.

**Cobalt glow pseudo-elements (PR3):** Create depth/emphasis with subtle radial gradient glows. Pattern: `::before` pseudo-element with `position: absolute`, `z-index: -1` (stays behind children), `width/height: 100%` (full parent), `border-radius: inherit`, `background: radial-gradient(ellipse at center, var(--accent-tint) 0%, transparent 70%)`. Parent must have `position: relative` and children need `z-index: 1`. Example: `NetWorthPage.module.css` `.hero::before` and `SetupPage.module.css` `.loginCard::before`.

## Frontend
- **Named API exports:** All API calls go through named exports in `api.js` (e.g. `fetchGroups()`, `saveGroupsConfigs()`). Pages must never use raw `fetchJSON`/`postJSON` with URL strings — those are internal helpers.
- **Shared formatters in chartUtils.jsx:** Dollar/date/percent formatters (`fmtDollar`, `fmtCompact`, `fmtFull`, `fmtPct`, `fmtBudgetMonth`, etc.) live in `chartUtils.jsx`. Don't duplicate formatting logic in component files.
- **PropTypes:** All components receiving props should have PropTypes validation.
- **Navigation items:** All nav items defined in `src/nav.js` (`NAV_ITEMS` array). Sidebar and BottomTabBar both consume this. To add/remove/reorder pages, edit `nav.js` and add a `<Route>` in `App.jsx`.
- **App.jsx is a thin shell:** Setup gate + header + `<AppShell>` (routes) + `<BottomTabBar>`. Page-specific state lives in page components, not App. `AppShell` inner component uses `useLocation` for focus management.
- **Router wrapping:** `BrowserRouter` lives in `main.jsx`. Tests use `MemoryRouter` with `initialEntries`. Component tests wrap only the component under test, not `<App>`.
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
