# Feature: SKU change in both sheets (US-38)
# Sprint 4. Classification: Core (write path; linked-sheet rules).

## Problem
SKU was blocked in the details form. Staff need to correct a SKU without breaking the link between the sheets or colliding with another product.

## Non-Goals
- No data-health view (US-31).
- No bulk SKU changes.

## Behavior Rules
- A new SKU is compared normalised (trimmed, case-insensitive) against every OTHER row of both sheets. The product's own Master row and linked Dr Trust row never count, so a case-only change is allowed.
- Spaces at either end are refused ("SKU can't start or end with a space."), never trimmed.
- Refused (inline under SKU, blocks Review): used by another Master row; for a linked product, used by any other Dr Trust row; used by more than one Dr Trust row. Messages name the sheet and product.
- Owner choice (2026-10-29): a master-only product may take the SKU of exactly ONE unmatched Dr Trust row; that links them. The save writes the SKU (exactly as typed) and the other changed fields to both rows in one approval, and the review says "This links it to the Dr Trust row "<name>" (qty N). Later changes save to both sheets."
- A linked product's new SKU goes to both sheets in one approval.
- Save-time re-check: whenever an approval changes SKU, the writer reads BOTH sheets fresh (even for a master-only product) and refuses if any row outside the user's original approval holds the new SKU ("SKU … is now used in <sheet> (<name>). Nothing was saved."). Nothing is written.
- Retry after a partial uses the original approval's rows (`ApprovedChange.owners`): the Master row that already took the new SKU is its own, so Retry can finish Dr Trust. The pair is held by row refs, never re-matched by SKU.

## Edge Cases
- Another person gives a row the same SKU between review and Approve: refused at save, nothing written.
- Partial (Master saved, Dr Trust not) and abandoned: the sheets hold different SKUs, so on the next load the product shows Master only and the Dr Trust row is unmatched (US-31 will list it).
- A master-only product taking the SKU of a linked product: refused (it is on a Master row).

## Implementation Phases
- Phase 1: `core/sheets/sku-check.ts` (`checkNewSku`, `freshSkuHolder`); `ApprovedChange.owners` / `newSku()` — verified by: unit tests.
- Phase 2: writer re-check on fresh data (`sku-taken`) — verified by: writer rule tests.
- Phase 3: live SKU error, link row, review note — verified by: store and component tests; owner check on TEST.

## Test Plan
- A SKU on another row in either sheet is refused live and at save; otherwise it is written to both sheets in the same action.
- Linking an unmatched Dr Trust row writes both rows; a linked product cannot take a Dr Trust row's SKU.
- A master-only SKU change still reads Dr Trust at save.
- Retry after Master took the new SKU finishes Dr Trust.

## Acceptance Checks
- [x] 583 tests pass; both typechecks clean; initial bundle 455 kB
- [x] No new libraries introduced
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md, docs/projectmap.md updated
- [x] Owner: linked product SKU change reaches both sheets; still linked
- [x] Owner: another product's SKU shows the inline message and blocks Review
- [x] Owner: master-only product takes an unmatched Dr Trust row's SKU — link note, Linked after save
- [x] Owner: case-only change allowed
- [x] Owner: checked at phone width
