# Workflow Enforcement Hooks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three Claude Code hooks that enforce the development workflow: warn when the orchestrator does too much inline work, inject delegation reminders before context compaction, and block `git push` until PR review is confirmed.

**Architecture:** All hooks are bash scripts in `.claude/hooks/`. They fire on specific Claude Code events (PreToolUse, PostToolUse, PreCompact, UserPromptSubmit). Each is independent — no shared state except temporary files keyed to `$PPID`. `settings.json` wires each hook to its event. `pipeline-gate.sh` (existing UserPromptSubmit hook) resets the inline-edit counter on each new user message.

**Tech Stack:** bash, python3 (stdlib only — json + re), Claude Code hooks API

---

## Current State (start here)

Several hook files were written inline without a plan and have known bugs. The plan below defines the correct end state. Implementers should **overwrite** the existing files rather than patch them.

**Files with bugs to fix:**
- `.claude/hooks/inline-edit-guard.sh` — `set -euo pipefail` causes hook to crash when `grep` returns 1 (no match)
- `.claude/hooks/pre-push-gate.sh` — regex to strip heredoc bodies doesn't match the actual `"$(cat <<'EOF'...EOF)"` shell pattern used for commit messages

**Files that need to exist (create or overwrite):**
- `.claude/hooks/pre-compact-reminder.sh` (exists, correct)
- `.claude/hooks/inline-edit-guard.sh` (exists, broken — see Task 1)
- `.claude/hooks/pre-push-gate.sh` (exists, broken — see Task 2)
- `.claude/hooks/pipeline-gate.sh` (exists, needs counter reset added — see Task 3)
- `.claude/settings.json` (exists, wiring already added — verify in Task 4)

---

## Chunk 1: Hook Scripts

### Task 1: Fix inline-edit-guard.sh

**Goal:** Track unique files edited directly per task. Warn at 3+ files. Counter resets on each user message (handled by pipeline-gate.sh).

**How it works:**
- On each Edit/Write PostToolUse, extract the `file_path` from the hook JSON
- Add to a per-session unique file list (flat file keyed to `$PPID`)
- At 3+ unique files, output a warning to Claude's context
- `grep` returning 1 (no match) must NOT crash the hook — avoid `set -e`

**Files:**
- Modify: `.claude/hooks/inline-edit-guard.sh`

- [ ] **Step 1: Write the hook**

```bash
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
```

- [ ] **Step 2: Make executable**

```bash
chmod +x .claude/hooks/inline-edit-guard.sh
```

- [ ] **Step 3: Manual smoke test — no crash on non-matching grep**

Simulate a PostToolUse call by piping minimal JSON:
```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/test1.js","old_string":"a","new_string":"b"}}' \
  | ./.claude/hooks/inline-edit-guard.sh
echo "Exit: $?"
```
Expected: exit 0, no output (first unique file, below threshold)

- [ ] **Step 4: Smoke test — warning fires at threshold**

```bash
# Seed 2 files already in the list
SESSION_DIR="${TMPDIR:-/tmp}/claude-unique-files-$$"
mkdir -p "$SESSION_DIR"
printf '/a/foo.js\n/b/bar.js\n' > "$SESSION_DIR/unique_files.txt"

# Pipe a 3rd file
echo "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/c/baz.js\",\"old_string\":\"a\",\"new_string\":\"b\"}}" \
  | PPID=$$ ./.claude/hooks/inline-edit-guard.sh
echo "Exit: $?"
```
Expected: warning printed, exit 0

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/inline-edit-guard.sh
git commit -m "fix: inline-edit-guard no set -e, safe grep handling"
```

---

### Task 2: Fix pre-push-gate.sh

**Goal:** Block `git push` commands until a review-confirmed marker file exists. Must NOT trigger on commit messages that contain the text "git push" (e.g. commit messages describing the hook itself).

**How it works:**
- On each Bash PreToolUse, extract the `command` field from the hook JSON
- Strip `$()` subexpressions (which contain heredoc bodies used for commit messages) using a character-level depth counter in Python
- After stripping, check if any shell-delimited segment begins with `git push`
- If yes: check for marker file `${TMPDIR}/claude-push-reviewed-${PPID}`
  - If marker exists: delete it and allow (exit 0)
  - If no marker: block with exit 2 and instructions

**Why strip `$()`:** We pass commit messages as `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"`. The heredoc body (inside `$()`) may mention "git push". After stripping all `$()` subexpressions, only the bare shell plumbing remains.

**Files:**
- Modify: `.claude/hooks/pre-push-gate.sh`

- [ ] **Step 1: Write the hook**

```bash
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
```

- [ ] **Step 2: Make executable**

```bash
chmod +x .claude/hooks/pre-push-gate.sh
```

- [ ] **Step 3: Smoke test — commit message with "git push" does NOT trigger**

```bash
# Simulate a git commit command whose -m body mentions "git push"
CMD='git commit -m "$(cat <<'"'"'EOF'"'"'\nfeat: add pre-push-gate.sh (blocks git push)\nEOF\n)"'
echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$CMD\"}}" \
  | ./.claude/hooks/pre-push-gate.sh
echo "Exit: $?"
```
Expected: exit 0 (no block)

- [ ] **Step 4: Smoke test — actual git push IS blocked**

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}' \
  | ./.claude/hooks/pre-push-gate.sh
echo "Exit: $?"
```
Expected: exit 2, blocking message printed

- [ ] **Step 5: Smoke test — marker file bypasses block**

```bash
MARKER="${TMPDIR:-/tmp}/claude-push-reviewed-$$"
touch "$MARKER"
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}' \
  | PPID=$$ ./.claude/hooks/pre-push-gate.sh
echo "Exit: $?"
ls "$MARKER" 2>/dev/null && echo "ERROR: marker not cleaned up" || echo "OK: marker deleted"
```
Expected: exit 0, marker deleted

- [ ] **Step 6: Commit**

```bash
git add .claude/hooks/pre-push-gate.sh
git commit -m "fix: pre-push-gate strip \$() subexprs to avoid commit-msg false positives"
```

---

### Task 3: Update pipeline-gate.sh — reset counter on user message

**Goal:** When a new user message arrives, reset the unique-files counter so the inline-edit-guard counts per-task, not per-session.

**Files:**
- Modify: `.claude/hooks/pipeline-gate.sh` (lines 5-8, after `INPUT=$(cat)`)

- [ ] **Step 1: Add counter reset** (add after `INPUT=$(cat)` line)

```bash
# Reset inline-edit-guard unique file counter for this new task
SESSION_DIR="${TMPDIR:-/tmp}/claude-unique-files-${PPID}"
rm -f "$SESSION_DIR/unique_files.txt"
```

- [ ] **Step 2: Verify file still passes bash syntax check**

```bash
bash -n .claude/hooks/pipeline-gate.sh && echo "OK"
```
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add .claude/hooks/pipeline-gate.sh
git commit -m "feat: reset inline-edit-guard counter on each user message"
```

---

## Chunk 2: Wiring and Verification

### Task 4: Verify settings.json wiring

**Goal:** Confirm `.claude/settings.json` correctly wires all hooks to their events. No changes needed if wiring is already correct (verify by reading).

**Expected wiring:**
- `PreToolUse[Agent]` → `validate-agent-type.sh` (existing)
- `PreToolUse[Bash]` → `pre-push-gate.sh` (new)
- `PostToolUse[Edit|Write]` → `edit-count-detector.sh` (existing) + `inline-edit-guard.sh` (new)
- `PreCompact` → `pre-compact-reminder.sh` (new)
- `UserPromptSubmit` → `pipeline-gate.sh` (existing)

**Files:**
- Verify: `.claude/settings.json`

- [ ] **Step 1: Read and verify settings.json matches expected wiring**

Read `.claude/settings.json` and confirm all 5 hook registrations are present.

- [ ] **Step 2: Validate JSON syntax**

```bash
python3 -m json.tool .claude/settings.json > /dev/null && echo "Valid JSON"
```
Expected: Valid JSON

- [ ] **Step 3: Commit settings.json if not already committed**

```bash
git add .claude/settings.json
git status .claude/settings.json
# Only commit if there are staged changes
git diff --cached --quiet .claude/settings.json || \
  git commit -m "chore: wire inline-edit-guard, pre-push-gate, pre-compact hooks in settings.json"
```

---

### Task 5: End-to-end integration test

**Goal:** Confirm all hooks work together in the actual Claude Code environment.

- [ ] **Step 1: Verify all hook files are executable**

```bash
ls -la .claude/hooks/*.sh | awk '{print $1, $NF}' | grep -v "^-rwx"
```
Expected: empty output (all files are executable)

- [ ] **Step 2: Run bash syntax check on all hooks**

```bash
for f in .claude/hooks/*.sh; do
  bash -n "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```
Expected: all OK

- [ ] **Step 3: Confirm pre-compact-reminder.sh comment is accurate**

Read `.claude/hooks/pre-compact-reminder.sh` — comment says "PostCompact hook" but it's actually a `PreCompact` hook. Fix the comment if wrong.

- [ ] **Step 4: Commit all remaining changes**

```bash
git add .claude/
git status .claude/
git commit -m "chore: workflow enforcement hooks — inline-edit-guard, pre-push-gate, pre-compact-reminder"
```

---

## Summary of All Files

| File | Action | Purpose |
|------|--------|---------|
| `.claude/hooks/inline-edit-guard.sh` | Fix (overwrite) | Warn at 3+ unique files edited inline |
| `.claude/hooks/pre-push-gate.sh` | Fix (overwrite) | Block git push until review confirmed |
| `.claude/hooks/pre-compact-reminder.sh` | Fix comment only | Remind about delegation before compaction |
| `.claude/hooks/pipeline-gate.sh` | Add 3 lines | Reset inline-edit counter per user message |
| `.claude/settings.json` | Verify/fix | Wire all hooks to correct events |

## Hook Behavior Quick Reference

| Hook | Event | Threshold | Action |
|------|-------|-----------|--------|
| inline-edit-guard | PostToolUse[Edit,Write] | 3 unique files | Advisory warning (exit 0) |
| pre-push-gate | PreToolUse[Bash] | `git push` detected | Hard block (exit 2) until marker file |
| pre-compact-reminder | PreCompact | Always | Inject delegation reminder into compaction context |
| pipeline-gate | UserPromptSubmit | Always | Reset file counter + pipeline classification gate |
