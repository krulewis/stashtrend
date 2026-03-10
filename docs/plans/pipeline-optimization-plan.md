# Pipeline Optimization — Implementation Plan

## Overview

This plan describes all edits required to apply 13 pipeline optimization changes to `/home/user/stashtrend/CLAUDE.md`. The target file is a single Markdown document; there are no code files, tests, or migrations involved. All changes are text edits to one file.

Because every change touches the same file, no two edits can run concurrently without risking merge conflicts. All edits are therefore marked `depends-on: previous edit` and must be applied in the stated order. The safe execution model is: apply edits top-to-bottom by line number so that earlier edits do not shift line numbers for later edits — or apply from bottom to top so that higher-numbered edits do not invalidate the line references of lower-numbered edits. This plan orders edits **bottom-to-top** (highest line number first) to keep every reference stable.

---

## Changes

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 198–203 (Project-Specific Workflow Details — Step 5 reference)
Parallelism: independent (applied last in bottom-to-top pass, but listed first for reader clarity; see Dependency Order)
Description: Update "Step 5" heading to "Step 6" to match the renumbered workflow.
Details:
  - Line 198: change "**Step 5 — Memory/docs paths:**" → "**Step 6 — Memory/docs paths:**"
  - No other lines in this block change.
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 173 (Memory Rules — mandatory update reference)
Parallelism: depends-on: Project-Specific Workflow Details edit
Description: Update step reference and add as-you-go note to match new workflow ordering.
Details:
  - Line 173: change
      "**Update memory AS YOU GO, not at the end.** Mandatory update at step 5 of workflow."
    to
      "**Update memory AS YOU GO, not at the end.** Mandatory formal update at step 6 of workflow (after tests pass). As-you-go updates during implementation still expected."
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 160 (POST-WORK checklist — memory/docs item)
Parallelism: depends-on: Memory Rules edit
Description: Update checklist item to reflect that docs update now happens after tests pass.
Details:
  - Line 160: change
      "[ ] Memory/docs updated before QA"
    to
      "[ ] Memory/docs updated after tests pass"
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 125–145 (Development Workflow — full section)
Parallelism: depends-on: POST-WORK checklist edit
Description: Renumber and revise steps 2b, 3, 4, 5, 6, 7/7b, 8b, and 9 per the optimization spec. This is the largest single edit block.
Details:
  BEFORE (lines 125–145):
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

  AFTER (replace lines 125–145 with):
    1. **Planning pipeline** (required for M/L) — use a `{feature}-planning` team. Dispatch to `pm`, `researcher` (can overlap), then `architect`, `engineer`, `staff-reviewer` agents per pipeline steps above. For UI features, include `frontend-designer` after architecture to produce design specs before engineering plan.
    2. **Confirm** approach with user before writing code. If unavailable: proceed but note it — this does NOT waive any subsequent step.
    2b. **Pre-flight dependency check + Regression risk scorer** — run in parallel (both Haiku agents) after plan confirmation. Pre-flight checks test coverage of affected files, circular deps, lock files, migration conflicts, and version mismatches. Regression risk scorer reads git log for affected files, scores risk 0-10, and flags high-risk files for extra test coverage. Inform step 3 with findings.
    3. **Write tests first** — dispatch to `qa` agent. Tests must fail before implementation exists. Cover happy path, edge cases, and error cases. Use regression risk scores from step 2b to prioritize coverage on high-risk files.
    4. **Implement** — use a `{feature}-impl` team. Spawn `qa`, `implementer` (x N for independent file groups), `code-reviewer`, `frontend-designer` (for UI work), and `docs-updater` as teammates. Coordinate via shared task list.
    5. **Run all automated tests** — failures → return to step 4
    6. **Update memory and docs** — dispatch to `docs-updater` agent after tests pass (see Memory Rules below for paths). As-you-go memory updates during implementation are still expected; this is the formal pass.
    7. **Lightweight code review + Playwright UI QA** — run as **parallel agents**: dispatch `code-reviewer` on the uncommitted diff (`git diff`) AND dispatch `playwright-qa` to exercise the feature in the running app (screenshot required). If either finds issues, fix and re-run both. Re-run Playwright if code changes from review.
    8. **Commit to feature branch** — push and create PR against main via `gh pr create`
    8b. **Automated review** — run `/code-review --comment` on the PR. This posts a multi-agent Sonnet+Haiku review (bug scan, CLAUDE.md compliance, git blame context, confidence-scored findings) directly to the PR as a comment. Pass these findings as explicit input to the first `staff-reviewer` in step 9.
    9. **PR Review Loop** — tiered review, repeat until clean:
       i. Dispatch to `staff-reviewer` agent with **fresh context**. Inputs: PR diff (`gh pr diff`) + project CLAUDE.md + `/code-review` findings from step 8b. Staff reviewer outputs a **severity-classified** findings list (Critical / High / Medium / Low).
       ii. Reviews for bugs, logic errors, edge cases, security, style → numbered findings list with severity labels.
       iii. Dispatch fixes to `implementer` or `debugger` agent as appropriate. Commit, push, re-run tests.
       iv. **Tiered next pass:** If the prior pass had ≤2 findings AND none were Critical or High, downgrade to `code-reviewer` (Sonnet) for the next pass. Escalate back to `staff-reviewer` (Opus) only if Sonnet flags new issues. Otherwise dispatch a new `staff-reviewer` (fresh context) → repeat from (i).
       v. **Exit:** Reviewer states "no remaining comments"
       vi. **Loop guard:** same comment on two consecutive passes → stop and flag to user
    10. **Cost Analysis** — run `/tokencostscope` actual-vs-estimate comparison. Report the delta and update calibration data for future estimates.
    11. **Merge** — ask user for permission first. Never merge without confirmation.
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 108–119 (Agent → Pipeline Step Mapping table)
Parallelism: depends-on: Development Workflow edit
Description: Add rows for the two new Haiku pre-flight steps (7b and 7c).
Details:
  BEFORE (the table body, lines 100–119):
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

  AFTER (insert two new rows after the "7. Cost estimate" row):
    | 1. Requirements interview | `pm` |
    | 2. Research (codebase) | `researcher` |
    | 2. Research (web/external) | `researcher` |
    | 3. Architecture | `architect` |
    | 3b. UI design (UI features) | `frontend-designer` |
    | 4. Initial plan | `engineer` |
    | 5. Plan review | `staff-reviewer` |
    | 6. Final plan | `engineer` |
    | 7. Cost estimate | `/tokencostscope` (inline) |
    | 7b. Pre-flight dependency check | `explorer` (haiku) |
    | 7c. Regression risk scoring | `explorer` (haiku) |
    | 3. Write tests | `qa` |
    | 4. Implement | `implementer` |
    | 6. Update docs | `docs-updater` |
    | 7. Code review + UI QA (parallel) | `code-reviewer` + `playwright-qa` |
    | 8b. Automated review | `/code-review --comment` (inline) |
    | 9. PR review | `staff-reviewer` |
    | 9. PR fixes | `implementer` / `debugger` |
    | 10. Cost analysis | `/tokencostscope` (inline) |
    | Ad-hoc search | `explorer` |
    | Ad-hoc review | `code-reviewer` |
    | UI/UX design | `frontend-designer` |

  Note: Also update "5. Update docs" row label to "6. Update docs" to match renumbered workflow.
  Note: Merge old standalone rows 7 and 7b into one combined row to reflect parallel execution.
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 65–69 (Standard team compositions table)
Parallelism: depends-on: Agent → Pipeline Step Mapping edit
Description: Update Planning team member list to show two researcher instances; update Implementation team notes to allow QA + frontend-designer overlap.
Details:
  BEFORE (line 67, Planning row):
    | **Planning** | `{feature}-planning` | `pm`, `researcher` | PM interviews user; researcher explores codebase/web in parallel. Architect + engineer run after (sequential dependency). |

  AFTER (line 67, Planning row):
    | **Planning** | `{feature}-planning` | `pm`, `researcher` (x2: codebase + web) | PM interviews user; two researcher instances run in parallel (one codebase-scoped, one web/external-scoped). Both must complete before Architect starts. |

  BEFORE (line 68, Implementation row):
    | **Implementation** | `{feature}-impl` | `qa`, `implementer` (x N), `code-reviewer`, `frontend-designer`, `docs-updater` | QA writes tests first. Implementers work independent file groups in parallel. Code-reviewer does a lightweight pre-commit review after implementation completes. Frontend-designer provides design specs for UI work. Docs-updater runs alongside or after implementation. |

  AFTER (line 68, Implementation row):
    | **Implementation** | `{feature}-impl` | `qa`, `implementer` (x N), `code-reviewer`, `frontend-designer`, `docs-updater` | QA writes tests first. Implementers work independent file groups in parallel. Code-reviewer does a lightweight pre-commit review after implementation completes. Frontend-designer provides design specs for UI work; QA + frontend-designer can overlap — frontend-designer works on upcoming component specs while QA tests the current batch. Docs-updater runs after tests pass (step 6). |
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 35–46 (Parallelism section — Pipeline parallelism bullet list)
Parallelism: depends-on: Standard team compositions edit
Description: Add five new pipeline parallelism bullet points per the optimization spec.
Details:
  BEFORE (lines 35–37, Pipeline parallelism subsection):
    **Pipeline parallelism:**
    - Research Agent + PM clarification follow-ups can overlap
    - Multiple independent searches, reads, or validations should always be parallel

  AFTER:
    **Pipeline parallelism:**
    - Research Agent + PM clarification follow-ups can overlap
    - Two `researcher` instances (codebase + web) run in parallel; both must complete before Architect starts
    - Multiple independent searches, reads, or validations should always be parallel
    - Pre-flight dependency check + Regression risk scorer run in parallel after plan confirmation
    - Cost estimate runs in background, non-blocking — proceed if user approves plan before estimate finishes
    - Code review (step 7) + Playwright QA (step 7) run as parallel agents; fix cycle is shared
    - QA + Frontend-Designer can overlap within a feature: frontend-designer works on later component specs while QA writes tests for first batch
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 46 (after the "When in doubt, prefer parallel" line — insert new subsection)
Parallelism: depends-on: Parallelism section edit
Description: Insert the new "Pipeline Context Packet" subsection after the Parallelism section and before Agent Teams.
Details:
  Insert the following block between line 46 ("When in doubt...") and line 48 ("### Agent Teams"):

    ### Pipeline Context Packet

    Each pipeline agent (steps 1-6) receives and appends to a structured context packet passed as agent input. This replaces ad-hoc re-exploration of prior step outputs.

    **Packet structure:**
    - Feature name and change size classification
    - PM: requirements summary (appended at step 1)
    - Research: codebase findings + web findings summaries (appended at step 2)
    - Architect: decision summary, rationale, key constraints (appended at step 3)
    - Engineer: plan summary, deviations from architecture (appended at step 4)
    - Staff reviewer: required changes summary (appended at step 5)

    The orchestrator maintains the packet and passes it to each agent. Project-level context (CLAUDE.md) is still loaded normally — the packet supplements, not replaces.
```

```
File: /home/user/stashtrend/CLAUDE.md
Lines: 18–28 (Pipeline Steps section)
Parallelism: depends-on: Pipeline Context Packet insertion
Description: Update steps 2, 4, 6, and 7 per the optimization spec; add new steps 7b and 7c.
Details:
  BEFORE (lines 20–28):
    1. **PM Agent** — dispatch to `pm` agent → requirements document
    2. **Research Agent** — dispatch to `researcher` agent → written report
    3. **Architect Agent** — dispatch to `architect` agent → architecture decision with rationale and rejected alternatives
    3b. **Frontend Designer** (UI features only) — dispatch to `frontend-designer` agent → design specification with component designs, tokens, states, responsive behavior
    4. **Engineer Agent — Initial Plan** — dispatch to `engineer` agent → file-level implementation plan with parallelism tags (incorporates design spec for UI work)
    5. **Staff Engineer Agent — Review** — dispatch to `staff-reviewer` agent → pressure-tests plan for bugs, ambiguities, edge cases, incorrect assumptions → required changes list
    6. **Engineer Agent — Final Plan** — dispatch to `engineer` agent (with staff feedback as input) → corrected plan ready for implementation
    7. **Cost Estimate** — run `/tokencostscope` on the final plan → token/dollar estimate for remaining steps (implementation, QA, review loop). Record estimate before proceeding.

  AFTER:
    1. **PM Agent** — dispatch to `pm` agent → requirements document
    2. **Research Agent** — dispatch TWO parallel `researcher` instances: one codebase-scoped, one web/external-scoped. Both produce written reports. Architect waits for BOTH to complete.
    3. **Architect Agent** — dispatch to `architect` agent → architecture decision with rationale and rejected alternatives
    3b. **Frontend Designer** (UI features only) — dispatch to `frontend-designer` agent → design specification with component designs, tokens, states, responsive behavior
    4. **Engineer Agent — Initial Plan** — dispatch to `engineer` agent → file-level implementation plan with parallelism tags (incorporates design spec for UI work). Plan **must include a "Deviations from Architecture" section** listing every place the plan diverges from the architect's decision and why. Staff-reviewer uses this section to focus review effort.
    5. **Staff Engineer Agent — Review** — dispatch to `staff-reviewer` agent → pressure-tests plan for bugs, ambiguities, edge cases, incorrect assumptions → required changes list
    6. **Engineer Agent — Final Plan** — dispatch to `engineer` agent with explicit inputs: "here is plan [X] + staff comments [Y] → produce corrected plan." This is a patch operation against the existing plan, not a clean-room re-derivation. Output is still a complete, standalone plan document.
    7. **Cost Estimate** — run `/tokencostscope` on the final plan → token/dollar estimate for remaining steps (implementation, QA, review loop). Runs in background, non-blocking. Proceed if user approves plan before estimate finishes.
    7b. **Pre-flight dependency check** — dispatch Haiku `explorer` agent. Checks test coverage of affected files, circular dependencies, lock files, migration conflicts, and version mismatches.
    7c. **Regression risk scorer** — dispatch Haiku `explorer` agent. Reads git log for affected files, scores each file 0-10 for regression risk, flags high-risk files for extra test coverage.
    (Steps 7b and 7c run in parallel with each other, after cost estimate / plan confirmation.)
```

---

## Dependency Order

Because all 9 edit groups touch a single file, they must be applied sequentially. Apply in the following order (bottom-to-top by original line number to keep earlier references stable):

1. **Edit A** — Lines 198–203: Project-Specific Workflow Details "Step 5" → "Step 6"
2. **Edit B** — Line 173: Memory Rules mandatory update reference
3. **Edit C** — Line 160: POST-WORK checklist memory/docs item
4. **Edit D** — Lines 125–145: Development Workflow full section rewrite
5. **Edit E** — Lines 108–119: Agent → Pipeline Step Mapping table
6. **Edit F** — Lines 65–69: Standard team compositions table
7. **Edit G** — Lines 35–46: Parallelism section pipeline bullet list
8. **Edit H** — Line 46 (after): Pipeline Context Packet new subsection insertion
9. **Edit I** — Lines 18–28: Pipeline Steps section

Rationale for bottom-to-top order: Edits A through D affect lines 125–203. Edits E through I affect lines 18–119. Applying the higher-numbered edits first means that when we reach the lower-numbered edits, line offsets have not shifted in the region we are about to edit. This eliminates the most common source of off-by-one errors when applying sequential edits to a single document.

---

## Test Strategy

This change is purely documentation — there are no code files, no functions, no imports, and no runtime behavior changed. The conventional test strategy (unit tests, integration tests) does not apply.

**Verification approach instead:**

1. **Structural completeness check** — after applying all edits, verify:
   - Section headers match the expected list: Change Size Classification, Pipeline Steps, Parallelism, Pipeline Context Packet, Agent Teams, Model Selection Principle, Agent Delegation
   - No section was accidentally deleted during a block replacement
   - No duplicate heading exists (e.g., two "### Parallelism" sections)

2. **Reference consistency check** — verify:
   - All "step N" references in Memory Rules, Project-Specific Workflow Details, and the checklist agree with the new numbering (step 6 for docs update)
   - The Agent → Pipeline Step Mapping table contains rows for 7b and 7c
   - The Standard team compositions Planning row shows `researcher` (x2)

3. **Prose integrity check** — verify:
   - The "Deviations from Architecture" section requirement appears in step 4 of Pipeline Steps
   - The Final Plan step 6 contains the "patch operation, not clean-room re-derivation" language
   - The PR Review Loop tiered review language appears in step 9, sub-item iv
   - The Pipeline Context Packet subsection is present and contains all six packet fields

4. **No orphaned references** — verify:
   - "Step 5 — Memory/docs paths" in Project-Specific Workflow Details no longer exists; "Step 6 — Memory/docs paths" does
   - "Mandatory update at step 5" no longer exists in Memory Rules

All verification steps can be performed by a single `explorer` or `code-reviewer` agent reading the final CLAUDE.md and confirming the above points.

**Edge cases:**
- If an edit tool applies changes and the file encoding changes (e.g., trailing whitespace added/removed), verify Markdown renders correctly
- If the Pipeline Context Packet insertion shifts line numbers such that the Pipeline Steps edit references stale lines, use the section header "### Pipeline Steps" as an anchor rather than a raw line number

---

## Deviations from Architecture

The requirements were provided as an informal change specification (no separate architecture document exists for a CLAUDE.md edit). The following notes record places where this plan made judgment calls or minor modifications relative to the stated requirements:

1. **Agent → Pipeline Step Mapping table — research row split**: The requirements said to update the Standard team compositions Planning row but did not explicitly say to split the Research row in the mapping table from one row into two. This plan adds two rows ("2. Research (codebase)" and "2. Research (web/external)") to the mapping table for internal consistency. This is a logical extension of the requirement, not a contradiction.

2. **Step 7 and 7b merge in workflow**: The requirements specified steps 7 and 7b as separate numbered items that are now parallel. This plan collapses them into a single numbered step 7 with explicit "run as parallel agents" language, rather than keeping the 7 / 7b split. Rationale: the 7b designation implied sequential ordering, which contradicts the parallelism intent. A single step with parallel sub-agents is clearer. If the original 7/7b numbering is preferred for backward-compatibility with other documents, the implementer should restore the split.

3. **"5. Update docs" row in mapping table**: The requirements mentioned renumbering the workflow step but did not call out the mapping table row explicitly. This plan updates the mapping table row label from "5. Update docs" to "6. Update docs" to keep the table consistent with the renumbered workflow.

4. **Agent → Pipeline Step Mapping — merged code review + UI QA row**: The existing table had separate rows for step 7 (code review) and step 7b (Playwright UI QA). This plan merges them into one row labeled "7. Code review + UI QA (parallel)" to reflect that they now run as parallel agents and share a fix cycle. This is a display-level decision; if the two-row format is preferred for granularity, the implementer may keep them as separate rows with a "(parallel)" annotation on each.

5. **Pipeline Steps — wording of step 6 Final Plan**: The requirements said the prompt is "here is plan X + staff comments Y → produce corrected plan." This plan renders that as prose instruction within the step description rather than as a literal prompt template, consistent with how other step descriptions are written. The semantic intent is fully preserved.

6. **No changes to `.claude/agents/engineer.md` or `.claude/agents/staff-reviewer.md`**: The requirements specified only CLAUDE.md changes. The engineer.md file already contains a Final Plan section; the new "patch operation, not clean-room re-derivation" language is added to CLAUDE.md's Pipeline Steps description only. If the intent is also to update the agent definition files to reinforce this behavior, that is out of scope of this plan and should be a separate change request.

---

## Rollback Notes

All changes are to a single text file tracked in git. Rollback is trivial:

- `git diff HEAD -- CLAUDE.md` to review what changed
- `git checkout HEAD -- CLAUDE.md` to restore the file to its pre-edit state
- No migrations, no data changes, no dependency updates — full rollback is atomic and zero-risk

If edits are applied incrementally (one edit group at a time with intermediate commits), each intermediate commit can be reverted individually with `git revert <sha>` without affecting earlier or later edit groups.
