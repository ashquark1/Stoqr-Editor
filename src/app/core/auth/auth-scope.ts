/**
 * The only OAuth scope the app requests (AI_CONTRACT: Writes). No identity
 * scopes (`openid`, `email`, `profile`), so the app cannot show who signed in
 * (DECISIONS: D1). Adding a scope needs a logged decision.
 */
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
