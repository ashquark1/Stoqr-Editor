# Feature: Sign-in card (US-44, S1-a)
# Sprint 5. Classification: Local (UI only; stores nothing). Depends on US-39, US-40, US-42.

## Problem
The sign-in card carried a logo (removed in US-40) and a hint line, and had no place for Remember me. CR-03 asks for one clean card with exactly three things.

## Non-Goals
- Remember me does nothing yet: no record is saved or read (US-67, US-68). `Auth` is unchanged.

## Behavior Rules
- Owner change (2026-10-30): the stacked logo tops the card again — mark, `stoqr`, and "EDITOR" as the sub-label (`<stoqr-logo appName="Editor" />`; the hero lockup now shows the app name in place of INVENTORY). This means TWO logos on the sign-in screen (top bar + card), against US-40's "one logo per screen".
- Below the logo, in order: the title "Sign in to edit stock"; the primary "Sign in with Google" button (44px; owner: "just a little less than the card" — the card's full width inside its 24px side padding, e.g. 290px in a 340px card; earlier narrowed to fit its text, then widened back); the checkbox "Remember me" (ticked by default). The hint line is removed.
- Deviation (owner, 2026-10-30): the story put the checkbox ABOVE the button; the owner moved it below.
- Kept: "Loading Google sign-in…" (disabled) until Google's script is ready; "Signing in…" while the popup is open; the "Couldn't sign in" toast with Retry.
- The value is a `FormControl<boolean>` (`rememberMe`, starts `true`) in the sign-in screen, view state only; US-67 passes it to sign-in.
- The card is centred vertically in the space below the top bar (owner, 2026-10-30): `.app-content` is a flex column and the sign-in screen grows to fill it.
- The card is square (owner, 2026-10-30): `aspect-ratio: 1`, at most 340×340 (first 420; reduced so the content fills it), full content width on phones.
- The button and "Remember me" are ONE group (owner: closer together): Remember me sits about 13px under the button (the 44px checkbox row's own space above its box).
- Equal visible spacing (owner): the logo, the title and the group are spread with `justify-content: space-evenly` — the same space logo to title and title to button (so the title sits midway between the logo and the button), and below "Remember me". An extra 16px (`--space-4`) of top padding sets the logo a little lower (owner), so the space above the logo is about 16px more than the other gaps. A `-12px` (`--space-3`) bottom margin on the checkbox takes the row's own space below its box out of the layout so the bottom gap matches; the tap area stays 44px.
- The checkbox row is centred in the card, like the title (owner, 2026-10-30; first built left-aligned).
- Corners: the card is `--radius-2xl` (12px), buttons `--radius-control` (10px) — the brand keeps cards one step rounder than controls; owner asked, kept as is. Soft shadow `--shadow-modal`.

## Shared checkbox (new, `shared/ui/checkbox/`)
- `<stoqr-checkbox label="…" [formControl]="…" />`: wraps PrimeNG `p-checkbox` (binary) with a real `<label for>`, so the words toggle it. A ControlValueAccessor (value, touched, disabled).
- The whole row is a 44px tap target; 8px gap; body-size label in Ink. Colours from the preset (Pine when ticked); Pine focus ring on the box on keyboard focus.
- Lives in the lazy sign-in chunk (18.5 kB); the first load is unchanged in practice (460.0 kB).

## Measured after (browser pane)
Card, centring and visible gaps (top edge→logo / logo→title / title→button / button→Remember me / Remember me→bottom edge); logo 94px tall; button 44px tall, 25px in from each card edge:
| Window | Card (w×h) | Button width | Space above / below card | Gaps |
|---|---|---|---|---|
| 320×700 | 272×272 | 222 | 180 / 180 | 32 / 15 / 15 / 13 / 17 |
| 360×740 | 312×312 | 262 | 180 / 180 | 42 / 25 / 25 / 13 / 27 |
| 1440×900 | 340×340 | 290 | 246 / 246 | 49 / 32 / 32 / 13 / 34 |
(768 and 1920 use the same 340px card as 1440.)
Card radius 12px, button radius 10px. The checkbox row stays 44px; no sideways scroll at any width. On a window shorter than the square card plus the top bar (e.g. 360×360) the page scrolls.
Before the owner's changes: card 420×208, 88 above / 313 below at 910×678; gaps 33 / 16 / 29 / 46.
- Order in the card: logo → title → button → checkbox; no hint. Ticked on load. Both logos are read as "Stoqr Editor".
- Keyboard: Tab reaches "Sign in with Google", then the checkbox (accessible name "Remember me", focus ring on the box); Space toggles it. Clicking the label text toggles it too.
- Light mode: button and ticked box Pine (#1A7A4A), white tick; dark mode: Sage.
- Before (US-40 shots): title, hint line, button; no checkbox.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. `sign-in.spec.ts` does not check the hint or logo, so it is not made stale by this story.
- Typechecks (`tsconfig.app.json`, `tsconfig.spec.json`) and the production build pass; initial bundle 460.0 kB.

## Acceptance Checks
- [x] In order (per owner): logo, title, Google button (primary, 44px, card width less its padding), Remember me (ticked by default, shared wrapper, centred)
- [x] Hint line removed (logo removed by US-40, then put back at the top by the owner)
- [x] Loading / Signing in labels and the error toast kept
- [x] Checkbox value available to sign-in code (form control); nothing stored
- [x] Card fills the content width on phones; never overflows at 320
- [x] Label clickable; keyboard operable with a visible focus ring
- [ ] Owner: keyboard-only sign-in at phone width
- Tests not run (owner decision 2026-10-29).
