# Feature: Filters service and pure matching (US-57, S3-d)
# Sprint 6. CORE (search state). UI is US-70.

## Behavior Rules
- Copied from V1 (untouched): `core/search/product-filter.ts` (pure: `FACET_KEYS`, `facetValue`, `applyFilters`, `applyStatusVisibility`, `distinctOptions`, `STOCK_STATUS_OPTIONS`) and `core/search/filter-store.ts` (`FilterStore`, state only).
- Dropdowns: Stock Status (In/Low/Out of Stock, Unknown), Category, Sub-category, Brand — options from the master products (distinct, non-blank, A–Z). Empty selection = "All".
- Toggles "Show Inactive Products" / "Show Discontinued Products" START ON (all shown; V1 starts them off). Differs from V1 also in that a blank/other status is never hidden (the Editor shows every product).
- `changedCount` ("Filters (n)") = dropdowns with a selection + toggles switched off. `reset()` = defaults; callable from code (US-61). Reset on a new session.
- `ProductSearchStore.matches` = search, then status visibility, then facets; `totalMatches` follows; `filtersChanged` for the "…and filters" message (US-70). Changing a filter never closes an open product.

## Checked (browser, signed in; via the store in page memory)
- "dr trust": 108; defaults count 0, both toggles on. Options: 4 statuses, 28 categories, 52 sub-categories, 4 brands.
- Stock Status = In Stock → 69 (count 1); + Brand = Dr Trust → 69. Inactive off → 108 (TEST has no Inactive); both off → 107 (one Discontinued hidden), count 2, `filtersChanged` true. `reset()` → 108, count 0.
- Rule tests from the story: not written/run (owner decision 2026-10-29). Typechecks and build pass.
