# Feature: One floating panel at a time; focus handling (US-71, S4-c)
# Sprint 6. UI. Depends on US-52, US-70.

## Behavior Rules
- One shared state: `PanelStore` holds a single open panel (`data-health` | `filters` | none). Opening one closes the other; there are no two copies of the state.
- Focus moves to the panel's heading when it opens and back to the button that opened it when it closes (✕, Escape, or its button).
- Switching panels: the panel being replaced does not take focus back to its own button when focus is already elsewhere (on the other panel's button), so the new panel returns focus to the right button (`FloatingPanel.ngOnDestroy`).
- No keyboard trap: the panels are not modal; Tab moves on through the page.

## Checked (browser, signed in)
- Filters open → Data health button: filters closed, Data health open, focus on its "Data health" heading; Escape → focus on "Data health, 2 issues" (was "Filters" before the fix).
- Data health open → Filters button: Data health closed, filters open, focus on "Filters" heading; Escape → focus on the Filters button.
- Rule tests: not written/run (owner decision 2026-10-29). Typechecks and build pass.
