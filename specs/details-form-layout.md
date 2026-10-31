# Feature: Details form shell inside the card (US-77, S8-a)
# Sprint 9. Classification: UI (details-form template/SCSS, focus). Depends on US-63, US-66, US-74.

## Behavior Rules
- Opens in place of the card body (the header stays; US-74). Heading "Edit details" (small uppercase), then Product Info, Stock Info, Pricing Info, Additional Info with their order, required marks and field types (`details-fields.ts`).
- Stock Info starts with Stock Qty, an ordinary required box with the whole-number message (US-63); Stock Status a read-only badge; Last Updated and Created At read-only values.
- Grid: 1 column under 768px, 2 from 768px, 3 from 1024px; Notes full width.
- Inline errors (red outline, `aria-invalid`, message tied by `aria-describedby`), the hint "Fix the highlighted fields to continue.", the live SKU check — unchanged.
- Buttons (44px): "Review changes" (primary; off until something changed and everything is valid) and "Cancel" (always on; closes the form, "Discard changes?" first when edited). "Loading details…" while the lazy form loads.
- Focus: the first field on open; back to the pencil when the form closes (Cancel, Discard, a save).

## Owner checks (signed in, TEST sheets)
- [ ] 320 / 767 / 768 / 1023 / 1024 / 1440 / 1920: 1 / 2 / 3 columns, Notes full width, long values and every error showing, no sideways scroll.
- [ ] Keyboard: pencil → focus in Product Name; Tab follows the visual order; Cancel → focus back on the pencil.
- [ ] Screenshots at 320 and 1440.

## Test Plan
- Unit tests suspended (2026-10-29); not written or run. Typechecks and build pass (first load 496.75 kB).
