# Project Context for Claude Code

## What this is

A custom Pomodoro/focus timer app (working name: "Pomme"). Web app first (React + TypeScript), mobile (React Native) later. See `docs/project-overview.md` in this repo for the full idea, roadmap, and decisions — read it if it's present and relevant to the current task.

## Stack

- Frontend: React + TypeScript (Vite)
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL (via Docker locally)
- Auth: Clerk
- Repo structure: monorepo (frontend + backend, mobile added later)

## Current phase

v1 — bare-bones web timer only. Do not build v2+ features (personalization, themes, gamification, blocking) unless explicitly asked for this session.

## Hard rules

- **Never run `git commit` or `git push`.** The user commits everything themselves. (Also enforced via `.claude/settings.json` permission deny rules — don't attempt to work around this.)
- Keep changes scoped to exactly what's asked in the current prompt — don't expand scope to adjacent files/features without asking.
- Ask before adding new dependencies not already in the stack above.
