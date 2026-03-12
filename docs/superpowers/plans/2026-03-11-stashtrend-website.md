# Stashtrend Website Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Stashtrend landing page with current features and design, publish it to `stashtrend.com` via a new GitHub repo + Cloudflare Pages, and wire up GitHub Wiki auto-sync.

**Architecture:** Single static `index.html` (no build step) in a new `krulewis/stashtrend-website` repo, deployed to Cloudflare Pages. Wiki sync is a GitHub Actions workflow in the main `krulewis/stashtrend` repo that pushes `docs/wiki/` to the GitHub Wiki on every push to `main`.

**Tech Stack:** HTML5, CSS3 (inline), SVG (inline), GitHub Actions, Cloudflare Pages

---

## Chunk 1: Landing Page Updates

**Files:**
- Modify: `/Users/kellyl./Documents/Cowork Projects/Content/stashtrend-landing.html`

**Spec reference:** `docs/superpowers/specs/2026-03-11-stashtrend-website-design.md` — Epics 1

---

### Task 1: Fix App Mockup Nav Items

All three inline app mockups show stale sidebar nav items. Update them to match the real app.

**Find:** Every `<div class="app-sidebar">` block (there are 3 — hero, budget section, accounts section).

**Current nav items in each:**
```html
<div class="sidebar-nav-item active">Net Worth</div>
<div class="sidebar-nav-item">Budgets</div>
<div class="sidebar-nav-item">Accounts</div>
<div class="sidebar-nav-item">Trends</div>
<div class="sidebar-nav-item">AI Analysis</div>
<div class="sidebar-nav-item">Sync</div>
```

**Replace with** (adjust `active` class to match which page each mockup shows):
```html
<!-- Hero mockup — Net Worth active -->
<div class="sidebar-nav-item active">Net Worth</div>
<div class="sidebar-nav-item">Budgets</div>
<div class="sidebar-nav-item">Groups</div>
<div class="sidebar-nav-item">Budget Builder</div>
<div class="sidebar-nav-item">Sync</div>

<!-- Budget mockup — Budgets active -->
<div class="sidebar-nav-item">Net Worth</div>
<div class="sidebar-nav-item active">Budgets</div>
<div class="sidebar-nav-item">Groups</div>
<div class="sidebar-nav-item">Budget Builder</div>
<div class="sidebar-nav-item">Sync</div>

<!-- Accounts mockup — Groups active -->
<div class="sidebar-nav-item">Net Worth</div>
<div class="sidebar-nav-item">Budgets</div>
<div class="sidebar-nav-item active">Groups</div>
<div class="sidebar-nav-item">Budget Builder</div>
<div class="sidebar-nav-item">Sync</div>
```

- [ ] **Step 1:** Find all 3 `app-sidebar` blocks and update nav items as above
- [ ] **Step 2:** Open `stashtrend-landing.html` in a browser — verify all 3 mockups show the corrected 5-item nav (no "Trends", no "AI Analysis")

---

### Task 2: Expand Feature Grid to 9 Cards

The feature grid currently has 6 cards in a 3×3 layout. Add 3 new cards at the end. The existing `grid-template-columns: repeat(3, 1fr)` already handles 9 cards — no CSS change needed.

- [ ] **Step 1:** Locate the closing `</div>` of the last feature card (the "Fully Private" card) inside `.feature-grid`

- [ ] **Step 2:** Insert these 3 new cards immediately after it, before the `</div>` that closes `.feature-grid`:

```html
<div class="feature-card">
  <div class="feature-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4D9FFF" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
  </div>
  <div class="feature-name">Retirement Tracker</div>
  <div class="feature-desc">Set a retirement target and track progress against your investable capital. Visualize your projected nest egg with CAGR-based growth curves and milestone markers on the net worth chart.</div>
  <span class="feature-tag">Planning</span>
</div>

<div class="feature-card">
  <div class="feature-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4D9FFF" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
  </div>
  <div class="feature-name">Budget Heatmap</div>
  <div class="feature-desc">A 5-month rolling heatmap of budget performance by category. Spot chronic overspending patterns at a glance — color-coded by how far over or under budget each category ran.</div>
  <span class="feature-tag">Insights</span>
</div>

<div class="feature-card">
  <div class="feature-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4D9FFF" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  </div>
  <div class="feature-name">Milestone Planner</div>
  <div class="feature-desc">Define financial milestones — emergency fund, house down payment, early retirement — and see projected achievement dates based on your current savings rate and investable capital.</div>
  <span class="feature-tag">Milestones</span>
</div>
```

- [ ] **Step 3:** Open in browser — verify the feature grid shows 9 cards in a clean 3×3 layout with no overflow

---

### Task 3: Add Retirement & Milestones Screenshot Section

Insert a new section between the AI section (`</div>` closing `.ai-section`) and the "How it works" section (`.how-section`).

- [ ] **Step 1:** Find the closing `</div>` of `.ai-section` and insert immediately after it. Note on layout: `screenshot-section` uses `grid-template-columns: 1fr 1fr` with left-to-right DOM order. Placing `screen-wrap` first = screen on left, text on right — this IS the intended non-reversed layout (same as the Budget section). Do NOT add `.reverse` class.

```html
<!-- ─────────── SCREENSHOT 4 — RETIREMENT & MILESTONES ─────────── -->
<section class="screenshot-section" style="padding-top:60px; padding-bottom:80px;">
  <div class="screen-wrap">
    <div class="screen-glow"></div>
    <div class="screen">
      <div class="screen-bar">
        <div class="screen-dots">
          <div class="dot" style="background:#FF5A7A;"></div>
          <div class="dot" style="background:#F5A623;"></div>
          <div class="dot" style="background:#2ECC8A;"></div>
        </div>
        <div class="screen-url">localhost · net worth · milestones</div>
      </div>
      <div class="app-layout">
        <div class="app-sidebar">
          <div class="app-logo-sm">Stashtrend</div>
          <div class="sidebar-nav-item active">Net Worth</div>
          <div class="sidebar-nav-item">Budgets</div>
          <div class="sidebar-nav-item">Groups</div>
          <div class="sidebar-nav-item">Budget Builder</div>
          <div class="sidebar-nav-item">Sync</div>
        </div>
        <div class="app-main">
          <div class="app-main-title">Milestones</div>
          <div class="app-main-sub">Investable capital · $283,070 · Retirement target $1.2M</div>
          <!-- Milestone cards -->
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            <!-- Card 1: Done -->
            <div style="background:#1C2333; border:1px solid #2ECC8A; border-radius:10px; padding:10px 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; color:#F0F6FF; font-weight:500;">Emergency Fund</div>
                <div style="font-size:9px; background:rgba(46,204,138,0.15); color:#2ECC8A; padding:2px 8px; border-radius:10px; letter-spacing:1px; text-transform:uppercase;">Done</div>
              </div>
              <div style="background:#1E2D4A; border-radius:4px; height:6px; overflow:hidden;">
                <div style="height:100%; width:100%; background:#2ECC8A; border-radius:4px;"></div>
              </div>
            </div>
            <!-- Card 2: In Progress -->
            <div style="background:#1C2333; border:1px solid #4D9FFF; border-radius:10px; padding:10px 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; color:#F0F6FF; font-weight:500;">House Down Payment</div>
                <div style="font-size:9px; color:#4D9FFF; letter-spacing:0.5px;">Est. Aug 2027</div>
              </div>
              <div style="background:#1E2D4A; border-radius:4px; height:6px; overflow:hidden;">
                <div style="height:100%; width:67%; background:#4D9FFF; border-radius:4px;"></div>
              </div>
              <div style="font-size:9px; color:#4A6080; margin-top:4px;">$33,500 of $50,000</div>
            </div>
            <!-- Card 3: Early -->
            <div style="background:#1C2333; border:1px solid #1E2D4A; border-radius:10px; padding:10px 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; color:#F0F6FF; font-weight:500;">Early Retirement</div>
                <div style="font-size:9px; color:#4A6080; letter-spacing:0.5px;">Est. 2041</div>
              </div>
              <div style="background:#1E2D4A; border-radius:4px; height:6px; overflow:hidden;">
                <div style="height:100%; width:24%; background:#4D9FFF; border-radius:4px; opacity:0.5;"></div>
              </div>
              <div style="font-size:9px; color:#4A6080; margin-top:4px;">$283k of $1.2M</div>
            </div>
          </div>
          <!-- Mini skyline chart -->
          <div class="chart-box" style="height:80px; margin-top:12px;">
            <div class="chart-title">Investable Capital Projection</div>
            <svg viewBox="0 0 420 50" width="100%" height="40" style="overflow:visible;">
              <defs>
                <linearGradient id="milestonefill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#4D9FFF" stop-opacity="0.15"/>
                  <stop offset="100%" stop-color="#4D9FFF" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <!-- Solid area: actual investable capital (flat-ish then rising) -->
              <path d="M 0,42 C 40,41 80,39 120,36 C 160,33 190,28 230,22 C 270,16 320,9 420,3 L 420,48 L 0,48 Z" fill="url(#milestonefill)"/>
              <path d="M 0,42 C 40,41 80,39 120,36 C 160,33 190,28 230,22 C 270,16 320,9 420,3" fill="none" stroke="#4D9FFF" stroke-width="1.8" stroke-linecap="round"/>
              <!-- Dashed projection beyond current -->
              <path d="M 280,12 C 320,5 370,-2 420,-8" fill="none" stroke="#7DBFFF" stroke-width="1.5" stroke-dasharray="3,3"/>
              <!-- Milestone reference lines -->
              <line x1="190" y1="0" x2="190" y2="48" stroke="#2ECC8A" stroke-width="1" stroke-dasharray="2,3" opacity="0.6"/>
              <line x1="310" y1="0" x2="310" y2="48" stroke="#4D9FFF" stroke-width="1" stroke-dasharray="2,3" opacity="0.5"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div>
    <div class="ss-eyebrow">Retirement &amp; Milestones</div>
    <h3 class="ss-title">See exactly when you'll get there</h3>
    <p class="ss-desc">Set a retirement target, define milestones along the way, and watch the math work. Stashtrend projects your nest egg using your actual investable capital and historical growth rate — no guesswork, no generic calculators.</p>
    <ul class="ss-bullets">
      <li>Retirement target with projected achievement date</li>
      <li>Milestone cards: progress bars + projected dates</li>
      <li>Skyline chart: investable capital + dashed projection curve</li>
      <li>All computed locally from your Monarch data</li>
    </ul>
  </div>
</section>
```

- [ ] **Step 2:** Open in browser — verify the new section appears between the AI section and "How it works", with the milestone cards and mini chart rendering correctly

---

### Task 4: Update All Links

- [ ] **Step 1:** Replace all `href="#"` placeholder links with real URLs. Find and replace each:

| Element | Old | New |
|---------|-----|-----|
| Nav "GitHub" link | `href="#"` | `href="https://github.com/krulewis/stashtrend"` |
| Nav "Wiki" link | `href="#"` | `href="https://github.com/krulewis/stashtrend/wiki"` |
| Nav "Get Started" CTA | `href="#"` | `href="https://github.com/krulewis/stashtrend"` |
| Hero "Clone on GitHub" | `href="#"` | `href="https://github.com/krulewis/stashtrend"` |
| Hero "View docs →" | `href="#"` | `href="https://github.com/krulewis/stashtrend/wiki"` |
| Final CTA "Clone on GitHub" | `href="#"` | `href="https://github.com/krulewis/stashtrend"` |
| Final CTA "Read the docs →" | `href="#"` | `href="https://github.com/krulewis/stashtrend/wiki"` |
| Footer "GitHub" | `href="#"` | `href="https://github.com/krulewis/stashtrend"` |
| Footer "Docs" | `href="#"` | `href="https://github.com/krulewis/stashtrend/wiki"` |
| Footer "MIT License" | `href="#"` | `href="https://github.com/krulewis/stashtrend/blob/main/LICENSE"` |

- [ ] **Step 2:** Add "Wiki" nav link and anchor hrefs to the nav. Do Steps 2 and 3 together in one pass — the `#features` and `#how` anchors must exist before the nav links work. Find the nav-links div:
```html
<div class="nav-links">
  <a href="...">Features</a>
  <a href="...">How it works</a>
  <a href="...">GitHub</a>
</div>
```
Update to:
```html
<div class="nav-links">
  <a href="#features">Features</a>
  <a href="#how">How it works</a>
  <a href="https://github.com/krulewis/stashtrend/wiki">Wiki</a>
  <a href="https://github.com/krulewis/stashtrend">GitHub</a>
</div>
```

- [ ] **Step 3:** Add matching `id` anchors to the Features section (`id="features"`) and How It Works section (`id="how"`) so the nav scroll links work

- [ ] **Step 4:** Update step 1 code block from `git clone github.com/krulewis/stashtrend` to:
```html
<div class="step-code">git clone https://github.com/<br>krulewis/stashtrend</div>
```

- [ ] **Step 5:** Open in browser — click every nav link and CTA, verify they all resolve correctly

---

### Task 5: Mobile Responsiveness

Add a `@media (max-width: 768px)` block at the end of the `<style>` tag (before `</style>`).

- [ ] **Step 1:** Insert the following CSS at the bottom of the `<style>` block:

```css
/* ── MOBILE ── */
@media (max-width: 768px) {
  nav {
    padding: 16px 20px;
  }
  .nav-links { display: none; }

  .hero {
    grid-template-columns: 1fr;
    padding: 120px 20px 60px;
    gap: 40px;
  }
  .hero-headline { font-size: 36px; }

  .features {
    padding: 60px 20px;
  }
  .feature-grid { grid-template-columns: 1fr; }

  .screenshot-section {
    grid-template-columns: 1fr;
    padding: 40px 20px 60px;
    gap: 40px;
  }
  .screenshot-section.reverse { direction: ltr; }

  .ai-section {
    grid-template-columns: 1fr;
    padding: 40px 20px;
    margin: 0 20px 60px;
  }

  .how-section { padding: 60px 20px; }
  .steps { grid-template-columns: 1fr; gap: 32px; }

  .cta-section { padding: 60px 20px 80px; }
  .cta-title { font-size: 32px; }
  .cta-actions { flex-direction: column; }

  footer {
    flex-direction: column;
    gap: 20px;
    text-align: center;
    padding: 28px 20px;
  }
  .footer-links { justify-content: center; }

  .trusted { padding: 30px 20px 40px; }
  .trusted-logos { flex-wrap: wrap; gap: 10px; }
}
```

- [ ] **Step 3:** Open in browser, use DevTools to simulate 375px width (iPhone) — verify: nav shows logo + CTA only (nav links hidden, CTA visible), hero stacks single column, feature grid is single column, all sections readable with no horizontal scroll

---

### Task 6: Minor Copy Updates

- [ ] **Step 1:** Find the `.hero-meta` div. Preserve all existing spans (Docker, Monarch Money, MIT License). Append two new spans at the end — a separator dot and the version badge:
```html
  <span>·</span>
  <span><strong>v2.0.0</strong></span>
```
Do not replace the entire block — only append these two spans before the closing `</div>`.

- [ ] **Step 2:** Find the footer and update copyright:
```html
<div class="footer-right">© 2026 Stashtrend — MIT License</div>
```

- [ ] **Step 3:** Open in browser — verify hero meta shows v2.0.0 badge and footer shows copyright

---

## Chunk 2: Repo, Cloudflare Pages & Wiki Sync

**Files to create:**
- New repo: `krulewis/stashtrend-website/index.html` (the updated landing page)
- New repo: `krulewis/stashtrend-website/README.md`
- Main repo: `krulewis/stashtrend/.github/workflows/sync-wiki.yml`

---

### Task 7: Create stashtrend-website Repo

- [ ] **Step 1:** Create the new GitHub repo:
```bash
gh repo create krulewis/stashtrend-website \
  --public \
  --description "Marketing site for stashtrend.com" \
  --clone
cd stashtrend-website
```

- [ ] **Step 2:** Copy the updated landing page as `index.html`:
```bash
cp "/Users/kellyl./Documents/Cowork Projects/Content/stashtrend-landing.html" index.html
```

- [ ] **Step 3:** Create `README.md`:
```markdown
# stashtrend.com

Marketing site for [Stashtrend](https://github.com/krulewis/stashtrend).

Static HTML/CSS — no build step. Deployed via Cloudflare Pages to [stashtrend.com](https://stashtrend.com).

To update the site, edit `index.html` and push to `main`. Cloudflare Pages auto-deploys within ~30 seconds.
```

- [ ] **Step 4:** Initial commit and push (run from inside the cloned `stashtrend-website/` directory):
```bash
git -C stashtrend-website add index.html README.md
git -C stashtrend-website commit -m "feat: initial stashtrend.com landing page"
git -C stashtrend-website push origin main
```

- [ ] **Step 5:** Verify repo is live at `https://github.com/krulewis/stashtrend-website`

---

### Task 8: Cloudflare Pages Setup (manual — guided steps)

These steps require the Cloudflare dashboard. Follow in order:

- [ ] **Step 1:** Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project** → **Connect to Git**

- [ ] **Step 2:** Authorize Cloudflare to access GitHub, select `krulewis/stashtrend-website`

- [ ] **Step 3:** Configure build settings:
  - Project name: `stashtrend`
  - Production branch: `main`
  - Build command: *(leave empty)*
  - Build output directory: `/`
  - Click **Save and Deploy**

- [ ] **Step 4:** Wait ~30 seconds for first deploy. Cloudflare provides a preview URL like `stashtrend.pages.dev` — open it and verify the site loads correctly

- [ ] **Step 5:** Add custom domain:
  - Pages project → **Custom domains** → **Set up a custom domain**
  - Enter `stashtrend.com` → Cloudflare auto-provisions SSL and DNS (since domain is registered via Cloudflare Registrar)
  - Wait for SSL to propagate (~1-5 min)

- [ ] **Step 6:** Add `www` redirect:
  - Cloudflare Dashboard → **stashtrend.com** zone → **Rules** → **Redirect Rules** → **Create rule**
  - Name: `www to apex`
  - If hostname equals `www.stashtrend.com` → Static redirect to `https://stashtrend.com` (301)

- [ ] **Step 7:** Open `https://stashtrend.com` in browser — verify site loads with SSL, all links work, `www.stashtrend.com` redirects to apex

---

### Task 9: GitHub Wiki Auto-Sync Workflow

Add a GitHub Actions workflow to the **main stashtrend repo** that pushes `docs/wiki/` to the GitHub Wiki on every push to `main` that touches wiki files.

- [ ] **Step 1:** Verify the wiki source file exists, then create the workflows directory in the main stashtrend repo:
```bash
cd "/Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard"
ls docs/wiki/Home.md   # must exist — this becomes the wiki home page
mkdir -p .github/workflows   # safe to run even if directory already exists
```

- [ ] **Step 2:** Create `.github/workflows/sync-wiki.yml`:
```yaml
name: Sync Wiki

on:
  push:
    branches: [main]
    paths:
      - 'docs/wiki/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Push docs/wiki/ to GitHub Wiki
        uses: Andrew-Chen-Wang/github-wiki-action@v4
        with:
          path: docs/wiki/
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_ACTOR: ${{ github.actor }}
```

- [ ] **Step 3:** Commit and push:
```bash
git add .github/workflows/sync-wiki.yml
git commit -m "ci: sync docs/wiki/ to GitHub Wiki on push to main"
git push origin main
```

- [ ] **Step 4:** Go to GitHub → `krulewis/stashtrend` → **Actions** tab → verify the "Sync Wiki" workflow ran successfully

- [ ] **Step 5:** Go to `https://github.com/krulewis/stashtrend/wiki` — verify `Home.md` content appears as the wiki home page

- [ ] **Step 6:** Make a trivial edit to `docs/wiki/Home.md`, commit, push, and verify the wiki updates within ~60 seconds
