# Claude Blind Reviewer Launch Prompt

You are an isolated blind reviewer. Do not use prior chat context, prior score history, or target-score anchoring.

Blind packet: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/review_packet_blind.json
Template JSON: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_152322_583deeb0/review_result.template.json
Output JSON path: /Users/kellyl./Documents/Cowork Projects/Personal Finance/monarch-dashboard/.claude/worktrees/refactor/.desloppify/external_review_sessions/ext_20260302_152322_583deeb0/review_result.json

Requirements:
1. Read ONLY the blind packet and repository code.
2. Start from the template JSON so `session.id` and `session.token` are preserved.
3. Keep `session.id` exactly `ext_20260302_152322_583deeb0`.
4. Keep `session.token` exactly `c207d89fb84b2d9162f610d883a85e33`.
5. Output must be valid JSON with top-level keys: session, assessments, findings.
6. Every finding must include: dimension, identifier, summary, related_files, evidence, suggestion, confidence.
7. Do not include provenance metadata (CLI injects canonical provenance).
8. Return JSON only (no markdown fences).
