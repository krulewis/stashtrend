#!/usr/bin/env bash
# inline-edit-guard.sh — PostToolUse hook for Edit and Write tools
#
# Tracks unique files edited directly by the orchestrator since the last
# user message. Warns at 3+ files — that's S/M scope and should be delegated.
#
# Counter resets on each UserPromptSubmit (via pipeline-gate.sh).
# IMPORTANT: Do NOT use set -e or set -euo pipefail here.
# grep returns exit code 1 when no match is found, which would crash the hook.

THRESHOLD=3
SESSION_DIR="${TMPDIR:-/tmp}/claude-unique-files-${PPID}"
mkdir -p "$SESSION_DIR"
UNIQUE_FILES="$SESSION_DIR/unique_files.txt"

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
tool_input = data.get('tool_input', data)
print(tool_input.get('file_path', ''))
" 2>/dev/null || true)
FILE_PATH="${FILE_PATH:-}"

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Add to unique set (no duplicates)
touch "$UNIQUE_FILES"
if ! grep -qxF "$FILE_PATH" "$UNIQUE_FILES" 2>/dev/null; then
  echo "$FILE_PATH" >> "$UNIQUE_FILES"
fi

COUNT=$(wc -l < "$UNIQUE_FILES" | tr -d ' ')

if [[ "$COUNT" -ge "$THRESHOLD" ]]; then
  FILES=$(awk -F'/' '{print $NF}' "$UNIQUE_FILES" | paste -sd ', ')
  printf '\n'
  printf '⚠️  DELEGATION GUARD: You have directly edited %s unique files this task (%s).\n' "$COUNT" "$FILES"
  printf 'Work touching 3+ files is S/M scope and must be delegated to an implementer agent.\n'
  printf 'XS exception is single file, <5 tool calls total. Dispatch an agent instead.\n'
fi

exit 0
