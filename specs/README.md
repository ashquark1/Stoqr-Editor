# Specs — Stoqr Editor (V2)
# One spec file per core feature. Written BEFORE implementation starts.
# Filename: specs/[feature-name].md

## When to write a spec
Any task classified as "Core" needs a spec before coding: anything touching the
`Product`/stock models, the Google Sheets read/write services, Google sign-in,
quantity rules, search/filter logic, or shared signal state. Local changes (UI
tweaks, copy edits, SCSS) do not.

## Spec template

```markdown
# Feature: [NAME]

## Problem
[One paragraph: what breaks or is missing without this feature]

## Non-Goals
- [What is explicitly out of scope for this iteration — e.g. "no adding or deleting rows"]

## Behavior Rules
- [Rule 1: domain invariant that must always hold — e.g. "quantity is a whole number >= 0"]
- [Rule 2: forbidden shortcut — e.g. "no write without the approval step"]
- [Rule 3: edge case handling]

## Edge Cases
- [Case]: [Expected behavior — e.g. "quantity changed by someone else before Approve: abort and show the fresh value"]

## Implementation Phases
- Phase 1: [model / mapping changes in src/app/core] — verified by: [unit test]
- Phase 2: [service / write or quantity logic] — verified by: [unit test]
- Phase 3: [UI wiring in feature component] — verified by: [visual check / component test]

## Test Plan
- [Rule-level test 1: "no code path writes without an approval step"]
- [Rule-level test 2: "no write payload contains id, Created At, or a formula"]

## Acceptance Checks
- [ ] All behavior rules hold
- [ ] Edge cases have tests
- [ ] Verified against the duplicate sheet, not production
- [ ] No new libraries introduced
- [ ] docs/DECISIONS.md updated if a trade-off was made
- [ ] docs/AI_CONTRACT.md updated if a new forbidden pattern was discovered
```

## How to use a spec with Claude Code

Start every implementation session with:
```
Read @specs/[feature].md. This is the constraint file for this task.
Do not deviate from the behavior rules. If implementation requires
breaking a rule, stop and tell me rather than working around it.
Also read @docs/AI_CONTRACT.md and @docs/projectmap.md.
```

## Keeping specs alive (spec-anchored approach)
- Update the spec when implementation reveals a new edge case
- Update the spec when a phase takes a different shape than planned
- Do NOT abandon the spec once coding starts — that's spec-once, not spec-driven
