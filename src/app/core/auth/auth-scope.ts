/** The scope the app depends on: read and write the two spreadsheets. */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * Optional: basic profile, used only to show the first name in the topbar
 * (DECISIONS: D1, 2026-10-28). Sign-in still succeeds without it.
 */
export const PROFILE_SCOPE = 'https://www.googleapis.com/auth/userinfo.profile';

/**
 * Exactly what the app asks Google for (AI_CONTRACT: Writes). No `email` or
 * `openid`. Adding a scope needs a logged decision.
 */
export const REQUESTED_SCOPES = [SHEETS_SCOPE, PROFILE_SCOPE].join(' ');
