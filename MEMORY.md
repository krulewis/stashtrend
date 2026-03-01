# Stashtrend Memory

## Project
- **Name:** Stashtrend — self-hosted personal finance dashboard for Monarch Money
- **Stack:** Flask + React/Vite frontend + pipeline
- **Status:** Phases 1–7 complete. Docker Compose works end-to-end.
- **Tests:** 165 backend (pytest) + 177 frontend (vitest) = 342 total, all passing

## Map — Where to Find Things
| Topic | File |
|-------|------|
| Stack, DDL init order, API shapes, AI routing | `docs/architecture.md` |
| Coding conventions, transfer filtering, test runners | `docs/conventions.md` |
| Known pitfalls and gotchas | `docs/gotchas.md` |
| Plans (active/completed) | `docs/plans/index.md` |
| Decision history and rationale | `../memory-decisions-archive.md` (parent dir) |

## User Preferences
- **Kelly** (kellyryanlewis@gmail.com)
- **Primary workflow:** Docker — `docker compose up --build -d` from `monarch-dashboard/`
- **Restart after code changes:** Always use `--build` flag
- **Memory structure:** `MEMORY.md` as index + `docs/` for details — no session logs
