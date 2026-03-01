# Budget vs Actuals + AI Analysis — Design Doc
**Date:** 2026-02-25
**Status:** Approved

---

## Context

Stashtrend currently shows net worth trends and account group balances, but has no view comparing planned spending (budgets) against what was actually spent. The `budgets` table already stores `budgeted_amount` and `actual_amount` (Monarch pre-calculates actuals) for each category × month, but no UI or API exposes this data.

This feature adds:
1. A **Budget vs Actuals** page — bar chart (monthly totals) + category detail table
2. An **AI Analysis panel** — manually triggered, proxied through the backend, with configurable provider/model

---

## Architecture

### New Tab
A new `budgets` tab is added to the `TABS` array in `App.jsx`, rendering `<BudgetPage />`. Follows the same manual tab-switching pattern as `networth`, `groups`, and `sync`.

### New Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/budgets/history?months=12` | Budget + actual per category per month |
| `GET` | `/api/ai/config` | Returns AI config status (never the raw key) |
| `POST` | `/api/ai/config` | Saves provider, API key, model, base URL |
| `POST` | `/api/ai/analyze` | Builds prompt from DB data, calls AI, returns analysis |

### New Frontend Components

| File | Role |
|------|------|
| `pages/BudgetPage.jsx` | Container — fetches history, owns filter state |
| `components/BudgetChart.jsx` | Grouped BarChart: total budget vs actual per month |
| `components/BudgetTable.jsx` | Categories × months table, color-coded cells |
| `components/AIAnalysisPanel.jsx` | Config form + analysis trigger + result display |

### AI Settings (stored in existing `settings` table)

| Key | Example Value |
|-----|---------------|
| `ai_provider` | `"anthropic"` or `"openai_compatible"` |
| `ai_api_key` | `"sk-ant-..."` (plaintext, same approach as Monarch token) |
| `ai_model` | `"claude-opus-4-5"` or `"gpt-4o"` |
| `ai_base_url` | `""` (empty = SDK default) or custom endpoint for Ollama/Mistral/etc. |

---

## Data Design

### `/api/budgets/history` Response Shape

```json
{
  "months": ["2025-03-01", "2025-04-01", "2025-05-01"],
  "totals_by_month": {
    "2025-03-01": { "budgeted": 3200.0, "actual": 3450.0 },
    "2025-04-01": { "budgeted": 3200.0, "actual": 3010.0 }
  },
  "categories": [
    {
      "category_id": "cat_123",
      "category_name": "Groceries",
      "group_name": "Food & Drink",
      "months": {
        "2025-03-01": { "budgeted": 500.0, "actual": 523.0, "variance": -23.0 },
        "2025-04-01": { "budgeted": 500.0, "actual": 489.0, "variance": 11.0 }
      }
    }
  ]
}
```

- Categories pre-sorted by worst average variance (biggest chronic over-spenders first)
- Variance = `budgeted - actual` (negative = over budget)
- Data source: `budgets` table (uses Monarch's pre-calculated `actual_amount`)

---

## UI Layout

### BudgetPage (top to bottom)
1. **Page header** — "Budget vs Actuals" + range filter buttons (3M / 6M / 12M)
2. **BudgetChart** — grouped BarChart, total budget vs actual per month
3. **BudgetTable** — category detail table with collapsible group headers
4. **AIAnalysisPanel** — collapsed by default, expands on demand

### BudgetChart
- Recharts `<BarChart>` with grouped bars
- X-axis: months formatted as "Jan '25"
- Budget bar: `--accent` (indigo)
- Actual bar: green if total actual ≤ total budget for that month, red if over
- `useResponsive()` for chart height
- Optional category-group dropdown filter

### BudgetTable

```
Category           | Nov '25        | Dec '25        | Jan '26
─────────────────────────────────────────────────────────────────
▼ Food & Drink
  Groceries        | $523 / $500 🔴 | $489 / $500 🟢 | $512 / $500 🔴
  Restaurants      | $215 / $200 🔴 | $145 / $200 🟢 | $198 / $200 🟢
▼ Entertainment
  Streaming        |  $45 /  $50 🟢 |  $45 /  $50 🟢 |  $45 /  $50 🟢
```

- **Rows:** categories, grouped under collapsible category group headers
- **Columns:** months (newest on right), horizontally scrollable
- **Cells:** show "Actual / Budget" — red tint when actual > budget, green tint when under
- Months with no budget data show a dash

### AIAnalysisPanel States

| State | UI |
|-------|----|
| Collapsed (default) | Card with "Analyze with AI" chevron button |
| Unconfigured + expanded | Inline config form: Provider, API Key, Model, Base URL (optional). "Save & Analyze" button. |
| Configured + expanded | Model badge + "Run Analysis" button + small "Reconfigure" link |
| Running | Spinner + "Analyzing your budget data…" |
| Complete | Formatted analysis text + "Re-run" button |

---

## AI Prompt

```
You are a personal finance analyst reviewing {N} months of budget vs. actual spending data.

Here is the data (negative variance = over budget):

Category           | [Month columns...] | Avg Variance
Groceries          | -$23, +$11, -$45   | -$19/mo
Restaurants        | -$15, +$55, -$30   | -$10/mo
...

Please analyze this data and:
1. Identify the categories that most consistently cause actual spending to exceed budget
2. Quantify the magnitude — how much over, how often
3. Note any seasonal patterns or trends
4. Give 2-3 concise, practical suggestions for addressing the worst offenders. If the user
   is always over or never hits a category budget, suggest modifying total budget by moving
   allocated funds from another category budget or reducing savings

Be specific to the numbers. Keep the response under 400 words.
```

### AI Provider Routing (backend)
- `ai_provider == "anthropic"` → use `anthropic` Python SDK (`messages.create`)
- `ai_provider == "openai_compatible"` → use `openai` Python SDK (`chat.completions.create`) with optional `base_url` override
- Both packages added to `requirements.txt`
- Response is non-streaming; frontend shows spinner until full response arrives

---

## Testing Plan

### Backend (pytest)
- `GET /api/budgets/history` — seeded test data; validates shape, category sort order, variance sign
- `GET /api/budgets/history?months=3` — verifies month-count filtering
- `GET /api/ai/config` — unconfigured returns `{"configured": false}`; configured returns model + provider, never the key
- `POST /api/ai/config` — saves all 4 keys, returns success
- `POST /api/ai/analyze` — mocks AI SDK call; verifies prompt contains budget data; verifies `{"analysis": "..."}` shape

### Frontend (vitest)
- `BudgetChart.test.jsx` — renders with data, range buttons toggle, loading state
- `BudgetTable.test.jsx` — renders rows, over-budget cells have red class, under-budget cells have green class, group headers collapse/expand
- `AIAnalysisPanel.test.jsx` — config form shown when unconfigured; Run button shown when configured; spinner during analysis; result text on completion; Reconfigure link visible after analysis

### End-to-End
1. `docker compose up --build -d`
2. Sync budget data
3. Navigate to Budgets tab
4. Verify chart and table populate with real data
5. Configure AI (Claude API key, model)
6. Run analysis, verify text response renders

---

## Files to Create / Modify

### Create
- `backend/tests/test_budgets.py`
- `backend/tests/test_ai.py`
- `frontend/src/pages/BudgetPage.jsx`
- `frontend/src/pages/BudgetPage.module.css`
- `frontend/src/pages/BudgetPage.test.jsx`
- `frontend/src/components/BudgetChart.jsx`
- `frontend/src/components/BudgetChart.module.css`
- `frontend/src/components/BudgetChart.test.jsx`
- `frontend/src/components/BudgetTable.jsx`
- `frontend/src/components/BudgetTable.module.css`
- `frontend/src/components/BudgetTable.test.jsx`
- `frontend/src/components/AIAnalysisPanel.jsx`
- `frontend/src/components/AIAnalysisPanel.module.css`
- `frontend/src/components/AIAnalysisPanel.test.jsx`
- `docs/plans/2026-02-25-budget-vs-actuals-design.md` *(this file)*

### Modify
- `backend/app.py` — add 4 new endpoints + `anthropic`/`openai` imports
- `backend/requirements.txt` — add `anthropic`, `openai`
- `frontend/src/App.jsx` — add `budgets` tab + `<BudgetPage />` import
- `frontend/src/App.module.css` — add tab styles if needed
- `frontend/src/test/fixtures.js` — add `MOCK_BUDGETS`, `MOCK_AI_CONFIG` fixtures
- `MEMORY.md` — update with new architecture notes
