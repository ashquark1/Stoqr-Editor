# Feature: Product picker — search, summary and states (US-12, US-13, US-14)
# Sprint 2. Classification: Core (search logic, shared signal state, the editability rule).

## Problem
After sign-in the app shows a temporary load-check table. Staff need to find one product quickly by typing, confirm it is the right one, and see clearly when nothing matches or the data is still loading. Every later step (adjust stock, edit details) starts from the selected product.

## Non-Goals
- No sync-status badge (US-37), quantity adjuster (US-15), or editing (Sprint 4).
- No V1 filters, sorting or pagination.
- No data-health counts (US-31); the load-check count lines are removed.
- No Dr Trust rows in the picker (the picker is driven by master; DECISIONS 2026-10-27).

## Behavior Rules
- Search rules are V1's, copied unchanged into `core/search/` (`search-fields.ts`, `product-matcher.ts`, `search-validation.ts`): case-insensitive, every typed word must match; core fields name, brand, SKU, category; size/colour/packing only count when a core field also matches; a secondary-only query shows "Please include a product name or brand in your search." and no results.
- The picker lists MASTER products only, of every status (owner choice: Active, Inactive, Discontinued, other), in sheet order.
- All search and selection state lives in `core/search/product-search-store.ts`: the query, the selected master `RowRef`, matches, the first 20 shown plus the total, the selected product, its linked Dr Trust row, whether the Dr Trust qty differs, and its editability. Components only read signals and call `setQuery`, `select`, `clearSelection`.
- Editability is ONE pure function, `editability(loaded, syncStatus)` in `core/sheets/editability.ts`: editable only with no row issues AND not blocked; reasons reuse the issue labels plus a blocked-SKU reason.
- The query input is a Reactive Forms `FormControl`; its value reaches the store via `toSignal` + `effect` (no `.subscribe()` in components).
- States: loading → overlay; load error → panel with Retry (+ Sign out when access is refused); empty master → "No products in the master sheet."; empty query → hint, no results; no match → "No products match '<query>'."; more than 20 matches → "Showing 20 of N — keep typing to narrow".
- Summary (US-13): name, brand, SKU, qty, stock-status badge; "Dr Trust sheet has X" when a linked product's quantities differ; not-editable reasons when any; Change product clears the selection (the query is kept).
- Sign-out clears the query and selection. A reload that no longer contains the selected row clears the selection.
- The temporary load-check view (US-08) is removed.

## Edge Cases
- Query with extra spaces or mixed case: same results.
- Query matching only a Dr Trust orphan: no results.
- Inactive or Discontinued product: listed, with its status pill.
- Blocked SKU or a row with an issue: selectable; the summary shows why it cannot be edited.
- Linked product whose Dr Trust qty differs: the summary shows the Dr Trust qty.
- Selected row gone after Retry/reload: selection cleared.

## Implementation Phases
- Phase 1: copy V1 search files + specs — verified by: V1's specs pass in V2.
- Phase 2: `editability`, `ProductSearchStore` — verified by: unit tests.
- Phase 3: page, picker, summary; remove load-check — verified by: component tests; owner check at 360px.

## Test Plan
Rule-level:
- Matching and validation are imported only by `core/search/` (architecture rule).
- The picker never lists a Dr Trust row; every status is listed.
- Editability: a blocked or flagged row is never editable.
Case tests: the edge cases above, the cap, and each state.

## Acceptance Checks
- [x] All behavior rules hold (unit, component and architecture rule tests, 2026-10-28)
- [x] Edge cases have tests
- [ ] Owner searches by name, SKU, brand; selects a product; checks the summary at phone width (OWNER CHECK, pending)
- [x] No new libraries
- [x] docs/DECISIONS.md, docs/projectmap.md and docs/AI_CONTRACT.md updated

## Built differently from plan (2026-10-28)
- Each load creates fresh row refs, so ANY Retry/reload clears the selection, not only when the selected row is gone (cautious: never points at stale data).
- The search-import architecture rule exempts spec files, which may import message constants to assert on them.
- The page chunk grew from about 15 kB to 44 kB, mostly Angular's forms module (Reactive Forms for the search box).
