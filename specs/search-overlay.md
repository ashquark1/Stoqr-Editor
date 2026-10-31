# Feature: Search overlay over an open product; Data health pick (US-59, US-61)
# Sprint 7. CORE. UI of the overlay is US-73.

## Behavior Rules
- State in `ProductSearchStore`: `overlayOpen`, the remembered box text (set when a product opens), `listShown` (home list, or the overlay), `selectionKey` (changes only when another product opens or it closes).
- The steps that may drop work are in `ProductNavigation` (`core/navigation/`): `open`, `pickFromHealth`, `setTyped`/`submit`/`clearBox`, `closeProduct`, `refresh`, `openDetails`/`closeDetails`. One page-level "Discard changes?" (moved from the details form).
- Unsaved changes (Phase 1 answer, used by every step): details edits, a typed adjuster amount, or a chosen Add/Subtract.
- A search that runs while a product is open shows the results as an overlay; the product stays underneath, unsaved work included. No question is asked while the overlay is open.
- Choosing a result opens THAT product (asks first when there is unsaved work); the box keeps the text that found it. Choosing the open product again just closes the overlay.
- Clear (×) or emptying the box: overlay showing → overlay goes, product shows, box gets the remembered text back. No overlay → product closes and the start state shows (empty box, no results); with unsaved work it asks first, and "Keep editing" puts the text back. No Escape shortcut.
- Data health pick (US-61): asks first when needed; then filters reset to defaults (every pick), the panel closes, the product's SKU goes in the box and is searched at once, and the product opens. A repeated SKU shows "2 results" or more. Nothing while a save runs.
- The box's typing reaches the store through the input event (not a signal of the box's value), so an emptied box always reaches these rules even after the store set its text.

## Checked (browser, signed in)
- "dr trust" → open Ortho Neck Corrector (box "dr trust"); type "ortho knee" → overlay over it; clear → overlay gone, box "dr trust".
- Overlay → choose Orthopaedic Knee Support (clean) → opens it, box "ortho knee".
- Amount 5 typed; search "cushion"; choose a result → "Discard changes?"; Keep editing → same product, amount 5 kept, overlay still up.
- Clear with overlay (dirty) → no question, overlay gone, box "ortho knee". Clear again (no overlay) → question; Keep → box "ortho knee"; Discard → product closed, box and query empty, amount cleared.
- Real keyboard: select-all + Backspace with a product open (clean) → product closed, start state. Typing "ortho" → 51 results after the pause.
- Data health: Brand filter set, search "bandage", pick "Ortho Neck & Travel Pillow 3209" → box and query "DTONTP3209", filters 0, panel closed, "1 result", product open.
- Rule tests: not written/run (owner decision 2026-10-29). Typechecks and build pass.
