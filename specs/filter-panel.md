# Feature: Floating filter panel (US-70, S3-d UI)
# Sprint 6. UI. Depends on US-57, US-52, US-69.

## Behavior Rules
- `app-filter-panel` (lazy, `@defer`) uses `<stoqr-floating-panel placement="below">`: under the results toolbar, full content-column width, over the results (not moving them), under both bars; its height stops 8px above the bottom bar and the body scrolls (measured on open and resize).
- Open state: `PanelStore` key `filters` (toggled by the toolbar's Filters button). Closes with ✕ ("Close filters", 36px), Escape, the Filters button, or opening a product (`ProductSearchStore.select`). A click outside does not close it. Focus moves to the heading on open and back to the Filters button on close.
- Contents in V1's order: Stock Status, Category, Sub-category, Brand (with a search box) via `<stoqr-filter-select>` (V1's wrapper, copied); 1 / 2 (768px) / 4 (1024px) per row; divider; "Show Inactive Products" and "Show Discontinued Products" via `<stoqr-toggle>` (V1's, copied, 44px at every width) with "Reset Filters" at the right end, stacked under 768px. Reset is disabled while nothing is changed.
- Filters apply at once. Empty results: "No products match your search." or, with filters changed, "No products match your search and filters."
- Escape with a dropdown open closes only the dropdown; the next Escape closes the panel.

## Checked (browser, signed in)
- 1440: panel 64→1361px (content column), 4 dropdowns per row, toggles + Reset on one line; Filters button pressed, `aria-expanded` true.
- 320×640: panel 24→296px (same edges as the cards), top 229, bottom 563.5 (bottom bar at 571), body scrolls; no horizontal scroll; toggles and Reset 44px.
- Keyboard: Enter on Filters → focus on the "Filters" heading; Escape → focus back on Filters.
- Brand = a value with no match → "Filters (1)", "No products match your search and filters.", Reset enabled; Reset → 108 results, Reset disabled. Opening a product closed the panel; toolbar stayed.
- First load 496 kB (was 480): the MultiSelect shares PrimeNG utility modules with the start-up PrimeNG setup, so those modules moved into the first load. Under the 500 kB budget.
- Rule tests: not written/run (owner decision 2026-10-29). Typechecks and build pass.
