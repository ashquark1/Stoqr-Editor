# Feature: Search state — typed vs submitted text (US-56, S3-b)
# Sprint 6. CORE (`ProductSearchStore`). Extended later by US-59 (overlay) and US-61 (Data health pick).

## Behavior Rules
- `ProductSearchStore` holds `typed` (the box) and `query` (the search that ran; only it filters).
- `setTyped(text)`: trimmed empty → results cleared at once; trimmed 3+ characters → `query` set after a 300 ms pause (`AUTO_SEARCH_MIN_CHARS`, `AUTO_SEARCH_DELAY_MS`), typing again restarts the pause; 1–2 characters → nothing until Enter/Search.
- `setQuery(text)`: runs at once, any length, and sets the box (Enter, the Search button, later a Data health pick). The search row passes the box's own value, so a fast Enter never misses the last keystroke.
- `clear()`: empties box and results (the ×). A new session clears both and cancels a pending search.
- Search filters the products already in memory; nothing is fetched. The size/colour/packing-only message is unchanged. Same rules with a product open (overlay rules are US-59).
- The search row forwards typing to `setTyped`; the × shows while the box has text.

## Checked (browser, signed in; store values read in the page)
- "kn" + 500 ms → no search; Enter → runs "kn". "kn" + Search button → runs.
- "kne" → nothing at 250 ms, runs at 350 ms.
- "knee", then "knee s" 200 ms later → nothing at 200 ms after the retype, runs "knee s" at 350 ms (pause restarted).
- "k" + immediate Enter → runs "k" (48 matches).
- Blank text → results cleared at once. × → box and results empty.
- Rule tests (fake timers) from the story: not written/run (owner decision 2026-10-29); the cases above cover them.
- Typechecks and build pass; initial bundle 477.8 kB.
