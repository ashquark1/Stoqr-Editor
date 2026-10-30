# Feature: Shared top bar and content bounds (US-39, UI-1)
# Sprint 5. Classification: Local (styling and markup; no data impact).

## Problem
The top bar put its gutters on the bar itself and nothing in the app had a 1440px cap, so on a wide window the bar and the page stretched edge to edge. The bar's height also changed with its contents (42px signed out, 57px signed in on desktop, 69px on phones). V1's bar is one height and its contents line up with the results below.

## Non-Goals
- No button changes (US-42), no logo change (US-40), no bottom-bar look or sticky behaviour (US-41).
- No data, auth or store change.

## Behavior Rules
- `.stoqr-bounds` in `stoqr-theme.scss` is the ONE definition of the content column: full width, max 1440px, centred, gutters 24px (<768) / 40px (≥768) / 64px (≥1024) via `from()`. Copied from V1's `content-bounds` mixin (a class, because components cannot `@use` the global theme).
- `.stoqr-topbar`: sticky, top 0, z-index 100, white, 0.5px Fog bottom border, 12px vertical padding. Its row `.stoqr-topbar__inner` uses `.stoqr-bounds`: flex, items centred, gap 16px, min-height 44px, so the bar is 12 + 44 + 12 + 0.5 = 68.5px in every state.
- `.app-content` and the footer row (`.app-footer__inner`) use `.stoqr-bounds`, so the bar, the page and the footer share the same left and right edges.
- Removed: the gutter block in `app.scss` and the unused V1 leftovers `.stoqr-page` / `.stoqr-page--initial` (a second copy of the gutters).

## Measured before (signed in)
| Width | Bar | Logo left | Sign out right | Content | Footer |
|---|---|---|---|---|---|
| 320 | 68.8 | 24 | 296 | 24–296 | 72px (two lines) |
| 1440 | 56.8 | 64 | 1376 | 64–1376 | 48px |
| 1920 | 56.8 | 64 | 1856 | 64–1856 (no cap) | 48px |
Signed out: bar 42.4px at every width.

## Measured after (browser pane, dark mode; 0.5px border draws as 0.8px)
Signed out (sign-in page):
| Width | Bar | Bar row | Logo left | Content inner | Footer row | Sideways scroll |
|---|---|---|---|---|---|---|
| 320 | 68.8 | 0–320 | 24 | 24–296 | 0–320 | no |
| 360 | 68.8 | 0–360 | 24 | 24–336 | 0–360 | no |
| 768 | 68.8 | 0–768 | 40 | 40–728 | 0–768 | no |
| 1024 | 68.8 | 0–1024 | 64 | 64–960 | 0–1024 | no |
| 1440 | 68.8 | 0–1440 | 64 | 64–1376 | 0–1440 | no |
| 1920 | 68.8 | 240–1680 | 304 | 304–1616 | 240–1680 | no |

Signed in (editor home):
| Width | Bar | Logo left | Sign out right | Content inner | Footer row | Sideways scroll |
|---|---|---|---|---|---|---|
| 320 | 68.8 | 24 | 296 | 24–296 | 0–320 | no |
| 360 | 68.8 | 24 | 336 | 24–336 | 0–360 | no |
| 768 | 68.8 | 40 | 728 | 40–728 | 0–768 | no |
| 1024 | 68.8 | 64 | 960 | 64–960 | 0–1024 | no |
| 1440 | 68.8 | 64 | 1376 | 64–1376 | 0–1440 | no |
| 1920 | 68.8 | 304 | 1616 | 304–1616 | 240–1680 | no |
The bar no longer changes height when signing in (signed out and in are both 68.8). Sign out is still 32px from desktop until US-42; the 44px row keeps the bar height.

V1 at 1920 (from V1's code, not run): `content-bounds` gives the same 240–1680 row and 304–1616 content edges.

## Keyboard pass
- Signed out: Tab reaches "Sign in with Google" with the Pine focus ring.
- Signed in: Tab order is Sign out → Data health → search; Sign out shows the focus ring (Sage in dark mode, Pine in light). The bar stays `position: sticky`.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. `app.spec.ts` is unchanged (footer text and structure kept).
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 455.4 kB.

## Acceptance Checks
- [x] Bar sticky, z-index 100, white, 0.5px Fog border, 12px padding, 16px gap, row in the content bounds
- [x] Bar height the same signed in and out, at every width (68.5px)
- [x] At 1920 the logo and Sign out line up with the page content edges
- [x] Bounds defined once in `stoqr-theme.scss`; used by the top bar, the footer row and `.app-content`; `min-width` only; tokens only
- [x] G1: no sideways scroll at 320, 360, 768, 1024, 1440, 1920
- [ ] Owner: look at the sign-in and editor screens at 320 and 1440, and side by side with V1 at 1920
- [ ] Owner: signed-out bar is now about 68.5px tall (was about 41px)
- Tests not run (owner decision 2026-10-29).
