# Feature: Remove the 20-item result cap (US-55, S3-g)
# Sprint 6. Classification: CORE-small (search/selection state in `ProductSearchStore`). Spec approved by the owner before code.

## Problem
The picker lists at most 20 matches with "Showing 20 of N — keep typing to narrow", so staff cannot see everything that matches (a "dr trust" search on TEST matches 108 and shows 20). V1 shows every match (CR-03 D14).

## Non-Goals
- No change to matching (V1's rules in `core/search/`, copied unchanged) or to the cards (fields, badges, plain status text).
- The toolbar and its count are US-69; the "…and filters" empty message is US-70.
- No virtual scrolling now (A-UI-14); only if the long list is slow.

## Behavior Rules
- `ProductSearchStore`: `MAX_SHOWN` and `shown` are deleted. `matches` (every match, sheet order) and `totalMatches` stay; nothing else in the store changes.
- `app-product-picker` lists `search.matches()`; the page scrolls. The "Showing 20 of N — keep typing to narrow" line is removed.
- No matches: "No products match your search." (V1's wording), replacing "No products match “<query>”.".
- The size/colour/packing-only message ("Please include a product name or brand in your search.") is unchanged.
- The number listed always equals `totalMatches` (the toolbar count in US-69).

## Edge Cases
- 0 matches → the empty message above.
- More than 20 matches → all listed (TEST: "dr trust" → 108).
- Every master product matches → all 122 listed (TEST master count, 2026-10-31).
- A product is selected → the list hides, as today.

## Implementation Phases
- Phase 1 (store): remove `MAX_SHOWN` and `shown` — verified by: typecheck; code read.
- Phase 2 (picker): list `matches()`, drop the count line, new empty text — verified by: browser (signed in) with a 108-match and a 0-match search; timing of the long list.
- Phase 3 (tests and rules): update the existing cases in `product-search-store.spec.ts` (all matches, > 20) and `product-picker.spec.ts` (no count line, new empty text); add "no `MAX_SHOWN` in `src/app`" to `architecture.spec.ts`. Written, not run (owner decision 2026-10-29).

## Rule checks (in place of running tests)
- [x] More than 20 matches are all returned and listed (code read: the picker iterates `matches()`; browser: "dr trust" → 108 listed of 108).
- [x] No cap constant remains (`MAX_SHOWN` / `.shown()` absent from `src/app` except the new rule; architecture rule "no result cap" written).

## Measured (browser pane, signed in, 2026-10-31)
- TEST master: 122 products. "dr trust" → 108 matches, 108 cards, no count line; the list rendered in about 23 ms after typing; page 10,908px tall, scrolls; the last card ("Knee Pillow 341") ends above the bottom bar. "a" → 108 of 108. No noticeable slowness, so no virtual scrolling.
- "zzqqxx" → "No products match your search.", no cards.
- Cards unchanged (name, brand · SKU, qty, stock badge, sync badge, status).
- Note: `product-picker.spec.ts` had been stale since US-50 (it typed into the search box that moved to `app-search-row`); it is rewritten for the results-only picker.

## Acceptance Checks
- [x] `MAX_SHOWN` and `shown` deleted; every match listed; page scrolls; count line removed
- [x] Empty message "No products match your search."
- [x] Cards unchanged; number listed = number of matches
- [x] Real product count noted (122 on TEST); list speed noted (~23 ms for 108)
- [x] Existing store and picker test cases updated (not run)
- [ ] docs/DECISIONS.md: "at most 20 are shown" marked superseded — proposal until "Apply all"
- Tests not run (owner decision 2026-10-29).
