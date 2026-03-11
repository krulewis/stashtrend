# Agent Harness Improvements — Recommendations from LangChain Article Analysis

*Source: [The Anatomy of an Agent Harness](https://blog.langchain.com/the-anatomy-of-an-agent-harness/) — mapped against our existing pipeline.*

## 1. Edit-Count Loop Detection for Implementers

**Problem:** An `implementer` or `debugger` agent can get stuck editing the same file repeatedly without making progress (a "doom loop"). Currently we only catch cycling at the PR review level via `loop-guard`.

**Recommendation:** Add middleware/hook logic that tracks per-file edit counts within a single agent session. After N edits to the same file (suggest N=5), inject a context message: *"You've edited this file {N} times. Step back and reconsider your approach before continuing."* This catches doom loops much earlier than waiting for test-triager or loop-guard.

**Where it fits:** WF-4 (Implement). Could be implemented as a hook on the Edit tool within `implementer` and `debugger` agents.

---

## 2. Tool Output Offloading / Summarization Within Agent Sessions

**Problem:** Large tool outputs (test suite failures, broad grep results, full file reads) clutter an agent's context window, reducing quality of subsequent reasoning. Our `packet-summarizer` handles this between pipeline steps, but not within a single agent's execution.

**Recommendation:** When a tool call returns output exceeding a threshold (suggest 200 lines or 2000 tokens), automatically dispatch a Haiku summarizer to compress it before it enters the agent's context. Preserve the full output in a scratch file on the filesystem if the agent needs to reference details later.

**Where it fits:** All agents that consume large outputs — especially `implementer`, `debugger`, `qa`, and `researcher`. Could be implemented as a post-tool-call hook.

**Implementation note:** Claude Code's PostToolUse hooks can annotate output but cannot intercept and replace it before it enters the agent's context window. True output replacement would require changes at the Claude Code platform level. A hook can detect large output and append a flag/summary note, but the full output is still in context. This recommendation is partially infeasible with current hook capabilities and is deferred until platform support improves.

---

## 3. Phase-Scoped Tool Loading (Lazy Loading)

**Problem:** Every agent type currently gets its full tool set loaded into context at startup. Planning agents don't need `Edit`/`Write`/`Bash`. Implementation agents don't need `WebSearch`/`WebFetch`. Extra tools in context degrade focus and waste tokens.

**Recommendation:** Define tool sets per agent phase:

| Phase | Tools to INCLUDE | Tools to EXCLUDE |
|-------|-----------------|-----------------|
| Planning (pm, architect) | Read, Grep, Glob, WebSearch, WebFetch | Edit, Write, Bash |
| Research (researcher) | Read, Grep, Glob, WebSearch, WebFetch, Bash (read-only) | Edit, Write |
| Implementation (implementer, debugger) | Read, Edit, Write, Bash, Grep, Glob | WebSearch, WebFetch |
| Review (staff-reviewer, code-reviewer) | Read, Grep, Glob, Bash (read-only) | Edit, Write |

This is already partially reflected in agent definitions but could be more aggressive about trimming.

**Where it fits:** Agent frontmatter / tool configuration. Audit each agent's tool list against actual usage.

---

## Priority

1. **Edit-count loop detection** — highest impact, lowest effort. A simple counter + context injection.
2. **Tool output offloading** — medium effort, good payoff for long-running agents.
3. **Phase-scoped tool loading** — requires audit of actual tool usage per agent; do this when refactoring agent definitions.

## What We Already Do Well (Validated by the Article)

- Multi-step planning decomposition (PM → Research → Architect → Engineer)
- Test-first verification loops with test-triager fallback
- Loop detection at the PR review level
- Context packet with 500-word limits + packet-summarizer
- Filesystem-based coordination (shared plans, task lists, Teams)
- Git-based versioning of agent work
- Fresh-context agent dispatch (prevents context contamination)
