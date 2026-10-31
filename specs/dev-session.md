# Feature: Development-only session keeper (owner request, 2026-10-31) — REMOVE BEFORE GO-LIVE
# Classification: CORE (auth). Temporary; delete at the US-27 cutover.

## Problem
During development every reload (including the dev server's reload after a code change) dropped the in-memory Google token and returned to the sign-in screen, so the owner had to sign in after almost every change. Skipping sign-in entirely would leave no token, and the sheets could not load.

## Non-Goals
- No change for production: never runs in a production build or against LIVE.
- Not Remember me (US-67/68), which stores a flag only, never a token.

## Behavior Rules
- `core/auth/dev-session.ts`: `devSessionEnabled(mode)` = `isDevMode() && mode === 'test'`. Saves `{ token, expiresAt, firstName, accountId }` under one key in this tab's `sessionStorage`; `loadDevSession()` returns it only while `expiresAt` is in the future (else removes it); `clearDevSession()`; storage errors are ignored (the app just asks for sign-in).
- `Auth`: on start-up, when enabled and a valid session is saved, resumes it (token + session clock, status `signed-in`, new `sessionId`, first name). Saves after every new token and after the first-name lookup; clears whenever the token is dropped (sign-out, refused access, expiry).
- The token still expires after about an hour (expiry dialog as usual).
- Architecture rule: only this file in `core/auth`/`core/sheets` may use browser storage, and its guard must stay `isDevMode() && mode === 'test'` (written, not run).

## Measured (browser pane, 2026-10-31)
- After sign-in: the session is saved (59 minutes left, first name "Ashutosh").
- Page reload: back on the editor at once — "Ashutosh" and Sign out in the bar, 122 products loaded, no sign-in screen.
- Production build: the code is present but inert (`isDevMode()` is false in production builds; LIVE is not `test`).

## Removal (US-27 checklist)
- [ ] Delete `src/app/core/auth/dev-session.ts`
- [ ] Remove its import, `keepDevSession`, the constructor restore, `saveDevSession()` and the clear in `dropToken()` from `auth.ts`
- [ ] Remove the exemption and the guard test from `architecture.spec.ts`
- [ ] Remove the TEMPORARY DEVELOPMENT EXCEPTION line from `docs/AI_CONTRACT.md`; mark the DECISIONS entry done

Tests not run (owner decision 2026-10-29).
