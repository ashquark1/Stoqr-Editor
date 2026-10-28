# Feature: Renew the session without losing work (US-06)
# Sprint 2. Classification: Core (auth, shared signal state, read path).

## Problem
Google access tokens last about an hour. Today an expired token is treated as a sign-out: the user is sent to the sign-in screen and the loaded sheets, the search and the selection are cleared. From Sprint 3 this would also throw away a reviewed stock change or a half-filled details form.

## Non-Goals
- No silent background renewal: browsers only allow Google's popup from a user click.
- No change to what a page reload does (tokens are memory-only, so a reload still signs out).
- No writes (US-10); the writer adopts `freshToken()` when it lands.

## Behavior Rules
- Auth statuses: `signed-out`, `signing-in`, `signed-in`, `expired` (token gone, work kept), `renewing` (Continue clicked, popup open).
- A session clock, reset on every new token and cleared on sign-out: at `expiresAt − 5 min` `expiringSoon` becomes true (warning); at `expiresAt` the session expires by itself.
- Expiry (clock, `expiresAt` passed, or HTTP 401) forgets ONLY the token. Data, search, selection and the first name are kept; there is no redirect. Only Sign out (or a page reload) returns to sign-in.
- `Auth.renew()` (from a click) requests a token with `prompt: ''`. Outcomes: same account → signed in, waiting requests resume; different account → new session; popup closed → stays expired with "Renewal was cancelled. Continue to keep working."; popup blocked → stays expired with the pop-up message; refused or Sheets permission unticked → signed out with the existing denied message.
- `Auth.freshToken()` resolves at once with a valid token; otherwise it expires the session if needed and waits for renewal; it rejects on sign-out (nothing hangs). `core/sheets` gets tokens only through it.
- `Auth.sessionId` changes only on a sign-in from signed out, on sign-out, and on an account change during renewal — never on expiry or a same-account renewal. `SheetsStore` and `ProductSearchStore` reset when it changes; `SheetsStore` then reloads if it had been asked to load and the user is signed in.
- Account identity: Google's account id (`sub`) from userinfo; if absent, the first name is compared instead (weaker; logged).
- `SheetsReader`: on 401 it marks the session expired, waits for a fresh token and retries the GET once; a second 401, or sign-out while waiting, is the existing session-expired error.
- Redirects: only `signed-out` on a protected page goes to `/sign-in`. `requireSignedIn` admits `signed-in`, `expired` and `renewing`. The topbar keeps the name and Sign out while expired or renewing.
- UI (`features/session/session-prompts`, rendered once in the app shell): a warning toast "Your session ends in 5 minutes" with Stay signed in; a non-dismissable dialog "Session expired" with Continue (disabled while renewing) and Sign out, showing any renewal error.
- Wrappers are extended, not forked: `<stoqr-toast>` gains `variant` (`error` default, `warning`), `actionLabel` (default `Retry`) and `autoDismissMs = 0` meaning never; `<stoqr-modal>` is copied from V1 with a `dismissable` input (default `true`).

## Edge Cases
- Tab asleep past expiry: the clock fires late, and `freshToken()` also checks the time, so the next request still waits for renewal.
- 401 during the initial load: the load completes after Continue.
- Two requests waiting: both get the same new token.
- Sign out from the dialog: waiting requests reject; back to sign-in.
- Different account on Continue: data and search reset; both sheets reload for the new account.
- Renew clicked while not expired or warned: ignored.

## Implementation Phases
- Phase 1: GIS types, profile id, Auth states/clock/renew/freshToken/sessionId — verified by: unit tests with fake timers and the fake GIS.
- Phase 2: reader retry, store resets, redirects/guards — verified by: unit tests.
- Phase 3: toast and modal wrappers, session prompts — verified by: component tests; owner check after a natural expiry.

## Test Plan
Rule-level:
- Expiry never clears data, search state, the name or `sessionId`; only sign-out or an account change moves `sessionId`.
- A request waiting on renewal resumes with the new token; waiters are rejected on sign-out.
- A different account on renewal moves `sessionId` and resets the stores.
Case tests: the edge cases above, each renewal outcome, the clock, the wrapper inputs, the prompts.

## Acceptance Checks
- [x] All behavior rules hold (unit, component and architecture rule tests with fake timers, 2026-10-28)
- [x] Edge cases have tests
- [x] Owner sees the 5-minute warning and, after expiry, Continue keeps the selected product (owner confirmed 2026-10-28)
- [x] No new libraries
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md, docs/projectmap.md and CLAUDE.md updated

## Built differently from plan (2026-10-28)
- "Renewal in progress" is a flag, not inferred from the status: a 401 can land while a renewal started from the warning is open, and without the flag that renewal was mistaken for a new sign-in (which would have reset the session).
- The prompts are rendered inside `@defer (when auth.hasSession())`: rendering them eagerly pulled the dialog library into the first load (574 kB, over the 500 kB budget); deferred, the first load is 452 kB and the dialog is a ~126 kB lazy chunk.
- A load interrupted by an expired session while the user still has one (e.g. a second 401 after renewal) shows "Loading was interrupted by the session ending. Please retry." instead of a blank page.
- No development-only shortcut for the clock; the clock is covered by fake-timer unit tests, and the owner checks a natural expiry.
- Not yet confirmed against Google: whether userinfo returns `sub` with only the profile scope (the owner's different-account check will show it; the first-name fallback covers it meanwhile).
