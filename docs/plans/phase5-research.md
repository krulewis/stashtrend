# Phase 5 Research — Monte Carlo Simulation + AI Narrative Layer

**Date:** 2026-03-09
**Agent:** Researcher

---

## 1. Existing AI Infrastructure

### `_call_ai()` Helper (`backend/app.py`, line ~1704)
- Signature: `_call_ai(prompt: str, conn, max_tokens: int = 1024) -> (text, stop_reason, provider)`
- Routes to either Anthropic SDK or OpenAI-compatible SDK based on `ai_provider` setting
- Returns `(None, ...)` if AI not configured
- Key retrieval via `_get_ai_key(conn)` (keychain-first, settings fallback)

### Rate Limiting Pattern
- `_ai_cooldowns` dict + `_ai_cooldowns_lock` (threading.Lock) + `_check_ai_rate_limit(endpoint)` function
- 2-second per-endpoint cooldown
- Returns 429 JSON error if called too soon
- Each endpoint has its own cooldown key (e.g., `"ai_analyze"`, `"fetch_builder_regional_ai"`)

### Existing AI Endpoints
| Endpoint | Purpose | Cooldown Key |
|----------|---------|--------------|
| `POST /api/ai/analyze` | Budget analysis | `ai_analyze` |
| `POST /api/budget-builder/regional/fetch` | Regional cost data | `fetch_builder_regional_ai` |
| `POST /api/budget-builder/generate` | Budget plan generation | `generate_budget_plan` |

### AI Config Endpoints
- `GET /api/ai/config` → returns `{configured, provider, model}` (never returns key)
- `POST /api/ai/config` → saves provider, key, model, base_url

### Frontend AI Pattern (`api.js`)
```js
export const fetchAiConfig = () => fetchJSON('/api/ai/config')
export const saveAiConfig = (data) => mutateJSON('/api/ai/config', 'POST', data)
export const runAiAnalysis = () => mutateJSON('/api/ai/analyze', 'POST', {})
```

---

## 2. Budget AI Analysis Panel (UX Reference)

### Component: `AIAnalysisPanel.jsx`
- **Pattern:** Collapsible panel with header toggle (chevron up/down)
- **States:** loading config → idle (unconfigured → config form) | idle (configured → run button) | running (spinner) | done (analysis text + re-run/reconfigure)
- **CSS:** Uses design tokens (`var(--bg-card)`, `var(--border)`, `var(--accent)`, etc.)
- **Key CSS classes:** `.panel`, `.header`, `.body`, `.runningRow`, `.spinner`, `.analysisText`, `.configuredView`, `.badges`, `.configForm`, `.btnPrimary`, `.btnGhost`, `.errorMsg`

### UX Flow
1. Panel collapsed by default (header only visible)
2. Click header → expands
3. If AI not configured → shows config form (provider, key, model, base_url)
4. If configured → shows provider/model badges + "Run Analysis" button
5. Click run → spinner + "Analyzing your budget data..."
6. Done → pre-formatted analysis text + Re-run/Reconfigure buttons
7. Error → red error message, retry available

### What to Reuse for Forecasting AI Panel
- Same collapsible panel pattern and CSS structure
- Same config check flow (fetchAiConfig on mount)
- Same running/done/error state machine
- **Difference:** The forecasting panel needs to pass projection/simulation data in the POST body, whereas budget analysis POST body is empty (server fetches budget data itself)

---

## 3. Historical Data Availability for Monte Carlo

### `security_prices` Table: DOES NOT EXIST
The requirements doc mentioned `security_prices` as optional ("Optionally track price history"). **It was never implemented in Phase 0.** The pipeline schema (`pipeline/monarch_pipeline/schema.py`) has no `security_prices` table. This is a critical gap.

### `account_history` Table (EXISTS)
```sql
CREATE TABLE IF NOT EXISTS account_history (
    account_id  TEXT NOT NULL,
    date        TEXT NOT NULL,
    balance     REAL,
    PRIMARY KEY (account_id, date),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```
- Daily balance snapshots per account from Monarch sync
- Available for all synced accounts (investment, cash, etc.)
- **Can derive portfolio-level daily returns** from sum of investment account balances
- **Volatility estimation:** Calculate daily log returns from account_history, then annualize

### `holdings` Table (EXISTS)
```sql
CREATE TABLE IF NOT EXISTS holdings (
    id TEXT PRIMARY KEY, account_id TEXT, security_id TEXT,
    security_name TEXT, ticker TEXT, security_type TEXT,
    quantity REAL, basis REAL, total_value REAL, current_price REAL,
    is_manual INTEGER, last_synced_at TEXT, synced_at TEXT
);
```
- Current positions snapshot (latest sync only, no history)
- Has ticker symbols — could be used for external price lookup (out of scope)
- **Not useful for historical volatility** (point-in-time snapshot only)

### Volatility Estimation Strategy
**Recommended: Use `account_history` for portfolio-level volatility.**
- Sum daily balances across investment accounts → portfolio time series
- Calculate daily log returns: `ln(P_t / P_{t-1})`
- Adjust for contributions (detected from transactions or approximated)
- Annualize: `daily_std * sqrt(252)`
- **Pro:** Uses real synced data, no new tables needed
- **Con:** Contribution noise inflates apparent volatility; must account for deposits/withdrawals

**Alternative: Create `security_prices` table**
- Would require new pipeline step to fetch historical prices
- More accurate per-security volatility
- Significant scope increase — new API calls, new storage, new sync entity
- **Recommendation:** Defer to future enhancement. Use account_history for v1.

---

## 4. Recharts Patterns for Probability Bands

### Existing Chart Architecture
- `TypeStackedChart.jsx` — stacked `<AreaChart>` with multiple `<Area>` fills
- `NetWorthChart.jsx` — line chart with `<ReferenceLine>` for milestones
- Shared utils in `chartUtils.jsx`: `fmtCompact`, `fmtFull`, `fmtPct`, `filterByRange`, `downsample`, `TOOLTIP_STYLE`, `COMMON_RANGES`, `AXIS_TICK`, `GRID_STROKE`

### Rendering Probability Bands in Recharts
Recharts doesn't have a native "confidence band" component, but bands can be rendered using:

**Option A: Stacked `<Area>` components (recommended)**
- Data shape: `{ date, p10, p25, p50, p75, p90 }`
- Render from outside-in: p10-p90 as lightest fill, p25-p75 as medium, p50 as line
- Use `<Area>` with `baseLine` prop or compute delta values for stacking
- Actually, Recharts `<Area>` supports a `type="monotone"` with `fillOpacity` for layered bands

**Option B: Custom SVG `<path>` elements**
- More control but harder to maintain
- Not consistent with existing codebase patterns

**Option C: Two `<Area>` components per band with inverted fills**
- Top area for upper bound, bottom area clipped — complex

**Recommended approach:** Use multiple `<Area>` components with decreasing `fillOpacity`:
```jsx
<Area dataKey="p90" stroke="none" fill={COLOR_ACCENT} fillOpacity={0.08} />
<Area dataKey="p75" stroke="none" fill={COLOR_ACCENT} fillOpacity={0.12} />
<Area dataKey="p50" stroke={COLOR_ACCENT} fill={COLOR_ACCENT} fillOpacity={0.18} strokeWidth={2} />
<Area dataKey="p25" stroke="none" fill={COLOR_ACCENT} fillOpacity={0.12} />
<Area dataKey="p10" stroke="none" fill={COLOR_ACCENT} fillOpacity={0.08} />
```
**Correction:** This won't work because each `<Area>` fills down to zero. The correct approach is to compute band data as nested ranges and use the `baseValue` or calculate deltas:
- Data: `{ date, p10, p25, p50, p75, p90 }` (absolute values)
- Use Recharts' `<Area>` with `stackId` and delta values (p90-p75, p75-p50, etc.) — similar to how TypeStackedChart stacks buckets
- Or use a custom shape/reference area

**Best practice for Recharts bands:**
- Compute data as: `{ date, band_90_upper: p90, band_90_lower: p10, band_75_upper: p75, band_75_lower: p25, median: p50 }`
- Use Recharts' `<ReferenceArea>` for static bands, or custom `<Area>` rendering for time-varying bands
- Most common Recharts approach: plot pairs of `<Area>` with one visible and one transparent, using `stackId`

---

## 5. Monte Carlo Simulation Best Practices

### Standard Approach: Geometric Brownian Motion (GBM)
The industry-standard method for portfolio Monte Carlo simulation:

1. **Model:** `S(t+1) = S(t) * exp((mu - sigma^2/2)*dt + sigma*sqrt(dt)*Z)`
   - `mu` = expected annual return (e.g., historical CAGR or user-set)
   - `sigma` = annualized volatility (from account_history)
   - `Z` = standard normal random variable
   - `dt` = time step (1/12 for monthly, 1/252 for daily)

2. **Monthly time steps** are standard for retirement projections (daily is overkill for 30-year horizons)

3. **Number of simulations:** 1,000 is minimum; 5,000 is standard; 10,000+ for publication-quality. Diminishing returns above 5,000.

4. **Percentile extraction:** After running N simulations, at each time step sort the N values and extract the 10th/25th/50th/75th/90th percentiles.

5. **Contributions:** Add monthly contribution to balance at each step before applying returns.

### Implementation Considerations

- **Python `numpy`:** GBM simulation is trivially vectorized with numpy. 5,000 runs × 360 months = ~1.8M random draws — completes in <1 second.
- **Random seed:** Optional reproducibility seed in request (for debugging). Production runs should be truly random.
- **Caching:** Cache results keyed on `(portfolio_value, monthly_contribution, return_pct, volatility, years, num_simulations)`. TTL: until next sync or settings change.
- **Contribution-adjusted volatility:** If using account_history, must strip out contribution effects before calculating volatility. Approximate: `daily_return = (balance_t - balance_{t-1} - estimated_daily_contribution) / balance_{t-1}`.

### Probability of Target
- Count simulations where final value >= nest egg target
- `probability = count / total_simulations`
- Display as percentage with one decimal: "73.2% chance of reaching your target"

---

## 6. Existing Retirement Math (`retirementMath.js`)

### Available Functions
- `computeNestEgg(desiredAnnualIncome, socialSecurityAnnual, withdrawalRatePct)` → required nest egg
- `generateProjectionSeries({currentNetWorth, monthlyContribution, annualReturnPct, years, startDate})` → monthly projection array
- `mergeHistoryWithProjection(history, projection)` → merged timeline

### RetirementPanel Integration
- `RetirementPanel.jsx` reads `typeData` prop for investable capital (Retirement + Brokerage buckets)
- Calls `generateProjectionSeries()` for simple projection
- Displays `RetirementSummary` with on/off track badge
- Advanced settings toggle already exists (return %, SS, withdrawal rate)

### What Phase 5 Needs from Phase 4
Phase 4 will build a dedicated Forecasting page. Phase 5 adds Monte Carlo bands to that page's chart and an AI panel. The key inputs Phase 5 needs:
- Current investable capital
- Monthly contribution amount
- Expected return rate (user-configured or CAGR-derived)
- Historical volatility (new — computed from account_history)
- Retirement target (nest egg from computeNestEgg)
- Time horizon (years to retirement)

---

## 7. Backend Route Patterns

All routes follow the pattern in `app.py`:
```python
@app.route("/api/<resource>", methods=["GET"])
def get_resource():
    conn = get_db()
    # ... query ...
    return jsonify(result)

@app.route("/api/<resource>", methods=["POST"])
def create_resource():
    body = request.get_json() or {}
    # ... validate, process ...
    return jsonify(result)
```

For AI-powered endpoints: rate limit check first, then `_call_ai()`, then format response.

Suggested endpoints for Phase 5:
- `POST /api/forecast/montecarlo` — run simulation, return percentile bands
- `POST /api/forecast/ai-analysis` — generate AI narrative for projections

---

## 8. Key Findings Summary

| Finding | Impact | Recommendation |
|---------|--------|----------------|
| `security_prices` table doesn't exist | Cannot do per-security volatility | Use `account_history` for portfolio-level volatility (v1) |
| `account_history` has daily balances | Good enough for volatility estimation | Strip contribution effects before computing returns |
| `_call_ai()` is well-established | Easy to add new AI endpoint | Follow existing pattern exactly |
| `AIAnalysisPanel` is reusable | Can fork/adapt for forecasting | Pass projection data in POST body instead of server-side fetch |
| Recharts lacks native band chart | Need creative `<Area>` composition | Use stacked delta areas with varying opacity |
| `numpy` available for Monte Carlo | Fast vectorized simulation | 5,000 runs in <1 second with numpy |
| Retirement settings already exist | Inputs for simulation are available | Phase 4 will expose these on the Forecasting page |
| Phase 4 dependency is hard | Must be built first | All Phase 5 work assumes Forecasting page route and components exist |
