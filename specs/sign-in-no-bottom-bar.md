# Feature: No bottom bar on the sign-in screen (US-45, S1-b)
# Sprint 5. Classification: Local (shell and route wiring; no data impact). Depends on US-41.

## Problem
The sign-in screen showed the bottom bar (TEST/LIVE and sheet labels), which distracts from the one thing to do there. CR-03 (S1-b) overrides CR-02 D3 for this screen only.

## Non-Goals
- No change to the bar itself (US-41) or the sign-in card (US-44).

## Behavior Rules
- The sign-in route carries `data: { bottomBar: false }` (`app.routes.ts`); every other route shows the bar by default.
- `App.showBottomBar` is a `toSignal` over the router's `NavigationEnd` events reading the active (deepest) route's flag; it starts `false`, so the bar appears only once a navigation has landed on a route without the flag.
- The bar follows the ROUTE, not the session: after sign-in the bar appears only when home is on screen (no flash on the card while home loads). An expired session does not navigate, so the bar stays during the "Session expired" dialog.
- The top bar is unchanged; the page area fills the window when the bar is hidden (`main` takes the spare height).

## Measured after (browser pane)
Sign-in screen, no bottom bar, page area to the window's bottom, no sideways scroll:
| Width | Bottom bar | Page area ends at | Window height |
|---|---|---|---|
| 320 | none | 700 | 700 |
| 360 | none | 700 | 700 |
| 768 | none | 900 | 900 |
| 1024 | none | 900 | 900 |
| 1440 | none | 900 | 900 |
| 1920 | none | 1000 | 1000 |

Sign-in → home, recorded in the page (every change of bar / card / home):
1. `/sign-in`: card shown, no bar.
2. `/`: home shown, card gone, no bar yet.
3. `/` (5 ms later): bar shown (68.8px).
The bar was never on screen together with the sign-in card.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run.
- Stale: `app.spec.ts` renders the shell with `provideRouter([])` and no navigation, so its footer tests will now find no footer; they need a navigation (or a route without the flag) when tests resume.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 459.5 kB.

## Acceptance Checks
- [x] Bottom bar hidden on the sign-in route only; shown on home (loading, error and editor states)
- [x] No flash of the bar when the route changes after sign-in
- [x] Top bar stays
- [x] Sign-in page fills the window, no stray gap (six widths)
- [ ] Owner: sign out and in at phone width; the bar appears only with the editor
- Tests not run (owner decision 2026-10-29).
