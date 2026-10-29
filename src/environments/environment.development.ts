import type { AppEnvironment } from '@core/config/app-environment';

// TEST spreadsheets: used by `npm start`, `npm run watch` and `npm test`.
// Off-limits (CLAUDE.md): change only with the owner's explicit confirmation.
export const environment: AppEnvironment = {
  production: false,
  mode: 'test',
  google: {
    clientId: '908411012665-f54o4npuca4kt6r9v0evjs3n0im345ud.apps.googleusercontent.com',
  },
  sheets: [
    {
      key: 'master',
      label: 'Master',
      spreadsheetId: '1C5B0zl7maHkxW1KKZPKtnPba5PHc2tHByKz6PzyBXYk',
      tab: 'Sheet1',
    },
    {
      key: 'dr-trust',
      label: 'Dr Trust',
      brand: 'Dr Trust',
      spreadsheetId: '15zTb3qSPd9tUHA5otabFKqhiSKuWb-ciyz1s4INI_QI',
      tab: 'Sheet1',
    },
  ],
};
