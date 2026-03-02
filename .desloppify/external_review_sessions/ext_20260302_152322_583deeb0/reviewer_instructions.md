# External Blind Review Session

Session id: ext_20260302_152322_583deeb0
Session token: c207d89fb84b2d9162f610d883a85e33
Blind packet: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/review_packet_blind.json
Template output: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_152322_583deeb0/review_result.template.json
Claude launch prompt: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_152322_583deeb0/claude_launch_prompt.md
Expected reviewer output: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_152322_583deeb0/review_result.json

Happy path:
1. Open the Claude launch prompt file and paste it into a context-isolated subagent task.
2. Reviewer writes JSON output to the expected reviewer output path.
3. Submit with the printed --external-submit command.

Reviewer output requirements:
1. Return JSON with top-level keys: session, assessments, findings.
2. session.id must be `ext_20260302_152322_583deeb0`.
3. session.token must be `c207d89fb84b2d9162f610d883a85e33`.
4. Include findings with required schema fields (dimension/identifier/summary/related_files/evidence/suggestion/confidence).
5. Use the blind packet only (no score targets or prior context).
