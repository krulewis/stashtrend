# Phases 3-4 + Phase B Integration — Web/External Research

**Date:** 2026-03-12
**Author:** Web Researcher Agent
**Status:** Complete — input for Architect

---

## Problem Summary

The integrated codebase has: (1) a `NameError` bug in `investments.py` where `current_app` is used but not imported, (2) zero tests for all Phase 3-4 backend endpoints and frontend components, and (3) potentially stale existing tests for nav item counts. This report covers external best practices for fixing the bug and writing the missing tests.

---

## 1. Flask `current_app` vs Module-Level Logger

### Finding

The Flask documentation and community consensus (CircleCI, BetterStack, SigNoz) are aligned:

- `current_app.logger` is valid **inside request context only** (route handler function body). If called outside an active app context it raises `RuntimeError: Working outside of application context`.
- `logging.getLogger(__name__)` (module-level) has **no context dependency**. It works at import time, in background threads, in tests without a pushed context, and inside route handlers equally well.
- Flask itself states: configure logging before creating the app object, and use Python's standard `logging` module for portability.

### Recommendation for `investments.py`

The module already has `logger = logging.getLogger(__name__)` on line 10 (confirmed in codebase research). The fix is to replace `current_app.logger.exception(...)` with `logger.exception(...)` on all three exception handler lines — not to add a `current_app` import. This is:

- Simpler (no new import)
- Context-free (safe in tests without a pushed app context)
- Consistent with how the module is already structured (module-level logger is already defined)
- The pattern Flask recommends for Blueprint modules in larger applications

Using `current_app` inside the `except` blocks would work at runtime (a request context is always active in route handlers), but module-level loggers are the superior pattern for Blueprint code because they are testable in isolation without needing a full Flask test client.

**Sources:** [Flask Logging Docs](https://flask.palletsprojects.com/en/stable/logging/), [BetterStack Flask Logging Guide](https://betterstack.com/community/guides/logging/how-to-start-logging-with-flask/), [SigNoz Flask Logging](https://signoz.io/guides/flask-logging/)

---

## 2. Flask Blueprint Testing Patterns

### Finding

The canonical pattern (Flask docs, TestDriven.io, AppSignal April 2025) is:

1. **Application factory + `conftest.py` fixtures** — create the real app in test config, push an app context, yield, then teardown. Use `app.test_client()` as the HTTP client.
2. **In-memory SQLite** for test databases — fast, isolated, no filesystem cleanup needed.
3. **`patch("app.get_db", return_value=make_db())`** — swap the database at the shim re-export level so Blueprint routes get the test DB.
4. **Test isolation** — each test gets a fresh `make_db()` call; never share state across tests.

### Fit to Existing Codebase

This project's existing tests already use this exact pattern (confirmed: `test_retirement.py`, `test_budgets.py` all use `patch("app.get_db", ...)` and `make_test_db()`). The investment endpoint tests should follow identical structure — no new infrastructure needed.

The `test_helpers.make_test_db()` function already applies canonical DDL from `app.DASHBOARD_DDL` and `monarch_pipeline.schema.DDL`, so investment test data can be seeded directly into the in-memory DB.

**Error handler testing:** To test the `except Exception` path, inject a mock DB that raises an exception on query execution:
```python
mock_db = MagicMock()
mock_db.execute.side_effect = Exception("DB error")
with patch("app.get_db", return_value=mock_db):
    resp = client.get("/api/investments/summary")
self.assertEqual(resp.status_code, 500)
```

**Sources:** [Flask Testing Docs](https://flask.palletsprojects.com/en/stable/testing/), [TestDriven.io Flask + Pytest](https://testdriven.io/blog/flask-pytest/), [AppSignal Flask Testing (April 2025)](https://blog.appsignal.com/2025/04/02/an-introduction-to-testing-in-python-flask.html)

---

## 3. React Component Testing Patterns

### 3.1 Recharts Chart Components

The primary problem: `ResponsiveContainer` renders at `width: 0, height: 0` in jsdom, so no SVG nodes are created.

**Established solution** (confirmed by Recharts GitHub issue #2268, which has been open since 2021 and remains the recommended workaround):

```js
vi.mock('recharts')
```

This project already uses this exact pattern — `vi.mock('recharts')` appears in 8 existing test files. The `setup.js` also stubs `ResizeObserver` (needed by Recharts). Investment and forecasting chart tests can follow the same pattern: mock Recharts, assert on structural elements (headings, loading states, data-driven text), not on SVG internals.

For the `AllocationChart.jsx` (a pie/donut chart) and `InvestmentPerformanceChart.jsx` (a line chart with `ResponsiveContainer`), the approach is: mock recharts, verify the container renders, verify loading/empty states, verify any non-chart text (labels, legends rendered as HTML).

### 3.2 Data Table Components (HoldingsTable, InvestmentAccountsTable)

The React Testing Library pattern for tables:
- Use `screen.getByRole('table')` or query by `columnheader` role for headers
- Use `getAllByRole('row')` to count rows
- Add `data-testid` on sortable cells to verify ordering after a click event
- `userEvent.click(sortHeader)` → `getAllByTestId('cell-id')` → assert order

Complex sort/filter interactions are better as Playwright E2E tests — RTL + jsdom has limitations for stateful table interactions. Unit tests should cover: initial render with mock data, empty state, loading state, error state.

### 3.3 API-Fetching Components

This project uses `vi.fn()` on `global.fetch` via the `mockFetch()` helper in `src/test/fixtures.js`. This is a simpler alternative to MSW that works well when:
- The component makes `fetch()` calls (not Axios)
- You need to control response shape per-test
- You don't need cross-environment reuse (browser + Node)

MSW would add real value if: multiple tests need the same handlers, or if Playwright tests need the same mock server. For this codebase's current scale (inline `mockFetch` is already established), **stick with `mockFetch`** for unit/integration tests and add MSW only if Playwright coverage of investments is added.

**Sources:** [Recharts Issue #2268](https://github.com/recharts/recharts/issues/2268), [Jay Kim — Tests with Charts](https://jskim1991.medium.com/react-writing-tests-with-graphs-9b7f2c9eeefc), [MSW Docs](https://mswjs.io/docs/), [Kent C. Dodds — Stop Mocking Fetch](https://kentcdodds.com/blog/stop-mocking-fetch)

---

## 4. Testing `retirementMath.js` Pure Functions

The three new Phase 4 functions (`getInvestableCapital`, `computeBlendedCAGR`, `calculateContributionToTarget`) are pure math functions — no DOM, no network. These are the easiest tests to write:

```js
import { getInvestableCapital } from '../utils/retirementMath.js'
describe('getInvestableCapital', () => {
  it('sums balances of investment-type accounts', () => { ... })
  it('returns 0 when no investment accounts', () => { ... })
})
```

No mocking needed. Existing `retirementMath.test.js` can simply be extended with additional `describe` blocks.

---

## 5. Snapshot vs Behavioral Testing Tradeoffs

### Industry Consensus (2024-2025)

| Approach | When to Use | Risk |
|----------|-------------|------|
| Behavioral (RTL) | Logic, data transforms, interactions, states | More upfront effort |
| Snapshot | Small, stable UI-only components (< 30 lines) | Blind updates erode value |

The modern consensus (Kent C. Dodds, SitePen, ezcater engineering) strongly prefers behavioral tests. Snapshot tests for financial components are particularly risky because data changes will cause constant snapshot churn.

**Recommendation for this project:** Use behavioral tests exclusively for all Phase 3-4 components. No new snapshot tests. The existing codebase does not use snapshots.

**Sources:** [Percy — Snapshot vs Unit Testing](https://percy.io/blog/react-snapshot-testing-vs-unit-testing), [SitePen — Snapshot Drawbacks](https://www.sitepen.com/blog/snapshot-testing-benefits-and-drawbacks), [ezcater — Case Against Snapshot Testing](https://engineering.ezcater.com/the-case-against-react-snapshot-testing)

---

## 6. SQLite Portfolio Schema Patterns

External reference implementations (BeanCounter, Portfolio Performance, databasesample.com) converge on:

- **Separate tables** for accounts, holdings (current positions), transactions (buy/sell history), and price_history (time series).
- **Integer representation** for monetary values (cents, not floats) to avoid rounding errors — though existing Stashtrend schema uses REAL, so this is informational only.
- **Cost basis tracking** at the holdings level (`cost_basis` per share or total), with FIFO/LIFO calculated via transaction queries.
- **Time-weighted returns** computed via SQL aggregation over price_history snapshots.

This project's schema already has `holdings` with `cost_basis` and `current_value` columns. No schema changes are required for Phase 3-4 tests — the existing schema is sufficient to seed test data.

**Sources:** [databasesample.com Portfolio Tracker Schema](https://databasesample.com/database/investment-portfolio-tracker-database), [SQL Portfolio Strategies (Medium)](https://medium.com/@lomso.dzingwa/enhancing-portfolio-management-with-sql-strategies-and-best-practices-25a9b3564339), [Eric Draken — Financial Time Series Storage](https://ericdraken.com/storing-stock-candle-data-efficiently/)

---

## 7. Integration Testing Strategy (Flask + React)

### Option A: Backend unit tests + Frontend unit tests (two separate layers, no full-stack wiring)

- Backend: pytest with in-memory SQLite, mock `get_db`, test HTTP responses
- Frontend: Vitest + RTL with `mockFetch`, test component render/state
- No shared contract file; API shape is implicitly verified by both layers independently

**Pros:** Fast, no server needed, matches existing project patterns exactly
**Cons:** A mismatch between mock shape and real API shape can go undetected

### Option B: Backend integration tests that exercise Blueprint registration

- Same as Option A but explicitly test that the Blueprint is registered (i.e., use `app.test_client()` without mocking Blueprint routing, only mock `get_db`)
- Verifies that `routes/__init__.py` registers the investments blueprint correctly

**Pros:** Catches Blueprint registration bugs; still fast (no real DB)
**Cons:** Minor additional effort; not fundamentally different from Option A

### Option C: Shared API contract (pact testing or OpenAPI schema)

- Define a contract file (OpenAPI YAML or Pact JSON) describing the investment API shape
- Backend tests verify responses match the contract; frontend tests use the contract as fixture source

**Pros:** Strongest guarantee of frontend/backend alignment
**Cons:** High overhead to set up; no existing contract tooling in the project; overkill for a single developer project

### Recommendation

**Option B** is best for this project. It adds minimal overhead over the existing pattern (just don't mock `app.get_db` at the Blueprint registration level — let the test client exercise real URL dispatch), while ensuring the investments Blueprint is correctly wired. The existing `test_retirement.py` implicitly does this — calling `self.client.get("/api/retirement")` verifies the route is registered.

**Sources:** [TestDriven.io Flask + Pytest](https://testdriven.io/blog/flask-pytest/), [Vitest + RTL guide (DEV.to)](https://dev.to/manjushsh/testing-a-react-application-with-vitest-and-react-testing-library-c40), [AG Grid RTL + Vitest](https://blog.ag-grid.com/unit-testing-ag-grid-react-tables-with-react-testing-library-and-vitest/)

---

## Summary for Pipeline Context Packet (under 500 words)

**`current_app` bug fix:** Use the module-level `logger` already defined on line 10 of `investments.py`. Do NOT add a `current_app` import. Module-level loggers are context-free, simpler, and the Flask-recommended approach for Blueprint modules. All three `current_app.logger.exception(...)` calls should become `logger.exception(...)`.

**Backend tests:** Follow the exact pattern in `test_retirement.py` and `test_budgets.py` — `unittest.TestCase`, `app.test_client()`, `patch("app.get_db", return_value=make_test_db())`, seed data before the call. No new infrastructure needed. Error handler paths are testable by making `mock_db.execute.side_effect = Exception(...)`. The `make_test_db()` helper already applies the full schema so holdings data can be seeded directly.

**Frontend tests:** All 8 chart-containing test files already use `vi.mock('recharts')`. Investment and forecasting chart tests copy that pattern. Data table tests use `getByRole`/`getAllByRole` for structural assertions plus `userEvent.click` for interaction. `mockFetch()` from `src/test/fixtures.js` handles API calls. `retirementMath.js` functions are pure and need no mocking. No MSW needed — the existing `mockFetch` pattern is sufficient.

**Snapshot vs behavioral:** Use behavioral tests only. No snapshots.

**Integration strategy:** Option B — use `app.test_client()` to verify Blueprint routing without mocking Flask dispatch (only mock `get_db`). This is how all existing backend tests work; it implicitly validates Blueprint registration.

**SQLite schema:** No schema changes needed. Existing `holdings` table has `cost_basis` and `current_value`. Test data can be seeded using `make_test_db()` + INSERT statements.
