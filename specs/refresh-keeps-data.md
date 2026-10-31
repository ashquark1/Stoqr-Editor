# Feature: Refresh keeps old data on failure (US-58)
# Sprint 6. CORE (Data Source). UI (toolbar button, toast) is US-69.

## Behavior Rules
- `SheetsStore.refresh()` reads both sheets (same read + mapping as Retry); `refreshing` is true while it runs and the old data stays available.
- Success: data and `fetchedAt` replaced → `'refreshed'`.
- Failure (either sheet, or a column error): data and `fetchedAt` kept, `refreshError` set (same message rules as a load), `error` untouched → `'failed'`. `clearRefreshError()` hides it.
- A call while a load or refresh runs, or before the first load → `'skipped'`, nothing read.
- A new session (sign-out / other account) discards a running refresh and clears both signals.
- First load and Retry stay all-or-nothing.

## Checked (browser, signed in; store in page memory)
- Refresh: `refreshing` true during, 122 rows kept, `fetchedAt` moved on → `refreshed`; a second call meanwhile → `skipped`.
- Reader forced to fail: `failed`, 122 rows kept, `refreshError` set, `error` null, `refreshing` false.
- Rule tests: not written/run (owner decision 2026-10-29). Typechecks and build pass.
