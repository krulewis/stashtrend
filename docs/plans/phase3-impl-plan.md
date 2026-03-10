# Phase 3: Investments Dashboard — Implementation Plan

**Date:** 2026-03-09
**Author:** Engineer Agent
**Status:** Ready for implementation
**Depends on:** phase3-architecture.md, phase3-design-spec.md

---

## Overview

Adds a full Investments page to Stashtrend at `/investments` and `/investments/:accountId`. Three new Flask endpoints serve account summary data, per-account holdings, and performance time-series with contribution detection. The frontend consists of one page component (`InvestmentsPage`) and five child components. Navigation and routing entries are added to two existing files. The API client gains three new functions. No database migrations are required.

The page has two views controlled by `useParams()` inside a single component: the dashboard view (account table + summary stats + performance chart) and the holdings drill-down (holdings table + allocation donut). All computation (CAGR, returns, allocation, security-type normalization) happens server-side.

---

## Changes

---

### BACKEND

---

```
File: /home/user/stashtrend/backend/app.py
Lines: new block appended after the existing endpoints (approximately after line 2400)
Parallelism: independent
Description: Add three new Flask endpoint handlers and three private helper functions.
Details:
  - Add helper: _compute_account_cagr(account_id, conn)
      * Query account_history for the given account_id ordered by date ASC.
      * Strip leading rows where balance IS NULL or balance <= 0.
      * If fewer than 30 non-zero-balance days remain, return None.
      * Compute years = (latest_date - earliest_date).days / 365.25.
      * If years <= 0, return None.
      * Return round((latest_balance / earliest_balance) ** (1.0 / years) - 1, 4) * 100.
      * All dates parsed as datetime.date using datetime.strptime(row['date'], '%Y-%m-%d').date().

  - Add helper: _normalize_security_type(raw_type)
      * Mapping dict (lowercase keys):
          'stock': 'Stock', 'equity': 'Stock',
          'etf': 'ETF', 'exchange_traded_fund': 'ETF',
          'mutual_fund': 'Mutual Fund', 'mutual fund': 'Mutual Fund',
          'bond': 'Bond', 'fixed_income': 'Bond',
          'cash': 'Cash', 'money_market': 'Cash', 'cash_equivalent': 'Cash'
      * If raw_type is None or empty, or not in map: return 'Other'.
      * Input coerced with (raw_type or '').lower().strip().

  - Add helper: _get_investment_account_ids(conn)
      * Query accounts WHERE include_in_net_worth=1 AND is_hidden=0.
      * For each account row, call _get_bucket(row['type'], row['subtype']).
      * Return list of account dicts (id, name, institution, type, subtype, current_balance)
        for accounts where bucket IN ('Retirement', 'Brokerage').
      * Also returns the bucket value per account.

  - Add endpoint: GET /api/investments/summary
      * Call _get_investment_account_ids(conn) to get the account list.
      * In a single SQL query, batch-aggregate holdings per account:
          SELECT account_id,
                 SUM(total_value) AS total_value,
                 SUM(basis) AS total_basis,
                 COUNT(*) AS holdings_count,
                 MAX(last_synced_at) AS last_synced_at
          FROM holdings
          WHERE account_id IN (?, ?, ...)
          GROUP BY account_id
      * For each account, merge the aggregated holdings row (or use current_balance fallback
        when holdings_count = 0 or total_value is NULL).
      * Compute per-account:
          total_return_dollars = total_value - total_basis (None if total_basis IS NULL)
          total_return_pct = total_return_dollars / total_basis * 100 (None if basis 0 or NULL)
          cagr_pct = _compute_account_cagr(account_id, conn)
      * Compute allocation_weight_pct for each account:
          portfolio_total = sum of all account current_values
          weight = (account_value / portfolio_total) * 100
      * Compute staleness:
          is_stale = last_synced_at > 24 hours ago (compare against UTC now)
          stale_days = (now - last_synced_at).days
      * Compute portfolio-level totals: sum current_value, total_cost_basis,
        total_return_dollars; total_return_pct from totals; cagr_pct as
        weighted average of per-account CAGR (weight by current_value, skip None).
      * Return JSON matching the architecture contract:
          { "accounts": [...], "totals": {...} }
      * Sort accounts by current_value DESC in the response.
      * On any unhandled exception: return jsonify({"error": str(e)}), 500.

  - Add endpoint: GET /api/investments/accounts/<account_id>/holdings
      * Validate account_id is an investment account: call _get_investment_account_ids,
        check id in result. Return 404 with {"error": "Account not found"} if not.
      * Query all holdings WHERE account_id = ? ORDER BY total_value DESC NULLS LAST.
      * For each holding:
          normalized_type = _normalize_security_type(holding['security_type'])
          unrealized_gain_loss_dollars = total_value - basis (None if basis NULL)
          unrealized_gain_loss_pct = gain / basis * 100 (None if basis NULL or 0)
          ticker display: holding['ticker'] or None (frontend shows "N/A")
          security_name display: holding['security_name'] or None (frontend shows "Unknown Security")
      * Compute allocation array:
          Group holdings by normalized_type, sum total_value per type.
          Compute pct = type_value / total_portfolio_value * 100.
          Merge types where pct < 2.0 into a single "Other" bucket.
          Sort by value DESC.
      * Compute totals: SUM(total_value), SUM(basis), SUM(gain_loss_dollars),
        gain_loss_pct from totals.
      * Return JSON matching architecture contract:
          { "account": {...}, "holdings": [...], "allocation": [...], "totals": {...} }
      * On any unhandled exception: return jsonify({"error": str(e)}), 500.

  - Add endpoint: GET /api/investments/performance
      * Query params: accounts (comma-sep IDs, optional), range (default '1y').
      * Parse range to date cutoff:
          '3m' -> 3 months, '6m' -> 6 months, '1y' -> 12 months,
          '3y' -> 36 months, '5y' -> 60 months, 'all' -> None
          Use datetime.date.today() - relativedelta(months=N) or dateutil.
          Fallback: manual subtraction if dateutil unavailable:
            cutoff = date(today.year - y, today.month, today.day) (handle month boundary).
      * Determine account_ids: parse accounts param (split on ',', strip),
        then intersect with _get_investment_account_ids to prevent unauthorized access.
        If no accounts param, use all investment account IDs.
      * Query account_history:
          SELECT account_id, date, balance
          FROM account_history
          WHERE account_id IN (?, ...) AND date >= ?
          ORDER BY date ASC
      * Pivot into date-keyed series:
          { date: "YYYY-MM-DD", total: float, accounts: { acct_id: float } }
          total = sum of all account balances for that date (only include accounts
          that have a row for that date in the total — do NOT fill missing dates).
      * Query contributions:
          SELECT t.account_id,
                 strftime('%Y-%m', t.date) AS month,
                 SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS contributions
          FROM transactions t
          JOIN categories c ON t.category_id = c.id
          WHERE t.account_id IN (?, ...)
            AND c.group_type = 'transfer'
            AND t.is_pending = 0
          GROUP BY t.account_id, strftime('%Y-%m', t.date)
          ORDER BY month ASC
        Apply date cutoff: only months >= cutoff month (strftime('%Y-%m', cutoff)).
      * Pivot contributions into month-keyed list:
          { month: "YYYY-MM", total: float, accounts: { acct_id: float } }
      * Build account_names map: { acct_id: name } for all returned accounts.
      * Return JSON: { "series": [...], "contributions": [...], "account_names": {...} }
      * On any unhandled exception: return jsonify({"error": str(e)}), 500.
```

---

### FRONTEND — API CLIENT

---

```
File: /home/user/stashtrend/frontend/src/api.js
Lines: append after last existing export (the file currently ends near line ~60-80)
Parallelism: independent
Description: Add three named fetch functions for the new investment endpoints.
Details:
  - Export fetchInvestmentsSummary = () => fetchJSON('/api/investments/summary')
  - Export fetchInvestmentsHoldings = (accountId) =>
      fetchJSON(`/api/investments/accounts/${accountId}/holdings`)
  - Export fetchInvestmentsPerformance = (range = '1y', accounts = '') =>
      fetchJSON(`/api/investments/performance?range=${range}${accounts ? `&accounts=${accounts}` : ''}`)
  - Follow the exact pattern of existing named exports in the file (no default export, just named).
```

---

### FRONTEND — NAVIGATION AND ROUTING

---

```
File: /home/user/stashtrend/frontend/src/nav.js
Lines: NAV_ITEMS array (currently 5 items)
Parallelism: independent
Description: Insert Investments nav item at index 1 (after Net Worth, before Account Groups).
Details:
  - Insert after the { path: '/networth', ... } entry:
      { path: '/investments', label: 'Investments', icon: '\uD83D\uDCBC' }
  - The icon is the briefcase emoji (💼). Use the Unicode escape to avoid encoding issues.
  - No changes to Sidebar.jsx or BottomTabBar.jsx — both consume NAV_ITEMS directly.
```

```
File: /home/user/stashtrend/frontend/src/App.jsx
Lines: Routes block inside AppShell (currently lines 36-43)
Parallelism: independent (but must be coordinated with InvestmentsPage.jsx creation)
Description: Add two Route entries for the investments page.
Details:
  - Add import at top of file:
      import InvestmentsPage from './pages/InvestmentsPage.jsx'
  - Inside <Routes>, before the catch-all Route path="*", insert:
      <Route path="/investments" element={<InvestmentsPage />} />
      <Route path="/investments/:accountId" element={<InvestmentsPage />} />
  - Position them after the /networth route and before /groups, following existing order.
  - The catch-all Route path="*" must remain the last route.
```

---

### FRONTEND — PAGE COMPONENT

---

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.jsx
Lines: new file
Parallelism: depends-on: api.js, nav.js, App.jsx; also depends-on child components listed below
Description: Page component that owns all state and dispatches to dashboard or drill-down view.
Details:
  - Imports: useEffect, useState from 'react'; useParams, useNavigate from 'react-router-dom';
    fetchInvestmentsSummary, fetchInvestmentsHoldings, fetchInvestmentsPerformance from '../api.js';
    InvestmentAccountsTable, InvestmentPerformanceChart, AccountDetailHeader,
    HoldingsTable, AllocationChart from their component paths;
    styles from './InvestmentsPage.module.css'.

  - State:
      const { accountId } = useParams()
      const isDrillDown = Boolean(accountId)
      const [summary, setSummary] = useState(null)       // /api/investments/summary response
      const [performance, setPerformance] = useState(null) // /api/investments/performance response
      const [holdings, setHoldings] = useState(null)     // /api/investments/accounts/:id/holdings response
      const [perfRange, setPerfRange] = useState('1y')
      const [loading, setLoading] = useState(true)
      const [perfLoading, setPerfLoading] = useState(false)
      const [holdingsLoading, setHoldingsLoading] = useState(false)
      const [error, setError] = useState(null)
      const [perfError, setPerfError] = useState(null)
      const [holdingsError, setHoldingsError] = useState(null)
      const [lastUpdated, setLastUpdated] = useState(null)

  - Dashboard data loader (named function, not arrow, to allow button ref):
      function loadDashboardData() {
        setError(null)
        setLoading(true)
        fetchInvestmentsSummary()
          .then((s) => { setSummary(s); setLastUpdated(new Date().toLocaleTimeString()) })
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false))
        // Performance loads independently (separate loading state):
        setPerfLoading(true)
        fetchInvestmentsPerformance(perfRange)
          .then((p) => setPerformance(p))
          .catch((err) => setPerfError(err.message))
          .finally(() => setPerfLoading(false))
      }

  - Performance re-fetch on range change:
      useEffect(() => {
        if (isDrillDown) return
        setPerfError(null)
        setPerfLoading(true)
        fetchInvestmentsPerformance(perfRange)
          .then((p) => setPerformance(p))
          .catch((err) => setPerfError(err.message))
          .finally(() => setPerfLoading(false))
      }, [perfRange])

  - Dashboard mount effect:
      useEffect(() => {
        if (!isDrillDown) loadDashboardData()
      }, [])

  - Drill-down fetch effect:
      useEffect(() => {
        if (!isDrillDown) return
        setHoldingsError(null)
        setHoldingsLoading(true)
        setHoldings(null)
        fetchInvestmentsHoldings(accountId)
          .then((h) => setHoldings(h))
          .catch((err) => {
            if (err.status === 404) setHoldingsError('not_found')
            else setHoldingsError(err.message)
          })
          .finally(() => setHoldingsLoading(false))
      }, [accountId])

  - Stale data: compute maxStaleDays from summary?.accounts as Math.max of stale_days values.
    showStaleBanner = maxStaleDays >= 7.

  - Render structure:
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Investments</h1>
          <div className={styles.pageActions}>
            {lastUpdated && !isDrillDown && <span className={styles.updatedAt}>Updated at {lastUpdated}</span>}
            {!isDrillDown && <button className={styles.refreshBtn} onClick={loadDashboardData}>↻ Refresh</button>}
          </div>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {loading && <div className={styles.loading}>Loading…</div>}
          {!loading && error && <div className={styles.errorBox}>...</div>}
        </div>

        {!loading && !error && !isDrillDown && (
          <>
            {showStaleBanner && <div className={styles.staleBanner}>...</div>}
            {summary?.accounts?.length === 0
              ? <EmptyState />  /* inline, no separate component */
              : <>
                  <SummaryCards totals={summary?.totals} />  /* inline JSX, not a separate file */
                  <InvestmentPerformanceChart ... />
                  <InvestmentAccountsTable accounts={summary?.accounts} />
                </>
            }
          </>
        )}

        {isDrillDown && (
          <>
            {holdingsLoading && <div className={styles.loading}>Loading holdings…</div>}
            {!holdingsLoading && holdingsError === 'not_found' && <div className={styles.errorBox}>Account not found...</div>}
            {!holdingsLoading && holdingsError && holdingsError !== 'not_found' && <div className={styles.errorBox}>...</div>}
            {!holdingsLoading && !holdingsError && holdings && (
              <>
                <AccountDetailHeader account={holdings.account} totals={holdings.totals} />
                <div className={styles.drillDownGrid}>
                  <HoldingsTable holdings={holdings.holdings} accountName={holdings.account.name} />
                  <AllocationChart allocation={holdings.allocation} totals={holdings.totals} accountName={holdings.account.name} />
                </div>
              </>
            )}
          </>
        )}
      </div>

  - SummaryCards: rendered inline as a <div className={styles.summaryRow}> with three card divs.
    Card 1: PORTFOLIO VALUE — fmtFull(totals.current_value), total return sub-row.
    Card 2: TOTAL RETURN — fmtFull(totals.total_return_dollars) colored by sign; "N/A" when null.
    Card 3: EST. CAGR — fmtPct(totals.cagr_pct) colored by sign; "—" when null.
    Each card has a "?" tooltip trigger for the CAGR card (simple CSS hover tooltip via
    position:absolute, controlled by :hover on the parent span).

  - Skeleton for SummaryCards: when summary is null and !loading and !error,
    render three <div className={styles.skeletonCard}> placeholders.
    (The summary cards render as skeleton while loading=false but summary=null
    is not a valid state — during loading=true the loading div shows.
    The skeleton state is only needed if summary and performance load independently;
    since summary uses its own loading flag, treat loading=true as the skeleton trigger.)
```

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.module.css
Lines: new file
Parallelism: independent (can be written in parallel with InvestmentsPage.jsx)
Description: CSS module for the page shell.
Details:
  - .pageHeader: copy exact spec from NetWorthPage.module.css (.pageHeader, .pageTitle,
    .pageActions, .updatedAt, .refreshBtn, .loading, .errorBox, .errorTitle, .errorMsg).
    The glow pseudo-element: .pageHeader::before { content:''; position:absolute;
    inset:-40px -60px; background:radial-gradient(ellipse at 50% 0%, var(--accent-tint) 0%,
    transparent 70%); pointer-events:none; z-index:0; }
  - .pageTitle: font-size:18px; font-weight:400; color:var(--text-primary);
    letter-spacing:-0.3px; @media(min-width:768px){ font-size:20px; }
  - .updatedAt: font-size:12px; color:var(--text-muted);
    @media(max-width:767px){ display:none; }
  - .refreshBtn: background:var(--bg-card); border:1px solid var(--border);
    color:var(--text-secondary); border-radius:8px; min-height:38px;
    padding:6px 14px; cursor:pointer; font-size:13px; letter-spacing:1.5px;
    text-transform:uppercase;
  - .loading: color:var(--text-muted); font-size:14px; text-align:center;
    padding:var(--sp-8) 0;
  - .errorBox: background:var(--bg-card); border:1px solid var(--color-negative);
    border-radius:var(--radius-lg); padding:24px 20px; text-align:center;
    @media(min-width:768px){ padding:32px; }
  - .staleBanner: background:var(--bg-error-subtle); border:1px solid var(--border-error);
    border-radius:var(--radius-lg); padding:var(--sp-3) var(--sp-4);
    color:var(--color-warning); font-size:13px; font-weight:500;
    margin-bottom:var(--sp-5);
  - .emptyState: display:flex; flex-direction:column; align-items:center;
    justify-content:center; padding:var(--sp-12) 0; gap:var(--sp-3); text-align:center;
  - .emptyIcon: font-size:48px; line-height:1;
  - .emptyHeading: font-size:16px; font-weight:500; color:var(--text-primary); margin:0;
  - .emptyBody: font-size:14px; color:var(--text-secondary); margin:0;
  - .emptyLink: color:var(--accent); text-decoration:none;
    &:hover{ text-decoration:underline; }
  - .summaryRow: display:grid; grid-template-columns:1fr; gap:12px;
    margin-bottom:20px;
    @media(min-width:480px){ grid-template-columns:repeat(3,1fr); gap:16px; }
    @media(min-width:768px){ margin-bottom:24px; }
  - .summaryCard: background:var(--bg-card); border-radius:var(--radius-lg);
    border:1px solid var(--border); padding:16px 20px;
    transition:border-color var(--ease-smooth);
    &:hover{ border-color:var(--accent-border-hover); }
    @media(min-width:768px){ padding:20px 24px; }
  - .skeletonCard: height:100px; border-radius:var(--radius-lg);
    background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-hover) 50%,var(--bg-card) 75%);
    background-size:800px 100%; animation:shimmer 1.5s infinite;
  - .cardLabel: font-size:10px; text-transform:uppercase; letter-spacing:2px;
    font-weight:500; color:var(--text-muted); margin-bottom:var(--sp-2);
    display:flex; align-items:center; gap:4px;
  - .cardValue: font-size:24px; font-weight:400; color:var(--text-primary);
    @media(min-width:768px){ font-size:28px; }
  - .cardSub: font-size:13px; margin-top:4px; display:flex; align-items:center; gap:4px;
  - .positive: color:var(--color-positive);
  - .negative: color:var(--color-negative);
  - .muted: color:var(--text-muted);
  - .tooltipTrigger: width:16px; height:16px; border-radius:50%; background:var(--bg-raised);
    border:1px solid var(--border); display:inline-flex; align-items:center;
    justify-content:center; font-size:10px; cursor:help; position:relative;
    color:var(--text-muted);
  - .tooltipPopup: display:none; position:absolute; bottom:calc(100% + 6px); left:50%;
    transform:translateX(-50%); background:var(--bg-raised); border:1px solid var(--border);
    border-radius:var(--radius-md); padding:var(--sp-2) var(--sp-3);
    color:var(--text-secondary); font-size:12px; font-weight:400; max-width:220px;
    box-shadow:var(--shadow-md); white-space:normal; z-index:10; width:max-content;
    .tooltipTrigger:hover > &, .tooltipTrigger:focus > &{ display:block; }
  - .drillDownGrid: display:grid; grid-template-columns:1fr; gap:var(--sp-5);
    @media(min-width:768px){ grid-template-columns:3fr 2fr; }
  - @media(forced-colors:active){ .refreshBtn, .tooltipTrigger { outline:2px solid; } }
```

---

### FRONTEND — CHILD COMPONENTS

All five child components are independent of each other and can be written in parallel. All depend on the CSS token system which already exists. None depend on the page component being complete first — they are pure presentational components that receive props.

---

```
File: /home/user/stashtrend/frontend/src/components/InvestmentAccountsTable.jsx
Lines: new file
Parallelism: independent
Description: Sortable account list table for the dashboard view.
Details:
  - Props: accounts (array), loading (bool).
  - Internal state: sortCol (string, default 'current_value'), sortDir ('asc'|'desc', default 'desc').
  - Sort toggle: clicking a column header sets sortCol to that column; if same column, toggle sortDir.
  - Sorted accounts: useMemo over accounts sorted by sortCol/sortDir.
  - Grouped rendering: split sorted accounts into Retirement and Brokerage groups; render a
    group header <tr> (colspan all columns) before each group.
  - Imports: useNavigate from 'react-router-dom'; fmtFull, fmtPct, COLOR_POSITIVE, COLOR_NEGATIVE
    from '../components/chartUtils.jsx'; styles from './InvestmentAccountsTable.module.css'.
  - Table markup:
      <table aria-label="Investment accounts">
        <caption className={styles.visuallyHidden}>
          Investment accounts sorted by {sortCol} {sortDir}
        </caption>
        <thead><tr>
          {columns.map(col => (
            <th scope="col" aria-sort={activeSortAttr(col)}
                tabIndex={0}
                onClick={() => handleSort(col.key)}
                onKeyDown={e => (e.key==='Enter'||e.key===' ') && handleSort(col.key)}>
              {col.label} {sortIcon(col.key)}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {loading ? <SkeletonRows /> : <GroupedRows />}
        </tbody>
        <tfoot><TotalsRow /></tfoot>
      </table>
  - Column visibility: controlled by CSS classes (hideBelow768, hideBelow1024) set on <th> and <td>.
    Do not use JS for responsive column hiding — use CSS classes from the module file.
  - Account row click: <tr tabIndex={0} role="row" onClick={()=>navigate(`/investments/${acct.id}`)}
    onKeyDown={e=>(e.key==='Enter'||e.key===' ') && navigate(`/investments/${acct.id}`)}>
  - Stale badge: render in account name cell when acct.is_stale && acct.stale_days < 7.
    Text: `Synced ${acct.stale_days}d ago`.
  - Return cells: prefix '+' for positive dollars; use Arrow helper for percentage.
  - Totals row: sums over all accounts for current_value, total_return_dollars, total_return_pct.
    CAGR and allocation_weight columns: empty in totals row.
  - Skeleton: render 4 <tr> rows each with shimmer <td> cells at varying widths.
  - Arrow helper: inline function — given a value, return '▲' in positive color or '▼' in negative color.
  - CAGR display: if cagr_pct is null, show "—"; if string "Insufficient data", show that in muted.
    (Backend returns null for insufficient data; frontend shows "—".)
```

```
File: /home/user/stashtrend/frontend/src/components/InvestmentAccountsTable.module.css
Lines: new file
Parallelism: independent (parallel with InvestmentAccountsTable.jsx)
Description: Styles for the accounts table component.
Details:
  - .container: background:var(--bg-card); border-radius:var(--radius-lg);
    border:1px solid var(--border); padding:16px; margin-bottom:var(--sp-5);
    @media(min-width:768px){ padding:20px 24px; }
  - .tableTitle: font-size:15px; font-weight:500; color:var(--text-primary);
    margin-bottom:16px;
  - .tableWrapper: overflow-x:auto;
  - table: width:100%; border-collapse:collapse;
  - th: font-size:10px; text-transform:uppercase; letter-spacing:2px; font-weight:500;
    color:var(--text-muted); padding:8px 12px; border-bottom:1px solid var(--border);
    text-align:left; cursor:pointer; user-select:none; white-space:nowrap;
    &:hover{ color:var(--text-secondary); }
    &:focus-visible{ outline:2px solid var(--border-focus); outline-offset:-2px; }
    @media(forced-colors:active){ &:focus-visible{ outline:2px solid; } }
  - td: font-size:13px; font-weight:400; padding:12px; vertical-align:middle;
    border-bottom:1px solid var(--border-sub);
  - .groupHeader td: font-size:10px; text-transform:uppercase; letter-spacing:2px;
    font-weight:500; color:var(--text-muted); background:var(--bg-root);
    padding:6px 12px; border-bottom:none;
  - tr.accountRow: cursor:pointer; transition:background var(--ease-quick);
    &:hover{ background:var(--bg-hover); }
    &:focus-visible{ outline:2px solid var(--border-focus); outline-offset:-2px; }
  - .accountName: font-size:14px; font-weight:500; color:var(--text-primary);
  - .institution: font-size:12px; font-weight:400; color:var(--text-muted); margin-top:2px;
  - .staleBadge: display:inline-block; font-size:10px; font-weight:500;
    color:var(--color-warning); background:rgba(245,166,35,0.15);
    border:1px solid rgba(245,166,35,0.3); border-radius:var(--radius-pill);
    padding:2px 8px; margin-top:4px;
  - .positive: color:var(--color-positive);
  - .negative: color:var(--color-negative);
  - .muted: color:var(--text-muted);
  - .secondary: color:var(--text-secondary);
  - tfoot td: background:var(--bg-raised); border-top:1px solid var(--border);
    font-weight:500;
  - .visuallyHidden: position:absolute; width:1px; height:1px; clip:rect(0,0,0,0);
    overflow:hidden;
  - .hideBelow768: @media(max-width:767px){ display:none; }
  - .hideBelow1024: @media(max-width:1023px){ display:none; }
  - .alignRight: text-align:right;
  - .shimmerRow td: padding:8px 12px;
  - .shimmerCell: height:24px; border-radius:4px;
    background:linear-gradient(90deg,var(--bg-hover) 25%,var(--bg-raised) 50%,var(--bg-hover) 75%);
    background-size:600px 100%; animation:shimmer 1.5s infinite;
  - .emptyRow td: text-align:center; color:var(--text-muted); font-size:14px; height:80px;
```

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.jsx
Lines: new file
Parallelism: independent
Description: Multi-account line chart with contribution bar overlay and Y-axis mode toggle.
Details:
  - Props: performance (API response object), loading (bool), error (string|null),
    range (string), onRangeChange (func), perfLoading (bool for range-change re-fetch).
  - Imports: ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer from 'recharts'; RangeSelector from './RangeSelector.jsx';
    useResponsive from '../hooks/useResponsive.js';
    fmtFull, fmtCompact, fmtPct, formatDateLabel, AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE,
    COLOR_ACCENT from './chartUtils.jsx';
    styles from './InvestmentPerformanceChart.module.css'.

  - Local constants (module-level, NOT in chartUtils):
      const COLOR_MUTUAL_FUND = '#9B7FE8'
      const COLOR_CASH = '#5EDDA8'
      const COLOR_AMBER = '#F5A623'
      const ACCOUNT_COLORS = ['#4D9FFF','#2ECC8A','#F5A623','#9B7FE8','#FF5A7A','#5EDDA8','#7DBFFF','#F5D76E']
      const INVEST_RANGES = [{label:'3M',months:3},{label:'6M',months:6},{label:'1Y',months:12},
                              {label:'3Y',months:36},{label:'5Y',months:60},{label:'All',months:null}]
      const tooltipStyles = { ...TOOLTIP_STYLE }

  - Internal state:
      const [yMode, setYMode] = useState('value')        // 'value' | 'pct'
      const [showContribs, setShowContribs] = useState(true)
      const [activeAccounts, setActiveAccounts] = useState(new Set(['__total__']))

  - Effect: when performance data arrives, initialize activeAccounts to include '__total__'
    plus all account IDs from performance.account_names.

  - Derived data (useMemo):
      chartData: transform performance.series for recharts.
        Each element: { date, total, [acctId]: value, ... }
        For 'pct' mode: normalize each series value by its first non-null value:
          ((v - first) / first) * 100.
        Apply downsample from chartUtils if series.length > 200.
      hasContribs: performance?.contributions?.length > 0
      contribData: performance.contributions mapped to { month, total, [acctId]: value }

  - Toggle chip handling (follows GroupsTimeChart pattern):
      toggleAccount(id) sets activeAccounts via Set add/delete.
      'All Combined' chip id = '__total__', maps to series key 'total'.

  - Render:
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>Performance</span>
          <RangeSelector ranges={INVEST_RANGES} activeRange={range} onSelect={onRangeChange} />
        </div>
        <div className={styles.controls}>
          <div className={styles.yModeToggle}>
            <button onClick={()=>setYMode('value')} className={yMode==='value'?styles.active:''}>$ Value</button>
            <button onClick={()=>setYMode('pct')} className={yMode==='pct'?styles.active:''}>% Change</button>
          </div>
          <button className={...} onClick={()=>setShowContribs(v=>!v)}
            disabled={!hasContribs} title={!hasContribs?'No contribution data detected':''}>
            {showContribs ? '☑' : '☐'} Show contributions
          </button>
        </div>
        <div className={styles.chips}>
          {['__total__', ...accountIds].map(id => (
            <button key={id} onClick={()=>toggleAccount(id)} className={activeAccounts.has(id)?styles.chipActive:styles.chip}
              style={activeAccounts.has(id)?{borderColor: colorFor(id), background: colorFor(id)+'22'}:{}}>
              <span className={styles.chipDot} style={{background: colorFor(id)}} />
              {id==='__total__' ? 'All Combined' : performance.account_names[id]}
            </button>
          ))}
        </div>
        <figure aria-label="Investment performance chart">
          <figcaption className={styles.visuallyHidden}>
            Performance chart, {range} range, {activeAccounts.size} accounts selected.
          </figcaption>
          {loading && <div className={styles.skeleton} />}
          {!loading && perfLoading && (
            <div className={styles.chartWrapper} style={{opacity:0.4}}>
              <ResponsiveContainer>...</ResponsiveContainer>
              <div className={styles.refetchSpinner} />
            </div>
          )}
          {!loading && !perfLoading && chartData?.length === 0 && (
            <div className={styles.emptyChart}>No performance data available for the selected range.</div>
          )}
          {!loading && !perfLoading && chartData?.length > 0 && (
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 340}>
              <ComposedChart data={chartData} margin={{top:10,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" width={isMobile?52:72}
                  tickFormatter={yMode==='pct' ? n=>`${n.toFixed(1)}%` : fmtCompact}
                  tick={AXIS_TICK} tickLine={false} axisLine={false} />
                {showContribs && hasContribs && (
                  <YAxis yAxisId="contributions" orientation="right" width={52}
                    tickFormatter={fmtCompact} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                )}
                <Tooltip content={<CustomTooltip yMode={yMode} showContribs={showContribs} />}
                  contentStyle={tooltipStyles} />
                {activeAccounts.has('__total__') && (
                  <Line yAxisId="left" type="monotone" dataKey="total"
                    stroke={COLOR_ACCENT} strokeWidth={2.5} dot={false}
                    activeDot={{r:5}} connectNulls name="All Combined" />
                )}
                {accountIds.filter(id=>activeAccounts.has(id)).map((id,i) => (
                  <Line key={id} yAxisId="left" type="monotone" dataKey={id}
                    stroke={ACCOUNT_COLORS[(i+1) % ACCOUNT_COLORS.length]}
                    strokeWidth={1.5} dot={false} activeDot={{r:4}} connectNulls
                    name={performance.account_names[id]} />
                ))}
                {showContribs && hasContribs && (
                  <Bar yAxisId="contributions" dataKey="total" data={contribData}
                    fill={COLOR_AMBER} opacity={0.4} radius={[2,2,0,0]} name="Est. Contributions" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </figure>
      </div>

  - CustomTooltip: functional component in same file. Shows date, sorted entries by value,
    contribution section if showContribs. Uses tooltipStyles spread.
  - colorFor(id): returns ACCOUNT_COLORS[0] for '__total__', else ACCOUNT_COLORS[(index+1) % len].
```

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.module.css
Lines: new file
Parallelism: independent (parallel with InvestmentPerformanceChart.jsx)
Description: Styles for the performance chart component.
Details:
  - .container: background:var(--bg-card); border-radius:var(--radius-lg);
    border:1px solid var(--border); padding:16px; margin-bottom:var(--sp-5);
    @media(min-width:768px){ padding:20px 24px; }
  - .header: display:flex; align-items:center; justify-content:space-between;
    flex-wrap:wrap; gap:var(--sp-3); margin-bottom:var(--sp-3);
    @media(max-width:599px){ flex-direction:column; align-items:flex-start; }
  - .title: font-size:15px; font-weight:500; color:var(--text-primary);
    @media(min-width:768px){ font-size:16px; }
  - .controls: display:flex; align-items:center; justify-content:space-between;
    flex-wrap:wrap; gap:var(--sp-2); margin-bottom:var(--sp-3);
  - .yModeToggle: display:flex; gap:4px;
    button: font-size:13px; font-weight:500; border:1px solid var(--border);
    border-radius:var(--radius-md); padding:4px 12px; background:transparent;
    color:var(--text-muted); cursor:pointer;
    &.active{ background:var(--bg-raised); color:var(--text-primary); border-color:var(--border); }
    &:focus-visible{ outline:2px solid var(--border-focus); }
  - .contribToggle: font-size:13px; color:var(--text-secondary); background:transparent;
    border:none; cursor:pointer; padding:4px 8px;
    &:disabled{ opacity:0.4; cursor:not-allowed; }
    &:focus-visible{ outline:2px solid var(--border-focus); }
  - .chips: display:flex; flex-wrap:wrap; gap:var(--sp-2); margin-bottom:var(--sp-4);
  - .chip, .chipActive: font-size:12px; font-weight:500; border:1px solid var(--border);
    border-radius:var(--radius-pill); padding:4px 12px; min-height:36px;
    cursor:pointer; background:transparent; color:var(--text-muted);
    display:flex; align-items:center; gap:6px; transition:all var(--ease-quick);
    &:focus-visible{ outline:2px solid var(--border-focus); }
  - .chipActive: color:var(--text-primary);
  - .chipDot: width:8px; height:8px; border-radius:50%; flex-shrink:0;
  - .skeleton: height:340px; border-radius:var(--radius-md);
    background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-hover) 50%,var(--bg-card) 75%);
    background-size:800px 100%; animation:shimmer 1.5s infinite;
    @media(max-width:767px){ height:220px; }
  - .chartWrapper: position:relative;
  - .refetchSpinner: position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    width:20px; height:20px; border:2px solid var(--border);
    border-top-color:var(--accent); border-radius:50%;
    animation:spin 0.8s linear infinite;
  - .emptyChart: height:160px; display:flex; align-items:center; justify-content:center;
    font-size:14px; color:var(--text-muted); font-style:italic;
    @media(min-width:768px){ height:200px; }
  - .visuallyHidden: position:absolute; width:1px; height:1px; clip:rect(0,0,0,0); overflow:hidden;
  - @keyframes spin { to{ transform:translate(-50%,-50%) rotate(360deg); } }
  - @media(forced-colors:active){ button:focus-visible{ outline:2px solid; } }
```

```
File: /home/user/stashtrend/frontend/src/components/AccountDetailHeader.jsx
Lines: new file
Parallelism: independent
Description: Header card for the holdings drill-down view with back link, account info, and metrics.
Details:
  - Props: account ({ id, name, institution, bucket }), totals ({ current_value, total_cost_basis,
    unrealized_gain_loss_dollars, unrealized_gain_loss_pct, holdings_count }), last_synced_at (string).
  - Imports: Link from 'react-router-dom'; fmtFull, fmtPct from './chartUtils.jsx';
    styles from './AccountDetailHeader.module.css'.
  - Staleness computed: (Date.now() - Date.parse(last_synced_at)) / (1000*60*60*24) > 1 → isStale.
  - Render:
      <div className={styles.container}>
        <Link to="/investments" className={styles.backLink}>← Investments</Link>
        <div className={styles.accountIdentity}>
          <div>
            <div className={styles.accountName}>{account.name}</div>
            <div className={styles.institution}>
              {account.institution}
              <span className={styles.bucketBadge}>{account.bucket}</span>
            </div>
          </div>
        </div>
        <div className={styles.metricsRow}>
          <MetricItem label="CURRENT VALUE" value={fmtFull(totals.current_value)} />
          <MetricItem label="TOTAL RETURN" value={...with sign and color...} />
          <MetricItem label="COST BASIS" value={fmtFull(totals.total_cost_basis) || 'N/A'} />
          <MetricItem label="HOLDINGS" value={`${totals.holdings_count} positions`} className={styles.desktopOnly} />
        </div>
        <div className={styles.lastSynced}>
          Last synced: {relativeTime(last_synced_at)}
          {isStale && <span className={styles.staleBadge}>Stale</span>}
        </div>
      </div>
  - MetricItem: inline functional component that renders label + value stacked.
  - relativeTime: simple helper — if < 1h: 'just now'; if < 24h: 'Nh ago'; else: 'Nd ago'.
  - Return/Gain coloring: if unrealized_gain_loss_dollars > 0 use positive class, else negative.
    Show 'N/A' in muted when null.
```

```
File: /home/user/stashtrend/frontend/src/components/AccountDetailHeader.module.css
Lines: new file
Parallelism: independent
Description: Styles for the account detail header.
Details:
  - .container: background:var(--bg-card); border-radius:var(--radius-lg);
    border:1px solid var(--border); padding:16px; margin-bottom:var(--sp-5);
    @media(min-width:768px){ padding:20px 24px; }
  - .backLink: display:block; font-size:13px; font-weight:500; color:var(--accent);
    text-decoration:none; margin-bottom:var(--sp-3);
    &:hover{ color:var(--accent-hover); text-decoration:underline; }
  - .accountIdentity: margin-bottom:var(--sp-3);
  - .accountName: font-size:18px; font-weight:400; color:var(--text-primary);
    @media(min-width:768px){ font-size:20px; }
  - .institution: font-size:13px; color:var(--text-muted); display:flex;
    align-items:center; gap:8px; margin-top:4px;
  - .bucketBadge: font-size:10px; text-transform:uppercase; letter-spacing:1.5px;
    font-weight:600; color:var(--accent-wash); background:var(--accent-tint);
    border:1px solid var(--accent-border-hover); border-radius:var(--radius-pill);
    padding:2px 8px;
  - .metricsRow: display:flex; flex-wrap:wrap; gap:var(--sp-5); margin-top:var(--sp-4);
    border-top:1px solid var(--border-sub); padding-top:var(--sp-4);
  - .metric: display:flex; flex-direction:column; gap:4px;
  - .metricLabel: font-size:10px; text-transform:uppercase; letter-spacing:2px;
    font-weight:500; color:var(--text-muted);
  - .metricValue: font-size:16px; font-weight:400; color:var(--text-primary);
  - .metricSub: font-size:13px; margin-top:2px; display:flex; gap:4px; align-items:center;
  - .positive: color:var(--color-positive);
  - .negative: color:var(--color-negative);
  - .muted: color:var(--text-muted);
  - .desktopOnly: @media(max-width:767px){ display:none; }
  - .lastSynced: text-align:right; font-size:11px; color:var(--text-muted);
    margin-top:var(--sp-3); display:flex; justify-content:flex-end; align-items:center; gap:8px;
  - .staleBadge: same spec as InvestmentAccountsTable staleBadge.
```

```
File: /home/user/stashtrend/frontend/src/components/HoldingsTable.jsx
Lines: new file
Parallelism: independent
Description: Sortable, filterable holdings table for the drill-down view.
Details:
  - Props: holdings (array), accountName (string), loading (bool).
  - Internal state: sortCol (default 'current_value'), sortDir ('desc'), typeFilter ('All').
  - TYPE_OPTIONS = ['All', 'Stock', 'ETF', 'Mutual Fund', 'Bond', 'Cash', 'Other']
  - Filtered holdings: filter by typeFilter if not 'All'.
  - Sorted holdings: sort filtered by sortCol/sortDir via useMemo.
  - Sort toggle: same pattern as InvestmentAccountsTable.
  - Imports: fmtFull, fmtPct from './chartUtils.jsx';
    styles from './HoldingsTable.module.css'.
  - Type badge colors: defined as a module-level object (uses hex for inline style since in SVG-like context):
      TYPE_COLORS = { Stock: '#4D9FFF', ETF: '#2ECC8A', Bond: '#F5A623',
                      'Mutual Fund': '#9B7FE8', Cash: '#5EDDA8', Other: '#4A6080' }
    Badge renders as: <span style={{color: TYPE_COLORS[type], background: TYPE_COLORS[type]+'22',
      border: `1px solid ${TYPE_COLORS[type]}55`}} className={styles.typeBadge}>{type}</span>
  - Render:
      <div className={styles.container}>
        <div className={styles.controlsRow}>
          <span className={styles.tableTitle}>Holdings</span>
          <select aria-label="Filter by security type" value={typeFilter}
            onChange={e=>setTypeFilter(e.target.value)} className={styles.typeSelect}
            disabled={loading}>
            {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className={styles.tableWrapper}>
          <table aria-label={`Holdings for ${accountName}`}>
            <caption className={styles.visuallyHidden}>
              Holdings sorted by {sortCol} {sortDir}, filtered by {typeFilter}
            </caption>
            <thead>...</thead>
            <tbody>
              {loading ? <SkeletonRows n={5} /> : <HoldingRows />}
            </tbody>
            <tfoot><TotalsRow /></tfoot>
          </table>
        </div>
        <div aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>
          {sortCol} sorted {sortDir}
        </div>
      </div>
  - HoldingRow cells:
      Ticker: holding.ticker || 'N/A' + is_manual badge if is_manual===1.
      Security Name (desktop): holding.security_name || 'Unknown Security'.
      Type: type badge using TYPE_COLORS.
      Quantity: holding.quantity !== null ? holding.quantity.toFixed(4) : '--'.
      Cost Basis: holding.cost_basis !== null ? fmtFull(holding.cost_basis) : '--'.
      Current Value: fmtFull(holding.current_value).
      Gain/Loss $: if null → 'N/A' muted; else formatted with sign + color.
      Gain/Loss %: if null → 'N/A' muted; else fmtPct with Arrow + color.
  - Totals row: sum current_value and cost_basis (skip nulls); gain/loss computed from totals.
  - Empty state: single row colspan all, centered message.
  - Filtered empty: "No [typeFilter] holdings in this account."
```

```
File: /home/user/stashtrend/frontend/src/components/HoldingsTable.module.css
Lines: new file
Parallelism: independent
Description: Styles for the holdings table.
Details:
  - .container: background:var(--bg-card); border-radius:var(--radius-lg);
    border:1px solid var(--border); padding:16px;
    @media(min-width:768px){ padding:20px 24px; }
  - .controlsRow: display:flex; align-items:center; justify-content:space-between;
    gap:var(--sp-3); margin-bottom:var(--sp-4);
  - .tableTitle: font-size:15px; font-weight:500; color:var(--text-primary);
  - .typeSelect: background:var(--bg-inset); border:1px solid var(--border);
    border-radius:var(--radius-md); padding:6px 10px; color:var(--text-secondary);
    font-size:13px; min-height:36px; cursor:pointer;
    &:focus{ border-color:var(--border-focus); box-shadow:0 0 0 1px var(--accent); outline:none; }
    &:disabled{ opacity:0.5; cursor:not-allowed; }
  - .tableWrapper: overflow-x:auto;
  - table: width:100%; border-collapse:collapse;
  - th: (same as InvestmentAccountsTable th, minus sortable pointer if non-sortable — but all are sortable here)
  - td: font-size:13px; padding:10px 12px; border-bottom:1px solid var(--border-sub);
    vertical-align:middle;
  - .ticker: font-family:'Courier New',monospace; font-size:14px; font-weight:500;
    color:var(--text-primary);
  - .tickerNull: color:var(--text-muted);
  - .securityName: font-size:13px; color:var(--text-secondary);
    overflow:hidden; text-overflow:ellipsis; max-width:200px; white-space:nowrap;
  - .typeBadge: font-size:11px; font-weight:500; border-radius:var(--radius-pill);
    padding:2px 8px; white-space:nowrap;
  - .manualBadge: font-size:10px; font-weight:500; text-transform:uppercase;
    color:var(--text-muted); background:var(--bg-raised); border:1px solid var(--border);
    border-radius:var(--radius-pill); padding:1px 6px; margin-left:4px;
  - .positive, .negative, .muted, .secondary: (same color classes as above)
  - tfoot td: background:var(--bg-raised); border-top:2px solid var(--border); font-weight:500;
  - .visuallyHidden: (same as other modules)
  - .hideBelow768: @media(max-width:767px){ display:none; }
  - .alignRight: text-align:right;
  - (Skeleton shimmer classes matching InvestmentAccountsTable pattern)
```

```
File: /home/user/stashtrend/frontend/src/components/AllocationChart.jsx
Lines: new file
Parallelism: independent
Description: Donut chart for asset allocation by security type. First use of PieChart in the codebase.
Details:
  - Props: allocation (array of {type, value, pct}), totals ({current_value}), accountName (string), loading (bool).
  - Imports: PieChart, Pie, Cell, Tooltip, ResponsiveContainer from 'recharts';
    fmtFull, fmtCompact, fmtPct, TOOLTIP_STYLE from './chartUtils.jsx';
    useResponsive from '../hooks/useResponsive.js';
    styles from './AllocationChart.module.css'.
  - Local constants (module-level):
      const SLICE_COLORS = { Stock:'#4D9FFF', ETF:'#2ECC8A', Bond:'#F5A623',
                              'Mutual Fund':'#9B7FE8', Cash:'#5EDDA8', Other:'#4A6080' }
      const tooltipStyles = { ...TOOLTIP_STYLE }
  - Inner/outer radii from useResponsive:
      const { isMobile } = useResponsive()
      innerRadius = isMobile ? 50 : 60
      outerRadius = isMobile ? 80 : 95
      chartHeight = isMobile ? 180 : 200
  - Render:
      <figure aria-label={`Asset allocation donut chart for ${accountName}`} className={styles.container}>
        <h3 className={styles.title}>Asset Allocation</h3>
        {loading && <div className={styles.skeletonCircle} />}
        {!loading && (!allocation || allocation.length === 0) && (
          <div className={styles.emptyState}>No allocation data available.</div>
        )}
        {!loading && allocation?.length > 0 && (
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie data={allocation} dataKey="value" innerRadius={innerRadius}
                  outerRadius={outerRadius} paddingAngle={2}>
                  {allocation.map((entry, i) => (
                    <Cell key={entry.type} fill={SLICE_COLORS[entry.type] || SLICE_COLORS.Other}
                      aria-label={`${entry.type}: ${fmtFull(entry.value)}, ${entry.pct.toFixed(1)}%`} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} contentStyle={tooltipStyles} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centerLabel}>
              <div className={styles.centerValue}>{fmtCompact(totals.current_value)}</div>
              <div className={styles.centerSub}>total</div>
            </div>
          </div>
        )}
        {!loading && allocation?.length > 0 && (
          <ul role="list" className={styles.legend}>
            {allocation.map(item => (
              <li key={item.type} className={styles.legendRow}>
                <span className={styles.legendDot} style={{background: SLICE_COLORS[item.type]||SLICE_COLORS.Other}} />
                <span className={styles.legendName}>{item.type}</span>
                <span className={styles.legendValue}>{fmtFull(item.value)}</span>
                <span className={styles.legendPct}>{item.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        )}
        <figcaption className={styles.visuallyHidden}>
          Asset allocation legend: {allocation?.map(a=>`${a.type} ${a.pct.toFixed(1)}%`).join(', ')}
        </figcaption>
      </figure>
  - CustomPieTooltip: inline functional component. Shows type name, fmtFull(value), fmtPct(pct).
  - The center label is absolutely positioned over the chart area via the .chartWrap container
    using position:relative on .chartWrap and position:absolute+transform:translate(-50%,-50%)
    at top:50% left:50% on .centerLabel.
```

```
File: /home/user/stashtrend/frontend/src/components/AllocationChart.module.css
Lines: new file
Parallelism: independent
Description: Styles for the allocation donut chart.
Details:
  - .container: background:var(--bg-card); border-radius:var(--radius-lg);
    border:1px solid var(--border); padding:16px;
    @media(min-width:768px){ padding:20px 24px; }
  - .title: font-size:15px; font-weight:500; color:var(--text-primary);
    margin-bottom:var(--sp-4); margin-top:0;
  - .chartWrap: position:relative; /* enables center-label absolute positioning */
  - .centerLabel: position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%); text-align:center; pointer-events:none;
  - .centerValue: font-size:16px; font-weight:400; color:var(--text-primary);
  - .centerSub: font-size:11px; color:var(--text-muted);
  - .legend: list-style:none; margin:var(--sp-3) 0 0; padding:0;
    display:flex; flex-direction:column; gap:var(--sp-2);
  - .legendRow: display:flex; align-items:center; gap:var(--sp-2);
  - .legendDot: width:10px; height:10px; border-radius:3px; flex-shrink:0;
  - .legendName: font-size:13px; color:var(--text-secondary); flex:1;
  - .legendValue: font-size:13px; color:var(--text-primary);
  - .legendPct: font-size:12px; color:var(--text-muted); min-width:40px; text-align:right;
  - .skeletonCircle: width:200px; height:200px; border-radius:50%;
    background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-hover) 50%,var(--bg-card) 75%);
    background-size:800px 100%; animation:shimmer 1.5s infinite; margin:0 auto;
  - .emptyState: height:160px; display:flex; align-items:center; justify-content:center;
    font-size:14px; color:var(--text-muted); font-style:italic;
  - .visuallyHidden: position:absolute; width:1px; height:1px; clip:rect(0,0,0,0); overflow:hidden;
```

---

## Dependency Order

The following serialization constraints apply. Items not listed here can run in parallel.

**Group A — Independent (run all in parallel):**
- `backend/app.py` additions
- `frontend/src/api.js` additions
- `frontend/src/nav.js` edit
- `frontend/src/components/InvestmentAccountsTable.jsx` + `.module.css`
- `frontend/src/components/InvestmentPerformanceChart.jsx` + `.module.css`
- `frontend/src/components/AccountDetailHeader.jsx` + `.module.css`
- `frontend/src/components/HoldingsTable.jsx` + `.module.css`
- `frontend/src/components/AllocationChart.jsx` + `.module.css`

**Group B — Depends on Group A (can parallelize within B once A completes):**
- `frontend/src/pages/InvestmentsPage.jsx` — depends on all child components and api.js
- `frontend/src/pages/InvestmentsPage.module.css` — can be written in parallel with InvestmentsPage.jsx

**Group C — Depends on InvestmentsPage.jsx existing:**
- `frontend/src/App.jsx` edit — needs the import to resolve

All test files can be written in parallel with their target implementation files (interfaces are fully specified above).

---

## Test Strategy

### Backend Tests

```
File: /home/user/stashtrend/backend/tests/test_investments.py
Lines: new file
Parallelism: independent (can be written against the API contract before backend is complete)
```

Tests to write (Python `unittest`, following existing test patterns in `backend/tests/`):

**`test_compute_account_cagr`**
- Happy path: 400 days of history, positive start/end balance → correct CAGR %
- Fewer than 30 days → returns None
- Zero starting balance → returns None
- Negative starting balance → returns None
- All null balances → returns None
- Single day of history → returns None
- Start equals end (0% return) → returns 0.0

**`test_investments_summary_endpoint`**
- GET /api/investments/summary with populated accounts+holdings → 200, correct JSON shape
- Accounts with no holdings: uses current_balance fallback
- CAGR None when insufficient history → `cagr_pct: null` in response
- `is_stale` and `stale_days` computed correctly for 25-hour-old last_synced_at
- Empty investment accounts → `{ "accounts": [], "totals": {...} }`
- Non-investment accounts excluded (checking account must not appear)
- `is_hidden=1` accounts excluded
- `include_in_net_worth=0` accounts excluded

**`test_investments_holdings_endpoint`**
- GET /api/investments/accounts/<valid_id>/holdings → 200, all holding fields present
- 404 for non-investment account_id
- 404 for unknown account_id
- Holdings with NULL basis → `unrealized_gain_loss_dollars: null`
- Holdings with NULL ticker → ticker field is null (not missing)
- Security type normalization: 'equity' → 'Stock', 'exchange_traded_fund' → 'ETF', NULL → 'Other'
- Allocation: types < 2% merged into Other
- Single security type → allocation has one entry
- No holdings → holdings: [], allocation: [], totals all zero/null

**`test_investments_performance_endpoint`**
- GET /api/investments/performance → 200, series and contributions arrays
- Range param: 3m, 6m, 1y, 3y, 5y, all → correct date cutoff applied
- accounts param: filters to specific accounts only
- Unknown accounts param values: intersection with valid accounts (no 500)
- Missing categories join (orphaned category_id): contribution query returns 0, not error
- Amount sign: positive amounts → contributions (test with explicit DB fixture)
- Empty contributions when no transfer transactions → contributions: []

**`test_normalize_security_type`**
- All known types in both casings: 'stock', 'Stock', 'STOCK' → 'Stock'
- 'etf', 'ETF', 'exchange_traded_fund' → 'ETF'
- None, empty string, 'unknown_type' → 'Other'

### Frontend Tests

```
File: /home/user/stashtrend/frontend/src/pages/InvestmentsPage.test.jsx
Lines: new file
Parallelism: independent
```

- Renders "Loading…" on mount before data arrives
- Renders summary cards after data loads (mock fetchInvestmentsSummary)
- Renders empty state when accounts array is empty
- Renders error box when fetchInvestmentsSummary rejects
- Renders stale banner when maxStaleDays >= 7
- Navigates to /investments/:accountId when account row is clicked (mock useNavigate)
- Drill-down view: renders AccountDetailHeader + HoldingsTable + AllocationChart for :accountId route
- Drill-down: 404 holdingsError shows "Account not found" message
- Refresh button calls loadDashboardData (re-fetches summary)
- Range change triggers performance re-fetch with new range param

```
File: /home/user/stashtrend/frontend/src/components/InvestmentAccountsTable.test.jsx
Lines: new file
Parallelism: independent
```

- Renders shimmer rows when loading=true
- Renders account rows with correct values
- Bucket group headers appear (Retirement, Brokerage)
- Positive return renders in positive color class; negative in negative
- Clicking column header sorts (first click → desc; second click → asc)
- Clicking account row navigates to /investments/:id
- Enter/Space on row navigates (keyboard accessibility)
- Stale badge appears for is_stale=true, stale_days=2
- Stale badge not shown when stale_days >= 7
- Null CAGR shows "—"
- Totals row shows correct sums

```
File: /home/user/stashtrend/frontend/src/components/HoldingsTable.test.jsx
Lines: new file
Parallelism: independent
```

- Renders holdings with all columns
- NULL ticker renders "N/A"
- NULL security_name renders "Unknown Security"
- NULL cost_basis renders "--" for basis cell, "N/A" for gain/loss cells
- NULL quantity renders "--"
- is_manual=1 renders "Manual" badge
- Type filter: selecting "ETF" hides non-ETF rows
- Filtered empty state: "No ETF holdings in this account."
- Column sort toggle (value desc default, click → asc)
- Totals row sums skipping null basis
- Loading=true shows 5 shimmer rows

```
File: /home/user/stashtrend/frontend/src/components/AllocationChart.test.jsx
Lines: new file
Parallelism: independent
```

- Renders pie chart segments for each allocation entry
- Empty allocation array shows "No allocation data available."
- Legend rows show type, value, percentage
- Single-type allocation renders without error
- Loading shows shimmer circle
- Center label shows formatted total value

```
File: /home/user/stashtrend/frontend/src/components/InvestmentPerformanceChart.test.jsx
Lines: new file
Parallelism: independent
```

- Renders loading skeleton when loading=true
- Renders empty state when series data is empty
- Range selector triggers onRangeChange callback
- Y-axis toggle between "$ Value" and "% Change" does not crash
- Account chip toggle shows/hides lines
- Contribution toggle: disabled when no contributions
- Contribution toggle: enabled and checked by default when contributions exist

### Existing Tests That May Break

- `frontend/src/App.test.jsx` (if it exists): may need updating to include the new routes
- Any navigation snapshot tests: the new nav item changes the NAV_ITEMS array length and content

### Edge Cases the Tests Must Cover

- All numeric fields null simultaneously (account with no holdings, no history)
- Portfolio with a single account (allocation weight = 100%)
- Very large portfolio values (> $1M): ensure fmtFull/fmtCompact don't overflow
- Monarch amount sign inversion for contributions: if fixture data shows negative amounts as
  contributions, the SQL SUM(CASE WHEN amount > 0) will return 0 — test must verify the
  backend fixture uses the correct sign convention and document the assumption

---

## Rollback Notes

- `backend/app.py`: All new code is additive (new functions + new routes). Roll back by reverting the appended block. No existing routes modified.
- `frontend/src/nav.js`: Revert the array entry. The sidebar and bottom tab bar revert automatically.
- `frontend/src/App.jsx`: Remove the two Route entries and the import.
- All new frontend files (`InvestmentsPage.jsx`, `InvestmentsPage.module.css`, and all 10 component files): simply delete.
- `frontend/src/api.js`: Remove the three new export functions.
- No database migrations were performed, so no migration rollback is required.
- No existing behavior was modified — rollback is purely additive deletion.
