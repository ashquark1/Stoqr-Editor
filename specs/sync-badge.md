# Feature: Sync-status badge per product (US-37)
# Sprint 2. Classification: Core (display rule over SKU pairing; shared signal state).

## Problem
Staff cannot tell from the picker or the summary whether a product is linked to the Dr Trust sheet, master-only, blocked, or linked but holding different stock in the two sheets. They need to know before changing anything whether a change goes to one sheet or both, or cannot be made.

## Non-Goals
- No change to pairing (`pairSheets`, `syncStatuses`) or to `editability()`.
- No data-health view or counts (US-31).
- No reconcile action for out-of-sync products (overwrite is the rule; Won't-have).

## Behavior Rules
- Four badges: Linked, Master only, Out of sync, Blocked.
- Out of sync = a LINKED product whose stock qty differs between the sheets (owner choice). Other differing fields do not count. It is display only: the product stays linked and editable.
- One pure function decides the badge: `syncBadges(pairingResult)` in `core/sheets/sync-badge.ts`, built on `syncStatuses()`. `linkedQtyDiffers(pair)` is the single definition of "quantities differ"; the summary's "Dr Trust sheet has X" note uses it too, so note and badge never disagree.
- Blank or invalid quantities load as `null` and count as a value: null vs null is in sync; null vs a number is out of sync.
- `ProductSearchStore` exposes `syncBadgeOf(ref)` and `selectedSyncBadge`; templates only bind them.
- `<stoqr-sync-badge [kind]>` (`shared/ui/sync-badge/`) reuses the outlined `.stoqr-status-badge` pill shape with component-scoped, token-only colours; the copied theme is not edited. Blocked is filled so it never looks like the outlined Discontinued pill; Out of sync uses crimson text (amber text fails contrast). The text label carries the meaning.
- Shown on every picker result row and as a "Sync" field on the summary.

## Edge Cases
- Linked, quantities equal: Linked.
- Linked, quantities differ: Out of sync, plus the Dr Trust qty note.
- Linked, both quantities blank: Linked.
- Linked, one quantity blank: Out of sync.
- SKU duplicated in either sheet: Blocked (never Linked or Out of sync).
- Master row with no SKU: Master only.

## Implementation Phases
- Phase 1: `sync-badge.ts` + store wiring — verified by: unit tests.
- Phase 2: `<stoqr-sync-badge>` + picker and summary — verified by: component tests; owner check.

## Test Plan
Rule-level:
- A blocked row is never shown as Linked or Out of sync.
- Out of sync only ever applies to a linked pair.
- Every master row gets exactly one badge.
- The summary's quantity note and the badge agree.
Case tests: the edge cases above; each badge kind renders its label.

## Acceptance Checks
- [x] All behavior rules hold (rule and component tests, 2026-10-28)
- [x] Edge cases have tests
- [x] Owner sees Linked / Master only (and Out of sync where quantities differ) on the TEST sheets (owner confirmed 2026-10-28)
- [x] No new libraries
- [x] docs/DECISIONS.md and docs/projectmap.md updated
