# Session Start Template — Stoqr Editor (V2)
# Paste this at the start of every new Claude Code session.
# Update "Current status" and "Today's task" each time.

---

Project: Stoqr Editor (V2)
Stack: Angular 21 (standalone, signals), TypeScript (strict), HttpClient, Reactive Forms, SCSS, Vitest. Node 22 (`nvm use 22.22.3`).
Data source: the Stoqr Google Sheet, read AND write via the Sheets API with Google sign-in (frontend-only). Develop against the duplicate sheet, never production.

Read before starting (in this order):
1. @CLAUDE.md — session rules and conventions
2. @docs/AI_CONTRACT.md — permanent constraints; these override everything
3. @docs/projectmap.md — domain ownership; tells you where logic belongs
4. @specs/[feature].md — if continuing a core feature from last session

Current status: [what was completed last session — UPDATE THIS. e.g. "governance docs written; nothing scaffolded yet"]
Today's task: [specific goal — classify as Core or Local first]
Key context: [any decisions made last session that affect today's work]
Reference files: @[relevant files for today's task]

---

## Core vs. Local Quick Check
Before every prompt, classify the task:

**Core** (requires full workflow: read contract + map → write spec → plan → implement → update docs):
- Touches the `Product`/stock models, the Sheets read/write services, Google sign-in, quantity rules, search/filter logic, or shared signal state.

**Local** (direct prompt + typecheck/test is enough):
- Isolated UI change, copy edit, SCSS/style fix, single-component layout adjustment with no data impact.

When in doubt: treat as Core. Anything that can change the real sheet is always Core.
