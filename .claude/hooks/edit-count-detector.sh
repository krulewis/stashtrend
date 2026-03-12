#!/usr/bin/env bash
# edit-count-detector.sh — PostToolUse hook for Edit and Write tools
#
# Tracks how many times each file has been edited in this session.
# After N edits to the same file, injects a warning into Claude's context.
#
# Hook receives tool input on stdin as JSON.
# Outputs plain text; Claude Code appends it as a hook message.

set -euo pipefail

THRESHOLD=5
COUNTER_DIR="${TMPDIR:-/tmp}/claude-edit-counts-$$"

# Persist counter dir for the session using the parent PID
SESSION_DIR="${TMPDIR:-/tmp}/claude-edit-counts-${PPID}"
mkdir -p "$SESSION_DIR"

# Read tool input JSON from stdin
INPUT=$(cat)

# Extract file path from tool input (Edit uses file_path, Write uses file_path)
FILE_PATH=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# PostToolUse input has tool_input nested
tool_input = data.get('tool_input', data)
print(tool_input.get('file_path', ''))
" 2>/dev/null || echo "")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Sanitize path to safe filename for counter
SAFE_NAME=$(echo "$FILE_PATH" | sed 's|/|_|g' | sed 's|[^a-zA-Z0-9._-]|_|g')
COUNTER_FILE="$SESSION_DIR/$SAFE_NAME"

# Increment counter
if [[ -f "$COUNTER_FILE" ]]; then
  COUNT=$(cat "$COUNTER_FILE")
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi

echo "$COUNT" > "$COUNTER_FILE"

# Warn if threshold reached or exceeded
if [[ "$COUNT" -ge "$THRESHOLD" ]]; then
  echo ""
  echo "⚠️  LOOP DETECTION: You have edited '$(basename "$FILE_PATH")' ${COUNT} times this session."
  echo "Step back and reconsider your approach before making further edits to this file."
  echo "If you're stuck, try a different strategy or ask for help."
fi
