#!/usr/bin/env bash
# pre-push-gate.sh — PreToolUse hook for Bash tool
#
# Intercepts actual git push invocations and blocks them until the operator
# confirms the PR review loop is complete (via a marker file).
#
# Exit 2 = hard block (tool use prevented)
# Exit 0 = allow
#
# IMPORTANT: Do NOT use set -e here — grep returns 1 on no-match.

INPUT=$(cat)

# Extract the bash command
COMMAND=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
tool_input = data.get('tool_input', data)
print(tool_input.get('command', ''))
" 2>/dev/null || true)
COMMAND="${COMMAND:-}"

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Strip $(...) subexpressions using a depth counter.
# This removes heredoc bodies embedded in commit messages like:
#   git commit -m "$(cat <<'EOF'\n...\nEOF\n)"
# so that "git push" appearing inside a commit message doesn't trigger the gate.
STRIPPED=$(python3 - "$COMMAND" <<'PYEOF'
import sys, re

cmd = sys.argv[1]

# Character-level: remove everything inside $(...) at any depth
result = []
depth = 0
i = 0
while i < len(cmd):
    if cmd[i:i+2] == '$(':
        depth += 1
        i += 2
        continue
    elif cmd[i] == ')' and depth > 0:
        depth -= 1
        i += 1
        continue
    elif depth > 0:
        i += 1
        continue
    result.append(cmd[i])
    i += 1

stripped = ''.join(result)

# Also strip -m "..." and -m '...' inline commit message args (single-line)
stripped = re.sub(r"-m\s+\"[^\"]*\"", '', stripped)
stripped = re.sub(r"-m\s+'[^']*'", '', stripped)

print(stripped)
PYEOF
) || STRIPPED="$COMMAND"

# Check if any shell-separated segment is a git push invocation
if ! echo "$STRIPPED" | grep -qE '(^|[;&|])\s*git\s+push'; then
  exit 0
fi

# Check for review-confirmed marker
MARKER_FILE="${TMPDIR:-/tmp}/claude-push-reviewed-${PPID}"
if [[ -f "$MARKER_FILE" ]]; then
  rm -f "$MARKER_FILE"
  exit 0
fi

# Block and instruct
printf '\n'
printf '🚫 PUSH BLOCKED — PR Review Gate\n'
printf '\n'
printf 'Before pushing, confirm all of the following:\n'
printf '  1. All tests pass (make test)\n'
printf '  2. Staff review loop completed (staff-reviewer agent — no remaining comments)\n'
printf '  3. No Critical/High findings unresolved\n'
printf '\n'
printf 'Once review is complete, allow the push by running:\n'
printf '  touch %s\n' "$MARKER_FILE"
printf 'Then re-run the push command.\n'
exit 2
