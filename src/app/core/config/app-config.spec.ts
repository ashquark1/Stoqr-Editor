import { TestBed } from '@angular/core/testing';

import { AppConfig } from './app-config';

describe('AppConfig', () => {
  let config: AppConfig;

  beforeEach(() => {
    config = TestBed.inject(AppConfig);
  });

  // Rule (US-04): the unit-test run must resolve to the TEST spreadsheets. This
  // proves the `development` fileReplacement and the pinned test buildTarget.
  it('resolves to TEST mode in the unit-test run', () => {
    expect(config.mode()).toBe('test');
    expect(config.isLive()).toBe(false);
  });

  it('exposes exactly the master and dr-trust sheets', () => {
    expect(config.sheets().map((s) => s.key)).toEqual(['master', 'dr-trust']);
    expect(config.sheet('dr-trust').key).toBe('dr-trust');
  });

  it('exposes a Client ID', () => {
    expect(config.clientId().trim()).not.toBe('');
  });
});
