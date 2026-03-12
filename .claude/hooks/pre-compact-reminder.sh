#!/usr/bin/env bash
# pre-compact-reminder.sh — PreCompact hook
#
# Fires before context compaction to remind the orchestrator about agent
# delegation rules, which are easy to bypass after losing conversation context.

cat <<'MSG'
CONTEXT COMPACTED — Agent delegation reminder:
- All multi-file work (3+ files) MUST be dispatched to an implementer or debugger agent
- XS exception (inline ok): single file, <5 tool calls total
- Do NOT edit source/test/doc files directly if the scope is S/M/L
- Resume by re-reading the compaction summary, then dispatch agents as needed
MSG
