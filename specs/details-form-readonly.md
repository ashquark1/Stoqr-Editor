# Feature: Read-only view of the same form (US-78, S8-b)
# Sprint 9. Classification: UI. Depends on US-77, US-74.

## Behavior Rules
- The eye icon opens the SAME `app-details-form` (no copy); `DetailsStore.readOnly` decides. Every field is text ("—" when blank), no inputs, no review.
- Above the sections: a heading with an icon, "Why this product can't be edited", then the red list of reasons (`editability()`), labelled by that heading.
- One "Close" button instead of Review changes / Cancel. Focus goes to the form heading on open and back to the eye icon on Close.

## Owner checks (signed in, TEST sheets)
- [ ] A blocked product (repeated SKU): eye → reasons with heading and icon, values as text, Close only.
- [ ] Keyboard: eye → focus on the heading; Close → focus back on the eye.
- [ ] Screenshots at 320 and 1440.

## Test Plan
- Unit tests suspended (2026-10-29); not written or run. Typechecks and build pass.
