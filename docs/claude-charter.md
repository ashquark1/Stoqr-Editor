# Claude Code Project Charter — Stoqr Editor (V2)

## What This Document Is
The operating agreement for AI-assisted development on this project.
Claude reads CLAUDE.md for session rules. This document records the
principles behind those rules for humans.

## Core Principles

1. **CLAUDE.md is the session rulebook. AI_CONTRACT.md is the law.**
   If a forbidden pattern isn't in AI_CONTRACT.md, Claude is allowed to use it.

2. **Context is scarce.** Use /clear between unrelated tasks. Use subagents
   for investigation. Keep CLAUDE.md under 80 lines.

3. **Examples over descriptions.** When establishing a pattern (e.g. the first
   feature component or the Sheets write service), write the reference
   implementation yourself, then point Claude to it.

4. **Classify before you prompt.** Core domain change → full workflow.
   Local change → direct prompt. The wrong classification is the root
   cause of most AI-assisted codebase rot.

5. **Plan before risky changes.** Use plan mode + structural justification
   for anything touching Products, Stock & Inventory Levels, the Sheets
   read/write layer, Google sign-in, or shared signal state. Anything that
   can change the real sheet is risky by definition.

6. **Tests assert rules, not cases.** "No code path writes to the sheet without
   an approval step" is a rule test; "this one button saves" is a case test.
   Prefer the former.

7. **Decisions get written down immediately.** Any trade-off made in a
   session lives in docs/DECISIONS.md before the session ends.

8. **Corrections mean prompts need improvement.** If you correct Claude
   twice on the same issue: /clear and write a better prompt.

9. **Specs are living documents.** Update the spec as you learn.
   Abandoning it once coding starts is spec-once, not spec-driven.

10. **Never test writes on the production sheet.** Develop against a
    duplicate spreadsheet; switch the spreadsheet ID only for release.

## The Four Governance Files
- **CLAUDE.md** → session behavior (commands, conventions, stack rules)
- **docs/AI_CONTRACT.md** → permanent forbidden patterns; the anti-rot contract
- **docs/DECISIONS.md** → why non-obvious choices were made
- **docs/projectmap.md** → domain ownership; where logic belongs

## Review Gate (Required Before Every Commit)
- [ ] Structural justification provided for each modified file
- [ ] Tests pass — and tests assert rules, not cases (`npm test`)
- [ ] Typecheck clean (`npx tsc -p tsconfig.app.json --noEmit`)
- [ ] Build clean (`npm run build`)
- [ ] No unauthorized new libraries
- [ ] No off-limits files modified
- [ ] No forbidden patterns from AI_CONTRACT.md introduced
- [ ] Diff is within the stated scope
- [ ] No secrets, tokens, or real credentials in the diff
- [ ] For any write-path change: verified against the duplicate sheet, not production
- [ ] For core changes: DECISIONS.md / AI_CONTRACT.md / projectmap.md updated

## Off-Limits Files
- `src/environments/*` — holds the spreadsheet ID and the Google OAuth client ID.
  Do not modify without explicit confirmation. Mirror as a deny rule in
  .claude/settings.json at scaffold time.

Add further files here (and to .claude/settings.json) when other auth or
env config is introduced.

## Anti-Patterns We Don't Accept
- Writing to the Google Sheet anywhere except `SheetsWriter`, or without approval.
- Writing `id`, `Created At`, formulas, or whole ranges.
- Silently clamping or auto-correcting quantities instead of blocking and explaining.
- Showing a save as successful before the API confirms it.
- `HttpClient` or Google APIs used anywhere except `core/sheets` / `core/auth`.
- Persisting access tokens, or committing keys/secrets.
- Business / mapping logic in components or templates.
- Manual `.subscribe()` in components instead of `async` pipe / `toSignal()`.
- One-off "quick fixes" that bypass the model or service layer.
- `if (specificValue)` special-cases instead of fixing the model/mapping.
- Copy-paste duplication instead of extracting shared code.
- `any`, `@ts-ignore`, `@ts-nocheck`, or otherwise silencing the compiler.
- NgModules or non-OnPush components.

## Last Updated
2026-10-21 — created for V2 from the V1 governance set
