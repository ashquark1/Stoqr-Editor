# Feature: Add product button in the bottom bar (US-93, C5-c)
# Sprint 10. Classification: UI (+ a small state in `PanelStore` and one step in `ProductNavigation`). Depends on US-41, US-51.

## Behavior Rules
- A 44px secondary button with a plus icon and "Add product", LEFT of Data health in the bottom bar; from 768px icon and text, under 768px icon only (`aria-label="Add product"`) with the shared tooltip. Shown only where Data health is (`PanelStore.healthAvailable`).
- Pressed look while the New product shell is open (`.stoqr-btn--pressed`, `aria-pressed="true"`).
- One-line bar: the sheet labels shorten first; the pill and both buttons never shrink (`.icon-btn`).
- Tap: `PanelStore.requestNewProduct()`; `ProductNavigation` answers it (the shell never imports navigation, so the search/editor stores stay out of the first load). Opening asks "Discard changes?" when the open product has unsaved work, then closes the product and the floating panels and opens the shell; a second tap closes it. Off while a save runs. Opening a product (a result, a Data health pick) closes the shell.
- Shell (`features/stock-editor/new-product/`): a card under the search row, where the product card sits, titled "New product" (Lora) with the close X (44px, round hover). Empty until US-99; the full rules (search overlay, Refresh, Discard) are US-98.
- Focus: to the "New product" title on open; back to Add product on close (unless a product opened).
- The button's tooltip is loaded on idle (`@defer`, plain button as placeholder): putting it in the first load added ~49 kB (the US-41 reason).

## Owner checks (signed in, TEST)
- [ ] Bar at 320 and 360 with the longest sheet labels: pill + both icon buttons on one line; 1440 with labels.
- [ ] Add product with a typed adjuster amount → "Discard changes?"; Keep editing stays; Discard opens the shell.
- [ ] Shell open: button pressed; filters / Data health closed; X closes it and focus returns to the button.
- [ ] Open a search result while the shell is open: the product opens, the shell closes.
- [ ] Keyboard: tooltip on focus (phone width); screenshots at 320 and 1440 (closed and open).

## Test Plan
- Unit tests suspended (owner). Typechecks and build pass; first load 501.0 kB (+2.1 kB; warning 550 kB).
