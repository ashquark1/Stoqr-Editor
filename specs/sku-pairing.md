# Feature: SKU pairing across the two sheets (US-30, Sprint 1 stretch)
# Classification: Core (linking rule that every later write depends on).

## Problem
Dr Trust products exist in both spreadsheets with different `id` values. The app must know which master products are linked to a Dr Trust row, and must never guess. Pairing is pure read-only logic, so it can be built and tested safely before any write exists.

## Non-Goals
- No writes, no retry state, no "out of sync" marking after partial failures (US-34, US-37).
- No data-health screen (US-31) and no "Dr Trust brand missing from Dr Trust sheet" check; that needs brand logic and belongs to US-31.
- No badge UI (US-37); Sprint 1 shows counts only.

## Behavior Rules
- One pure function, `pairSheets(master, drTrust)` in `core/sheets/sheet-pairing.ts`, taking `LoadedProduct[]` for each sheet. It does not mutate its input and keeps input order.
- Normalised SKU = `String(sku).trim().toLowerCase()`. Nothing else (no punctuation or inner-space rewriting).
- An empty normalised SKU never pairs and never counts as a duplicate: a master row without a SKU is Master only (with a no-SKU note); a Dr Trust row without a SKU is an orphan.
- Linked: the normalised SKU appears exactly once in master AND exactly once in Dr Trust.
- Blocked: the normalised SKU appears more than once in EITHER sheet. All rows carrying that SKU, in both sheets, are blocked and are not orphans.
- Master only: a master row whose SKU does not appear in Dr Trust, and is not duplicated.
- Orphan: a Dr Trust row whose SKU has no master match (including empty SKU).
- Result: `{ linked: { master, drTrust }[], masterOnly: LoadedProduct[], blocked: { sku: string; rows: { sheet; product }[] }[], orphans: LoadedProduct[] }`. A helper maps each master product's `RowRef` to its `SyncStatus` (`linked` | `master-only` | `blocked`).
- Pairing never uses `id`, `RowRef`, row number or product name as a key. (`RowRef`s are carried through untouched so later stories can write to the right rows.)
- Rows already flagged non-editable by the loader (missing or duplicate `id`) are still paired for display but keep their flag; `linked` does not override it.

## Edge Cases
- `"ABC-1"` vs `" abc-1 "`: linked.
- Numeric SKU `123` in one sheet vs text `"00123"` in the other: not linked (different strings); US-31 will surface it later.
- Same SKU twice in Dr Trust only: master row and both Dr Trust rows blocked.
- Same SKU twice in master only: both master rows blocked; the Dr Trust row is blocked too, not an orphan.
- Case-only duplicates (`ABC`, `abc`) in one sheet: duplicates.
- Both sheets empty: empty result, no error.

## Implementation Phases
- Phase 1: `pairSheets` and the status helper — verified by: table-driven unit tests for every edge case above.
- Phase 2: wire into the store service and show counts in the load-check view ("Linked N · Master only N · Blocked N · Unmatched Dr Trust N") — verified by: counts reconcile against the TEST sheets (owner spot-checks 3 SKUs).

## Test Plan
Rule-level:
- Result is independent of `id` values (randomise all ids; same pairing).
- Result is independent of row order within each sheet (shuffle; same sets).
- Every input row appears in exactly one output bucket.
- A duplicate SKU in either sheet never produces a linked pair.
- Input arrays are not mutated.

## Acceptance Checks
- [x] All behavior rules hold (rule tests, 2026-10-28)
- [x] Edge cases have tests
- [x] Counts on the load-check view reconcile with the TEST sheets, and the owner spot-checks 3 SKUs (owner confirmed 2026-10-28)
- [x] No new libraries
- [x] docs/DECISIONS.md updated: normaliser choice; "blocked rows are not orphans"; empty-SKU handling
- [x] docs/projectmap.md updated (`sheet-pairing.ts` landed)

## Built differently from plan (2026-10-28)
- The "no SKU" note is the `hasSku(loaded)` helper; `masterOnly` stays a plain `LoadedProduct[]` as specified.
- `pairingCounts(result)` was added (and a `pairingCounts` computed signal on `SheetsStore`) so counting happens outside the template.
- The load-check line reads "Linked N · Master only N · Blocked N SKUs (M rows) · Unmatched Dr Trust N" (owner choice: SKUs and rows).
- Blocked groups are ordered by first appearance, master rows before Dr Trust rows; `sku` is the normalised SKU.
