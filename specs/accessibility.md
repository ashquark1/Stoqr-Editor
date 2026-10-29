# Feature: Accessibility and small-screen checks (US-26)
# Sprint 5. Classification: Local (styling and markup; no data impact) — kept as a spec for the audit record.

## Problem
Staff use the app on phones (Chrome on Android, light or dark mode) and desktops. The audit found small text below WCAG AA contrast, buttons below the touch-target size, no explicit button focus ring, and a live region that re-read the whole summary card while typing.

## Non-Goals
- No new libraries. No layout redesign. No change to the brand's own colour tokens.

## Audit findings (before)
- Light mode: Mist text 2.95:1 (labels, headings); Ink Light text 4.37:1 (hints).
- Dark mode (the app follows the phone's setting): crimson error text 2.80:1.
- `.stoqr-btn` ~29px tall, `--sm` ~21px (below WCAG 2.2's 24px minimum); focus ring left to the browser default.
- Summary card `aria-live="polite"` re-announced the whole card on every change inside it.
- Badges: already AA (their text colours are darker than the semantic tokens). No sideways scroll at 375px.

## Behavior Rules (after)
- New tokens `--color-text-muted` (light `#56685F`, dark `#7B9E8D`) and `--color-text-error` (light `#C0392B`, dark `#F0857A`): every small text colour formerly Mist / Ink Light, and every error text colour, uses them (theme and components). Mist and Ink Light remain for borders, icons and large text.
- Buttons: min-height 44px on phones; from desktop 36px (`--sm` 32px). Pine focus ring on `:focus-visible`.
- Inputs (`.stoqr-input`, search): 16px text on phones (no iOS zoom on focus); body size from tablet.
- The summary card is labelled by its heading, not a live region; targeted messages (errors, results, toasts) announce themselves.
- `prefers-reduced-motion`: no transitions; the spinner turns slowly.

## Measured after (sign-in page, 375px)
- Light: lowest text 5.35:1; button 44px; no sideways scroll.
- Dark: lowest text 5.15:1; error text 6.04:1 on cards.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Typechecks and the production build pass.
- Measured in the browser pane (light and dark, 375px) on the sign-in page; signed-in screens are the owner's check.

## Acceptance Checks
- [x] Typechecks clean; build: initial 456 kB
- [x] Tests not run (owner decision 2026-10-29)
- [x] No new libraries introduced
- [x] Sign-in page at 375px passes in light and dark mode
- [ ] Owner: keyboard-only pass on every signed-in screen (reachable, visible focus)
- [ ] Owner: TalkBack — typing in the details form does not re-read the card; errors and results are announced
- [ ] Owner: phone width, light and dark — no sideways scroll, readable text, easy-to-tap buttons
