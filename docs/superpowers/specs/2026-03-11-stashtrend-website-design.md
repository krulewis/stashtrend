# Stashtrend Website — Design Spec
**Date:** 2026-03-11
**Status:** Draft
**Scope:** Marketing landing page + Cloudflare Pages deployment

---

## Overview

A single-page marketing website for Stashtrend — a self-hosted, privacy-first personal finance dashboard built on the Monarch Money API. The website is a standalone static HTML/CSS file hosted on Cloudflare Pages at `stashtrend.com`, in a separate GitHub repo (`krulewis/stashtrend-website`).

The existing file at `/Users/kellyl./Documents/Cowork Projects/Content/stashtrend-landing.html` is the starting point — it already uses the correct Dark Cobalt design system. This spec defines the updates and additions required to bring it current plus wire up hosting.

---

## Epic 1 — Landing Page Updates

### 1.1 Fix App Mockups (all 3 screen sections)

The inline app mockups in the hero, Budget section, and Accounts section show stale sidebar nav items ("Trends", "AI Analysis" as standalone pages). Update all three mockups to match the real app navigation:

**Current (stale):** Net Worth, Budgets, Accounts, Trends, AI Analysis, Sync
**Corrected:** Net Worth, Budgets, Groups, Budget Builder, Sync

### 1.2 Feature Grid — Expand to 9 Cards (3×3)

Keep all 6 existing feature cards. Add 3 new cards:

| Card | Name | Description | Tag |
|------|------|-------------|-----|
| New | Retirement Tracker | Set a retirement target and track progress against your investable capital. Visualize your projected nest egg with CAGR-based growth curves and milestone markers. | Planning |
| New | Budget Heatmap | A 5-month rolling heatmap of budget performance by category — spot trends and chronic overspending at a glance. | Insights |
| New | Milestone Planner | Define financial milestones (emergency fund, house down payment, early retirement) and see projected achievement dates based on your current savings rate. | Milestones |

Layout: `grid-template-columns: repeat(3, 1fr)` — already in use, no change needed.

### 1.3 New Screenshot Section — Retirement & Milestones

Placed between the AI section and "How It Works". Follows the same alternating layout pattern as the Budget and Accounts sections (text left, screen right — non-reversed).

**Copy:**
- Eyebrow: "Retirement & Milestones"
- Headline: "See exactly when you'll get there"
- Description: Set a retirement target, define milestones along the way, and watch the math work. Stashtrend projects your nest egg using your actual investable capital and historical growth rate — no guesswork, no generic calculators.
- Bullets:
  - Retirement target with projected achievement date
  - Milestone cards: progress bars + projected dates
  - Skyline chart: investable capital + dashed projection curve
  - All computed locally from your Monarch data

**Screen mockup contents:** Milestone hero card showing 3 milestones (Emergency Fund ✓, House Down Payment 67%, Early Retirement 12%) with a mini area chart showing investable capital trajectory — flat for the first third, then steadily rising curve (mirrors the real MilestoneSkylineView shape). Drawn as inline SVG, same style as the existing chart mockups in the file.

### 1.4 GitHub Links

Replace all `href="#"` placeholder links with real URLs:
- "Clone on GitHub" buttons → `https://github.com/krulewis/stashtrend`
- "GitHub" nav link → `https://github.com/krulewis/stashtrend`
- "GitHub" footer link → `https://github.com/krulewis/stashtrend`
- "View docs →" / "Read the docs →" → `https://github.com/krulewis/stashtrend#readme` (until a docs site exists)
- Step 1 code block: `git clone https://github.com/krulewis/stashtrend`

### 1.5 Mobile Responsiveness

The current file has no `@media` queries. Add a single responsive breakpoint at `768px`:

| Element | Mobile behavior |
|---------|----------------|
| Nav | Hide nav links; show logo + "Clone on GitHub" CTA only |
| Hero | Single column (stack text above screen) |
| Feature grid | Single column |
| Screenshot sections | Single column (screen above text) |
| AI section | Single column |
| Steps | Single column |
| Footer | Stack vertically, center-aligned |

No JavaScript required — CSS only.

### 1.6 Minor Copy Updates

- Hero meta: add `· v2.0.0` badge alongside Docker / Monarch Money / MIT
- Footer copyright: "© 2026 Stashtrend — MIT License"

---

## Epic 2 — Cloudflare Pages Deployment

### 2.1 New GitHub Repo

Create `krulewis/stashtrend-website` with:
```
stashtrend-website/
├── index.html        # the landing page (single file)
└── README.md         # brief note pointing to main repo
```

No build step, no `package.json`, no dependencies.

### 2.2 Cloudflare Pages Project

| Setting | Value |
|---------|-------|
| Project name | `stashtrend` |
| Production branch | `main` |
| Build command | *(none)* |
| Build output directory | `/` (root) |
| Root directory | `/` |

Deploy trigger: every push to `main` auto-deploys.

### 2.3 Custom Domain

Once `stashtrend.com` is registered via Cloudflare Registrar:
1. Cloudflare Pages → Custom domains → Add `stashtrend.com`
2. Cloudflare automatically provisions SSL and sets the DNS record
3. Add `www` redirect: `www.stashtrend.com` → `stashtrend.com` via Cloudflare **Redirect Rule** (not Page Rules — those are deprecated)

### 2.4 README for stashtrend-website

Brief README pointing to the main app repo:
```markdown
# stashtrend.com

Marketing site for [Stashtrend](https://github.com/krulewis/stashtrend).

Static HTML/CSS — no build step. Deployed via Cloudflare Pages to stashtrend.com.
```

---

## Design System Reference (no changes — already correct)

| Token | Value |
|-------|-------|
| Background | `#0A0F1E` |
| Surface | `#111827` / `#1C2333` |
| Cobalt accent | `#4D9FFF` |
| Cobalt light | `#7DBFFF` |
| Border | `#1E2D4A` |
| Text primary | `#F0F6FF` |
| Text secondary | `#8BA8CC` |
| Text muted | `#4A6080` |
| Text faint | `#2B4060` |
| Green | `#2ECC8A` |
| Red | `#FF5A7A` |
| Amber | `#F5A623` |
| Font | Helvetica Neue, Helvetica, Arial, sans-serif |

---

## Out of Scope

- Blog, docs site, or multi-page structure
- JavaScript animations or interactivity beyond existing CSS transitions
- Analytics (can add Cloudflare Web Analytics later — zero config, privacy-friendly)
- Contact form
- i18n

---

## Delivery Order

1. Update `stashtrend-landing.html` with all Epic 1 changes
2. Create `krulewis/stashtrend-website` repo
3. Add updated `index.html` + `README.md`
4. Connect Cloudflare Pages to the new repo
5. Add `stashtrend.com` custom domain (after user registers it)
