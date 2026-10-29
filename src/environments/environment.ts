import type { AppEnvironment } from '@core/config/app-environment';

// LIVE spreadsheets: used ONLY by the production build (`npm run build`).
// Off-limits (CLAUDE.md): change only with the owner's explicit confirmation.
export const environment: AppEnvironment = {
  production: true,
  mode: 'live',
  google: {
    clientId: '908411012665-f54o4npuca4kt6r9v0evjs3n0im345ud.apps.googleusercontent.com',
  },
  sheets: [
    {
      key: 'master',
      label: 'Master',
      spreadsheetId: '105x2kk-hCfXmHdw8P0QUOtd5hbiDhEYR43EPljTqxEY',
      tab: 'Sheet1',
    },
    {
      key: 'dr-trust',
      label: 'Dr Trust',
      brand: 'Dr Trust',
      spreadsheetId: '1yvchzyHq0lGJe4LOBW-h37IxpoCh7yJrAwKlz2ydDt0',
      tab: 'Sheet1',
    },
  ],
};
