import { AppEnvironment, SheetDefinition, validateEnvironment } from './app-environment';

const master: SheetDefinition = {
  key: 'master',
  label: 'Master',
  spreadsheetId: 'test-master-id',
  tab: 'Sheet1',
};
const drTrust: SheetDefinition = {
  key: 'dr-trust',
  label: 'Dr Trust',
  spreadsheetId: 'test-dr-trust-id',
  tab: 'Sheet1',
};
const valid: AppEnvironment = {
  production: false,
  mode: 'test',
  google: { clientId: 'client-id' },
  sheets: [master, drTrust],
};

describe('validateEnvironment', () => {
  it('accepts a valid test config and a valid live config', () => {
    expect(validateEnvironment(valid)).toBe(valid);
    const live: AppEnvironment = { ...valid, production: true, mode: 'live' };
    expect(validateEnvironment(live)).toBe(live);
  });

  it.each<[string, AppEnvironment, RegExp]>([
    ['a duplicate key', { ...valid, sheets: [master, { ...drTrust, key: 'master' }] }, /'master' is defined 2 times/],
    ['a missing sheet', { ...valid, sheets: [master] }, /'dr-trust' is missing/],
    ['a third sheet', { ...valid, sheets: [master, drTrust, drTrust] }, /expected 2 sheets/],
    ['a blank spreadsheet ID', { ...valid, sheets: [master, { ...drTrust, spreadsheetId: ' ' }] }, /'dr-trust' has a blank spreadsheetId/],
    ['a blank tab', { ...valid, sheets: [{ ...master, tab: '' }, drTrust] }, /'master' has a blank tab/],
    ['a blank client ID', { ...valid, google: { clientId: '' } }, /clientId is blank/],
    ['production with test mode', { ...valid, production: true }, /production is true but mode is 'test'/],
    ['live mode outside production', { ...valid, mode: 'live' }, /production is false but mode is 'live'/],
  ])('rejects %s with a clear message', (_case, env, message) => {
    expect(() => validateEnvironment(env)).toThrow(message);
  });
});
