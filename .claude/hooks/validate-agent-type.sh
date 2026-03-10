#!/bin/bash
# PreToolUse hook: enforce that only custom agents from .claude/agents/ are used.
# Blocks built-in agent types that don't have custom overrides.

set -e
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Agent tool calls
if [[ "$TOOL_NAME" != "Agent" ]]; then
  exit 0
fi

AGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')

# Whitelist: must match a file in .claude/agents/
# These are the custom agents with model assignments in their frontmatter
ALLOWED=(
  "pm"
  "researcher"
  "architect"
  "engineer"
  "implementer"
  "qa"
  "debugger"
  "staff-reviewer"
  "frontend-designer"
  "docs-updater"
  "code-reviewer"
  "explorer"
  "playwright-qa"
)

for allowed in "${ALLOWED[@]}"; do
  if [[ "$AGENT_TYPE" == "$allowed" ]]; then
    exit 0
  fi
done

# Block with feedback
cat <<EOF
Blocked: subagent_type="${AGENT_TYPE}" is not a custom agent.
Use one of the project's custom agents from .claude/agents/:
  ${ALLOWED[*]}
Each has a model assignment in its frontmatter (opus/sonnet/haiku).
EOF
exit 2
