# External Blind Review Session

Session id: ext_20260302_145834_b324b296
Session token: c98350f35ccaf0918b2554b34d7f6a50
Blind packet: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/review_packet_blind.json
Template output: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_145834_b324b296/review_result.template.json
Claude launch prompt: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_145834_b324b296/claude_launch_prompt.md
Expected reviewer output: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_145834_b324b296/review_result.json

Happy path:
1. Open the Claude launch prompt file and paste it into a context-isolated subagent task.
2. Reviewer writes JSON output to the expected reviewer output path.
3. Submit with the printed --external-submit command.

Reviewer output requirements:
1. Return JSON with top-level keys: session, assessments, findings.
2. session.id must be `ext_20260302_145834_b324b296`.
3. session.token must be `c98350f35ccaf0918b2554b34d7f6a50`.
4. Include findings with required schema fields (dimension/identifier/summary/related_files/evidence/suggestion/confidence).
5. Use the blind packet only (no score targets or prior context).
