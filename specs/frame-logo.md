# Feature: Logo reads "stoqr Editor", one logo only (US-40, UI-2)
# Sprint 5. Classification: Local (shared UI component and markup; no data impact). Depends on US-39.

## Problem
The bar's logo read "stoqr" like V1's, so the two apps looked the same. The sign-in screen showed two logos (bar and card). Screen readers heard the logo twice ("Stoqr" from the mark, then "stoqr" from the text).

## Non-Goals
- No change to the hero lockup (mark above wordmark, INVENTORY); it stays in the shared kit but no Editor screen uses it now.
- The rest of the sign-in card (title, hint, Remember me) is US-44.

## Behavior Rules
- `<stoqr-logo>` has an optional `appName` input (default empty). In the inline lockup it shows after the wordmark: DM Sans 500, 14px (`--text-body`), `--color-pine` (Sage in dark mode), on the wordmark's text baseline, 4px gap; the lockup never shrinks or wraps. The hero lockup never shows it.
- The lockup is one image to assistive tech: `role="img"`, `aria-label` "Stoqr" + app name ("Stoqr Editor" in the bar; "Stoqr" otherwise). The SVG mark is `aria-hidden`.
- The bar uses `<stoqr-logo [inline]="true" appName="Editor" />`. The sign-in card's logo is removed (owner choice: now, not in US-44), so every screen shows exactly one logo.
- The browser tab title stays "Stoqr Editor" (`index.html`, unchanged).
- Change (owner, 2026-10-30, after US-40): "Editor" sits UNDER the wordmark, not beside it — `stoqr` on top, "Editor" below, both left-aligned beside the mark (2px apart), "Editor" at `--text-small` (12px), DM Sans 500, Pine. Supersedes "on the wordmark's text baseline, 14px" above. The logo is now 56px wide (was 99px); the bar stays 68.8px.
- Change (owner, 2026-10-30, in US-44): the hero lockup shows `appName` as its sub-label in place of INVENTORY ("EDITOR"), and its accessible name is "Stoqr Editor"; the inline lockup no longer renders the hidden sub-label. The sign-in card shows the hero lockup again, so the sign-in screen has TWO logos (bar + card); every other screen has one.

## Measured after (browser pane, dark mode)
| Width | Logos visible | Logo (left–right) | Accessible name | Sideways scroll |
|---|---|---|---|---|
| 320 | 1 | 24–123 | Stoqr Editor | no |
| 360 | 1 | 24–123 | Stoqr Editor | no |
| 768 | 1 | 40–139 | Stoqr Editor | no |
| 1024 | 1 | 64–163 | Stoqr Editor | no |
| 1440 | 1 | 64–163 | Stoqr Editor | no |
| 1920 | 1 | 304–403 | Stoqr Editor | no |
Signed out (sign-in) and signed in (editor) give the same logo numbers; the bar stays 68.8px.

Signed in, logo + name + Sign out on one line:
- 320: name shortens to "Ashuto…" (61px), Sign out 212–296; nothing wraps. US-43 (icon-only Sign out on phones) gives the name more room.
- 360: full name "Ashutosh", Sign out 252–336. With a long test name ("Bartholomew-Alexander", set in the page only) the name shortens and Sign out stays in place.
- 1440: name and Sign out at the right edge (Sign out ends at 1376).

## Test Plan
- Unit tests suspended by the owner (2026-10-29); `logo.spec.ts` updated (accessible name, app name inline only, none in the hero) but not run.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 456.3 kB.

## Acceptance Checks
- [x] Bar logo reads `stoqr` + "Editor" (title case, DM Sans medium, Pine); "Editor" stacked under the wordmark per owner (was one line)
- [x] Accessible name "Stoqr Editor"; tab title "Stoqr Editor"
- [x] Exactly one logo on every screen at 360 and 1440 (sign-in and editor)
- [x] Logo + Sign out fit at 320 and 360 with no wrap or overflow
- [x] `logo.spec.ts` updated (not run)
- [ ] Brand doc §1 lockup change — proposal until "Apply all"
- [ ] Owner: look at the bar at 320 and 1440 in light and dark mode
- Tests not run (owner decision 2026-10-29).
