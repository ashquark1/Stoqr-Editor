# Feature: Close X and footer bar for the form and the review (US-92, C5-b)
# Sprint 10. Classification: UI (+ the shared close path in `ProductNavigation`). Depends on US-77–79.

## Behavior Rules
- **X:** while the details form (edit, read-only or its review) is open, an X replaces the pencil/eye at the top right of the card header: 44px tap target, round hover, focus ring, `aria-label` "Close edit details" (read-only: "Close details"), tooltip. It calls `ProductNavigation.closeDetails()` — the same path as Cancel and Close: asks "Discard changes?" when there are edits, ends an open details review (a half save's Close included), closes the form; focus returns to the pencil/eye. Off while a save runs. Tab order: the X comes first (it is first on screen; owner, 2026-11-01).
- **Footer:** new shared `<stoqr-form-footer>` (`shared/ui/form-footer/`): status line left (polite live region), secondary then primary right, 44px; the primary is at least 150px from 768px. Full card width (the card sets `--form-footer-bleed`), thin line above, quiet paper fill, rounded bottom corners. Under 768px: status, primary full width, secondary full width; it sits at the end of the form (not sticky).
- **Edit form:** status "N field(s) changed" when valid edits exist, "Fix the highlighted fields to continue." when something is invalid; Cancel and Review changes (off until changed and valid).
- **Review:** Back and Save changes; while saving the status reads "Saving to Master and Dr Trust…", the primary shows the busy "Saving…" and Back is off. Outcome strips unchanged (US-80).
- **Read-only (eye):** the X plus a single "Close" in the footer.
- `review-actions/` is removed (the footer replaces it). The footer is reused by the New product form and review (US-99, US-100).
- Spacing uses tokens (the CR-05 note's 10px button gap is `--space-2`, 8px).

## Owner checks (signed in, TEST)
- [ ] X and Cancel behave the same, with and without edits (Discard question); focus back on the pencil.
- [ ] X during the review and after a half save closes everything; the product shows Out of sync after a half save.
- [ ] Footer stacks under 768px; status line updates (count / fix message); widths 319/320, 767/768, 1023/1024 with every error showing — the footer never covers a field.
- [ ] Read-only: X + Close only. Keyboard: X, fields, Cancel, Review changes.
- [ ] Screenshots at 320 and 1440 for form, review and read-only.

## Test Plan
- Unit tests suspended (owner). To add when they resume: X closes with/without edits; X and Cancel identical; focus returns to the pencil; footer stacks under 768px.
- Typechecks and build pass; first load 498.9 kB (warning 550 kB).
