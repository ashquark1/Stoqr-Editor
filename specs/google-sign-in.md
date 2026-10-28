# Feature: Google sign-in (US-05)
# Sprint 1. Classification: Core (auth).

## Problem
The app has no backend. Access is controlled by Google: a staff member signs in with Google and the app calls the Sheets API with their access token. Without sign-in nothing can load, and the sheets' own Editor sharing is the only access control.

## Non-Goals
- Silent token renewal / re-prompt without losing work (US-06, Sprint 2).
- Sign-out button and per-sheet "no access" messages (US-07 and US-32, Sprint 2).
- Showing the signed-in person's name or email (see the scope rule below).
- Any Sheets read (US-08).

## Behavior Rules
- Only `src/app/core/auth/` touches Google Identity Services. Components call the `Auth` service; templates never reference `google.accounts`.
- Token flow: `google.accounts.oauth2.initTokenClient({ client_id, scope, callback, error_callback })` and `requestAccessToken()`. Client ID from `AppConfig`.
- Scope is exactly `https://www.googleapis.com/auth/spreadsheets`, held as one constant in `core/auth`. No `email`, `profile` or `openid`. Consequence: Google returns no identity for this token, so the signed-in screen shows "Signed in", not a name or email. (Owner decision pending: adding identity scopes needs a DECISIONS.md entry; the Stock Log feature will probably want it.)
- The access token lives in memory only (a private signal). Never in `localStorage`, `sessionStorage`, cookies or IndexedDB. A page reload means signed out.
- Expose signals: `status` (`signed-out` | `signing-in` | `signed-in`), `error` (friendly message or null), `expiresAt`. Only `core/sheets/` may read the token, through a method, never through a signal that features can bind to.
- `requestAccessToken()` is called only from a user click (popup blockers).
- Ignore further clicks while `status === 'signing-in'`.
- Success: store the token and `expiresAt = now + expires_in` (minus a 60s margin). Verify the granted scope with `google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)`; if the user unticked the Sheets permission, treat it as denied.
- Failures give friendly messages and leave the user signed out: consent denied (`error` in the token response), popup closed (`popup_closed`), popup blocked (`popup_failed_to_open`), GIS script failed to load (offline or blocked).
- The GIS script (`https://accounts.google.com/gsi/client`) is loaded by a small loader inside `core/auth`, injected through an `InjectionToken` so tests can fake it. If it fails, show a message with Retry.
- Types: declare the minimal GIS types locally in `core/auth/gis-types.ts`. Do not add `@types/google.accounts` or any other library.
- The app is unusable until signed in: a functional route guard sends signed-out users to the sign-in screen.
- If `Auth.markExpired()` is called (the reader calls it on a 401), clear the token, set `status` to `signed-out` and set the message "Your session expired. Please sign in again."

## Edge Cases
- Popup blocked or closed: message, no state change, button usable again.
- User approves with the Sheets permission unticked: treated as denied.
- Double-click on the button: one request only.
- Token expires while the page stays open: next API call returns 401, `markExpired()` returns the user to sign-in.
- Opened on `127.0.0.1` instead of `localhost`: Google rejects the origin. Only `http://localhost:4200` is registered; use that.
- Staff on the OAuth test-user list see Google's "hasn't verified this app" screen. This is expected in Testing mode; tell staff beforehand.
- A signed-in Google account without Editor access to a sheet: not detectable here; it surfaces on load (US-08 names the sheet).

## Implementation Phases
- Phase 1: `gis-types.ts`, loader with `InjectionToken`, `SCOPE` constant — verified by: unit tests with a fake GIS (loader success, script failure).
- Phase 2: `Auth` service and route guard — verified by: unit tests (success, denied, popup closed, popup blocked, scope unticked, double-click, `markExpired`).
- Phase 3: sign-in screen and signed-in shell state (Stoqr styling, wrappers only) — verified by: manual sign-in with the owner's account on `http://localhost:4200`, TEST config, at 360px.

## Test Plan
Rule-level:
- No code path writes the token to any browser storage (spy on `Storage.prototype.setItem` during a full sign-in; also assert no `localStorage` / `sessionStorage` / `document.cookie` usage in `core/auth`).
- The requested scope equals the single Sheets scope constant.
- `google.accounts` appears only under `src/app/core/auth/`.
- Token is not exposed through any public signal (only the method used by `core/sheets`).
Case tests: the edge cases above.

## Acceptance Checks
- [x] All behavior rules hold (unit and architecture rule tests, 2026-10-28)
- [ ] Owner signs in successfully on localhost:4200 and sees "Signed in" (OWNER CHECK, pending)
- [x] Cancelling or blocking the popup shows a friendly message and stays signed out (unit tests; blocked popup also seen with the real GIS in the browser pane)
- [ ] Reload returns to the sign-in screen (OWNER CHECK, pending: needs a real sign-in first)
- [ ] No tokens in browser storage (checked in dev tools) (OWNER CHECK, pending; storage confirmed empty before and after a blocked sign-in)
- [x] No new libraries
- [x] docs/DECISIONS.md updated: no identity scope in Sprint 1 and its consequence (no account name shown); local GIS types
- [x] docs/projectmap.md updated if `core/auth` ownership changed

## Built differently from plan (2026-10-28)
- `Auth` also exposes `gisReady` (button disabled until GIS loads) and `retry()` (re-runs whichever step failed), so the sign-in component holds no logic.
- Redirects live in `provideAuthRedirects()` (an app initializer that also starts the GIS load); guards cover URLs typed directly.
- Errors reuse `<stoqr-toast>` (title "Couldn't sign in", 8 s auto-dismiss).
- The loader forgets a failed load and replaces the failed script tag on the next attempt.
- The sign-in screen lives in its own feature folder, `src/app/features/sign-in/` (owner choice).
