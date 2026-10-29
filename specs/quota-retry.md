# Feature: Friendly errors and backoff when Google is busy or unreachable (US-11)
# Sprint 3, story D. Classification: Core (read and write paths).

## Problem
The Sheets API allows about 60 requests a minute per user and answers 429 beyond that; networks drop and Google has brief 5xx outages. Today the first such error fails a load or a save with a generic message. Staff should not have to click Retry for a blip, and when the app does give up, the message must say plainly what happened — and never claim "not saved" when a save may have gone through.

## Non-Goals
- No offline mode or queued writes.
- No "retrying…" indicator (the loading overlay or "Saving…" stays up while waiting).
- No change to 401 renewal, 403/404/missing-tab handling.

## Behavior Rules
- Backoff (`core/sheets/backoff.ts`): up to 3 automatic retries, after about 1 s, 2 s and 4 s (±20% random spread). A `Retry-After` header in seconds wins, capped at 30 s. The wait is the `RETRY_WAIT` injection token (a timer by default, instant in tests).
- Transient = 429, any 5xx, or a network failure (status 0). Busy = 429.
- Reads (both sheet loads, and the re-read before every write) retry on transient errors; a fresh token is asked for on every try. 401, 403, 404 and a missing tab are never retried by backoff.
- Read messages once retries run out (kind `unavailable`):
  - 429: "Google is busy right now (too many requests). Wait a minute, then Retry."
  - 5xx / network: "Couldn't reach Google to load <sheet>. Check your connection, then Retry."
- Writes (owner choice: "429 only, re-check first"): after a 429 the writer waits, re-reads and re-checks THAT sheet only, and resends — up to 3 times. A conflict or missing row found by the re-check stops it like any check.
- Write messages:
  - 429 every time: "Google is busy right now (too many requests). Nothing was saved to <sheet>. Wait a minute and try again." (kind `unavailable`).
  - 5xx / network: NOT retried automatically, since it may have been saved. Kind `unconfirmed`: "Google didn't confirm the save to <sheet>, so it may or may not have been saved. Try again re-checks the sheet first."
- Try again and Retry Dr Trust always re-read before writing, so a save that did go through is never applied twice.
- Change product is disabled while a save runs, so a save's result is never lost.

## Edge Cases
- One 429 during the load: loads after ~1 s, no message.
- Network off during the load: four tries, then the unreachable message with Retry.
- 429 on Approve, then OK: saved; the row was re-checked before the resend.
- Someone edits Master qty during a 429 wait: the re-check finds the conflict; nothing sent.
- Network drops during Approve: one POST, the "didn't confirm" message; Try again re-checks (a save that went through shows as the new qty, never applied twice).
- Dr Trust 503 after Master: partial with the "didn't confirm" reason; Retry Dr Trust rewrites the same qty.
- Retry-After: 5 → waits 5 s; Retry-After: 120 → waits 30 s.

## Implementation Phases
- Phase 1: `backoff.ts` — verified by: unit tests.
- Phase 2: reader and writer retry, messages — verified by: `HttpTestingController` tests.
- Phase 3: Change product disabled while saving — verified by: component test; owner check.

## Test Plan
Rule-level:
- A write is retried automatically only after 429, and only after re-reading and re-checking the row.
- A 5xx or network failure on a write sends exactly one request and is never reported as "nothing saved".
- No more than 3 automatic retries per request.
Case tests: the edge cases above.

## Acceptance Checks
- [ ] All behavior rules hold
- [ ] Edge cases have tests
- [ ] Owner: with the network turned off, opening the editor shows the unreachable message; Retry works once the network is back (OWNER CHECK)
- [ ] Owner: with the network turned off just before Approve, the "didn't confirm" message appears; with the network back, Try again shows the right qty and nothing is applied twice (TEST sheets; OWNER CHECK)
- [ ] No new libraries
- [ ] docs/DECISIONS.md, docs/AI_CONTRACT.md and docs/projectmap.md updated
