# Feature: Data health button in the bottom bar (US-51, S3-f)
# Sprint 5. Classification: Local (UI and a small view-state store; DataHealthStore and dataHealth() untouched). Depends on US-41.

## Problem
"Data health (n)" was a button above the search row, with its open state local to the page. CR-03 puts it in the bottom bar so it is always one tap away; the shell and the page now both need the open state.

## Non-Goals
- The panel still opens inline at the top of the page until US-52 floats it above the bar.
- One panel at a time and focus handling are US-71.

## Behavior Rules
- `PanelStore` (`core/layout/panel-store.ts`, `providedIn: 'root'`): one "open panel" value (`'data-health'` or none; the filter panel joins in US-71); `healthOpen`, `toggleHealth()`, `closeHealth()`; `healthAvailable` = the sheets have loaded (`fetchedAt`), not reloading, no error — an empty master counts (owner choice); `healthCount` (from `DataHealthStore.health().total`) and `healthLabel` ("Data health, no issues / 1 issue / n issues"). Closes every panel when `Auth.sessionId` changes. View state only.
- Bottom bar (`app.html`): after the sheet labels, `@if (panels.healthAvailable())`, a 44px `stoqr-btn stoqr-btn--secondary icon-btn` with a pulse icon, `aria-label` = `healthLabel`, `aria-expanded`; label "Data health (n)" from 768px. Under 768px icon-only with the count as a small amber badge (`aria-hidden`; light amber with `--color-on-warning` text), none at 0. Pressed while open: Dew fill, Pine outline. Never shrinks; the labels shorten with "…" first; the bar stays 68.5px.
- Page (`stock-editor`): the button row and the local `healthOpen` signal are removed; the inline panel shows from `panels.healthOpen()` whenever the sheets have loaded (also on the empty-master card) and its Close calls `panels.closeHealth()`.

## Measured after (browser pane, signed in)
| Width | Button | Badge | Label | Sheet labels |
|---|---|---|---|---|
| 320 | 252–296, 44×44 | "2" | hidden | 101–236 (cut with long labels) |
| 360 | 292–336, 44×44 | "2" | hidden | 101–276 |
| 768 | 569–728, 159×44 | hidden | "Data health (2)" | 117–553 |
| 1024 | 801–960 | hidden | shown | 141–785 |
| 1440 | 1217–1376 | hidden | shown | 141–1201 |
| 1920 | 1457–1616 | hidden | shown | 381–1441 |
Bottom bar 68.8px at every width; no sideways scroll; long test labels (set in the page, then restored) shorten with "…" and the button keeps its size.
- Absent on: sign-in (no bar); while loading (recorded at sign-in: loading → hidden, loaded → shown); on a load error (set in page memory, then restored).
- Open: click → `aria-expanded="true"`, pressed (Dew fill, Pine outline), panel shows; the panel's Close → closed, not pressed. Keyboard: Tab from Search → sheet labels → Data health (focus ring); Enter opens, Enter closes.
- Count 0 (set in page memory, then restored): no badge, accessible name "Data health, no issues", label "Data health (0)".

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run.
- Typechecks and the production build pass. Initial bundle 475.4 kB (+14.6 kB: the shell now reads the data-health count, which brings the pairing code into the first load); about 25 kB left before the 500 kB warning.

## Acceptance Checks
- [x] 44px secondary button at the right end of the bottom bar; icon + "Data health (n)"; icon-only under 768px with an amber count badge, none at 0
- [x] Pill and labels on the left shorten first; the button never shrinks
- [x] Only once data has loaded (empty master included); not on sign-in, loading or error
- [x] Pressed look and `aria-expanded` while open
- [x] Open state in one small shared store; the inline panel opens from the new button; `DataHealthStore` / `dataHealth()` untouched
- [ ] Owner: on a phone, tap the bottom-bar button and close the panel
- Tests not run (owner decision 2026-10-29).
