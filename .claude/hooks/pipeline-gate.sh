#!/bin/bash
# UserPromptSubmit hook: inject pipeline classification gate.
# Outputs context that Claude receives as a system reminder before processing.

set -e
INPUT=$(cat)

# Reset inline-edit-guard unique file counter on each user message
SESSION_DIR="${TMPDIR:-/tmp}/claude-unique-files-${PPID}"
rm -f "$SESSION_DIR/unique_files.txt"

# Don't inject on resume/continuation messages (short prompts)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
PROMPT_LEN=${#PROMPT}

# Skip for very short prompts (confirmations, "yes", "continue", etc.)
if [[ $PROMPT_LEN -lt 20 ]]; then
  exit 0
fi

cat <<'EOF'
<user-prompt-submit-hook>
PIPELINE GATE — Before starting work, classify this task:

| Size | Description | Pipeline Required? |
|------|-------------|-------------------|
| XS   | Single file, < 5 lines, no tests affected | No — execute inline |
| S    | 1-2 files, clear scope | Optional |
| M    | Multi-file, new feature, involves tests | YES — full pipeline |
| L    | New systems, architectural decisions | YES — full pipeline |

If M or L:
1. State the classification and why
2. Run the planning pipeline: pm → researcher → architect → (frontend-designer if UI) → engineer → staff-reviewer → engineer (final)
3. Do NOT skip steps or combine agents
4. Each step must be a fresh-context agent dispatch

If XS or S:
1. State the classification briefly
2. Proceed directly (< 5 tool calls may execute inline per CLAUDE.md)

ALWAYS state the classification before doing any work.
</user-prompt-submit-hook>
EOF

exit 0
