# Architecture Decision: CLAUDE.md Pipeline Optimization

**Date:** 2026-03-10
**Status:** Proposed
**Change Size:** M
**Scope:** `/home/user/stashtrend/CLAUDE.md` only -- no application code, no new agent definition files.

---

## Decision Summary

We are restructuring the Stashtrend development pipeline (defined in CLAUDE.md) to reduce token waste, increase agent parallelism, and add two advisory quality-gate steps. The 13 changes are adopted as specified in the requirements with three modifications: (1) the pipeline context packet includes an explicit soft size cap per step, (2) the tiered PR review loop includes a maximum Sonnet-pass count before mandatory Opus re-engagement, and (3) the regression risk scorer output is fed into the QA agent via the pipeline context packet. No changes to agent definition files are required. The result is a pipeline that spends fewer Opus tokens on routine follow-up reviews, runs more steps in parallel, and surfaces regression risk and dependency problems earlier.

---

## Chosen Approach

### Description

All 13 changes are implemented as a single coordinated update to CLAUDE.md. The changes are organized into three groups that must be applied together because they affect shared sections (numbering, team tables, checklists, mapping table):

**Group 1 -- Token Waste Fixes (Requirements 1-5):**
- Tiered PR review loop with severity-classified findings and Sonnet downgrade rules
- Delta-based final plan derivation (engineer receives plan + staff delta, produces complete document)
- Automated review findings piped explicitly into the first staff-reviewer pass
- Formal docs-updater pass moved after tests pass
- Pipeline context packet as ephemeral structured summary flowing through planning steps

**Group 2 -- New Parallelism (Requirements A-D):**
- Split research into two parallel researcher instances (codebase vs. web/external)
- QA + frontend-designer explicitly parallelizable within implementation team
- Cost estimate runs in background, non-blocking
- Code review (step 7) and Playwright QA (step 7b) run in parallel with combined fix cycle

**Group 3 -- New Value-Add Steps (Requirements I-III):**
- Pre-flight dependency check (Haiku agent, advisory)
- Regression risk scorer (Haiku agent, advisory, output feeds into QA via context packet)
- "Deviations from Architecture" section in engineer's initial plan output

### Rationale

**Why all 13 together rather than incremental:** The changes share infrastructure (numbering, tables, team compositions). Applying them incrementally would require re-numbering and re-editing shared sections multiple times. A single coordinated update is cleaner and avoids intermediate inconsistent states in CLAUDE.md.

**Why the tiered review approach over alternatives:** The first Opus pass catches the most severe issues. Subsequent passes are typically verifying fixes -- a task well within Sonnet's capability. The escalation path back to Opus when Sonnet finds new issues preserves the quality bar for genuine surprises. This directly reduces the most expensive per-feature cost (multiple Opus review passes).

**Why ephemeral context packet over a file-based approach:** A file on disk introduces lifecycle management (creation, cleanup, path conventions, gitignore entries). An ephemeral structured summary passed as agent input avoids all of that overhead while achieving the same goal: reducing re-exploration by downstream agents.

**Why advisory-only pre-flight and regression scoring:** Blocking gates would add friction without proven value. Starting advisory lets us measure whether the agents' outputs are actionable before committing to gating semantics.

### Alignment with Success Criteria

| SC | How Satisfied |
|----|---------------|
| SC-1 | New Planning Pipeline numbering: 1 (PM), 2 (Research, split), 3 (Architect), 3b (Frontend Designer), 4 (Engineer Initial Plan), 5 (Staff Review), 6 (Engineer Final Plan -- delta-based), 7 (Cost Estimate -- background), 7a (Pre-flight), 7b (Regression Scorer). 7a and 7b are parallel. |
| SC-2 | PR Review Loop rewritten with tiered model. First pass always Opus. Subsequent passes downgrade to Sonnet code-reviewer when prior pass had <=2 findings, none Critical/High. Sonnet finding new issues escalates back to Opus. |
| SC-3 | Staff-reviewer output already uses severity classifications (Critical/High/Medium/Low) per the existing agent definition. CLAUDE.md will reference this requirement explicitly so it is not just implicit in the agent file. |
| SC-4 | Step 6 description updated: "engineer receives original plan + staff feedback delta, produces complete corrected plan. Patch operation, not clean-room re-derivation." |
| SC-5 | Step 9.i inputs list updated: "PR diff + project CLAUDE.md + /code-review findings from step 8b." |
| SC-6 | Formal docs-updater pass moves to new Development Workflow step 7 (after tests pass at step 6). Memory Rules mandatory checkpoint updated to reference new step number. As-you-go updates during implementation preserved. |
| SC-7 | New "Pipeline Context Packet" subsection in Planning Pipeline. Ephemeral, not a file. Accumulates across steps 1-6. Contains feature name, change size, step summaries. Each summary <=500 words. |
| SC-8 | Step 2 specifies two parallel researcher instances: `researcher (codebase)` and `researcher (web)`. Architect waits for both. |
| SC-9 | Implementation team composition calls out QA + frontend-designer as parallelizable: frontend-designer works on later-component specs while QA writes tests for first batch. |
| SC-10 | Step 7 (Cost Estimate) marked non-blocking/background. Proceeds if user approves before it finishes. Logged when available. Cost analysis at step 11 notes "no baseline" if estimate never completed. |
| SC-11 | Steps 8 (code review) and 8b (Playwright QA) run in parallel. Combined fix cycle. Explicit note: re-run Playwright QA if code changes resulted from code review. |
| SC-12 | Planning Pipeline step 7a: pre-flight dependency check. Haiku agent. Checks: test file existence for affected files, circular dependencies, lock file consistency, migration conflicts, version mismatches. |
| SC-13 | Planning Pipeline step 7b: regression risk scorer. Haiku agent. Reads git log, scores 0-10, flags high-risk files. |
| SC-14 | Steps 7a and 7b are marked as parallel (independent inputs: 7a reads project files, 7b reads git log). |
| SC-15 | Engineer step 4 output format adds "Deviations from Architecture" section. Staff-reviewer uses it as a focus guide but still reviews full plan. |
| SC-16 | Agent-to-Pipeline-Step mapping table updated with all new entries. |
| SC-17 | Model Selection table adds `pre-flight-checker` and `regression-scorer` to Haiku tier. |
| SC-18 | Planning Pipeline and Development Workflow retain separate numbering. |
| SC-19 | Checklists updated with new/moved steps. |
| SC-20 | Team composition tables updated for all three phases. |

---

## Rejected Alternatives

### Alternative 1: File-Based Context Packet

**What it was:** Create a `.pipeline-context.json` file at the repo root that each agent reads and appends to, then delete it after the pipeline completes.

**Why rejected:** Introduces file lifecycle management (creation, cleanup, gitignore, error handling for missing/corrupted files). Agents would need to coordinate file access (potential race conditions with parallel agents). The ephemeral agent-input approach achieves the same benefit (reducing re-exploration) without any of this overhead. The context packet is small enough to fit in an agent's input window -- there is no need for file persistence.

### Alternative 2: Always-Opus PR Review Loop (Status Quo)

**What it was:** Keep every PR review loop pass as an Opus staff-reviewer dispatch.

**Why rejected:** Empirically, most PR review loops require 2-3 passes. The first pass catches substantive issues; subsequent passes are verifying that fixes were applied correctly. Verifying fix application is pattern-matching work that Sonnet handles reliably. At current pricing, each Opus pass costs roughly 3-5x what a Sonnet pass costs. For a typical 3-pass loop, the tiered approach saves 1-2 Opus dispatches per feature with negligible quality risk, since the escalation path returns to Opus when Sonnet detects genuinely new issues.

### Alternative 3: Single Researcher with Broader Scope

**What it was:** Keep a single researcher agent but give it both codebase and web research in its prompt.

**Why rejected:** The two research domains are fully independent -- codebase exploration uses Read/Grep/Glob while web research uses WebSearch/WebFetch. Running them sequentially wastes wall-clock time. Running them as two parallel instances with focused scopes produces results faster with no quality loss. The constraint (AG-1) that no new agent files are created is satisfied because both instances use the existing `researcher` agent definition with different prompt scoping.

### Alternative 4: Blocking Pre-Flight and Regression Gates

**What it was:** Make pre-flight dependency check and regression risk scorer into hard gates that block implementation if issues are found.

**Why rejected:** These agents run on Haiku and perform heuristic analysis (checking test file existence, reading git log frequency). Their outputs are useful signals but not reliable enough to justify blocking a pipeline. False positives would create friction; false negatives would create false confidence. Starting advisory-only (AG-10) lets us calibrate their accuracy before considering gate semantics. Deferred decision DD-4 tracks revisiting this for L-sized changes.

### Alternative 5: Full Re-Derivation for Final Plan (Status Quo Step 6)

**What it was:** Keep the current approach where the engineer agent for step 6 receives all context fresh and re-derives the plan from scratch.

**Why rejected:** The engineer agent for the final plan already has the initial plan as input. Re-deriving from scratch means re-reading architecture decisions, re-exploring file structures, and re-making decisions that were already settled. The delta-based approach (receive plan X + staff comments Y, produce corrected plan) eliminates this redundant work. The output is still a complete plan document (AG-5), so downstream consumers are unaffected. The savings come from the derivation process, not the output format.

---

## Design Details

### New Planning Pipeline Step Numbering

```
1.  PM Agent                              → requirements document
2.  Research Agents (x2, parallel)        → two research reports (codebase + web)
3.  Architect Agent                       → architecture decision (waits for both 2s)
3b. Frontend Designer (UI only)           → design specification
4.  Engineer Agent — Initial Plan          → file-level plan + "Deviations from Architecture" section
5.  Staff Engineer Agent — Review          → required changes list (with severity per finding)
6.  Engineer Agent — Final Plan (delta)    → corrected complete plan (patch derivation)
7.  Cost Estimate (background)            → non-blocking /tokencostscope
7a. Pre-flight Dependency Check           → advisory findings (Haiku, parallel with 7b)
7b. Regression Risk Scorer               → file risk scores 0-10 (Haiku, parallel with 7a)
```

Steps 7, 7a, and 7b all run after step 6 and are independent of each other. All three can run in parallel.

### New Development Workflow Step Numbering

```
1.  Planning pipeline (M/L required)
2.  Confirm approach with user
3.  Pre-flight + regression scoring results reviewed (advisory)
4.  Write tests first (QA agent)
5.  Implement (impl team)
6.  Run all automated tests — failures → step 5
7.  Update memory and docs (formal docs-updater pass)
8.  Code review + Playwright QA (parallel) — issues → combined fix cycle → step 6
    8a. Lightweight code review (code-reviewer agent)
    8b. Playwright UI QA (playwright-qa agent)
9.  Commit to feature branch, push, create PR
9b. Automated review (/code-review --comment on PR)
10. PR Review Loop (tiered):
    i.   First pass: Opus staff-reviewer (inputs: PR diff + CLAUDE.md + 9b findings)
    ii.  Severity-classified findings list
    iii. Fix → commit → push → re-run tests
    iv.  If prior pass had <=2 findings AND none Critical/High:
         → next pass: Sonnet code-reviewer
         If Sonnet flags new issues: → escalate to Opus staff-reviewer
         If prior pass had >2 findings OR any Critical/High:
         → next pass: Opus staff-reviewer (fresh context)
    v.   Exit: reviewer states "no remaining comments"
    vi.  Loop guard: same finding on two consecutive passes → flag to user
    vii. Safety cap: max 3 consecutive Sonnet passes → mandatory Opus pass
11. Cost Analysis (/tokencostscope actual vs. estimate)
12. Merge (user permission required)
```

Key changes from current numbering:
- Step 3 is new (pre-flight/regression review -- advisory, no blocking)
- Step 5 (old) was docs-updater; now moved to step 7 (after tests pass)
- Steps 7/7b (old) become 8a/8b and run in parallel
- Step 9 (old PR review loop) becomes step 10 with tiered model
- Steps renumbered accordingly throughout

### Pipeline Context Packet Specification

```
Pipeline Context Packet (ephemeral, passed as structured agent input)
---------------------------------------------------------------------
Introduced at step 1, accumulated through step 6.

Structure:
  feature_name: string
  change_size: XS | S | M | L
  steps_completed:
    - step: 1 (PM)
      summary: <requirements summary, <=500 words>
    - step: 2a (Research - Codebase)
      summary: <codebase research findings, <=500 words>
    - step: 2b (Research - Web)
      summary: <web research findings, <=500 words>
      gaps: <any failures or missing data, e.g., "web search unavailable">
    - step: 3 (Architect)
      summary: <architecture decision summary, <=500 words>
    - step: 3b (Frontend Designer) [if applicable]
      summary: <design spec summary, <=500 words>
    - step: 4 (Engineer Initial Plan)
      summary: <plan summary + deviations from architecture, <=500 words>
    - step: 5 (Staff Review)
      summary: <review findings summary, <=500 words>
    - step: 6 (Engineer Final Plan)
      summary: <final plan summary, <=500 words>

Rules:
  - Each step appends its summary. No step modifies prior summaries.
  - Summaries are concise extracts, not full outputs.
  - Full outputs (requirements doc, research report, plan) are still passed
    as separate agent inputs when needed.
  - The context packet supplements, not replaces, CLAUDE.md loading.
  - Researcher failure (EC-5) is noted in the gaps field.
  - Soft cap: each summary <=500 words. Orchestrator may truncate.
  - Regression risk scores (from step 7b) are appended after step 6
    so QA agent receives them at step 4 of the Development Workflow.
```

### Updated Team Compositions

| Phase | Team Name | Members | Notes |
|-------|-----------|---------|-------|
| **Planning** | `{feature}-planning` | `pm`, `researcher (codebase)`, `researcher (web)` | PM interviews user; two researcher instances explore in parallel (one codebase-scoped, one web/external-scoped). Architect + engineer run after (sequential dependency on both researchers). |
| **Implementation** | `{feature}-impl` | `qa`, `implementer` (x N), `code-reviewer`, `playwright-qa`, `frontend-designer`, `docs-updater` | QA writes tests first. Frontend-designer works on later-component specs in parallel with QA's first batch. Implementers work independent file groups in parallel. Code-reviewer and playwright-qa run in parallel after implementation. Docs-updater runs after tests pass. |
| **Review** | `{feature}-review` | `staff-reviewer` OR `code-reviewer`, `implementer` / `debugger` | First pass: staff-reviewer. Subsequent passes: code-reviewer (Sonnet) if prior pass had <=2 findings, none Critical/High. Escalate to staff-reviewer if code-reviewer flags new issues. |

### Updated Agent-to-Pipeline-Step Mapping

| Pipeline Step | Agent |
|---------------|-------|
| 1. Requirements interview | `pm` |
| 2. Research (codebase) | `researcher` (codebase-scoped instance) |
| 2. Research (web/external) | `researcher` (web-scoped instance) |
| 3. Architecture | `architect` |
| 3b. UI design (UI features) | `frontend-designer` |
| 4. Initial plan | `engineer` (output includes "Deviations from Architecture") |
| 5. Plan review | `staff-reviewer` (severity-classified findings) |
| 6. Final plan (delta) | `engineer` (receives plan + staff delta) |
| 7. Cost estimate | `/tokencostscope` (inline, background, non-blocking) |
| 7a. Pre-flight dependency check | `pre-flight-checker` (Haiku, uses existing `explorer`-style prompting) |
| 7b. Regression risk scorer | `regression-scorer` (Haiku, reads git log) |
| 4 (workflow). Write tests | `qa` (receives regression risk scores if available) |
| 5 (workflow). Implement | `implementer` |
| 7 (workflow). Update docs | `docs-updater` |
| 8a (workflow). Code review | `code-reviewer` |
| 8b (workflow). UI QA | `playwright-qa` |
| 9b. Automated review | `/code-review --comment` (inline) |
| 10. PR review (first pass) | `staff-reviewer` (inputs include 9b findings) |
| 10. PR review (subsequent) | `code-reviewer` (if <=2 findings, none Critical/High) |
| 10. PR review (escalation) | `staff-reviewer` (if code-reviewer flags new issues) |
| 10. PR fixes | `implementer` / `debugger` |
| 11. Cost analysis | `/tokencostscope` (inline) |
| Ad-hoc search | `explorer` |
| Ad-hoc review | `code-reviewer` |
| UI/UX design | `frontend-designer` |

### Updated Model Selection Table

| Tier | Model | Criteria | Agents |
|------|-------|----------|--------|
| **Critical judgment** | opus | Mistakes are expensive and hard to reverse | `pm`, `architect`, `staff-reviewer` |
| **Standard work** | sonnet | Produces artifacts by following patterns | `researcher`, `engineer`, `implementer`, `qa`, `code-reviewer`, `debugger`, `frontend-designer` |
| **Mechanical** | haiku | Procedural tasks, no deep reasoning needed | `explorer`, `docs-updater`, `playwright-qa`, `pre-flight-checker`, `regression-scorer` |

### Updated Checklists

**PRE-WORK:**
```
[ ] Change size classified -- pipeline run if M/L
[ ] Cost estimate initiated (tokencostscope, non-blocking)
[ ] Plan confirmed with user
[ ] Pre-flight + regression risk reviewed (advisory)
[ ] Tests written before implementation
```

**POST-WORK:**
```
[ ] Tests: written first (failed initially), all passing (new + existing)
[ ] Memory/docs updated after tests pass
[ ] Code review + Playwright QA -- parallel pass clean (no Critical/High)
[ ] Playwright QA re-run if code review required changes
[ ] Cost analysis -- actual vs estimate compared, calibration updated
[ ] Automated review -- /code-review --comment posted to PR
[ ] PR review loop clean -- no comments on final pass
[ ] User approved merge to main
```

### Memory Rules Update

The mandatory checkpoint reference changes from "step 5" to the new step number for formal docs-updater pass (step 7 in the new Development Workflow numbering). The as-you-go principle remains unchanged: "Update memory AS YOU GO, not at the end. Mandatory update at step 7 of workflow."

### Agent Definition Implications (AG-1 Compliance)

No new agent definition files are created. The implementation uses:

- **Pre-flight dependency check:** A dispatch to a Haiku-tier agent using the prompt role "pre-flight-checker." This can be implemented as an inline agent dispatch with a specific system prompt, or as a task assigned to the `explorer` agent with expanded instructions. The orchestrator's dispatch prompt provides the checking scope.
- **Regression risk scorer:** Same pattern -- Haiku-tier dispatch with role "regression-scorer" and a prompt focused on git log analysis and risk scoring.
- **Split researcher:** Two instances of the existing `researcher` agent, differentiated by the dispatch prompt: one receives "scope: codebase only, do not use WebSearch/WebFetch" and the other receives "scope: web/external research only, minimize codebase exploration."

**Open question for implementation (flagged):** The requirements say no new agent files (AG-1), but the Model Selection table and Agent-to-Pipeline-Step mapping reference `pre-flight-checker` and `regression-scorer` as named agents. The engineer implementing this will need to decide whether to:
(a) Add these as new agent definition files (violates AG-1), or
(b) Reference them as "dispatch roles" in CLAUDE.md without corresponding agent files, relying on the orchestrator to use inline Haiku dispatch with specific prompts.

**Recommendation:** Option (b) -- keep them as named dispatch roles in CLAUDE.md. Add a note under the Agent Delegation section: "Roles without dedicated agent files (`pre-flight-checker`, `regression-scorer`) are dispatched as inline Haiku agents with role-specific prompts. The orchestrator provides the system prompt at dispatch time."

---

## Interaction Analysis: How the 13 Changes Affect Each Other

### Reinforcing Interactions

1. **Context packet (5) + Split research (A):** The context packet naturally accommodates two research summaries (2a codebase, 2b web). Each researcher appends its own summary. The architect receives both via the packet plus full reports.

2. **Delta-based final plan (2) + Context packet (5):** The context packet provides the engineer with a concise summary of all prior steps, reducing the need to re-read full documents. Combined with the delta approach, step 6 becomes significantly cheaper.

3. **Tiered review (1) + Automated review feed-in (3):** Feeding /code-review findings into the first Opus pass means the first pass is more efficient (no re-discovery). This makes it more likely that the first pass resolves most issues, which makes subsequent Sonnet passes more likely to qualify for the downgrade threshold (<=2 findings, none Critical/High).

4. **Pre-flight (I) + Regression scorer (II):** Both are Haiku, both are advisory, both run after the final plan, both are independent. Natural parallelism with no coordination needed.

5. **Regression scorer (II) + QA tests (workflow step 4):** Regression risk scores inform QA about which files need extra test coverage. The scores flow through the context packet into the QA agent's input.

6. **Plan deviations (III) + Staff review (step 5):** The deviations section gives the staff reviewer explicit focus areas, potentially reducing review time and improving finding quality.

### Potential Conflicts

1. **Docs-updater move (4) + Parallel code review/Playwright (D):** Moving docs-updater to after tests pass (step 7) means it now runs just before the parallel code review + Playwright QA (step 8). There is no conflict because docs-updater modifies documentation files while code review and Playwright QA read application code. No file overlap.

2. **Tiered review (1) + Loop guard (existing):** The loop guard ("same comment on two consecutive passes -> stop and flag") must apply across tiers. A finding repeated by Sonnet that was first raised by Opus still triggers the guard. The tiered approach does not break this rule but it needs explicit documentation because the reviewer agent is different between passes.

3. **Background cost estimate (C) + Pre-flight/regression (I, II):** All three run after step 6 and are independent. No conflict, but the orchestrator must track three parallel background processes. If cost estimate is background and the user approves before pre-flight/regression complete, the advisory results arrive after plan confirmation. This is acceptable (they are advisory) but worth noting.

### No Conflicts Found Between

- Split research (A) and any other change
- QA + frontend-designer parallel (B) and any other change
- Automated review feed-in (3) and any non-review change
- Plan deviations (III) and any non-planning change

---

## Risks and Mitigations

### Risk 1: Sonnet Code-Reviewer Misses Issues in Tiered PR Review

**Severity:** Medium
**Description:** Downgrading subsequent PR review passes to Sonnet may miss subtle bugs that Opus would catch, particularly in complex logic or security-sensitive code.
**Mitigation:** (a) The downgrade only applies when the prior pass had <=2 findings with none Critical/High -- this means the code is already in good shape. (b) The escalation path returns to Opus if Sonnet flags anything new. (c) The safety cap (max 3 consecutive Sonnet passes) forces periodic Opus re-engagement. (d) The first pass is always Opus, catching the most impactful issues early.
**Acceptable threshold:** If a post-merge bug is traced to a tiered-review miss more than once, revert to always-Opus and investigate.

### Risk 2: Pipeline Context Packet Bloat

**Severity:** Low
**Description:** Without enforcement, step summaries may exceed the 500-word guideline, making the packet too large to fit in agent input windows alongside other required inputs.
**Mitigation:** (a) 500-word soft cap per step is documented. (b) Orchestrator can truncate summaries that exceed the cap. (c) The packet is supplementary -- full documents are still passed when needed. Even a bloated packet does not break the pipeline; it just wastes some input tokens.
**Acceptable threshold:** If total packet size regularly exceeds 4000 words (8 steps x 500 words), add hard truncation logic.

### Risk 3: Pre-flight/Regression Scorer Noise

**Severity:** Low
**Description:** Haiku agents performing heuristic analysis may produce false positives (flagging non-issues) or false negatives (missing real problems), causing either alert fatigue or false confidence.
**Mitigation:** (a) Advisory-only status means false positives cost attention, not pipeline blockage. (b) DD-4 tracks revisiting blocking semantics after accuracy data is collected. (c) The QA agent treats risk scores as hints, not mandates.
**Acceptable threshold:** Track false positive rate. If >50% of flags are non-actionable after 5 features, revise the agent prompts or demote the steps.

### Risk 4: Parallel Code Review + Playwright QA Leads to Stale QA Results

**Severity:** Medium
**Description:** If code review finds Critical issues requiring code changes, the parallel Playwright QA results are stale and must be re-run, partially negating the parallelism benefit.
**Mitigation:** (a) Explicit re-run requirement is documented: "Re-run Playwright QA if code changes were required from parallel code review." (b) In practice, most code review findings are localized fixes that do not affect UI behavior, so Playwright results remain valid in the majority case. (c) The worst case (code review requires changes + Playwright re-run) is no worse than the current sequential approach.

### Risk 5: Split Researcher Coordination

**Severity:** Low
**Description:** Two researcher instances may produce overlapping or contradictory findings. The architect must reconcile them.
**Mitigation:** (a) Scope separation (codebase vs. web) minimizes overlap by design. (b) The architect already evaluates research critically -- reconciling two reports is a natural extension. (c) If one researcher fails (EC-5), the architect proceeds with available research and notes the gap.

### Risk 6: Delta-Based Final Plan May Miss Staff Feedback

**Severity:** Medium
**Description:** If the engineer treats the delta approach as "only change what staff flagged," they may miss systemic issues that require broader plan adjustments.
**Mitigation:** (a) The engineer must still address every finding (existing quality bar, preserved in engineer agent definition). (b) The output is a complete plan document, not a diff -- so the engineer cannot hide unaddressed areas. (c) The staff-reviewer's findings include severity and required actions, making it clear what needs attention.

---

## Open Questions (Requiring Human Judgment)

### OQ-1: Pre-flight and Regression Scorer Agent Files

The requirements state no new agent files (AG-1), but the pipeline references `pre-flight-checker` and `regression-scorer` as named entities in the Model Selection and Mapping tables. Should these be:
- **(a)** Inline dispatch roles (no agent files, orchestrator provides system prompt) -- **recommended**
- **(b)** New agent definition files (cleaner but violates AG-1)

**Impact:** If (a), the CLAUDE.md must document the inline dispatch pattern. If (b), AG-1 is relaxed and two small agent files are created.

### OQ-2: Regression Risk Scores in Context Packet

Should regression risk scores (step 7b output) be appended to the pipeline context packet so the QA agent receives them? Requirements OQ-2 recommends yes.

**Recommendation:** Yes. The QA agent benefits from knowing which files are high-risk. The scores are small (file path + number) and fit easily in the packet.

### OQ-3: Safety Cap on Sonnet Passes in Tiered Review

The requirements do not specify a maximum number of consecutive Sonnet passes before mandatory Opus re-engagement. Without a cap, a loop of Sonnet passes finding 1-2 Medium/Low issues each iteration could continue indefinitely at reduced review quality.

**Recommendation:** Add a safety cap of 3 consecutive Sonnet passes, after which the next pass must be Opus regardless of finding count/severity. This bounds the maximum "time away from Opus" and prevents degraded review loops.

### OQ-4: Test Coverage Check Method in Pre-Flight

Requirements OQ-3 asks how pre-flight checks "test coverage of affected files" -- by test file existence or by parsing coverage reports?

**Recommendation:** Existence-based (does a test file exist for each affected source file, using the project's test file naming convention). Coverage reports may not be current and parsing them adds complexity to a Haiku agent's task.

---

## Dependency Graph for Implementation

The 13 changes must be applied to CLAUDE.md in a specific order due to shared sections:

```
Independent groups (can be written in parallel as separate edits to different sections):

Group A: Planning Pipeline steps
  - Split research (A) → step 2 rewrite
  - Plan deviations (III) → step 4 addition
  - Delta-based final plan (2) → step 6 rewrite
  - Background cost estimate (C) → step 7 rewrite
  - Pre-flight + regression scorer (I, II) → new steps 7a, 7b
  - Pipeline context packet (5) → new subsection

Group B: Development Workflow steps
  - Docs-updater move (4) → renumbering
  - Parallel code review + Playwright (D) → steps 8a/8b rewrite
  - Feed automated review into staff-reviewer (3) → step 9b/10 update
  - Tiered PR review (1) → step 10 rewrite

Group C: Supporting tables (depends on A and B for final numbering)
  - Team compositions → new table
  - Agent-to-Pipeline-Step mapping → new table
  - Model Selection → add two Haiku entries
  - Checklists → update both
  - Memory Rules → update mandatory checkpoint reference

Group D: QA + frontend-designer parallel (B)
  - Implementation team composition note
  - Parallelism section update
```

**Implementation order:** Groups A and B can be done in parallel. Group C depends on both A and B (needs final step numbers). Group D is part of Group C (team composition table).
