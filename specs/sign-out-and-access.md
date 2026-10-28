# Feature: Sign-out, access messages and first name (US-07, US-32, D1)
# Sprint 2. Classification: Core (auth, OAuth scopes, shared signal state).

## Problem
A signed-in staff member cannot sign out or switch Google accounts, and cannot see which account is signed in. When their account cannot open a spreadsheet, the app names only the first failing sheet, even if both fail, and offers no way to switch account. The owner decided (D1, 2026-10-28) that the topbar shows the signed-in person's first name.

## Non-Goals
- No email address shown; no `email` or `openid` scope.
- No token renewal without losing work (US-06).
- No per-sheet block on editing a linked product (US-32 write side, Sprint 3); here US-32 is the load-time message.
- No Stock Log or any other use of the name beyond the topbar.

## Behavior Rules
- Scopes: the app requests exactly `spreadsheets` and `userinfo.profile` (`REQUESTED_SCOPES` in `core/auth/auth-scope.ts`). Sign-in succeeds only when the Sheets scope is granted; the profile scope is optional.
- First name: after sign-in, `core/auth` reads `GET https://www.googleapis.com/oauth2/v3/userinfo` with the bearer token. The name is `given_name`, else the first word of `name`, else none. It is held in memory only (a signal), never in browser storage, and cleared on sign-out or expiry. A failed or late (after sign-out) lookup is ignored; the topbar then shows "Signed in".
- Topbar: when signed in, shows the first name (or "Signed in") and a Sign out button. Nothing shows when signed out.
- Sign-out: `Auth.signOut()` revokes the token with Google (`google.accounts.oauth2.revoke`, not awaited), then clears the token, name, expiry and error and sets `signed-out`; the existing redirects return to `/sign-in` and `SheetsStore` clears its data. A failing revoke never keeps the user signed in.
- Access messages: `SheetsStore` waits for both reads (`Promise.allSettled`). All-or-nothing still holds. `combineLoadErrors` (pure): any expired → no panel (Auth handles it); all errors are no-access → one message naming every such sheet ("You don't have access to Master or Dr Trust. Ask the owner to share them with you as Editor."); otherwise each sheet's message in order.
- `SheetsStore.noAccess` is true when at least one sheet refused access; the error panel then shows Sign out next to Retry.
- The "cancelled" sign-in message adds: "If Google said access is blocked, ask the owner to add your account as a test user."

## Edge Cases
- Profile scope unticked or not returned: signed in, label "Signed in".
- Userinfo call fails (network, 401, 403): signed in, label "Signed in"; no error shown.
- Sign-out while the profile lookup is in flight: the late result is discarded.
- `revoke` throws or GIS never loaded: still signed out locally.
- Both sheets 403: one combined message naming both; Sign out shown.
- One sheet 403, the other 5xx: both messages; Sign out shown.
- One sheet 401: no panel; back to sign-in.

## Implementation Phases
- Phase 1: scopes, `revoke` type, `UserProfileReader` + `firstNameFrom` — verified by: unit tests (HttpTestingController).
- Phase 2: `Auth.signOut`, `firstName`/`userLabel`, profile fetch — verified by: unit tests with the fake GIS.
- Phase 3: `combineLoadErrors`, `noAccess`, `allSettled` in the store — verified by: unit tests.
- Phase 4: topbar and error-panel buttons — verified by: component tests; owner check on localhost:4200.

## Test Plan
Rule-level:
- The requested scopes equal the approved list (`spreadsheets`, `userinfo.profile`).
- No partial data when any sheet fails (unchanged rule, re-asserted with `allSettled`).
- Sign-out always ends signed out, even if revoke fails.
- The first name never reaches browser storage (existing storage rule tests cover `core/auth`).
Case tests: the edge cases above.

## Acceptance Checks
- [x] All behavior rules hold (unit and rule tests, 2026-10-28; the real GIS request asked exactly `spreadsheets` + `userinfo.profile`)
- [x] Owner sees the consent screen with the profile line, then their first name in the topbar (owner confirmed 2026-10-28)
- [x] Sign out returns to sign-in; signing in again shows Google's consent screen (owner confirmed 2026-10-28)
- [x] Edge cases have tests
- [x] No new libraries
- [x] docs/DECISIONS.md: D1 resolved (profile scope, consent change, revoke on sign-out); docs/AI_CONTRACT.md scope rule updated; docs/projectmap.md Auth updated
- [ ] Owner adds `userinfo.profile` to the OAuth consent screen's scopes in Google Cloud (recommended; OWNER ACTION, pending)

## Built differently from plan (2026-10-28)
- `SheetsStore` maps both sheets before setting either (caught during the build: the first draft could have shown master rows when the Dr Trust mapping then failed).
- With mixed failures, each sheet's own message is shown as the reader produced it; only an all-access failure is merged into one message.
