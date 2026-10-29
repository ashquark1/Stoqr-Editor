# Feature: Data-health summary (US-31)
# Sprint 4 (stretch). Classification: Core (config shape; shared signal state). Display only.

## Problem
The owner cannot see where the master and Dr Trust sheets disagree: repeated SKUs, rows that never pair, Dr Trust products missing from the Dr Trust sheet, and quantity differences.

## Non-Goals
- No fixing from this view: it never blocks or writes anything.
- Loader-flagged rows (missing/duplicate `id`, invalid qty) are not listed; they already show as not editable.

## Behavior Rules
- A "Data health (N)" button above the picker opens a lazy panel (`@defer`); N = rows across the four lists.
- Lists, all from the pairing (pure `dataHealth` in `core/sheets/data-health.ts`, exposed by `DataHealthStore`):
  1. Repeated SKUs: each SKU with every row carrying it and its sheet (all blocked).
  2. Unmatched Dr Trust rows (no Master match, blank SKU included).
  3. Missing from Dr Trust: master-only products whose brand equals the configured Dr Trust brand (trimmed, case-insensitive, inner spaces collapsed). Without the config value, the list shows "Set the Dr Trust brand in config to see this list."
  4. Quantities differ: linked products whose quantities differ (`linkedQtyDiffers`, the sync badge's rule), with both quantities.
- Master rows are buttons: picking one selects it in the editor (through "Discard changes?" when a details edit is unsaved) and closes the panel; disabled while a save runs. Dr Trust rows are text.
- Config: optional `brand` on `SheetDefinition`; a present-but-blank brand fails the startup check. The owner adds `brand: 'Dr Trust'` to the `dr-trust` entry of both environment files.
- The panel follows every load and confirmed save (computed from the pairing).

## Edge Cases
- No brand configured: list 3 shows the config hint; the count excludes it.
- A half-done SKU change that was abandoned shows the product under "Missing from Dr Trust" (if its brand matches) and the old Dr Trust row under "Unmatched".

## Implementation Phases
- Phase 1: optional `brand` in config + validation.
- Phase 2: `dataHealth` (pure) + `DataHealthStore`.
- Phase 3: data-health panel and page button.

## Test Plan
- Unit tests suspended by the owner (2026-10-29); not written or run. Both typechecks and the production build pass.

## Acceptance Checks
- [x] Typechecks clean; build: initial 455 kB, data-health chunk 8 kB
- [x] Tests not run (owner decision 2026-10-29)
- [x] No new libraries introduced
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md, docs/projectmap.md updated
- [x] Owner: `brand: 'Dr Trust'` added to both environment files
- [x] Owner: counts match the TEST sheets
- [x] Owner: picking a product opens it in the editor
- [x] Owner: checked at phone width
