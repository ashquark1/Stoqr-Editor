# Feature: Floating Data health panel (US-52, S4-a)
# Sprint 5. Classification: Local (UI; creates the shared floating panel). Depends on US-51. The filter panel (US-70) reuses the floating piece; US-53 hides one list.

## Problem
Data health opened as a card at the top of the page, pushing everything down, and on a scrolled phone it opened out of view. CR-03 floats it above the bottom bar so nothing on the page moves.

## Non-Goals
- Contents unchanged (intro, four lists, counts, hints, "None.", the lazy-load line); a pick behaves as today until US-61.
- One panel at a time is US-71.

## Behavior Rules
- New `<stoqr-floating-panel>` (`shared/ui/floating-panel/`): inputs `heading`, `closeLabel`; output `closed`; the body is projected. Shared by Data health and later the filter panel.
  - Position: a fixed layer `bottom: calc(var(--bar-height) + var(--space-2))`, full width, with the panel in `.stoqr-bounds` (the content column); z-index 90, under both bars (100). Only the panel takes clicks.
  - Height: grows with content up to `100dvh − 2 × bar height − 2 × 8px`; beyond that the body scrolls and the header stays.
  - Header: heading + ✕ (36px tap area, `aria-label` from `closeLabel`, focus ring). Closes with the ✕, Escape (document-wide), or the feature removing it (the bottom-bar button). A click outside does not close it.
  - Focus: remembers the focused element when it opens (the bar button) and moves focus to its heading; when it goes, focus returns there.
  - `role="dialog"` named by its heading; not modal (no focus trap, no backdrop).
  - Look: card surface, `--radius-2xl`, `--shadow-modal`; 150ms fade + 8px rise on open, none under reduced motion.
- New theme token `--bar-height` = 12 + 44 + 12 + 0.5px (both bars).
- Data health: wrapped in the floating panel with heading "Data health" and close label "Close data health"; its own header and "Close" button are removed; one column under 768px, two from 768px; `app-data-health` takes no space in the page.

## Measured (browser pane, signed in; long names/SKUs and 25 rows set in page memory, then restored)
| Width × height | Panel (left–right, top–bottom) | Bars | Body scrolls | Columns |
|---|---|---|---|---|
| 320×700 | 24–296, 77–624 | top 0–69, bottom 631–700 | yes | 1 |
| 360×740 | 24–336, 77–664 | bottom 671–740 | yes | 1 |
| 768×1024 | 40–728, 77–948 | bottom 955–1024 | yes | 2 |
| 1024×768 | 64–960, 77–692 | bottom 699–768 | yes | 2 |
| 1440×900 | 64–1376, 77–824 | bottom 831–900 | yes | 2 |
| 1920×1000 | 304–1616, 77–924 | bottom 931–1000 | yes | 2 |
- 8px from each bar; edges equal the content column; no sideways scroll; long names and SKUs wrap inside the panel.
- With the real (short) data the panel sits just above the bar and is only as tall as its content.
- The page does not move (search row stays at 93px when the panel opens).
- Keyboard: Enter on the bar button opens it with focus on the heading; Tab → ✕ (focus ring); Enter on ✕ closes, focus back on the bar button. Escape closes, focus back on the bar button. The bar button toggles it. A click in the search box leaves it open.
- Picking "Ortho Neck & Travel Pillow 3209" opens the product and closes the panel (as before).
- Light and dark mode both checked.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. The data-health component spec (if any) looks for the old "Close" button.
- Typechecks and the production build pass; initial bundle 475.9 kB; the data-health chunk (with the floating panel) is 11.1 kB, lazy.

## Acceptance Checks
- [x] Opens upward just above the bottom bar; page does not move; content-column width; under both bars
- [x] Grows to the space between the bars, then the lists scroll with the header fixed
- [x] Header "Data health" + ✕ (36px, "Close data health"); old Close removed; ✕, bar button and Escape close; outside click does not
- [x] Focus into the panel on open, back to the bar button on close
- [x] Contents unchanged; 1 / 2 columns
- [x] Floating behaviour is one shared piece in `shared/ui`
- [x] Short fade and rise, reduced-motion safe; soft shadow
- [ ] Owner: open, scroll and close it on a phone
- Tests not run (owner decision 2026-10-29).
