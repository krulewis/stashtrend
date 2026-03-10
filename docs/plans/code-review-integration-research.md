# Research Report: Claude Code `/code-review` Plugin Integration

**Date:** 2026-03-09
**Researcher:** researcher agent
**Scope:** Survey the `/code-review` plugin internals, compare with Stashtrend's existing PR review pipeline, and identify integration options.

---

## Problem Summary

Stashtrend uses a custom `staff-reviewer` agent (running on Opus) inside a manually orchestrated PR review loop. The question is whether Anthropic's official `/code-review` plugin could replace, complement, or be composed with that pipeline to improve review quality, reduce cost, or add automation (e.g., auto-triggering on `gh pr create`).

---

## Codebase Context

### Existing review agents

Two agents currently handle code review:

**`/home/user/stashtrend/.claude/agents/staff-reviewer.md`**
- Model: Opus
- Role: Formal PR gate. Called in pipeline step 5 (plan review) and step 9 (PR review loop)
- Inputs: the diff + CLAUDE.md — nothing else
- Output: numbered findings with severity (Critical/High/Medium/Low) and required actions
- Loads a `code-review-standards` skill for what to flag
- Fresh context every pass; loop exits when agent writes "No remaining comments"
- Enforces: correctness, edge cases, security, missing tests, performance, conventions, anti-patterns

**`/home/user/stashtrend/.claude/agents/code-reviewer.md`**
- Model: Sonnet
- Role: Lightweight in-flight check during development, not the formal gate
- Reads `git diff`, scans changed files, produces tiered findings (Critical/Warning/Suggestion)

### Existing hooks

**`/home/user/stashtrend/.claude/settings.json`**
- `PreToolUse` on `Agent`: runs `validate-agent-type.sh` — enforces the agent whitelist
- `UserPromptSubmit`: runs `pipeline-gate.sh` — injects classification reminder before every long prompt

**`/home/user/stashtrend/.claude/hooks/validate-agent-type.sh`**
- Whitelists exactly 13 named agents: `pm`, `researcher`, `architect`, `engineer`, `implementer`, `qa`, `debugger`, `staff-reviewer`, `frontend-designer`, `docs-updater`, `code-reviewer`, `explorer`, `playwright-qa`
- Blocks any other subagent type with exit 2

### Constraints from current architecture

1. The `validate-agent-type.sh` whitelist will block any agent the plugin tries to spawn unless its name matches the list.
2. Step 9 of the workflow is a human-orchestrated loop: orchestrator dispatches `staff-reviewer`, waits for findings, dispatches fixes, repeats. The plugin's `--comment` flag posts to GitHub directly but does not re-enter a loop.
3. The `staff-reviewer` also reviews *plans* (pipeline step 5), not just code diffs. The plugin is purely diff-focused.
4. CLAUDE.md explicitly assigns `staff-reviewer` to pipeline step 9 and maps model tiers to roles — changing this has ripple effects on the pipeline gate and agent whitelist.

---

## How the `/code-review` Plugin Works Internally

### Source repositories

- Primary: `github.com/anthropics/claude-code/tree/main/plugins/code-review`
- Official plugin directory: `github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review`

### File structure

```
plugins/code-review/
├── .claude-plugin/
│   └── plugin.json          # Metadata: name, version, author
├── commands/
│   └── code-review.md       # The /code-review slash command definition
└── README.md
```

No `agents/`, `hooks/`, or `skills/` directories exist. The entire plugin is implemented as a single command file that orchestrates multiple inline agent spawns.

### Command file mechanics (`commands/code-review.md`)

The frontmatter restricts allowed tools to `gh` subcommands only:

```
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*),
               Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*),
               Bash(gh pr list:*)
```

The command proceeds in 8 sequential steps:

**Step 1 — Eligibility check (Haiku agent)**
Skips if: PR is closed, draft, trivially simple/automated, or already reviewed by this command.

**Step 2 — CLAUDE.md file discovery (Haiku agent)**
Returns file paths (not contents) for the root CLAUDE.md and any CLAUDE.md files in directories the PR touched.

**Step 3 — PR summary (Haiku agent)**
Produces a concise summary of what the PR changes.

**Step 4 — 5 parallel Sonnet review agents**
- Agent 1: CLAUDE.md compliance audit
- Agent 2: Shallow bug scan (changes only, no pre-existing issues, no nitpicks)
- Agent 3: Git blame and history analysis for contextual bugs
- Agent 4: Previous PR comments on touched files — checks if past review comments still apply
- Agent 5: Code comment compliance — verifies changes obey inline code guidance

Each returns a list of issues with reasons.

**Step 5 — Confidence scoring (parallel Haiku agents)**
One Haiku agent per issue scores 0–100:
- 0: false positive
- 25: uncertain, might be real
- 50: real but minor/rare
- 75: verified real, important
- 100: confirmed definite, frequent

For CLAUDE.md issues, the scorer double-checks that the guideline explicitly names the problem.

**Step 6 — Filter**
Drops all issues below score 80. If nothing remains, stops without posting.

**Step 7 — Second eligibility check (Haiku agent)**
Repeats the step 1 check to guard against race conditions (PR closed between start and finish).

**Step 8 — Post comment**
Uses `gh pr comment` to post findings in a structured format with permalink citations (full SHA + line range).

### The `--comment` flag

When omitted: outputs to terminal only.
When present: step 8 runs `gh pr comment` to post to GitHub. The comment links each issue to `https://github.com/owner/repo/blob/[FULL_SHA]/path/to/file.ext#L[start]-L[end]`.

### Confidence scoring detail

Score rubric used verbatim in the Haiku scorer prompts:
- **0** — Doesn't stand up to light scrutiny; pre-existing issue
- **25** — Might be real, cannot verify; if stylistic, not explicitly in CLAUDE.md
- **50** — Verified real, but minor or rare
- **75** — Double-checked, very likely real, directly impacts functionality or directly in CLAUDE.md
- **100** — Confirmed definitely real, happens frequently, evidence directly confirms

Default threshold: 80. Configurable by editing the value `80` in `commands/code-review.md`.

### What the plugin does NOT have

- No hooks — cannot auto-trigger on `gh pr create` or any other lifecycle event natively
- No programmatic API — it is only invokable as a slash command
- No re-review loop — posts once and stops
- No plan review capability — only works on PR diffs via `gh`
- No custom agent type registration — spawned agents are inline, not named types in the agent whitelist sense

### Hook triggering limitation

The Claude Code hooks system (`PostToolUse`, `Stop`, etc.) can fire shell commands or HTTP calls, but cannot directly invoke a slash command. To trigger `/code-review` automatically after `gh pr create`, you would need a shell script hook that invokes `claude -p "/code-review --comment"` as a subprocess — a workaround, not a native capability. The hooks documentation confirms no hook event maps to "after a Bash command matching gh pr create succeeds."

---

## Comparison: Plugin vs Existing `staff-reviewer`

| Dimension | `/code-review` plugin | `staff-reviewer` agent |
|---|---|---|
| **Model** | Haiku (admin steps) + Sonnet (review agents) + Haiku (scorers) | Opus (single agent) |
| **Review depth** | Broad surface coverage: compliance, bugs, history, prior comments, code comments | Deeper single-pass: correctness, edge cases, security, perf, tests, anti-patterns |
| **False positive mitigation** | Explicit confidence scoring with 80 threshold; drops uncertain findings | Relies on agent judgment; severity labels (Critical to Low) |
| **CLAUDE.md compliance** | Dedicated agent + explicit guideline-citation verification in scorer | Part of "Conventions" check, less structured |
| **Historical context** | Agent 3 (git blame) + Agent 4 (prior PR comments) | Not present |
| **Code comment compliance** | Agent 5 (inline comment guidance) | Not explicitly present |
| **Loop / iteration** | Single pass, no loop | Full loop: finds → fixes → re-review until clean |
| **Plan review** | Not supported | Step 5: reviews implementation plans, not just code |
| **GitHub posting** | Native via `--comment` with `gh pr comment` | Orchestrator manually runs loop; no auto-post |
| **Token cost** | Lower per pass (Haiku-heavy) | Higher per pass (Opus) |
| **Customization** | Edit a single markdown file; add focus areas | Full agent definition; loads `code-review-standards` skill |
| **Integration effort** | Install plugin, run `/code-review` | Already integrated |
| **Agent whitelist compatibility** | Spawned agents are inline (not named types) — likely fine unless whitelist blocks inline spawning | Fully compatible |

### Key gap: the plugin does not loop

The `staff-reviewer` loop in CLAUDE.md step 9 is: find → fix → re-review → repeat until "No remaining comments." The plugin runs once and posts. This is appropriate if the developer reads the comment and fixes manually before re-running, but it removes the automated loop guarantee built into the current pipeline.

### Key advantage: historical and prior-PR context

Agents 3 and 4 add review dimensions the `staff-reviewer` does not cover. Agent 3 checks git blame for contextual bugs (e.g., a change that reverts a deliberate previous fix). Agent 4 checks whether comments from *prior PRs* on the same files still apply to the current PR. These are structural blind spots in the current pipeline.

### Key advantage: false-positive filtering

The confidence scoring system is more systematic than relying on a single Opus agent's judgment. The independent Haiku scorer per issue adds a verification pass that the current pipeline lacks.

---

## Options Evaluated

### Option A: Full Replacement — Use plugin, retire `staff-reviewer` for PR review

The plugin installs and runs as `/code-review --comment`. The CLAUDE.md step 9 PR review loop is removed and replaced with a single plugin invocation after PR creation.

**Pros:**
- Eliminates Opus cost entirely for PR review (Haiku + Sonnet is significantly cheaper)
- Adds historical context and prior-PR comment analysis
- Native GitHub posting with permalink citations
- Confidence scoring reduces false-positive noise
- One-command workflow instead of a multi-step orchestration loop

**Cons:**
- No re-review loop: a single pass may miss issues that require back-and-forth
- Loses plan review capability at step 5 (plugin can't review documents)
- Loses anti-pattern checks from `code-review-standards` skill unless that content is added to CLAUDE.md
- Loses severity tiers (Critical/High/Medium/Low) — plugin output format is flat
- Agent whitelist (`validate-agent-type.sh`) may need updating if inline spawns are blocked, though this is unlikely since the plugin uses inline agents rather than named agent types
- CLAUDE.md step 9 definition, pipeline gate, and team compositions would all need rewriting

**Effort:** Medium (plugin install, CLAUDE.md rewrite, whitelist audit, workflow testing)
**Compatibility:** Low — conflicts with established pipeline structure and step 9 semantics

---

### Option B: Complement — Plugin as first-pass filter, `staff-reviewer` as gate

Run `/code-review` immediately after PR creation as an automated first pass. The `staff-reviewer` loop continues as the formal gate but receives the plugin's output as additional context.

**Pros:**
- Plugin catches low-hanging bugs and compliance issues before human/Opus review
- Adds git history and prior-PR dimensions to the overall review coverage
- `staff-reviewer` loop remains the authoritative gate
- Plan review at step 5 is unchanged
- Incremental adoption with no pipeline surgery

**Cons:**
- Higher total cost: Haiku + Sonnet (plugin) plus Opus (staff-reviewer loop)
- Two reviews of the same diff can produce conflicting findings
- Orchestrator must manage two review sources
- No deduplication: `staff-reviewer` may repeat findings the plugin already surfaced
- Plugin posts a GitHub comment; `staff-reviewer` findings stay in terminal — two different outputs to track

**Effort:** Low (install plugin, add invocation to step 9 preamble)
**Compatibility:** Medium — adds to the pipeline without breaking it, but increases complexity

---

### Option C: Hybrid — Adopt plugin's agent structure inside `staff-reviewer`

Don't install the plugin. Instead, update the `staff-reviewer` agent definition to incorporate the plugin's structural ideas: parallel sub-agents, confidence scoring, historical context agents. The `staff-reviewer` stays on Opus for final judgment but gains systematic coverage.

**Pros:**
- Stays entirely within the existing pipeline and agent whitelist model
- Adds historical context and confidence scoring without a new tool dependency
- `staff-reviewer` retains plan review and severity tiers
- No GitHub comment format change
- No CLAUDE.md step 9 rewrite needed

**Cons:**
- Significant effort to redesign `staff-reviewer` as a multi-agent orchestrator
- Opus driving five sub-agents is more expensive than the plugin's Haiku-driven approach
- Requires deciding which sub-agents are Haiku vs Sonnet vs Opus internally
- Does not benefit from Anthropic's ongoing maintenance of the plugin

**Effort:** High (agent redesign, skill updates, testing)
**Compatibility:** High — native to existing patterns

---

### Option D: Hook-triggered plugin automation

Install the plugin and wire a `PostToolUse` hook on `Bash` matching `gh pr create` to automatically run `claude -p "/code-review --comment"` as a shell subprocess, triggering the plugin automatically after every PR creation.

**Pros:**
- Zero manual invocation — review appears automatically on the PR
- Earliest possible feedback loop (before the developer switches context)
- Combined with option B, provides early filtering without changing step 9

**Cons:**
- Hooks cannot natively invoke slash commands; requires `claude -p` subprocess which is a workaround with uncertain stability
- Matching `gh pr create` in a `PostToolUse` hook requires parsing the Bash command string — fragile
- Adds a long-running async subprocess that blocks or fires asynchronously depending on hook config
- `async: true` hook would mean the review may arrive after the developer has already moved on
- May interact unpredictably with the existing `validate-agent-type.sh` and `pipeline-gate.sh` hooks

**Effort:** Medium (hook script writing, testing edge cases)
**Compatibility:** Low — hooks system not designed for slash-command invocation; workaround territory

---

## Recommendation

**Option B (Complement) is the lowest-risk starting point, with Option C as the longer-term investment.**

Rationale:

The plugin's two structural advantages — git history analysis (Agent 3) and prior-PR comment analysis (Agent 4) — address real blind spots in the current pipeline. However, the plugin's single-pass, no-loop design is fundamentally incompatible with Stashtrend's loop-until-clean review guarantee in step 9.

Option B threads this needle: install the plugin and run `/code-review --comment` immediately after `gh pr create` (manually, not via hook) as a cheap early-signal pass. The `staff-reviewer` loop then runs as the authoritative gate. The total added cost per PR is modest (mostly Haiku + Sonnet tokens). The orchestrator can provide the plugin's GitHub comment URL to the `staff-reviewer` as supplemental context.

Option C is more architecturally coherent but requires significant agent redesign. It is the right long-term direction if the team wants to avoid managing two review systems, but it should not be attempted before validating whether the plugin's coverage actually improves outcomes in practice.

Option A (full replacement) should not be adopted because it removes the review loop — the current pipeline's most important quality guarantee — and eliminates plan review capability.

Option D (hook automation) should be deferred. The lack of native slash-command invocation from hooks makes it an unreliable workaround. If automation is desired, the simpler approach is adding a one-liner to the CLAUDE.md step 9 instructions ("after `gh pr create`, run `/code-review --comment`") rather than encoding it in a hook.

---

## Open Questions

1. **Whitelist compatibility:** Does `validate-agent-type.sh` block inline agent spawns initiated by a slash command, or only named `Agent` tool calls? If the plugin's internal agents are spawned as unnamed inline agents, the hook likely passes them through unchanged. This needs a test run to confirm.

2. **Context size for plan review:** If Option C is pursued, `staff-reviewer` handling both plans and diffs as an orchestrator would require careful context management. The plugin's command uses `allowed-tools` to restrict tool access — the same restriction would need careful design in an agent.

3. **`code-review-standards` skill content:** The `staff-reviewer` loads a `code-review-standards` skill but this file was not found in the agent listing. Verifying its contents is needed before any hybrid or replacement approach — anti-patterns it defines should survive the migration.

4. **Cost baseline:** No empirical token cost data for the current `staff-reviewer` loop (Opus, multi-pass) is available. Before committing to option B or C, running `/tokencostscope` on a representative step 9 loop would establish the savings opportunity.

5. **Confidence threshold calibration:** The plugin defaults to 80. For a codebase with a detailed CLAUDE.md (as Stashtrend has), a lower threshold (e.g., 60–70) may be appropriate since the CLAUDE.md scorer has more explicit material to reference. This should be tuned empirically.

6. **Plugin installation scope:** The plugin docs distinguish project-level (`--plugin-dir`) from marketplace installation. For a team repo, the preferred approach is committing the plugin directory and loading it via `--plugin-dir` in the project's dev tooling, or distributing through a team marketplace. Neither path is currently set up.

---

## Sources

- [Code Review Plugin README (anthropics/claude-code)](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md)
- [Code Review Command Source (anthropics/claude-plugins-official)](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/commands/code-review.md)
- [Plugin Tree (anthropics/claude-code)](https://github.com/anthropics/claude-code/tree/main/plugins/code-review)
- [Official Plugin Directory](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review)
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Code Review Plugin — Claude.com](https://claude.com/plugins/code-review)
