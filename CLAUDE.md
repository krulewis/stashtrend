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
2. **Research Agent** — dispatch to `researcher` agent → written report
3. **Architect Agent** — dispatch to `architect` agent → architecture decision with rationale and rejected alternatives
3b. **Frontend Designer** (UI features only) — dispatch to `frontend-designer` agent → design specification with component designs, tokens, states, responsive behavior
4. **Engineer Agent — Initial Plan** — dispatch to `engineer` agent → file-level implementation plan with parallelism tags (incorporates design spec for UI work)
5. **Staff Engineer Agent — Review** — dispatch to `staff-reviewer` agent → pressure-tests plan for bugs, ambiguities, edge cases, incorrect assumptions → required changes list
6. **Engineer Agent — Final Plan** — dispatch to `engineer` agent (with staff feedback as input) → corrected plan ready for implementation
7. **Cost Estimate** — run `/tokencostscope` on the final plan → token/dollar estimate for remaining steps (implementation, QA, review loop). Record estimate before proceeding.

**Never skip or combine steps.** Fresh-context agents catch what prior agents missed.

### Parallelism

Run pipeline steps and build processes as **parallel agents** whenever their inputs are independent. Only serialize when a step requires output from a prior step (e.g., Architect depends on Research) or when changes touch the same files/branch (rebase conflicts).

**Pipeline parallelism:**
- Research Agent + PM clarification follow-ups can overlap
- Multiple independent searches, reads, or validations should always be parallel

**Implementation parallelism:**
- The `engineer` agent's plan tags each change as `independent` or `depends-on: <other change>`
- When a plan identifies independent file groups, spawn multiple `implementer` agents in parallel — one per independent group
- `qa` agent can begin writing tests in parallel with implementation when test interfaces are defined in the plan
- `docs-updater` runs in parallel with QA after implementation completes
- PR review loop fixes on independent files can be parallelized across `implementer` or `debugger` agents

When in doubt, prefer parallel — the cost of a wasted agent is lower than the cost of idle waiting.

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
| **Planning** | `{feature}-planning` | `pm`, `researcher` | PM interviews user; researcher explores codebase/web in parallel. Architect + engineer run after (sequential dependency). |
| **Implementation** | `{feature}-impl` | `qa`, `implementer` (x N), `code-reviewer`, `frontend-designer`, `docs-updater` | QA writes tests first. Implementers work independent file groups in parallel. Code-reviewer does a lightweight pre-commit review after implementation completes. Frontend-designer provides design specs for UI work. Docs-updater runs alongside or after implementation. |
| **Review** | `{feature}-review` | `staff-reviewer`, `implementer` / `debugger` | Staff reviewer finds issues → implementer/debugger fix → fresh staff-reviewer pass. |

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
| **Standard work** | sonnet | Produces artifacts by following patterns | `researcher`, `engineer`, `implementer`, `qa`, `code-reviewer`, `debugger`, `frontend-designer` |
| **Mechanical** | haiku | Procedural tasks, no deep reasoning needed | `explorer`, `docs-updater`, `playwright-qa` |

### Agent Delegation — MANDATORY

**All execution work MUST be dispatched to a named agent.** The orchestrator coordinates and dispatches but does not perform execution tasks inline.

**Agent → Pipeline Step Mapping:**

| Pipeline Step | Agent |
|---------------|-------|
| 1. Requirements interview | `pm` |
| 2. Research | `researcher` |
| 3. Architecture | `architect` |
| 3b. UI design (UI features) | `frontend-designer` |
| 4. Initial plan | `engineer` |
| 5. Plan review | `staff-reviewer` |
| 6. Final plan | `engineer` |
| 7. Cost estimate | `/tokencostscope` (inline) |
| 3. Write tests | `qa` |
| 4. Implement | `implementer` |
| 5. Update docs | `docs-updater` |
| 7. UI QA | `playwright-qa` |
| 8b. Automated review | `/code-review --comment` (inline) |
| 9. PR review | `staff-reviewer` |
| 9. PR fixes | `implementer` / `debugger` |
| 10. Cost analysis | `/tokencostscope` (inline) |
| Ad-hoc search | `explorer` |
| Ad-hoc review | `code-reviewer` |
| UI/UX design | `frontend-designer` |

**Exception:** XS/S changes where the total work is < 5 tool calls — the orchestrator may execute inline rather than spawning an agent.

---

## Development Workflow (strict order — do not skip or reorder)

1. **Planning pipeline** (required for M/L) — use a `{feature}-planning` team. Dispatch to `pm`, `researcher` (can overlap), then `architect`, `engineer`, `staff-reviewer` agents per pipeline steps above. For UI features, include `frontend-designer` after architecture to produce design specs before engineering plan.
2. **Confirm** approach with user before writing code. If unavailable: proceed but note it — this does NOT waive any subsequent step.
3. **Write tests first** — dispatch to `qa` agent. Tests must fail before implementation exists. Cover happy path, edge cases, and error cases.
4. **Implement** — use a `{feature}-impl` team. Spawn `qa`, `implementer` (x N for independent file groups), `code-reviewer`, `frontend-designer` (for UI work), and `docs-updater` as teammates. Coordinate via shared task list.
5. **Update memory and docs** — dispatch to `docs-updater` agent before QA (see Memory Rules below for paths)
6. **Run all automated tests** — failures → return to step 4
7. **Lightweight code review** — dispatch `code-reviewer` agent on the uncommitted diff (`git diff`). Fixes any Critical/High findings before proceeding. Catches issues pre-commit so the PR review loop is cleaner.
7b. **Playwright UI QA** — dispatch to `playwright-qa` agent. Exercise the feature in the running app, take a screenshot — issues → return to step 4
8. **Commit to feature branch** — push and create PR against main via `gh pr create`
8b. **Automated review** — run `/code-review --comment` on the PR. This posts a multi-agent Sonnet+Haiku review (bug scan, CLAUDE.md compliance, git blame context, confidence-scored findings) directly to the PR as a comment. Cheap first-pass filter before the Opus review loop.
9. **PR Review Loop** — repeat until clean:
   i. Dispatch to `staff-reviewer` agent with **fresh context**. Only inputs: PR diff (`gh pr diff`) + project CLAUDE.md + any `/code-review` findings already posted on the PR
   ii. Reviews for bugs, logic errors, edge cases, security, style → numbered findings list
   iii. Dispatch fixes to `implementer` or `debugger` agent as appropriate. Commit, push, re-run tests.
   iv. Dispatch to **new** `staff-reviewer` agent (fresh context) → repeat from (i)
   v. **Exit:** Staff Engineer states "no remaining comments"
   vi. **Loop guard:** same comment on two consecutive passes → stop and flag to user
10. **Cost Analysis** — run `/tokencostscope` actual-vs-estimate comparison. Report the delta and update calibration data for future estimates.
11. **Merge** — ask user for permission first. Never merge without confirmation.

### Checklists (post visibly in responses)

**PRE-WORK** (before writing code):
```
[ ] Change size classified — pipeline run if M/L
[ ] Cost estimate recorded (tokencostscope)
[ ] Plan confirmed with user
[ ] Tests written before implementation
```

**POST-WORK** (after completing):
```
[ ] Tests: written first (failed initially), all passing (new + existing)
[ ] Memory/docs updated before QA
[ ] Code review — lightweight pre-commit review clean (no Critical/High)
[ ] Playwright QA — screenshot taken
[ ] Cost analysis — actual vs estimate compared, calibration updated
[ ] Automated review — `/code-review --comment` posted to PR
[ ] PR review loop clean — no comments on final pass
[ ] User approved merge to main
```

---

## Memory Rules

**Update memory AS YOU GO, not at the end.** Mandatory update at step 5 of workflow.

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

**Step 5 — Memory/docs paths:**
- `MEMORY.md` (test counts, architecture changes)
- `docs/conventions.md` (new patterns)
- `docs/gotchas.md` (bugs found, pitfalls)
- `docs/architecture.md` (new features, structural changes)
- `docs/plans/index.md` (completed/active plans)

**Step 7 — App URLs:** `http://localhost` (Docker) or `http://localhost:5173` (local dev)

**Step 9 — Test command:** `make test`
