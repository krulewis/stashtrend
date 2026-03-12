# StashTrend Wiki

StashTrend is a self-hosted personal finance dashboard for [Monarch Money](https://monarchmoney.com) users. It pulls your financial data from Monarch Money and stores it locally in a SQLite database — no accounts, no cloud, nothing leaves your machine.

---

## Table of Contents

- [Net Worth Dashboard](#net-worth-dashboard)
- [Account Groups](#account-groups)
- [Budget vs Actuals](#budget-vs-actuals)
- [Budget Builder](#budget-builder)
- [Sync Data](#sync-data)
- [AI Integration](#ai-integration)
- [Retirement Planning](#retirement-planning)
- [Investment Holdings](#investment-holdings)
- [Privacy & Security](#privacy--security)

---

## Net Worth Dashboard

**Route:** `/networth`

The Net Worth Dashboard is your financial home base. It gives you a historical view of your overall financial picture.

### Stat Cards

At the top of the page, three cards show:
- **Current Net Worth** — your total net worth as of the most recent sync
- **Month-over-Month Change** — difference vs. the same day last month
- **Year-over-Year Change** — difference vs. the same day last year

### Net Worth Over Time Chart

A line chart showing your net worth history. Milestone markers (if configured) appear as labeled reference lines on the chart. You can refresh the chart to pick up newly synced data.

### Account Breakdown

A collapsible grouped list of all your synced accounts with their current balances, organized by account type, so you can see at a glance where your money lives.

### Net Worth by Account Type

A stacked area chart that buckets your accounts into categories:

| Bucket | What's Included |
|---|---|
| **Retirement** | 401k, IRA, Roth IRA, 403b, pension, and similar |
| **Brokerage** | Taxable investment accounts, HSA, 529 |
| **Cash** | Checking, savings, money market |
| **Real Estate** | Home equity |
| **Debt** | Mortgages, student loans, credit cards (shown as negative) |
| **Other** | Vehicles, collectibles, and anything else |

Debt uses a secondary Y-axis (right side) with inverted ticks so you can read the magnitude without negative signs cluttering the chart. The right-axis ticks mirror the left-axis values exactly — for example, $1M on the left aligns with −$1M on the right.

### CAGR by Bucket

Below the stacked chart, StashTrend calculates the estimated **Compound Annual Growth Rate** for each bucket over 1, 3, and 5 year windows. These figures are approximations derived from account balance history — not a true internal rate of return — so actual investment performance may differ, particularly for accounts with significant contributions or withdrawals during the period.

---

## Account Groups

**Route:** `/groups`

Account Groups let you bundle accounts into custom logical groupings — for example, "Liquid Cash", "Retirement Accounts", or "Total Debt" — and track them over time independently of the built-in account type buckets.

### Creating and Managing Groups

- Click **New Group** to create a group, give it a name, and assign a color
- Add any accounts you want tracked in that group
- Remove accounts or delete groups at any time
- If the same account appears in multiple groups, StashTrend displays a conflict indicator in the UI

### Group Time Chart

A line chart showing each group's total balance history. Each group gets its own color-coded line, making it easy to spot trends in any custom slice of your finances.

### Group Snapshot

A current-balance summary broken down by group — useful for a quick sanity check at a glance.

### Snapshot Configurations

You can **save** the current set of active groups as a named configuration and **restore** it later. This is handy if you want to quickly toggle between different views (e.g., a "debt payoff" view vs. an "investment growth" view) without re-selecting accounts each time.

---

## Budget vs Actuals

**Route:** `/budgets`

The Budget vs Actuals page compares your Monarch Money budget targets against what you actually spent, month by month.

### The Table

The table is split into two sections:
- **Income** — all income categories with monthly actuals and a monthly total row
- **Expenses** — expense categories organized by Monarch's category groups (Food & Drink, Transportation, etc.) with a monthly total row

Transfers are automatically excluded from all calculations.

### Time Range

Use the time range selector to view the last **3**, **6**, or **12** months.

### Budget vs Actual Bar Chart

A bar chart overlaying your budget target and actual spending side by side, with an income bar for context. This makes it easy to spot months where you went over or under.

### AI Budget Analysis

An optional panel (requires [AI configuration](#ai-integration)) that analyzes your spending patterns and surfaces insights. You can run the analysis on demand; results are displayed inline. API keys are stored securely and reused between sessions.

---

## Budget Builder

**Route:** `/builder`

The Budget Builder uses AI to generate a personalized monthly budget across all your Monarch categories, grounded in real regional cost-of-living data.

### Step 1 — Your Profile

Fill in:
- Monthly take-home income
- Location (city/region)
- Number of children and their ages
- Housing type (rent vs. own)
- Any upcoming life events or financial goals

### Step 2 — Regional Cost Data

The AI fetches local benchmarks for your area — typical costs for groceries, childcare, utilities, insurance, transportation, and more. You can review and edit these numbers before proceeding.

### Step 3 — Budget Recommendations

Based on your profile and regional data, the AI produces a suggested monthly budget for every Monarch category. Use the **months ahead** selector (1–6 months) to control how many future months the budget covers. The results appear in an editable table — adjust any line before applying.

### Apply to Monarch

Once you're happy with the numbers, click **Apply** to push the budget back to Monarch Money directly.

### Saved Plans

You can save any budget plan with a name and timestamp and reload it later. Saved plans support full CRUD — you can rename them, edit individual line items, track when a plan was last applied to Monarch, and delete plans you no longer need. Multiple plans can be stored, making it easy to compare a conservative vs. aggressive spending scenario.

> Budget Builder requires an AI provider to be configured. See [AI Integration](#ai-integration).

---

## Sync Data

**Route:** `/sync`

The Sync page controls how and when StashTrend fetches data from Monarch Money.

### Manual Sync

Trigger an on-demand sync of any combination of the following entities:

| Entity | What It Fetches |
|---|---|
| **Accounts** | Account metadata (names, types, institution) |
| **Account History** | Daily balance snapshots |
| **Holdings** | Investment positions (ticker, quantity, value, cost basis) |
| **Categories** | Transaction categories from Monarch |
| **Transactions** | Individual transaction records |
| **Budgets** | Monthly budget targets |

You can also enable **Full Refresh** to wipe and re-fetch all data for the selected entities (instead of an incremental update).

### Auto-Sync

Configure a sync interval from 0 to 24 hours. When set, a background scheduler automatically syncs all entities on that cadence.

- Set to **0** to disable auto-sync (the default — auto-sync is off until you configure it)

### Sync History

A table of the most recent sync jobs (up to 10) showing:
- Start and end time
- Duration
- Entities synced
- Row counts and deltas (rows added/changed)
- Status and any errors

### Live Status

While a sync is running, the page polls for live progress so you can watch entities complete in real time.

---

## AI Integration

AI features are optional and require you to supply your own API key. StashTrend supports two provider types:

| Provider | Examples |
|---|---|
| **Anthropic** | Claude models (e.g. claude-opus-4-5, claude-sonnet-4-5) |
| **OpenAI-compatible** | OpenAI GPT models, Ollama, Groq, or any provider with an OpenAI-compatible API |

For the model name, enter any identifier supported by your chosen provider — consult your provider's documentation for the latest available models.

### Configuring AI

Open the **Budgets** page and expand the **"Analyze with AI"** panel at the bottom. If no AI provider is configured, a setup form appears inline — enter your provider type, model name, API key, and (for OpenAI-compatible providers) a base URL. Once saved, the configuration persists and is reused by both the Budget Analysis and Budget Builder features. Keys are stored in your system keychain (with a secure file fallback in Docker environments).

### Where AI Is Used

1. **Budget Analysis** (Budget vs Actuals page) — interprets your spending history and provides narrative insights
2. **Regional Data Fetch** (Budget Builder Step 2) — retrieves local cost-of-living benchmarks for your location
3. **Budget Generation** (Budget Builder Step 3) — produces a full personalized budget recommendation

A 2-second rate limit between AI calls prevents accidental runaway usage.

---

## Retirement Planning

Retirement planning lives in the **Net Worth Dashboard** as a collapsible panel — scroll to the bottom of the `/networth` page to find the **Retirement Target** section.

### Settings

Configure:
- **Current age** and **target retirement age**
- **Desired annual retirement income** in today's dollars
- **Monthly contributions** you're currently making
- **Expected annual return** (used for projection math)
- **Expected annual Social Security income**
- **Withdrawal rate (%)** — defaults to 4% (the classic safe withdrawal rule) but is fully adjustable

### Milestones

Add custom financial milestones — for example, "Pay off mortgage" or "Reach $1M" — with target dollar amounts. Milestones appear as labeled reference lines on the Net Worth Over Time chart.

### Retirement Summary

A summary panel shows:
- **Projected nest egg** at your target retirement age based on your current balances and settings
- **Required nest egg** derived from your desired income and withdrawal rate
- **On-track status** — a color-coded badge indicating whether your projected savings meets your goal
- Social Security offset applied to reduce the required nest egg

---

## Investment Holdings

Holdings are synced from Monarch Money per investment account and stored locally.

Each holding record includes:
- Security name and ticker symbol
- Security type
- Quantity of shares/units
- Cost basis
- Current price and total current value
- Whether the holding was entered manually in Monarch

To view holdings data, sync the **Holdings** entity from the Sync page.

---

## Privacy & Security

StashTrend is designed to keep your financial data entirely on your own machine:

- **Browser-level CORS restriction** — the API rejects cross-origin browser requests from any origin other than `localhost`, `127.0.0.1`, and `[::1]` (IPv6 loopback). Note that CORS does not restrict non-browser access; if your machine is reachable on a local network, consider firewalling port 5050 to localhost-only.
- **No external data transmission** — your financial data never leaves your machine (AI features send only the data you explicitly submit to the analysis prompt)
- **Secure credential storage** — your Monarch token and AI API keys are stored in your system keychain (macOS) or in a permission-restricted file (`chmod 600`) on Linux; Docker deployments can use the `MONARCH_TOKEN` environment variable
- **Prompt sanitization** — AI input is sanitized before being sent to prevent injection attacks
- **Security headers** — the nginx reverse proxy sets `X-Frame-Options: DENY`, Content Security Policy, `X-Content-Type-Options: nosniff`, and `Permissions-Policy` on all responses
- **Debug mode off by default** — Flask debug mode requires explicit opt-in via the `FLASK_DEBUG=1` environment variable
