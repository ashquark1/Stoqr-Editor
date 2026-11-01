# Feature: Retry a half-done linked save (US-34)
# Sprint 3, story C. Classification: Core (write path; linked-sheet rules).
> **Updated by CR-04 (2026-10-31):** Retry is offered from the half-saved result under the adjuster (US-64; a strip in US-76) instead of the review panel. The rules below still hold; no Undo after a half-done save or its Retry (US-65).


## Problem
A linked save can stop halfway: Master is written and confirmed, Dr Trust is not (no access, network, Google error). Story B reports this but offers no way to finish it, so the sheets stay different until the next change. Staff need a clear message and a safe Retry that completes Dr Trust without touching Master again.

## Non-Goals
- No automatic retry or 429 backoff (story D, US-11).
- No retry after the panel is closed (owner choice: Close leaves it out of sync; the Out of sync badge and the next quantity change cover it).
- No data-health view (US-31).

## Behavior Rules
- A partial is always "Master written, Dr Trust not" (Master is written first). A master-only product can never be partial.
- The partial result carries `remaining`: the approval for the unwritten rows, made by `ApprovedChange.remaining(writtenSheets)` from the user's original approval (same targets, same values). It is sealed like any approval and refuses an empty result. No new `approve()` call.
- Retry calls the same `SheetsWriter.write(remaining)`: it re-reads Dr Trust only, finds the row by `id` (held in memory by row ref, never re-matched by SKU), and writes the same ABSOLUTE quantity, the derived Stock Status and a fresh Last Updated, confirmed by Google's echo. Dr Trust's quantity is not checked (overwritten by design). Master is never re-read or rewritten.
- Retry works only from the partial step. While it saves, the panel shows one disabled "Saving…".
- Retry written → the normal success: confirmed values applied, toast "<name> is now <qty> (Master and Dr Trust).", amount reset, selection cleared.
- Retry failed (or anything but written) → stays partial: "Master was updated to N. Dr Trust still not updated: <reason>." Never shown as a plain failure or as success. Retry can be tried again.
- Close, choosing another product, sign-out or a reload drops the pending retry. The product keeps the Out of sync badge (Master already holds the new qty).
- Approve from the partial step does nothing, so the Master change cannot be sent twice.
- Panel, partial step: "Retry Dr Trust" (sheet label from config) and Close.

## Edge Cases
- Dr Trust access restored, then Retry: written, toast names both sheets.
- Dr Trust still unreachable: stays partial with the new reason; Retry again.
- Dr Trust row deleted meanwhile: stays partial ("no longer in Dr Trust"); nothing written.
- Dr Trust qty edited by hand meanwhile: overwritten with the approved qty (overwrite rule).
- Session expires during Retry: waits for Continue, then completes.
- Double click on Retry: one write.

## Implementation Phases
- Phase 1: `remaining()`, partial carries it — verified by: approval and writer rule tests.
- Phase 2: `retry()` in `StockReviewStore`, Retry button — verified by: store and panel tests; owner check.

## Test Plan
Rule-level:
- `remaining()` keeps only unwritten rows, stays genuine, refuses an empty result.
- Retrying a partial re-reads Dr Trust only and sends exactly one Dr Trust request, no Master request.
- Retry writes the same absolute qty even when Dr Trust's qty changed meanwhile.
- A retry is never success until confirmed; a failed retry stays partial.
Case tests: the edge cases above.

## Acceptance Checks
- [x] All behavior rules hold
- [x] Edge cases have tests
- [x] Owner: on the TEST sheets, remove your Editor access to the TEST Dr Trust sheet, subtract 1 on a linked product, Approve → partial message with Retry Dr Trust; restore access, Retry → "Stock saved" naming both sheets; both TEST sheets show the same qty (owner confirmed 2026-10-29)
- [x] No new libraries
- [x] docs/DECISIONS.md, docs/AI_CONTRACT.md and docs/projectmap.md updated
