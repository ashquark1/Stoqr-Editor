# Feature: Sticky bottom bar matching the top bar (US-41, UI-3)
# Sprint 5. Classification: Local (shell markup and styles, a shared UI directive; no data impact). Depends on US-39.

## Problem
The footer scrolled away with the page, wrapped to two lines on phones (72px at 320) and was shorter than the top bar (48px), so the frame looked uneven and the environment (TEST/LIVE) was not always visible.

## Non-Goals
- No Data health button yet (US-51); the right end is left free for it.
- The bar still shows on the sign-in screen (hidden there by US-45).

## Behavior Rules
- `.app-footer`: `position: sticky; bottom: 0; z-index: 100`, white, 0.5px Fog top border, 12px vertical padding. Row `.app-footer__inner` (in `.stoqr-bounds`): one line, items centred, 16px gap, `min-height: 44px` → 68.5px, the same as the top bar.
- The TEST/LIVE pill never shrinks or truncates.
- The sheet labels sit in ONE span (`.app-footer__sheets`) that takes the free width and shrinks first with "…". The two `.app-footer__sheet` spans and the "·" separator stay (`app.spec.ts` unchanged).
- Full text: always in the DOM for screen readers; on hover or keyboard focus a tooltip shows "Master (Sheet1) · Dr Trust (Sheet1)" only while the labels are cut short. The span is focusable (`tabindex="0"`, focus ring). The text comes from `AppConfig.sheetsLabel()`.
- Sticky (not fixed): the bar keeps its own space, so the end of the page is never hidden behind it; on a short page it sits at the bottom of the window.

## Shared tooltip (new, `shared/ui/tooltip/tooltip.ts`)
- `[stoqrTooltip]="text"` directive; wraps PrimeNG's Tooltip as a host directive, so features never import PrimeNG.
- Inputs: `stoqrTooltip` (text), `stoqrTooltipPosition` (default top), `stoqrTooltipOnEllipsis` (show only while the host's text is cut short; PrimeNG `showOnEllipsis`).
- Fixed: shows on hover AND focus; Escape hides it. Defaults are set with PrimeNG's `setOption()` (setting its input fields directly has no effect).
- Look (`_primeng-overrides.scss`): small text, inverted Ink box (Ink/white in light, Paper/Forest in dark), 6px radius, soft shadow, no arrow.
- Reused later by US-43 (icon-only Sign out), US-69 (Last updated), US-75 (+ / −).
- Bundle: the tooltip library is about 45 kB; in the shell it pushed the first load to 503 kB (over the 500 kB warning). The labels span is therefore `@defer (on idle)` with a plain-text placeholder; the first load is 458.2 kB and the tooltip is a 17.5 kB lazy chunk.

## Measured after (browser pane)
| Width | Top bar | Bottom bar | Pill | Labels span | Labels cut | Sideways scroll |
|---|---|---|---|---|---|---|
| 320 | 68.8 | 68.8 | 24–85 | 101–296 | yes | no |
| 360 | 68.8 | 68.8 | 24–85 | 101–336 | no | no |
| 768 | 68.8 | 68.8 | 40–101 | 117–728 | no | no |
| 1024 | 68.8 | 68.8 | 64–125 | 141–960 | no | no |
| 1440 | 68.8 | 68.8 | 64–125 | 141–1376 | no | no |
| 1920 | 68.8 | 68.8 | 304–365 | 381–1616 | no | no |
- LIVE (pill switched in the page) with long labels at 320: pill whole (58px), labels cut, bar 68.8px.
- Tooltip at 320: Tab from Sign in reaches the labels (focus ring) and shows the full text above; Escape hides it. At 1440 (not cut) focus shows no tooltip. Light: Ink box, white text; dark: Paper box, Forest text; 12px DM Sans.
- Signed in, 320×640, long result list (2550px page): while scrolling the top bar stays at 0 and the bottom bar at 571–640; at the end the last row ends at 531, above the bar.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. `app.spec.ts` footer selectors still match.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 458.2 kB.

## Acceptance Checks
- [x] Sticky bottom, z-index 100, white, 0.5px Fog border, 12px padding, content bounds, 16px gap, one line
- [x] Same height as the top bar at every width (TEST; LIVE checked in the page)
- [x] Pill never truncates; labels shorten with "…" first; full text on hover, focus and to screen readers
- [x] Right end free for Data health (US-51)
- [x] Content never hidden; bar at the bottom on a short page
- [x] `app.spec.ts` footer selectors unchanged (not run)
- [ ] Owner: phone at 320 — scroll a long result list; Tab to the labels and see the tooltip
- Tests not run (owner decision 2026-10-29).
