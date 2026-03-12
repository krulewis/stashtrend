# Development Rules — Stashtrend

These rules govern all development on this project. Agent definitions live in `.claude/agents/`.

---

## Planning Pipeline

### Change Size Classification

| Size | Description | Pipeline |
|------|-------------|----------|
| **XS** | Single file, trivial fix, < 5 lines, no tests affected | May bypass |
| **S** | 1-2 files, clear scope, no architectural decisions | Optional |
| **M** | Multi-file, new feature, involves tests, clear scope | **Required** |
| **L** | New systems, architectural decisions, cross-cutting concerns | **Required** |

### Pipeline Steps (M and L — run each as a separate agent with fresh context)

1. **PM Agent** — dispatch to `pm` agent → requirements document
2. **Research Agents** (parallel) — dispatch two `researcher` agent instances:
   - **Codebase researcher** — scoped to codebase analysis → codebase findings report
   - **Web researcher** — scoped to external/web research → external findings report
   Architect waits for BOTH to complete before starting.
3. **Architect Agent** — dispatch to `architect` agent → architecture decision with rationale and rejected alternatives
3b. **Frontend Designer** (UI features only) — dispatch to `frontend-designer` agent → design specification with component designs, tokens, states, responsive behavior
4. **Engineer Agent — Initial Plan** — dispatch to `engineer` agent → file-level implementation plan with parallelism tags (incorporates design spec for UI work). Must include a **"Deviations from Architecture"** section listing where/why the plan diverges from the architect's decision. Must include a **"Test Coverage Plan"** section listing: (a) every new test file and test class/function to be written, (b) which source files/functions each test covers, (c) estimated per-file coverage for new/changed source files (target: ≥80% per file). Staff-reviewer uses these sections to focus review.
5. **Staff Engineer Agent — Review** — dispatch to `staff-reviewer` agent → pressure-tests plan for bugs, ambiguities, edge cases, incorrect assumptions, **and test coverage adequacy (flags any new/changed file below 80% estimated coverage as High)** → required changes list with **severity classification** (Critical / High / Medium / Low) on each finding
6. **Engineer Agent — Final Plan** — dispatch to `engineer` agent with original plan + staff feedback delta as input (patch operation, not clean-room re-derivation) → complete corrected plan ready for implementation
7. **Cost Estimate** — run `/tokencostscope` on the final plan in background (non-blocking). Record estimate when it arrives. Proceed without it if user approves the plan before it finishes. If the estimate agent fails, log the missing estimate; step 10 notes "no baseline estimate recorded."

*Pre-flight dependency check and regression risk scorer are defined in Development Workflow step 2b — they run after plan confirmation, which is a workflow event.*

**Never skip or combine steps.** Fresh-context agents catch what prior agents missed.

### Parallelism

Run pipeline steps and build processes as **parallel agents** whenever their inputs are independent. Only serialize when a step requires output from a prior step (e.g., Architect depends on Research) or when changes touch the same files/branch (rebase conflicts).

**Pipeline parallelism:**
- Two `researcher` instances (codebase + web) run in parallel; both must complete before Architect starts
- PM clarification follow-ups can overlap with research
- `explorer` instances (pre-flight check, regression risk scorer, file change classifier) run in parallel after plan confirmation (all Haiku)
- `changelog-scanner` (Haiku) runs in parallel with the above explorer instances
- Cost estimate runs in background (non-blocking)
- Packet summarization (Haiku) runs inline when any step exceeds 500-word limit
- Multiple independent searches, reads, or validations should always be parallel

**Implementation parallelism:**
- The `engineer` agent's plan tags each change as `independent` or `depends-on: <other change>`
- When a plan identifies independent file groups, spawn multiple `implementer` agents in parallel — one per independent group
- `qa` agent can begin writing tests in parallel with implementation when test interfaces are defined in the plan
- QA + `frontend-designer` can overlap within a single feature: frontend-designer works on design specs for later components while QA writes tests for the first batch
- Code review + Playwright QA (workflow steps 7/7b) run as parallel agents. Combined fix cycle if either finds issues. Re-run Playwright QA if code changes were required from parallel code review.
- `lint-fixer` (Haiku) runs after implementation, before code review — can overlap with test execution (steps 4b and 5 may run concurrently)
- `test-triager` (Haiku) runs on test failure output before returning to implementation
- `commit-drafter` + `pr-drafter` (both Haiku) run in parallel — both read from the pre-commit diff independently, no sequential dependency
- `docs-updater` runs after tests pass (not before)

**Review parallelism:**
- `loop-guard` (Haiku) runs between PR review passes to detect cycling comments
- PR review loop fixes on independent files can be parallelized across `implementer` or `debugger` agents

When in doubt, prefer parallel — the cost of a wasted agent is lower than the cost of idle waiting.

### Pipeline Context Packet

Each pipeline agent (steps 1–6) receives and appends to a structured context packet passed as agent input. This replaces ad-hoc re-exploration of prior step outputs.

**Packet structure** (each step appends its summary, ≤500 words per step):
- **Feature name** and **change size classification**
- **PM** (step 1): requirements summary
- **Research** (step 2): codebase findings summary + web findings summary. If one researcher fails, log the gap here — architect proceeds with available findings.
- **Architect** (step 3): decision summary, rationale, key constraints
- **Engineer** (step 4): plan summary, deviations from architecture
- **Staff reviewer** (step 5): required changes summary with severities
- **Pre-flight + risk scores** (WF-2b, post-pipeline): dependency issues flagged, per-file regression risk scores (0–10). QA agent uses risk scores to prioritize test coverage.

The orchestrator maintains the packet and passes it to each agent. Step 6 (final plan) is the terminal consumer — it receives the packet but does not append. Project-level context (CLAUDE.md) is still loaded normally — the packet supplements, not replaces. The packet is ephemeral (not written to disk).

**Packet summarization:** When any pipeline agent's raw output exceeds 500 words, the orchestrator dispatches `packet-summarizer` (Haiku) with the full raw output as input. The summarizer returns a ≤500-word summary that the orchestrator appends to the packet in place of the raw output. If the raw output is already ≤500 words, it is appended directly without invoking the summarizer.

### Agent Teams

For M/L changes, use **TeamCreate** to coordinate agents via shared task lists instead of ad-hoc sequential dispatch. Teams formalize parallelism and make agent coordination explicit.

**When to use teams:** Any M/L change where 3+ agents will run, or when parallel agent coordination is needed.

**Team lifecycle:**
1. `TeamCreate` — creates the team and its task list
2. `TaskCreate` — break the work into discrete tasks
3. Spawn teammates via Agent tool with `team_name` and `name` parameters
4. `TaskUpdate` — assign tasks to teammates, track progress
5. Teammates work, complete tasks, and go idle between turns
6. `SendMessage` with `type: "shutdown_request"` — gracefully shut down teammates when done
7. `TeamDelete` — clean up team resources after all teammates shut down

**Standard team compositions:**

| Phase | Team Name | Members | Notes |
|-------|-----------|---------|-------|
| **Planning** | `{feature}-planning` | `pm`, `researcher` (x2: codebase + web) | PM interviews user; two researcher instances run in parallel (codebase + web). Team covers the parallelizable portion only. `architect`, `engineer`, `staff-reviewer` are dispatched sequentially by the orchestrator after the team completes (sequential dependency on both researchers completing). |
| **Implementation** | `{feature}-impl` | `qa`, `implementer` (x N), `lint-fixer`, `security-scanner`, `test-triager`, `code-reviewer`, `playwright-qa`, `frontend-designer`, `docs-updater`, `commit-drafter`, `pr-drafter` | QA writes tests first. QA + frontend-designer can overlap. Implementers work independent file groups in parallel. lint-fixer → security-scanner after implementation. test-triager on failures. Code-reviewer + playwright-qa in parallel after tests pass. commit-drafter + pr-drafter in parallel for step 8. Docs-updater after tests pass. |
| **Review** | `{feature}-review` | `staff-reviewer`, `loop-guard`, `implementer` / `debugger` | Staff reviewer finds issues → implementer/debugger fix → fresh staff-reviewer pass. loop-guard monitors for cycling comments between passes. |

**Team rules:**
- Each team phase corresponds to a workflow stage — don't mix planning and implementation agents in one team
- Spawn a **new team** for each phase (planning → implementation → review) to keep context clean
- Tasks must have clear ownership — never leave a task unassigned when agents are idle
- The orchestrator monitors the task list and reassigns/unblocks as needed
- Delete each team after its phase completes before creating the next one

**When NOT to use teams:**
- XS/S changes (overhead exceeds benefit)
- Single-agent tasks (just dispatch directly)
- Sequential-only work with no parallelism opportunity

### Model Selection Principle

Models are defined in each agent's frontmatter — not chosen at dispatch time. The tier philosophy behind assignments:

| Tier | Model | Criteria | Agents |
|------|-------|----------|--------|
| **Critical judgment** | opus | Mistakes are expensive and hard to reverse | `pm`, `architect`, `staff-reviewer` |
| **Standard work** | sonnet | Produces artifacts by following patterns | `researcher`, `engineer`, `implementer`, `qa`, `code-reviewer`, `security-scanner`, `debugger`, `frontend-designer` |
| **Mechanical** | haiku | Procedural tasks, no deep reasoning needed | `explorer` (incl. pre-flight checker, regression scorer, file change classifier), `docs-updater`, `playwright-qa`, `commit-drafter`, `pr-drafter`, `test-triager`, `lint-fixer`, `packet-summarizer`, `changelog-scanner`, `loop-guard` |

### Plan Before Code — MANDATORY

**No code edits without a stated plan first — regardless of size classification.**

- **XS:** State the file name and the specific change in your response before touching it (one sentence is enough).
- **S/M/L:** A written plan document must exist before any implementer agent is dispatched. For S, a brief inline plan in the response suffices. For M/L, use the full planning pipeline.

This rule has no exceptions. "It's just a quick fix" is not a reason to skip it — that is exactly when plans are skipped and bugs are introduced.

### Agent Delegation — MANDATORY

**All execution work MUST be dispatched to a named agent.** The orchestrator coordinates and dispatches but does not perform execution tasks inline.

**Agent → Pipeline Step Mapping:**

| Step | Agent |
|------|-------|
| **— Planning Pipeline —** | |
| PP-1. Requirements interview | `pm` |
| PP-2. Research (codebase) | `researcher` (codebase-scoped) |
| PP-2. Research (web/external) | `researcher` (web-scoped) |
| PP-3. Architecture | `architect` |
| PP-3b. UI design (UI features) | `frontend-designer` |
| PP-4. Initial plan (+ deviations) | `engineer` |
| PP-5. Plan review (+ severities) | `staff-reviewer` |
| PP-6. Final plan (delta-based) | `engineer` |
| PP-7. Cost estimate (background) | `/tokencostscope` (inline) |
| **— Development Workflow —** | |
| WF-2b. Pre-flight check + risk scorer + file change classifier + changelog scan | `explorer` (haiku) × 3 (pre-flight, risk scorer, file classifier) + `changelog-scanner` (haiku) |
| WF-3. Write tests | `qa` |
| WF-4. Implement | `implementer` |
| WF-4b. Lint/format check | `lint-fixer` (haiku) |
| WF-4c. Safety scan | `security-scanner` (sonnet) |
| WF-5. Run tests | `make test` |
| WF-5b. Test result triage (on failure) | `test-triager` (haiku) |
| WF-6. Update docs (after tests pass) | `docs-updater` |
| WF-7/7b. Code review + UI QA (parallel) | `code-reviewer` + `playwright-qa` |
| WF-8. Commit + PR (drafts generated) | `commit-drafter` (haiku) + `pr-drafter` (haiku) |
| WF-8b. Automated review → feeds into 9 | `/code-review --comment` (inline) |
| WF-9. PR review (tiered) | `staff-reviewer` → `code-reviewer` |
| WF-9. Loop guard monitoring | `loop-guard` (haiku) |
| WF-9. PR fixes | `implementer` / `debugger` |
| WF-10. Cost analysis | `/tokencostscope` (inline) |
| **— Ad-hoc —** | |
| Search | `explorer` |
| Review | `code-reviewer` |
| UI/UX design | `frontend-designer` |

**Exception:** XS/S changes where the total work is < 5 tool calls — the orchestrator may execute inline rather than spawning an agent.

---

## Development Workflow (strict order — do not skip or reorder)

*Sub-steps (e.g., 4b/4c) may overlap with adjacent steps where noted — see Parallelism section for details.*

1. **Planning pipeline** (required for M/L) — use a `{feature}-planning` team. Dispatch to `pm`, two `researcher` instances (codebase + web, in parallel), then `architect`, `engineer`, `staff-reviewer` agents per pipeline steps above. For UI features, include `frontend-designer` after architecture to produce design specs before engineering plan.
2. **Confirm** approach with user before writing code. If unavailable: proceed but note it — this does NOT waive any subsequent step.
2b. **Pre-flight checks** (parallel) — dispatch `explorer` (Haiku) agents for pre-flight dependency check + regression risk scorer + `changelog-scanner` (Haiku) for dependency changelog summaries + `explorer` (Haiku) as file change classifier (git-history churn/bug-fix risk scoring). All advisory — flags risks for QA but does not block.
3. **Write tests first** — dispatch to `qa` agent. Tests must fail before implementation exists. Cover happy path, edge cases, and error cases. Prioritize high-risk files flagged by regression risk scorer. **Tests must target ≥80% line coverage per new/changed source file** (as specified in the plan's Test Coverage Plan section). QA agent receives the engineer's test coverage plan as input.
4. **Implement** — use a `{feature}-impl` team. Spawn `qa`, `implementer` (x N for independent file groups), `lint-fixer`, `security-scanner`, `test-triager`, `code-reviewer`, `playwright-qa`, `frontend-designer` (for UI work), `docs-updater`, `commit-drafter`, and `pr-drafter` as teammates. Coordinate via shared task list. QA + frontend-designer can overlap within a feature. Sub-steps 4b, 4c, 5b, and 8 dispatch from within this team.
4b. **Lint/format check** — dispatch `lint-fixer` (Haiku) to run project linters via CLI only (e.g., `eslint --fix`, `prettier --write`). Does not manually edit source files — restricted to linter CLI auto-fix. Reports `git diff --stat` after fixes; subsequent safety scan (4c) and code review (7/7b) verify the changes. Keeps the Sonnet code-reviewer focused on logic.
4c. **Safety scan** — dispatch `security-scanner` (Sonnet) on the uncommitted diff: scan for OWASP top 10 (injection, XSS, SSRF, secrets in code, insecure deserialization), unsafe patterns, and credential exposure. Critical finding → return to step 4 for fix → re-run 4c. High findings are logged and carried forward to step 7/7b review. This is a targeted security pass — the full logic/style review happens at step 7/7b.
5. **Run all automated tests with coverage** — run `make test-coverage` (backend: pytest --cov, frontend: vitest --coverage). Failures → dispatch `test-triager` (Haiku) to parse test output, classify failures (flaky vs. real, related vs. unrelated to the change), and surface actionable ones before returning to step 4. **Coverage gate:** if any new/changed source file has <80% line coverage, return to step 3 to add tests before proceeding. Report per-file coverage for all new/changed files in the step output.
6. **Update memory and docs** — dispatch to `docs-updater` agent after tests pass (see Memory Rules below for paths). As-you-go memory updates during implementation are still expected; this is the formal pass.
7/7b. **Lightweight code review + Playwright UI QA** (parallel) — dispatch `code-reviewer` on the uncommitted diff (`git diff`) AND `playwright-qa` to exercise the feature in the running app, in parallel. Fixes any Critical/High findings before proceeding. If code changes result from review, re-run Playwright QA. Combined fix cycle if either finds issues → return to step 4.
8. **Commit to feature branch** — dispatch `commit-drafter` and `pr-drafter` (both Haiku) in parallel — both read from the pre-commit diff independently. Use drafts for commit message and PR title/body. Push and create PR against main via `gh pr create`.
8b. **Automated review** — run `/code-review --comment` on the PR. This posts a multi-agent Sonnet+Haiku review (bug scan, CLAUDE.md compliance, git blame context, confidence-scored findings) directly to the PR as a comment. Cheap first-pass filter before the Opus review loop. **Output is passed as explicit input to the first staff-reviewer in step 9** so Opus skips re-discovering known issues.
9. **PR Review Loop** (tiered) — repeat until clean:
   i. **First pass (Opus):** Dispatch to `staff-reviewer` agent with **fresh context**. Inputs: PR diff (`gh pr diff`) + project CLAUDE.md + `/code-review` findings from step 8b (explicit input, so Opus skips re-discovering known issues)
   ii. Reviews for bugs, logic errors, edge cases, security, style → numbered findings list with **severity classification** (Critical / High / Medium / Low)
   iii. Dispatch fixes to `implementer` or `debugger` agent as appropriate. Commit, push, re-run tests.
   iv. **Subsequent passes (tiered):** If prior pass had **≤2 findings AND none Critical/High**, downgrade to `code-reviewer` (Sonnet) for the next pass. If Sonnet flags new issues, **escalate back to Opus** `staff-reviewer` for the following pass.
   v. **Exit:** Reviewer states "no remaining comments"
   vi. **Loop guard:** dispatch `loop-guard` (Haiku) to compare consecutive review passes and detect duplicate/cycling comments. Same comment on two consecutive passes → stop and flag to user (applies regardless of reviewer tier)
10. **Cost Analysis** — run `/tokencostscope` actual-vs-estimate comparison. Report the delta and update calibration data for future estimates.
11. **Merge** — ask user for permission first. Never merge without confirmation.

### Checklists (post visibly in responses)

**PRE-WORK** (before writing code):
```
[ ] Change size classified — pipeline run if M/L
[ ] Cost estimate launched (tokencostscope, non-blocking)
[ ] Plan includes Test Coverage Plan section (≥80% per new/changed file)
[ ] Plan confirmed with user
[ ] Pre-flight checks + regression risk scorer + changelog scanner + file change classifier run (parallel, advisory)
[ ] Tests written before implementation (high-risk files prioritized, ≥80% coverage target)
```

**POST-WORK** (after completing):
```
[ ] Tests: written first (failed initially), all passing (new + existing)
[ ] Coverage gate passed: ≥80% line coverage per new/changed source file
[ ] Lint/format: lint-fixer run, trivial violations auto-fixed
[ ] Safety scan: no Critical security findings (step 4c)
[ ] Memory/docs updated after tests pass (formal docs-updater pass)
[ ] Code review + Playwright QA — run in parallel, no Critical/High findings
[ ] Cost analysis — actual vs estimate compared, calibration updated
[ ] Automated review — `/code-review --comment` posted to PR, findings fed into step 9
[ ] PR review loop clean — tiered (Opus→Sonnet), no comments on final pass
[ ] User approved merge to main
```

---

## Memory Rules

**Update memory AS YOU GO, not at the end.** Mandatory formal update at step 6 of workflow (after tests pass). As-you-go updates during implementation are still expected.

`MEMORY.md` is the index (create at repo root if it doesn't exist). Details live in `docs/`:

| Trigger | Update |
|---------|--------|
| User shares a fact / preference | → `MEMORY.md` → User Preferences |
| A convention or pattern is established | → `docs/conventions.md` |
| A bug is fixed or pitfall discovered | → `docs/gotchas.md` |
| Architecture changes | → `docs/architecture.md` + `MEMORY.md` Project section |
| Test count changes | → `MEMORY.md` Project section |
| Plan completed or added | → `docs/plans/index.md` |

**Auto memory** (auto-loaded each session): `.claude/projects/-Users-kellyl--Documents-Cowork-Projects-Personal-Finance/memory/MEMORY.md` — keep as a short pointer/fast-recall index only; full details always go in `docs/`.

**Project structure:** Frontend code is in `frontend/src/`, backend in `backend/`. There is NO `monarch-dashboard/` directory — that was the old name.

**Skip:** Quick factual questions, trivial tasks with no new info.

**DO NOT ASK. Just update the right file when you learn something.**

---

## Project-Specific Workflow Details

**Step 6 — Memory/docs paths:**
- `MEMORY.md` (test counts, architecture changes)
- `docs/conventions.md` (new patterns)
- `docs/gotchas.md` (bugs found, pitfalls)
- `docs/architecture.md` (new features, structural changes)
- `docs/plans/index.md` (completed/active plans)

**Step 7/7b — App URLs:** `http://localhost` (Docker) or `http://localhost:5173` (local dev)

**Test command** (steps 5, 9.iii): `make test`
