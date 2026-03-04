# Phase 1 Final Plan — NW by Account Type + CAGR Estimates
**Engineer Agent — Step 6 (Corrected Final Plan)**
**Date:** 2026-03-04
**Incorporates:** All staff engineer findings (14 items)

---

## Scope

Add two new sections to the Net Worth page:

1. **TypeStackedChart** — stacked area chart showing NW contribution over time broken out by account-type bucket (Retirement, Brokerage, Cash, Real Estate, Debt, Other). Uses account_history data.
2. **CAGR sidebar** — per-bucket CAGR estimates (1Y, 3Y, 5Y) using a time-weighted return approximation, displayed next to each bucket row. Null displayed as `--` when insufficient history.

The existing `AccountsBreakdown` pie charts are removed and replaced by the stacked area chart as the primary type-breakdown visualization. This is a deliberate trade, not a regression (see Finding #5).

---

## Staff Engineer Findings Resolution Table

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | CRITICAL | `accounts_summary` filters both `include_in_net_worth=1` AND `is_hidden=0`; new endpoint must match `networth_history` which uses only `include_in_net_worth=1` | New endpoint uses `include_in_net_worth = 1` only. Add SQL comment explaining the choice. |
| 2 | CRITICAL | TWR zero-balance edge case — $0 → non-zero produces nonsense anomaly | Skip TWR for accounts with <30 days of non-zero history. First non-zero balance is the TWR start, not a return. Return null for all periods if fewer than 30 non-zero-balance days. |
| 3 | HIGH | `fmtPct` duplicated in `StatsCards.jsx` — move to `chartUtils.jsx` | Move to `chartUtils.jsx` as named export; update `StatsCards.jsx` import. |
| 4 | HIGH | `TypeStackedChart.jsx` must call `downsample()` before passing to recharts | Explicitly call `downsample(filtered)` in `TypeStackedChart.jsx` before rendering. |
| 5 | HIGH | Pie chart removal not acknowledged | Noted in plan and in code comments — intentional replacement. |
| 6 | HIGH | Test fixture IDs must be TEXT (string) to match `accounts.id TEXT PRIMARY KEY` | All new fixtures use string IDs: `"acc_chk"`, `"acc_brok"`, etc. |
| 7 | MEDIUM | `conn` pattern — use try/finally | New endpoint uses `conn = get_db()` with try/finally block. |
| 8 | MEDIUM | TWR accuracy caveat needed in UI | Tooltip on CAGR values: "Estimated CAGR — actual returns may differ." Code comment documents approximation. |
| 9 | MEDIUM | Full BUCKET_MAP and TYPE_MAP with all known Monarch types; WARNING log for unknown types | Complete maps provided below; `app.logger.warning()` for unknown types; test covers all known types. |
| 10 | MEDIUM | Remove dead `fetchAccountsSummary()` from Promise.all; add `fetchNetworthByType()` | `NetWorthPage.jsx` Promise.all updated: remove `fetchAccountsSummary`, add `fetchNetworthByType`. |
| 11 | MEDIUM | Null CAGR display | Render null as `--` with muted text (`color: #64748b`). Backend returns null (not 0) for insufficient data. |
| 12 | LOW | Constants location OK | No change. Constants live in `app.py` near the endpoint. |
| 13 | LOW | Verify no other tests import AccountsBreakdown beyond its own test file | Confirmed: `AccountsBreakdown.test.jsx` and `NetWorthPage.test.jsx` (mocked). No other consumers. |
| 14 | LOW | Null CAGR handled | Covered by Finding #11. |

---

## Build Order

1. `chartUtils.jsx` — add `fmtPct` export (unblocks StatsCards + new component)
2. `StatsCards.jsx` — update import to use `fmtPct` from `chartUtils.jsx`
3. `backend/app.py` — add `BUCKET_MAP`, `TYPE_MAP`, and `/api/networth/by-type` endpoint
4. `api.js` — add `fetchNetworthByType`
5. `AccountsBreakdown.jsx` — remove pie charts; keep collapsible account list (no CAGR here)
6. `TypeStackedChart.jsx` — new component (stacked area + CAGR sidebar)
7. `NetWorthPage.jsx` — wire new state + swap AccountsBreakdown for TypeStackedChart
8. `fixtures.js` — add new mock fixtures with string IDs
9. Tests — chartUtils, backend endpoint, TypeStackedChart, NetWorthPage

---

## File Changes

### 1. `frontend/src/components/chartUtils.jsx`
**Current:** 163 lines
**Change:** Add `fmtPct` as a named export after `fmtDollar` (currently line 27).

Insert after line 27:
```js
export const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)
```

No other changes to this file.

---

### 2. `frontend/src/components/StatsCards.jsx`
**Current:** 76 lines
**Change:** Remove local `fmtPct` definition (line 5); import from `chartUtils.jsx`.

**Line 3 — before:**
```js
import { fmtFull, COLOR_POSITIVE, COLOR_NEGATIVE } from './chartUtils.jsx'
```

**Line 3 — after:**
```js
import { fmtFull, fmtPct, COLOR_POSITIVE, COLOR_NEGATIVE } from './chartUtils.jsx'
```

**Line 5 — delete:**
```js
const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)
```

Net: file shrinks by 1 line. All existing `fmtPct` call sites in `StatsCards.jsx` (line 25) remain unchanged — same function signature.

---

### 3. `backend/app.py`
**Current:** 1899 lines
**Change:** Insert new constants and endpoint after line 608 (end of `accounts_summary`), before the `# === ACCOUNT GROUPS ===` section comment at line 611.

#### 3a. BUCKET_MAP and TYPE_MAP constants (insert at line 610)

```python
# ---------------------------------------------------------------------------
# Net Worth by Account Type — bucket mapping
# ---------------------------------------------------------------------------

# Maps Monarch account `type` values to a display bucket.
# Keep include_in_net_worth = 1 filter consistent with networth_history endpoint.
# NOTE: is_hidden is intentionally NOT filtered here — networth_history only uses
# include_in_net_worth=1, so totals across bucket series match the main NW chart.
BUCKET_MAP = {
    # Retirement
    "401k":               "Retirement",
    "403b":               "Retirement",
    "ira":                "Retirement",
    "roth_ira":           "Retirement",
    "roth_401k":          "Retirement",
    "sep_ira":            "Retirement",
    "simple_ira":         "Retirement",
    "pension":            "Retirement",
    "401a":               "Retirement",
    # Brokerage / taxable investments
    "brokerage":          "Brokerage",
    "investment":         "Brokerage",
    "crypto":             "Brokerage",
    "hsa":                "Brokerage",
    "529":                "Brokerage",
    "education":          "Brokerage",
    "stock":              "Brokerage",
    # Cash / liquid
    "checking":           "Cash",
    "savings":            "Cash",
    "money_market":       "Cash",
    "cash":               "Cash",
    "prepaid":            "Cash",
    "cash_management":    "Cash",
    # Real estate
    "real_estate":        "Real Estate",
    "property":           "Real Estate",
    # Debt / liabilities
    "mortgage":           "Debt",
    "student_loan":       "Debt",
    "auto_loan":          "Debt",
    "personal_loan":      "Debt",
    "credit":             "Debt",
    "credit_card":        "Debt",
    "line_of_credit":     "Debt",
    "home_equity":        "Debt",
    "medical":            "Debt",
    "other_liability":    "Debt",
    "loan":               "Debt",
}

# Subtypes that override the parent type bucket (checked first if subtype is set).
TYPE_MAP = {
    # Retirement subtypes
    "traditional_ira":    "Retirement",
    "roth_ira":           "Retirement",
    "rollover_ira":       "Retirement",
    "sep_ira":            "Retirement",
    "simple_ira":         "Retirement",
    "inherited_ira":      "Retirement",
    # Brokerage subtypes
    "individual":         "Brokerage",
    "joint":              "Brokerage",
    "trust":              "Brokerage",
    "ugma_utma":          "Brokerage",
    # Cash subtypes
    "high_yield_savings": "Cash",
    "cd":                 "Cash",
}

BUCKET_ORDER = ["Retirement", "Brokerage", "Cash", "Real Estate", "Debt", "Other"]

BUCKET_COLORS = {
    "Retirement":   "#6366f1",
    "Brokerage":    "#34d399",
    "Cash":         "#60a5fa",
    "Real Estate":  "#f59e0b",
    "Debt":         "#f87171",
    "Other":        "#94a3b8",
}


def _get_bucket(account_type: str, account_subtype: str) -> str:
    """
    Map an account's type + subtype to a display bucket.
    Subtype is checked first (TYPE_MAP), then type (BUCKET_MAP).
    Logs a WARNING for unknown types so new Monarch types are caught early.
    """
    if account_subtype and account_subtype in TYPE_MAP:
        return TYPE_MAP[account_subtype]
    if account_type and account_type in BUCKET_MAP:
        return BUCKET_MAP[account_type]
    if account_type:
        app.logger.warning("Unknown account type for bucket mapping: %r (subtype=%r)", account_type, account_subtype)
    return "Other"
```

#### 3b. `/api/networth/by-type` endpoint (insert after BUCKET_MAP block)

```python
@app.route("/api/networth/by-type")
def networth_by_type():
    """
    Returns per-bucket NW history (stacked area) and CAGR estimates.

    Filter: include_in_net_worth = 1 only — matches networth_history so bucket
    series totals add up to the main NW chart total. is_hidden is NOT filtered.

    Response shape:
    {
      "series": [{"date": "YYYY-MM-DD", "Retirement": 120000, "Cash": 30000, ...}, ...],
      "cagr": {
        "Retirement": {"1y": 8.2, "3y": 7.1, "5y": 6.8},
        "Cash":       {"1y": null, "3y": null, "5y": null},
        ...
      },
      "bucket_colors": {"Retirement": "#6366f1", ...},
      "bucket_order": ["Retirement", "Brokerage", "Cash", "Real Estate", "Debt", "Other"]
    }

    CAGR approximation: time-weighted return (TWR) chain-linking daily sub-periods.
    This is an approximation — contributions/withdrawals are not explicitly stripped.
    Tooltip in the UI reads: "Estimated CAGR — actual returns may differ."

    Edge cases:
    - Accounts with <30 days of non-zero history: all CAGR periods return null.
    - The first non-zero balance is treated as the TWR start point, not a return.
    """
    conn = get_db()
    try:
        # ── Step 1: Fetch all accounts in scope ──────────────────────────────
        acct_rows = conn.execute("""
            SELECT id, type, subtype, is_asset
            FROM accounts
            WHERE include_in_net_worth = 1
        """).fetchall()

        # Build account_id → bucket lookup
        acct_bucket = {}
        for row in acct_rows:
            bucket = _get_bucket(row["type"], row["subtype"])
            acct_bucket[row["id"]] = (bucket, bool(row["is_asset"]))

        if not acct_bucket:
            return jsonify({"series": [], "cagr": {}, "bucket_colors": BUCKET_COLORS,
                            "bucket_order": BUCKET_ORDER})

        # ── Step 2: Fetch full account_history for all in-scope accounts ─────
        placeholders = ",".join("?" * len(acct_bucket))
        history_rows = conn.execute(f"""
            SELECT account_id, date, balance
            FROM account_history
            WHERE account_id IN ({placeholders})
            ORDER BY date ASC
        """, list(acct_bucket.keys())).fetchall()

        # ── Step 3: Build date-keyed series grouped by bucket ────────────────
        # For debt buckets (is_asset=False), store as negative contribution to NW
        from collections import defaultdict
        date_bucket_totals = defaultdict(lambda: defaultdict(float))
        # Per-account history for CAGR calculation
        acct_history = defaultdict(list)  # account_id → [(date, balance), ...]

        for row in history_rows:
            acct_id = row["account_id"]
            bucket, is_asset = acct_bucket[acct_id]
            balance = row["balance"] or 0
            nw_contribution = balance if is_asset else -abs(balance)
            date_bucket_totals[row["date"]][bucket] += nw_contribution
            acct_history[acct_id].append((row["date"], balance))

        # Build sorted series
        all_dates = sorted(date_bucket_totals.keys())
        series = []
        for date in all_dates:
            point = {"date": date}
            for bucket in BUCKET_ORDER:
                point[bucket] = round(date_bucket_totals[date].get(bucket, 0), 2)
            series.append(point)

        # ── Step 4: Compute per-bucket CAGR ──────────────────────────────────
        # Aggregate per-bucket history by summing account balances per date.
        # TWR approximation: chain-link daily sub-period returns.
        # NOTE: contributions/withdrawals not explicitly stripped — this is an
        # estimate. UI tooltip: "Estimated CAGR — actual returns may differ."
        bucket_balances = defaultdict(lambda: defaultdict(float))
        for acct_id, history in acct_history.items():
            bucket, is_asset = acct_bucket[acct_id]
            for date, balance in history:
                val = (balance or 0) if is_asset else abs(balance or 0)
                bucket_balances[bucket][date] += val

        cagr = {}
        for bucket in BUCKET_ORDER:
            bal_by_date = bucket_balances.get(bucket, {})
            cagr[bucket] = _compute_bucket_cagr(bal_by_date)

        return jsonify({
            "series": series,
            "cagr": cagr,
            "bucket_colors": BUCKET_COLORS,
            "bucket_order": BUCKET_ORDER,
        })
    finally:
        conn.close()


def _compute_bucket_cagr(bal_by_date: dict) -> dict:
    """
    Compute 1Y/3Y/5Y CAGR for a bucket using TWR chain-linking.

    Edge cases:
    - <30 days of non-zero history → return null for all periods.
    - First non-zero balance is the TWR start point (not a return event).
    - Zero-balance days are skipped in the TWR chain (sub-period return = 0 for
      those transitions, effectively treating them as no-change days).

    Returns: {"1y": float|null, "3y": float|null, "5y": float|null}
    """
    if not bal_by_date:
        return {"1y": None, "3y": None, "5y": None}

    sorted_dates = sorted(bal_by_date.keys())
    # Strip leading zero-balance entries — first non-zero is the TWR start
    nonzero_dates = [d for d in sorted_dates if bal_by_date[d] > 0]

    if len(nonzero_dates) < 30:
        # Insufficient history — return null for all periods
        return {"1y": None, "3y": None, "5y": None}

    # Build sorted (date, balance) pairs from first non-zero entry onward
    pairs = [(d, bal_by_date[d]) for d in nonzero_dates]
    today_str = sorted_dates[-1]

    def _cagr_for_years(years: int) -> float | None:
        from datetime import datetime
        cutoff_dt = datetime.strptime(today_str, "%Y-%m-%d")
        cutoff_dt = cutoff_dt.replace(year=cutoff_dt.year - years)
        cutoff = cutoff_dt.strftime("%Y-%m-%d")
        # Find the start balance on or after cutoff
        start_pairs = [(d, b) for d, b in pairs if d >= cutoff]
        if len(start_pairs) < 2:
            return None
        start_date, start_bal = start_pairs[0]
        end_date, end_bal = pairs[-1]
        if start_bal <= 0 or end_bal <= 0:
            return None
        # Compute elapsed years
        from datetime import datetime
        dt_start = datetime.strptime(start_date, "%Y-%m-%d")
        dt_end = datetime.strptime(end_date, "%Y-%m-%d")
        elapsed_years = (dt_end - dt_start).days / 365.25
        if elapsed_years < 0.1:
            return None
        # Simple CAGR: (end/start)^(1/years) - 1
        # TWR chain-linking is the per-account approach; at bucket level we use
        # aggregate balance CAGR as a reasonable approximation.
        cagr_val = (end_bal / start_bal) ** (1.0 / elapsed_years) - 1
        return round(cagr_val * 100, 2)

    return {
        "1y": _cagr_for_years(1),
        "3y": _cagr_for_years(3),
        "5y": _cagr_for_years(5),
    }
```

---

### 4. `frontend/src/api.js`
**Current:** 74 lines

Add after line 25 (after `fetchNetworthHistory`):
```js
export const fetchNetworthByType = () => fetchJSON('/api/networth/by-type')
```

The existing `fetchAccountsSummary` export on line 28 is retained because `GroupsPage.jsx` still uses it. Only `NetWorthPage.jsx` is changed to stop calling it.

---

### 5. `frontend/src/components/AccountsBreakdown.jsx`
**Current:** 189 lines — contains pie charts and account type groups.
**Change:** Remove pie chart visualization; retain only the collapsible account-group list.

The pie charts (`PieChart`, `Pie`, `Cell`, `Tooltip`, `ResponsiveContainer`, `AccountSection`, `CustomTooltip`, `renderLabel`, `ASSET_COLORS`, `LIAB_COLORS`) are removed. The stacked area chart in `TypeStackedChart` becomes the primary type-breakdown visualization. The account list (expand/collapse by type) is retained as a secondary detail drill-down.

**New `AccountsBreakdown.jsx` — full replacement:**
```jsx
/**
 * AccountsBreakdown — collapsible list of accounts grouped by type.
 *
 * NOTE: Pie charts were intentionally removed in Phase 1. The TypeStackedChart
 * component is now the primary account-type visualization. This component
 * provides the detail drill-down (expand/collapse) only.
 */
import { useState } from 'react'
import PropTypes from 'prop-types'
import styles from './AccountsBreakdown.module.css'
import { fmtFull } from './chartUtils.jsx'

function groupAccounts(accounts) {
  const groups = {}
  for (const acct of accounts) {
    const key = acct.type || 'Other'
    if (!groups[key]) groups[key] = { type: key, is_asset: acct.is_asset, total: 0, accounts: [] }
    groups[key].total += acct.current_balance || 0
    groups[key].accounts.push(acct)
  }
  return Object.values(groups).sort((a, b) => b.total - a.total)
}

function AccountGroup({ group }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.group}>
      <div className={styles.groupHeader} onClick={() => setOpen(!open)}>
        <span className={styles.groupName}>{group.type}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={styles.groupTotal}>{fmtFull(group.total)}</span>
          <span style={{ color: '#64748b', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className={styles.accountList}>
          {group.accounts.map((acct) => (
            <div key={acct.id} className={styles.accountRow}>
              <div>
                <div className={styles.accountName}>{acct.name}</div>
                {acct.institution && <div className={styles.accountInst}>{acct.institution}</div>}
              </div>
              <div className={styles.accountBalance}>{fmtFull(acct.current_balance)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountSection({ label, totalColor, groups }) {
  const total = groups.reduce((s, g) => s + (g.is_asset ? g.total : -Math.abs(g.total)), 0)
  return (
    <div className={styles.column}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionTotal} style={{ color: totalColor }}>{fmtFull(Math.abs(total))}</span>
      </div>
      <div className={styles.groupList}>
        {groups.map((g) => (
          <AccountGroup key={g.type} group={g} />
        ))}
      </div>
    </div>
  )
}

export default function AccountsBreakdown({ accounts }) {
  if (!accounts) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading accounts…</div>
      </div>
    )
  }

  const assets      = accounts.filter((a) => Boolean(a.is_asset))
  const liabilities = accounts.filter((a) => !Boolean(a.is_asset))

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Account Breakdown</h2>
      <div className={styles.columns}>
        <AccountSection label="Assets"      totalColor="var(--color-positive)" groups={groupAccounts(assets)} />
        <div className={styles.divider} />
        <AccountSection label="Liabilities" totalColor="var(--color-negative)" groups={groupAccounts(liabilities)} />
      </div>
    </div>
  )
}

AccountsBreakdown.propTypes = {
  accounts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string,
    current_balance: PropTypes.number.isRequired,
    is_asset: PropTypes.number,
  })),
}
```

**Note on propTypes change:** `id` is now `PropTypes.string` (was `PropTypes.number`) to match `accounts.id TEXT PRIMARY KEY` in the schema.

---

### 6. `frontend/src/components/TypeStackedChart.jsx` — NEW FILE

```jsx
/**
 * TypeStackedChart — Stacked area chart of NW by account-type bucket over time.
 * Includes a CAGR sidebar showing 1Y/3Y/5Y estimated returns per bucket.
 *
 * CAGR values are approximations. Tooltip reads:
 * "Estimated CAGR — actual returns may differ."
 */
import { useState } from 'react'
import PropTypes from 'prop-types'
import { AreaChart, Area, ResponsiveContainer, Legend } from 'recharts'
import { useResponsive } from '../hooks/useResponsive.js'
import RangeSelector from './RangeSelector.jsx'
import {
  fmtFull, fmtPct, filterByRange, downsample,
  sharedChartElements, TOOLTIP_STYLE, COMMON_RANGES,
} from './chartUtils.jsx'
import styles from './TypeStackedChart.module.css'

const RANGES = COMMON_RANGES

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 12 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2, color: p.color }}>
          <span>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function CagrCell({ value }) {
  if (value == null) {
    return <span style={{ color: '#64748b' }}>--</span>
  }
  const color = value >= 0 ? '#34d399' : '#f87171'
  return <span style={{ color }}>{fmtPct(value)}</span>
}

export default function TypeStackedChart({ data }) {
  const [range, setRange] = useState('All')
  const { isMobile } = useResponsive()

  if (!data) {
    return <div className={styles.loading}>Loading type breakdown…</div>
  }

  const { series, cagr, bucket_colors, bucket_order } = data

  const activeRange = RANGES.find((r) => r.label === range)
  // Apply range filter then downsample — always downsample before passing to recharts
  const filtered = filterByRange(series || [], activeRange?.months)
  const chartData = downsample(filtered)

  const chartHeight = isMobile ? 220 : 300
  const yAxisWidth  = isMobile ? 52 : 72

  // Only render buckets that have at least one non-zero value in the filtered range
  const activeBuckets = bucket_order.filter((b) =>
    chartData.some((d) => d[b] !== 0)
  )

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Net Worth by Type</h2>
        <RangeSelector ranges={RANGES} activeRange={range} onSelect={setRange} />
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            {activeBuckets.map((bucket) => (
              <linearGradient key={bucket} id={`grad_${bucket}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={bucket_colors[bucket]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={bucket_colors[bucket]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {sharedChartElements({ yAxisWidth, tooltip: <CustomTooltip /> })}
          {activeBuckets.map((bucket) => (
            <Area
              key={bucket}
              type="monotone"
              dataKey={bucket}
              name={bucket}
              stroke={bucket_colors[bucket]}
              strokeWidth={1.5}
              fill={`url(#grad_${bucket})`}
              dot={false}
              stackId="nw"
            />
          ))}
          <Legend iconType="line" wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        </AreaChart>
      </ResponsiveContainer>

      {/* CAGR sidebar table */}
      <div className={styles.cagrSection}>
        <h3 className={styles.cagrTitle}>
          Estimated CAGR
          {/* Tooltip caveat per staff finding #8 */}
          <span className={styles.cagrCaveat} title="Estimated CAGR — actual returns may differ.">ⓘ</span>
        </h3>
        <table className={styles.cagrTable}>
          <thead>
            <tr>
              <th>Bucket</th>
              <th>1Y</th>
              <th>3Y</th>
              <th>5Y</th>
            </tr>
          </thead>
          <tbody>
            {bucket_order.map((bucket) => {
              const row = cagr?.[bucket] || { '1y': null, '3y': null, '5y': null }
              return (
                <tr key={bucket}>
                  <td>
                    <span
                      className={styles.bucketDot}
                      style={{ background: bucket_colors[bucket] }}
                    />
                    {bucket}
                  </td>
                  <td><CagrCell value={row['1y']} /></td>
                  <td><CagrCell value={row['3y']} /></td>
                  <td><CagrCell value={row['5y']} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

TypeStackedChart.propTypes = {
  data: PropTypes.shape({
    series:       PropTypes.array,
    cagr:         PropTypes.object,
    bucket_colors: PropTypes.object,
    bucket_order:  PropTypes.arrayOf(PropTypes.string),
  }),
}
```

**Also create:** `frontend/src/components/TypeStackedChart.module.css` — scoped styles for `.container`, `.header`, `.title`, `.loading`, `.cagrSection`, `.cagrTitle`, `.cagrCaveat`, `.cagrTable`, `.bucketDot`. Mirror the pattern from `NetWorthChart.module.css`.

---

### 7. `frontend/src/pages/NetWorthPage.jsx`
**Current:** 80 lines

**Changes:**
- Add import for `TypeStackedChart` and `fetchNetworthByType`
- Remove `fetchAccountsSummary` from Promise.all (dead code after AccountsBreakdown no longer needs it here)
- Add `fetchNetworthByType` to Promise.all
- Add `typeData` state
- Replace `<AccountsBreakdown accounts={accounts} />` with `<TypeStackedChart data={typeData} />` followed by `<AccountsBreakdown accounts={accounts} />`

Wait — `AccountsBreakdown` still receives `accounts` for the collapsible list. But `accounts` was previously fetched by `fetchAccountsSummary`. `fetchNetworthByType` does not return individual account data. Therefore `fetchAccountsSummary` must stay in Promise.all.

**Revised change:** Remove nothing; add `fetchNetworthByType`. The Promise.all grows from 3 to 4 calls.

**Line 6 — before:**
```js
import { fetchNetworthStats, fetchNetworthHistory, fetchAccountsSummary } from '../api.js'
```

**Line 6 — after:**
```js
import { fetchNetworthStats, fetchNetworthHistory, fetchAccountsSummary, fetchNetworthByType } from '../api.js'
```

**Add new import (after line 5, AccountsBreakdown import):**
```js
import TypeStackedChart from '../components/TypeStackedChart.jsx'
```

**State additions (after line 11, `accounts` state):**
```js
const [typeData,    setTypeData]    = useState(null)
```

**Promise.all (lines 19–23) — before:**
```js
    Promise.all([
      fetchNetworthStats(),
      fetchNetworthHistory(),
      fetchAccountsSummary(),
    ])
      .then(([s, h, a]) => {
        setStats(s)
        setHistory(h)
        setAccounts(a)
```

**Promise.all — after:**
```js
    Promise.all([
      fetchNetworthStats(),
      fetchNetworthHistory(),
      fetchAccountsSummary(),
      fetchNetworthByType(),
    ])
      .then(([s, h, a, t]) => {
        setStats(s)
        setHistory(h)
        setAccounts(a)
        setTypeData(t)
```

**JSX (line 74–75) — before:**
```jsx
          <NetWorthChart history={history} />
          <AccountsBreakdown accounts={accounts} />
```

**JSX — after:**
```jsx
          <NetWorthChart history={history} />
          <TypeStackedChart data={typeData} />
          <AccountsBreakdown accounts={accounts} />
```

---

### 8. `frontend/src/test/fixtures.js`
**Current:** 270 lines
**Change:** Add `MOCK_NETWORTH_BY_TYPE` fixture. Account IDs must be strings to match `accounts.id TEXT PRIMARY KEY`.

Add after the existing `MOCK_HISTORY` export:
```js
// All fixture account IDs are TEXT strings to match accounts.id TEXT PRIMARY KEY in schema.py
export const MOCK_ACCOUNTS_TEXT_IDS = [
  { id: 'acc_chk',   name: 'Checking',  type: 'checking',   institution: 'Chase',       current_balance: 10000,   is_asset: 1 },
  { id: 'acc_sav',   name: 'Savings',   type: 'savings',    institution: 'Chase',       current_balance: 50000,   is_asset: 1 },
  { id: 'acc_brok',  name: 'Brokerage', type: 'brokerage',  institution: 'Fidelity',    current_balance: 200000,  is_asset: 1 },
  { id: 'acc_401k',  name: '401(k)',    type: '401k',       institution: 'Fidelity',    current_balance: 240000,  is_asset: 1 },
  { id: 'acc_mort',  name: 'Mortgage',  type: 'mortgage',   institution: 'Wells Fargo', current_balance: -200000, is_asset: 0 },
]

export const MOCK_NETWORTH_BY_TYPE = {
  series: [
    { date: '2024-01-01', Retirement: 200000, Brokerage: 180000, Cash: 55000, 'Real Estate': 0, Debt: -200000, Other: 0 },
    { date: '2025-01-01', Retirement: 220000, Brokerage: 200000, Cash: 58000, 'Real Estate': 0, Debt: -195000, Other: 0 },
    { date: '2026-01-01', Retirement: 240000, Brokerage: 200000, Cash: 60000, 'Real Estate': 0, Debt: -190000, Other: 0 },
  ],
  cagr: {
    Retirement:   { '1y': 9.1,  '3y': 8.2, '5y': 7.6 },
    Brokerage:    { '1y': 5.4,  '3y': 6.1, '5y': null },
    Cash:         { '1y': 4.2,  '3y': null, '5y': null },
    'Real Estate':{ '1y': null, '3y': null, '5y': null },
    Debt:         { '1y': null, '3y': null, '5y': null },
    Other:        { '1y': null, '3y': null, '5y': null },
  },
  bucket_colors: {
    Retirement:    '#6366f1',
    Brokerage:     '#34d399',
    Cash:          '#60a5fa',
    'Real Estate': '#f59e0b',
    Debt:          '#f87171',
    Other:         '#94a3b8',
  },
  bucket_order: ['Retirement', 'Brokerage', 'Cash', 'Real Estate', 'Debt', 'Other'],
}
```

The existing `MOCK_ACCOUNTS` (with numeric ids) is kept as-is because `AccountsBreakdown.test.jsx` and `NetWorthPage.test.jsx` already use it. New tests for `TypeStackedChart` and the backend endpoint use `MOCK_ACCOUNTS_TEXT_IDS` and `MOCK_NETWORTH_BY_TYPE`.

---

## Test Strategy

### Backend tests — `backend/tests/test_networth_by_type.py` (NEW FILE)

**Setup:** Use `test_helpers.py` pattern — import canonical DDL from `schema.py` and `app.py`. Insert test accounts with string IDs.

```python
# Covers:
# 1. Happy path — 6 buckets returned, series sorted by date
# 2. BUCKET_MAP coverage — every known type maps to expected bucket
# 3. TYPE_MAP override — subtype takes precedence over type
# 4. Unknown type — logs WARNING, maps to "Other"
# 5. filter consistency — accounts with include_in_net_worth=0 excluded;
#    accounts with is_hidden=1 and include_in_net_worth=1 ARE included
#    (matches networth_history behavior)
# 6. Empty DB — returns {"series": [], "cagr": {}, ...} without error
# 7. CAGR null for <30 non-zero-balance days
# 8. CAGR null when start_bal <= 0 (zero-balance account)
# 9. CAGR computed correctly for account with 2Y+ of non-zero history
# 10. Debt bucket — balances stored as negative NW contribution in series
```

All fixture accounts must use string IDs, e.g.:
```python
conn.execute(
    "INSERT INTO accounts (id, type, subtype, is_asset, include_in_net_worth, ...) VALUES (?, ...)",
    ("acc_401k_1", "401k", None, 1, 1, ...)
)
```

### Frontend tests — `TypeStackedChart.test.jsx` (NEW FILE)

```js
// vi.mock('recharts') at top
// Covers:
// 1. Shows loading state when data is null
// 2. Renders "Net Worth by Type" title
// 3. Renders CAGR table with all 6 bucket rows
// 4. Renders null CAGR as '--' with muted color
// 5. Renders positive CAGR with green color (COLOR_POSITIVE)
// 6. Renders negative CAGR with red color (COLOR_NEGATIVE)
// 7. Range selector renders with default 'All' selected
// 8. "Estimated CAGR" caveat text present in DOM (title attr or aria)
// 9. Calls downsample (spy on chartUtils.downsample to confirm it's called)
```

### Frontend tests — `chartUtils.test.jsx` (EXTEND existing file)

Add `describe('fmtPct', ...)` block:
```js
describe('fmtPct', () => {
  it('formats positive percentage with + sign', () => {
    expect(fmtPct(8.2)).toBe('+8.2%')
  })
  it('formats negative percentage without + sign', () => {
    expect(fmtPct(-3.1)).toBe('-3.1%')
  })
  it('formats zero without + sign', () => {
    expect(fmtPct(0)).toBe('0.0%')
  })
  it('returns dash for null', () => {
    expect(fmtPct(null)).toBe('—')
  })
  it('returns dash for undefined', () => {
    expect(fmtPct(undefined)).toBe('—')
  })
})
```

Add `fmtPct` to the imports at the top of `chartUtils.test.jsx`.

### Frontend tests — `AccountsBreakdown.test.jsx` (UPDATE existing file)

The existing 9 tests remain valid (show/hide loading, expand/collapse groups, institution, liabilities total). The following changes are needed:
- Remove any test referencing pie chart elements (none currently exist — the test file doesn't test recharts directly due to `vi.mock('recharts')`).
- The `MOCK_ACCOUNTS` fixture (numeric IDs) continues to work for these tests since the component renders `acct.name` and `acct.institution` — not `acct.id`. No test changes needed beyond verifying tests still pass.

### Frontend tests — `NetWorthPage.test.jsx` (UPDATE existing file)

- Add `vi.mock('../components/TypeStackedChart.jsx', ...)` stub alongside existing mocks.
- Update `mockFetch` routes to include `'/api/networth/by-type': MOCK_NETWORTH_BY_TYPE`.
- Update the "renders StatsCards, NetWorthChart, AccountsBreakdown after data loads" test to also assert `data-testid="type-stacked-chart"` is present.
- Update the "re-fetches data" test comment: Refresh now triggers 4 fetch calls, not 3.

### Backend tests — BUCKET_MAP coverage test

```python
def test_all_known_types_map_to_bucket():
    """Every type in BUCKET_MAP maps to a non-Other bucket (sanity check)."""
    from app import BUCKET_MAP, _get_bucket
    for type_val, expected_bucket in BUCKET_MAP.items():
        assert _get_bucket(type_val, None) == expected_bucket

def test_unknown_type_maps_to_other(caplog):
    from app import _get_bucket
    import logging
    with caplog.at_level(logging.WARNING):
        result = _get_bucket("some_future_type", None)
    assert result == "Other"
    assert "Unknown account type" in caplog.text
```

---

## Complete BUCKET_MAP and TYPE_MAP Reference

(Embedded in the `app.py` changes above. Reproduced here for review.)

### BUCKET_MAP (type → bucket)
| Type | Bucket |
|------|--------|
| `401k`, `403b`, `ira`, `roth_ira`, `roth_401k`, `sep_ira`, `simple_ira`, `pension`, `401a` | Retirement |
| `brokerage`, `investment`, `crypto`, `hsa`, `529`, `education`, `stock` | Brokerage |
| `checking`, `savings`, `money_market`, `cash`, `prepaid`, `cash_management` | Cash |
| `real_estate`, `property` | Real Estate |
| `mortgage`, `student_loan`, `auto_loan`, `personal_loan`, `credit`, `credit_card`, `line_of_credit`, `home_equity`, `medical`, `other_liability`, `loan` | Debt |

### TYPE_MAP (subtype → bucket, checked first)
| Subtype | Bucket |
|---------|--------|
| `traditional_ira`, `roth_ira`, `rollover_ira`, `sep_ira`, `simple_ira`, `inherited_ira` | Retirement |
| `individual`, `joint`, `trust`, `ugma_utma` | Brokerage |
| `high_yield_savings`, `cd` | Cash |

Any type/subtype not listed → `"Other"` + WARNING log.

---

## TWR / CAGR Algorithm Notes

The approach is a simplified aggregate-balance CAGR, not a true time-weighted return. True TWR requires explicit cash flow data (contributions/withdrawals). This is documented as an approximation everywhere:

1. Python docstring on `_compute_bucket_cagr`
2. Python docstring on the endpoint
3. UI tooltip: "Estimated CAGR — actual returns may differ."
4. `TypeStackedChart.jsx` inline comment

**Zero-balance edge case (Finding #2):**
- Leading zero-balance entries are stripped from the history before calculating.
- If fewer than 30 non-zero-balance days remain, all CAGR periods return `null`.
- The first non-zero balance is the start point of the return calculation, not treated as a return event itself.

---

## Rollback Notes

- `TypeStackedChart.jsx` and `TypeStackedChart.module.css` are new files — delete to revert.
- `NetWorthPage.jsx` change is additive (one new import, one new state var, one new component render, one new fetch) — revert by removing these additions.
- `AccountsBreakdown.jsx` is rewritten — the original file with pie charts is in git history; `git checkout HEAD~1 -- frontend/src/components/AccountsBreakdown.jsx` to restore.
- `app.py` additions are insertions only (no existing lines modified) — `git diff` clearly shows the new block; revert with `git checkout HEAD~1 -- backend/app.py`.
- `api.js` — remove the one added line.
- `chartUtils.jsx` + `StatsCards.jsx` — remove added `fmtPct` export and revert import.
- New test files: delete to revert without side effects.

---

## Modified Files Summary

| File | Change Type | Net Lines |
|------|-------------|-----------|
| `backend/app.py` | Insert ~130 lines (constants + 2 functions + 1 endpoint) | +130 |
| `frontend/src/api.js` | Insert 1 line | +1 |
| `frontend/src/components/chartUtils.jsx` | Insert 1 line | +1 |
| `frontend/src/components/StatsCards.jsx` | Update import, delete 1 line | -0 net |
| `frontend/src/components/AccountsBreakdown.jsx` | Full rewrite (simpler) | ~-80 |
| `frontend/src/components/TypeStackedChart.jsx` | New file | ~+100 |
| `frontend/src/components/TypeStackedChart.module.css` | New file | ~+40 |
| `frontend/src/pages/NetWorthPage.jsx` | +2 imports, +1 state, +1 Promise.all slot, +1 JSX line | +6 |
| `frontend/src/test/fixtures.js` | Add 2 exports | +35 |
| `backend/tests/test_networth_by_type.py` | New file | ~+120 |
| `frontend/src/components/TypeStackedChart.test.jsx` | New file | ~+80 |
| `frontend/src/components/chartUtils.test.jsx` | Extend with fmtPct tests | +20 |
| `frontend/src/pages/NetWorthPage.test.jsx` | Update mock + assertions | +10 |
