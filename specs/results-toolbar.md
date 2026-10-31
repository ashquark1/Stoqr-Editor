# Feature: Results toolbar (US-69, S3-c)
# Sprint 6. UI. Depends on US-57 (filters), US-58 (refresh), US-42, US-50.

## Behavior Rules
- `app-results-toolbar` sits under the search row once a search has run, and stays while a product is open (`ProductSearchStore.toolbarShown`).
- From 768px one line: Filters (ghost) · "N results" … "Last updated: {time ago}" · Refresh Results. Under 768px V1's 2×2 grid: Filters | Refresh (icon-only), then count | Last updated. Count and time cut with "…" rather than overflow.
- "Filters (n)" = `FilterStore.changedCount`; while the filter panel is open (`PanelStore.filtersOpen`, US-70) the button is pressed (Dew fill, Pine outline) with `aria-expanded`.
- "Last updated" uses V1's `relativeTime` pipe (copied to `shared/util/relative-time.ts`, ticks every minute) and shows the exact time (`d MMM y, h:mm a`, via `exactTime`) in the shared tooltip; it is focusable so the tooltip opens by keyboard.
- Refresh = `SheetsStore.refresh()` (US-58): spinner + "Refreshing…", `aria-busy`, disabled while it runs. Success updates the list, counts, badges and Last updated and keeps the search text and filters. Failure keeps the list and shows the toast "Couldn't refresh the products" (Retry runs the same refresh; 8 s).
- Until US-60 adds the open-product rules, Refresh is disabled while a product is open (a reload makes new row refs and would close it, dropping unsaved edits).
- The count is announced politely (`aria-live`).

## Checked (browser, signed in)
- "dr trust": "Filters · 108 results · Last updated: just now · Refresh Results"; Discontinued off → "Filters (1)", 107 results; panel open → pressed.
- 1440: one line. 320: 2×2, icon-only buttons, both text cells fit.
- Refresh with the reader made to fail after 1.5 s: disabled, `aria-busy`, "Refreshing…"; then toast "Couldn't refresh the products / The list shown is unchanged. Please try again. / Retry"; 107 results kept.
- Tab from Filters to Last updated: focus ring and tooltip "31 Oct 2026, 12:42 PM".
- First load unchanged at 480 kB (`DatePipe` was replaced by `exactTime`: it added 13 kB).
- Rule tests: not written/run (owner decision 2026-10-29). Typechecks and build pass.
