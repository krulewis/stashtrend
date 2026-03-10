# Requirements: CLAUDE.md Pipeline Optimization

**Date:** 2026-03-10
**Change Size:** M (multi-file edits to a single file with cross-cutting structural changes)
**Scope:** Updates to `/home/user/stashtrend/CLAUDE.md` only. No application code changes.

---

## 1. Clarified Intent

The user wants to update the development pipeline defined in CLAUDE.md to reduce token waste, add new parallelism opportunities, and introduce new value-add steps. The changes fall into three categories:

- **Token waste fixes** (5 items): Tiered PR review loop, eliminate double engineer plan, feed automated review into staff-reviewer, move docs-updater after tests pass, introduce a pipeline context packet pattern.
- **New parallelism opportunities** (4 items): Split research into two parallel agents, QA + frontend-designer parallel within a feature, cost estimate in background, parallel code review + Playwright QA.
- **New value-add steps** (3 items): Pre-flight dependency check, regression risk scorer, plan diff review (engineer produces "Deviations from Architecture" section).

All changes are documentation/process changes to CLAUDE.md. No new agent definition files, no application code, no test changes.

---

## 2. Success Criteria

Each criterion is testable by reading the updated CLAUDE.md.

| # | Criterion |
|---|-----------|
| SC-1 | Planning Pipeline step numbering is updated to reflect all additions and reorderings, with no gaps or duplicates. |
| SC-2 | The PR Review Loop (Development Workflow step 9) specifies a tiered model: first pass is Opus staff-reviewer; subsequent passes downgrade to Sonnet code-reviewer if prior pass produced <=2 findings with none Critical/High; a final Opus pass is required only if Sonnet flags something new. |
| SC-3 | Staff-reviewer output format is specified to include severity classification (Critical / High / Medium / Low) on each finding. |
| SC-4 | Planning Pipeline step 6 (final plan) is described as a patch operation: engineer receives original plan + staff feedback delta, produces a complete corrected plan document (not a diff), without full re-derivation. |
| SC-5 | Development Workflow step 8b (/code-review --comment) output is explicitly listed as an input to the first staff-reviewer pass in step 9. |
| SC-6 | The formal docs-updater agent pass is positioned after tests pass (after current step 6). Memory Rules still specify as-you-go updates during implementation. The mandatory checkpoint reference is updated from "step 5" to the correct new step number. |
| SC-7 | A "Pipeline Context Packet" section exists describing: (a) it is an ephemeral structured summary passed as agent input, not a file; (b) it accumulates across planning steps 1-6; (c) it contains feature name, change size, PM requirements summary, researcher findings summary, architect decision summary; (d) each step appends its output summary; (e) project-level context (CLAUDE.md) is still loaded normally. |
| SC-8 | Research step specifies two parallel instances of the `researcher` agent -- one scoped to codebase analysis, one scoped to web/external research. Architect must wait for both to complete. |
| SC-9 | QA + frontend-designer are called out as parallelizable within a single feature: frontend-designer works on design specs for later components while QA writes tests for the first batch. |
| SC-10 | Cost estimate (/tokencostscope) is specified as non-blocking/background: proceeds without it if user approves plan first; estimate is recorded when it arrives. |
| SC-11 | Steps 7 (code review) and 7b (Playwright QA) are specified as parallel. Combined fix cycle if either finds issues. Explicit note: re-run Playwright QA if code changes were required from the parallel code review. |
| SC-12 | A pre-flight dependency check step exists (Haiku agent) between plan confirmation and test writing. Checks: test coverage of affected files, circular dependencies, lock files, migration conflicts, version mismatches. |
| SC-13 | A regression risk scorer step exists (Haiku agent) after final plan. Reads git log for affected files, scores regression risk 0-10, flags high-risk files for extra test coverage. |
| SC-14 | Pre-flight dependency check and regression risk scorer are specified as parallel (independent inputs). |
| SC-15 | Engineer's step 4 output includes a "Deviations from Architecture" section listing where/why the plan diverged from the architect's decision. Staff-reviewer uses this to focus review but still reviews the full plan. |
| SC-16 | The Agent-to-Pipeline-Step mapping table is updated to include new agents/steps (pre-flight, regression scorer, split researcher). |
| SC-17 | The Model Selection table is updated: pre-flight and regression scorer are Haiku tier. |
| SC-18 | Both sections (Planning Pipeline and Development Workflow) retain separate numbering schemes. |
| SC-19 | All checklists (PRE-WORK and POST-WORK) are updated to reflect new/moved steps. |
| SC-20 | The team composition tables are updated to reflect split research, parallel QA + frontend-designer, and parallel code review + Playwright QA. |

---

## 3. Constraints and Anti-Goals

| # | Constraint / Anti-Goal |
|---|------------------------|
| AG-1 | No new agent definition files (.claude/agents/*.md) are created. Split research uses two instances of the existing `researcher` agent with different prompts. |
| AG-2 | No application code, test code, or configuration changes. Scope is CLAUDE.md only. |
| AG-3 | The pipeline context packet is NOT a file on disk. It is ephemeral structured input passed between agents. Do not introduce file creation/management for it. |
| AG-4 | The tiered PR review does NOT eliminate Opus entirely. First pass is always Opus. Final pass returns to Opus if Sonnet flags new issues. |
| AG-5 | The engineer's corrected plan (step 6) is still a complete document. It is NOT a diff/patch output -- only the derivation process is more efficient. |
| AG-6 | As-you-go memory updates during implementation are preserved. The docs-updater move only affects the formal agent pass, not the general principle. |
| AG-7 | The architect still waits for BOTH researcher instances. No "start architect when first researcher finishes" optimization. |
| AG-8 | Do not merge the Planning Pipeline and Development Workflow into a single numbering scheme. |
| AG-9 | Do not change the Model Selection tiers for existing agents. Only add new entries. |
| AG-10 | Pre-flight and regression scorer are advisory. They flag risks but do not gate/block implementation. |

---

## 4. Edge Cases and Error States

| # | Edge Case | Resolution |
|---|-----------|------------|
| EC-1 | First staff-reviewer pass has 3+ findings or any Critical/High: does it stay Opus? | Yes. Downgrade to Sonnet only when prior pass had <=2 total findings AND none Critical/High. |
| EC-2 | Sonnet code-reviewer in tiered loop flags something new -- what happens? | Escalate back to Opus staff-reviewer for the next pass. Document this in the loop description. |
| EC-3 | Parallel code review finds Critical issues while Playwright QA passes -- stale QA? | Yes, Playwright results are potentially stale. Pipeline must note: "Re-run Playwright QA if code changes were required from parallel code review." |
| EC-4 | Cost estimate never completes (agent failure) while user has already approved plan. | Proceed without it. Log the missing estimate. Cost analysis at step 10 will note "no baseline estimate recorded." |
| EC-5 | One researcher instance fails (e.g., no web access) while the other succeeds. | Architect proceeds with available research. Note the gap. Do not silently ignore the failure -- log it in the context packet. |
| EC-6 | Pre-flight check finds a circular dependency or migration conflict. | Report findings to user/orchestrator. Advisory only -- does not auto-block. User decides whether to proceed or fix first. |
| EC-7 | Regression risk scorer gives a 9/10 on a file. | Flag for extra test coverage in QA step. Does not change the plan or block implementation. |
| EC-8 | Engineer's "Deviations from Architecture" section is empty (no deviations). | Valid case. Staff-reviewer still reviews the full plan but knows there are no intentional divergences to investigate. |
| EC-9 | Pipeline context packet grows very large across many steps. | Keep summaries concise. Each step appends a summary, not full output. Specify a soft size guideline (e.g., each summary <=500 words). |
| EC-10 | Tiered review loop guard: same finding on two consecutive Sonnet passes. | Existing loop guard rule still applies: "same comment on two consecutive passes -> stop and flag to user." Applies regardless of reviewer tier. |

---

## 5. Deferred Decisions

| # | Decision | Reason |
|---|----------|--------|
| DD-1 | Formal schema/template for the pipeline context packet. | Start with a loose structure (feature name, change size, step summaries). Formalize after observing real usage across 2-3 features. |
| DD-2 | Whether to create dedicated `codebase-researcher` and `web-researcher` agent files. | Start with two instances of `researcher` with different prompts. If prompt divergence grows, split into separate agent definitions later. |
| DD-3 | Automated severity classification in staff-reviewer output (vs. manual). | Severity is assigned by the staff-reviewer agent. Whether to add structured output validation is a future iteration. |
| DD-4 | Whether pre-flight and regression scorer should become blocking gates for L-sized changes. | Start advisory-only. Revisit after observing whether their warnings are consistently actionable. |
| DD-5 | Metrics/tracking on token savings from these optimizations. | Would require tooling beyond CLAUDE.md. Defer to a future instrumentation effort. |

---

## 6. Open Questions

| # | Question | Impact |
|---|----------|--------|
| OQ-1 | The pipeline context packet soft size limit (EC-9): should this be specified in CLAUDE.md or left as agent judgment? | If specified, it constrains summary length. If not, packets may bloat over time. Recommend specifying "each step summary <= 500 words" as a guideline. |
| OQ-2 | Should the regression risk scorer's output (file risk scores) be included in the pipeline context packet? | If yes, QA agent gets risk scores as input and can prioritize test coverage. Recommend yes. |
| OQ-3 | The pre-flight dependency check covers "test coverage of affected files." How is coverage measured -- by checking for existence of test files, or by parsing coverage reports? | Affects the pre-flight agent's prompt. Recommend existence-based (does a test file exist for each affected source file) since coverage reports may not be current. |

---

## 7. Scope Summary

The following changes will be made to `/home/user/stashtrend/CLAUDE.md`:

### Planning Pipeline Section
1. Update step 2 (Research) to specify two parallel `researcher` instances: one codebase-scoped, one web/external-scoped. Architect waits for both.
2. Update step 4 (Engineer Initial Plan) to require a "Deviations from Architecture" section in output.
3. Update step 6 (Engineer Final Plan) to describe a patch operation: receives original plan + staff feedback delta, produces complete corrected plan.
4. Add step 7a: Pre-flight dependency check (Haiku agent, parallel with step 7b).
5. Add step 7b: Regression risk scorer (Haiku agent, parallel with step 7a).
6. Update step 7 (Cost Estimate) to specify non-blocking/background execution.
7. Add a "Pipeline Context Packet" subsection describing the ephemeral structured summary pattern.

### Development Workflow Section
8. Move docs-updater formal pass from step 5 to after step 6 (tests passing). Update Memory Rules mandatory checkpoint reference.
9. Update step 7 and 7b to specify parallel execution with combined fix cycle and Playwright re-run note.
10. Update step 8b to specify its output feeds into step 9's first staff-reviewer pass.
11. Rewrite step 9 (PR Review Loop) with tiered model: Opus first pass, Sonnet subsequent passes if <=2 findings and none Critical/High, Opus escalation if Sonnet flags new issues.
12. Add severity classification requirement (Critical/High/Medium/Low) to staff-reviewer output specification.
13. Specify QA + frontend-designer as parallelizable within a single feature.

### Supporting Tables and Sections
14. Update Agent-to-Pipeline-Step mapping table with new steps.
15. Update Model Selection table with pre-flight (Haiku) and regression-scorer (Haiku).
16. Update team composition tables for split research, parallel QA + frontend-designer, parallel code review + Playwright QA.
17. Update PRE-WORK and POST-WORK checklists.
18. Keep both sections with separate numbering schemes; renumber as needed within each.
