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

- **Backgrounds:** `--bg-root` (#0A0F1E), `--bg-card` (#1C2333), `--bg-deep`, `--bg-sunken`, `--bg-hover`, `--bg-inset`, `--bg-raised` (#1E2D4A), `--bg-surface` (#111827), `--bg-table-active`, `--bg-glass` (rgba --bg-root at 90% for frosted glass), `--bg-frosted` (rgba --bg-root at 85% for frosted header glass)
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

**AI pulse dot animation (PR3):** Add animated indicator dots to AI panels. Use `@keyframes aiPulse` (0%/100%: opacity 1, 50%: opacity 0.35) with 2s ease-in-out. Apply via `::before` pseudo-element on the flex container: `content: ''`, `width/height: 6px`, `border-radius: 50%`, `background: var(--accent)`, `flex-shrink: 0`. Example: `AIAnalysisPanel.module.css` `.badges::before`.

**Cobalt glow pseudo-elements (PR3):** Create depth/emphasis with subtle radial gradient glows. Pattern: `::before` pseudo-element with `position: absolute`, `z-index: 0`, `pointer-events: none`, `background: radial-gradient(ellipse at center, var(--accent-tint) 0%, transparent 70%)`. Parent must have `position: relative`; children need `position: relative; z-index: 1` to stack above the glow. Sizing varies by context: use `inset` with negative offsets for bleed-out glows (NetWorthPage `.pageHeader::before`), or explicit pixel dimensions for full-page ambient glows (SetupPage `.root::before`).

## Frontend
- **Named API exports:** All API calls go through named exports in `api.js` (e.g. `fetchGroups()`, `saveGroupsConfigs()`). Pages must never use raw `fetchJSON`/`postJSON` with URL strings — those are internal helpers.
- **isMobile guard in useEffect (not in deps):** When a `useEffect` should skip on mobile, put `if (isMobile) return` inside the effect body and keep `isMobile` OUT of the deps array. Adding `isMobile` to deps would re-run (and re-fetch) on every window resize that crosses the 768px breakpoint. Suppress the `react-hooks/exhaustive-deps` lint warning with `// eslint-disable-next-line react-hooks/exhaustive-deps` and a comment explaining the intentional exclusion. Pattern used in `BudgetPage.jsx`.
- **Mobile data lift to parent page:** When a page has both desktop and mobile views, lift all data fetching to the parent page component. The mobile view component receives `budgetData`, `loading`, `error` as props and does NOT fetch independently. Separate `useEffect` per path (desktop `useEffect([months])`, mobile `useEffect([isMobile])` with `Promise.all`). Mobile component only calls mutating API functions (e.g. `saveCustomGroups`) — reads come from props.
- **Shared formatters in chartUtils.jsx:** Dollar/date/percent formatters (`fmtDollar`, `fmtCompact`, `fmtFull`, `fmtPct`, `fmtBudgetMonth`, etc.) live in `chartUtils.jsx`. Don't duplicate formatting logic in component files.
- **PropTypes:** All components receiving props should have PropTypes validation.
- **Navigation items:** All nav items defined in `src/nav.js` (`NAV_ITEMS` array). Sidebar and BottomTabBar both consume this. To add/remove/reorder pages, edit `nav.js` and add a `<Route>` in `App.jsx`.
- **App.jsx is a thin shell:** Setup gate + header + `<AppShell>` (routes) + `<BottomTabBar>`. Page-specific state lives in page components, not App. `AppShell` inner component uses `useLocation` for focus management.
- **Router wrapping:** `BrowserRouter` lives in `main.jsx`. Tests use `MemoryRouter` with `initialEntries`. Component tests wrap only the component under test, not `<App>`.
- **Inline styles:** kept only for data-driven values (group colors, status badges, active/selected states, recharts tooltips, progress bar widths)
- **Progress bars in BudgetTable:** `CellValue` renders an absolutely-positioned bar `<div>` behind the text `<span>` for expense cells with `budgeted > 0 && actual > 0`. Three color zones: green (0–84%), amber (85–100%), red (>100%). `WARNING_THRESHOLD = 0.85` is imported from `utils/budgetUtils.js` (not defined locally). ARIA `role="progressbar"` with `aria-valuenow` capped at 100. Use `color-mix()` for translucent bar backgrounds.
- **Budget domain utilities:** `frontend/src/utils/budgetUtils.js` is the single source of truth for budget calculation constants and helpers: `WARNING_THRESHOLD`, `getBudgetZone(actual, budgeted)` → `'safe'|'warning'|'over'|'no-budget'|'no-data'`, `getPillAriaLabel(actual, budgeted, zone)` → accessible string, `groupExpenses(categories, customGroups)` → sorted group array with full `months` objects preserved, `formatMonthLabel(monthKey)` → `"Sep '25"` format (short month + apostrophe + 2-digit year), `formatGroupLabel(name, maxLen = 14)` → word-boundary–truncated label with `GROUP_SHORT_MAP` for known long Monarch names (e.g. `'Auto & Transportation'` → `'Auto & Transit'`); null/undefined/empty → `"Other"`; single long word → hard-truncate with `…`. All budget components (table, pill, heatmap, etc.) import from here — do not redefine these in component files or in `chartUtils.jsx`.
- **`groupExpenses()` contract:** Returns `[{ groupName, categories: [{ category_id, category_name, effectiveGroup, sort_order, months }] }]`. Filters out `group_type === 'income'` and `'transfer'`. Resolves `effectiveGroup` via customGroups lookup, falling back to `group_name ?? 'Other'`. Groups sorted by minimum `sort_order` ascending, then alphabetical groupName as tiebreaker (deterministic even when all `Infinity`). Categories within groups sorted by `sort_order` then `category_name`. Preserves the full `months` object — callers extract the specific month they need.
- **`formatMonthLabel()` timezone safety:** Always appends `'T00:00:00'` before `new Date()` to prevent UTC timezone rollback (bare `new Date('2026-01-01')` can return Dec 31 in negative UTC-offset environments). Use this function anywhere month keys need display formatting — do not inline `new Date(key).toLocaleDateString()`. Output format: `"Sep '25"` (short month + straight apostrophe + 2-digit year).
- **WindowPicker prop interface:** `WindowPicker` uses `{ months, windowStart, windowSize, onWindowStartChange }`. It is a combobox-pattern component (ARIA `role="combobox"` trigger + `role="listbox"` panel). Old arrow-nav props (`displayMonths`, `canGoOlder`, `canGoNewer`, `onGoOlder`, `onGoNewer`, `hidden`) are removed. `months` must be sorted most-recent-first. `LISTBOX_ID = 'heatmap-window-listbox'` — distinct from MonthDropdown's `'month-listbox'`. Selecting a month makes it the OLDEST visible month: `newStart = Math.max(0, idx - (windowSize - 1))`. `aria-selected` marks `months[windowStart + windowSize - 1]` (the actual oldest in the window), not `months[windowStart]`. `aria-label` uses a template literal from `windowSize` — never hardcode the column count in ARIA strings.
- **HeatmapView WINDOW_SIZE:** Currently `5`. Grid CSS uses `repeat(5, 1fr)` with a `140px` label column. The `aria-label` on the grid element reads from `WINDOW_SIZE` dynamically. If changing this constant, update the CSS `grid-template-columns` in `.columnHeaders`, `.groupHeaderRow`, and `.categoryRow`.
- **HeatmapView legend:** Always-visible 5-item legend (`LEGEND_ITEMS` constant) rendered between column headers and group rows. Uses `role="group"` with `aria-label="Dot color legend"`. Legend dot classes (`dotSafe`, `dotWarning`, `dotOver`, `dotMuted`, `dotFaint`) set only `background` — the `legendDot` base class supplies `width/height/border-radius`.
- **HeatmapView group accent:** Expanded group cards get `groupCardExpanded` CSS class which sets `border-left-color: var(--accent)`. Base `.groupCard` reserves `border-left: 3px solid transparent` to prevent layout shift on expand. QA note: the 3px left vs 1px elsewhere may produce corner artifacts at 12px border-radius — fallback is `box-shadow: inset 3px 0 0 var(--accent)` on `.groupCardExpanded` (see `gotchas.md` for the rollback procedure).
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
