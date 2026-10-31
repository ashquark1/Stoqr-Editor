# Feature: Remember me — record, silent return, rule change (US-67, US-68, US-82)
# Sprint 9. Classification: CORE (auth). Approved 2026-10-31; built (first load 499.1 kB). Tests not run (suspended).

## Problem
Every visit starts at the sign-in screen. Remember me should let a returning person land on the editor without a click when their Google session is still alive, without ever storing a token.

## Owner decisions (2026-10-31)
- Storage: ONE file, `core/auth/remember-me.ts`, may use browser storage — `localStorage` for the record `{ remember: true, savedAt }` only (no token, no name, no account id), and `sessionStorage` for the one-time random `state` of the silent round trip. `core/sheets` never. `dev-session.ts` stays the separate temporary exception until US-27.
- Return flow: a SILENT REDIRECT, not the popup (the GIS popup only opens from a click; DECISIONS US-06).

## Behavior Rules
- Record: a ticked sign-in saves it after success; an unticked sign-in deletes it; Sign out deletes it. Expires 30 days after the last successful sign-in (renewed on each); an expired record is ignored and deleted. Storage errors (private window, blocked) are caught; the app works without it.
- Silent return (app start, valid record, not signed in): `provideAuthRedirects()` sends the page to Google's OAuth endpoint with `response_type=token`, `prompt=none`, the same two scopes, the configured Client ID, `redirect_uri` = the app's address, and a random `state` (kept in `sessionStorage`). A short "Signing you in…" state shows meanwhile, so the sign-in screen does not flash.
- Coming back: `remember-me.ts` reads the URL fragment once, removes it from the address bar at once (`history.replaceState`), checks `state`, and hands the token to `Auth` (memory only; same expiry, profile lookup and `sessionId` as a normal sign-in). Any error (`login_required`, `consent_required`, `interaction_required`, `account_selection_required`, state mismatch) → the normal sign-in screen with Remember me still ticked and NO error toast.
- At most one silent attempt per page load (a flag in `sessionStorage`), so a failure never loops.
- Hourly renewal stays the click-based popup (US-06): a redirect would reload the page and lose unsaved work.
- Owner setup: add the app's address(es) (localhost:4200 and the hosted site) as Authorized redirect URIs on the OAuth client in Google Cloud.

## Risks
- Several Google accounts signed in in the browser → Google cannot pick one silently (no account hint by decision) → normal sign-in.
- OAuth app in Testing mode: consent may lapse after ~7 days → normal sign-in.
- The token passes through the URL fragment for a moment (standard browser OAuth); it is removed at once and never stored.

## Proposed doc changes (applied on "Apply all")
- AI_CONTRACT (Auth): "neither uses `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`" → "… except `core/auth/remember-me.ts`, which may keep only the Remember-me record (flag + time) in `localStorage` and the one-time silent-sign-in `state` in `sessionStorage` (US-67, US-68). No token, name or account id is ever stored."
- AI_CONTRACT (secrets): add "The only thing persisted across visits is the Remember-me record (flag and time). Tokens are never persisted (dev-session exception until US-27)."
- AI_CONTRACT (Auth): add "The silent return is a top-level redirect with `prompt=none`, at most once per page load; the token is read from the URL fragment, removed from the address bar at once, and kept in memory only."
- DECISIONS: new entry with the above, the rejected options (popup on start — blocked; storing the token — risky on shared computers) and the Google Cloud setup step.
- projectmap (Auth): add `remember-me.ts`.

## Owner checks (real account, TEST)
- [ ] Ticked: sign in, close the tab, reopen → editor without a click.
- [ ] Unticked: reopen → sign-in screen; record gone. Sign out → record gone.
- [ ] Two Google accounts signed in → sign-in screen, no error.
- [ ] Private window / blocked storage → normal sign-in, no error.
- [ ] Address bar never shows the token after landing.

## Test Plan
- Unit tests suspended (2026-10-29). Rule checks by reading: no token in any storage; one storage file; one attempt per load.
