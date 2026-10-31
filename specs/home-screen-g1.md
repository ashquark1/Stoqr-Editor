# Check: Home screen G1 pass (US-84, S3-h)
# Sprint 6. TEST. Depends on US-50, 51, 55, 69, 70.

## Setup
Signed in on TEST; search "dr trust" (108 results); the first result given (in page memory only, nothing written) a 120-character product name and a 38-character SKU; filter panel open. Measured with the page's own layout boxes.

## Results (px)
| Width | Cards L–R | Filter panel L–R | Toolbar | Bottom bar | Horizontal scroll |
|---|---|---|---|---|---|
| 320 | 24–296 | 24–296 (bottom 624, bar at 631) | 2×2: Filters/Refresh, then count (24–84) / Last updated (147–296) | one line (69 tall), labels "Dr T…" | none |
| 360 | 24–336 | 24–336 | 2×2 | one line | none |
| 768 | 40–713 | 40–713 | one line | one line | none |
| 1024 | 64–945 (after fix; was 64–492) | 64–945 | one line | one line | none |
| 1440 | 64–1361 (after fix; was 64–700) | 64–1361 | one line | one line | none |
| 1920 | 296–1608 (after fix) | 296–1608 | one line | one line | none |

- Long name wraps inside the card (no overflow); the long SKU stays inside the card.
- With a product open the content shifts 8px at 1920 only because the page scrollbar goes away (shorter page); not a layout fault.

## Finding fixed
- From 1024px the page kept the old two-column grid (picker | summary). The list hides while a product is open, so the cards used only the left half (not lining up with the toolbar and filter panel) and an open product sat in the right half. Now one full-width column at every size (`stock-editor.scss`), which US-72 also requires.

## Not covered
- Real-device checks and light mode screenshots (the pane renders dark); owner check list.
