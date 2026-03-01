# Active Conventions — Stashtrend

## Data Boundaries
- **snake_case/camelCase:** backend always snake_case; frontend destructures with alias
  - e.g. `const { groups_meta: groupsMeta } = data`
- **Upsert pattern:** `ON CONFLICT(key) DO UPDATE SET value = excluded.value`

## Frontend
- **Inline styles:** kept only for data-driven values (group colors, status badges, active/selected states, recharts tooltips)
- **Recharts tooltips:** always `const tooltipStyles = {...}` at module level — recharts renders outside React tree, CSS Modules can't reach them

## Budget & Transfers
- **Transfer filtering:** Monarch transfers have `group_type = 'transfer'` in `categories` table. Budget queries must always include:
  ```sql
  AND (c.group_type IS NULL OR c.group_type <> 'transfer')
  ```
  Transfers are neutral (not expenses/income) — including them double-counts money movement.
- **Budget table layout:** Income section (categories + Total Income row) → Expenses section (categories grouped by group_name + Total Expenses row) → Net row (income − expenses). Bar chart uses expense-only `totals_by_month`.

## Testing
- **Backend test runner:** `./run_tests.sh` from `backend/` (auto-creates venv, installs deps, runs pytest)
- **Frontend test runner:** `./run_tests.sh` from `frontend/` (checks node_modules freshness, runs vitest)

## Distribution & Docker
- **Self-hosted:** Docker Compose — each user runs locally, no data leaves their machine
- **Dockerfile.backend:** Filters `-e ../pipeline` from requirements.txt via grep — path doesn't resolve in Docker; pipeline installed as non-editable `pip install ./pipeline`
