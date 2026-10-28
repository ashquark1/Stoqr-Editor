import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppConfig } from '@core/config/app-config';
import { AppMode, SheetDefinition } from '@core/config/app-environment';
import { App } from './app';

const SHEETS: readonly SheetDefinition[] = [
  { key: 'master', label: 'Master', spreadsheetId: 'fake-master', tab: 'Sheet1' },
  { key: 'dr-trust', label: 'Dr Trust', spreadsheetId: 'fake-dr-trust', tab: 'Sheet1' },
];

/** A stand-in AppConfig so the footer can be rendered in either mode. */
function fakeConfig(mode: AppMode): Partial<AppConfig> {
  const modeSignal = signal(mode).asReadonly();
  return {
    mode: modeSignal,
    isLive: computed(() => modeSignal() === 'live'),
    sheets: signal(SHEETS).asReadonly(),
  };
}

function render(mode?: AppMode): HTMLElement {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      ...(mode ? [{ provide: AppConfig, useValue: fakeConfig(mode) }] : []),
    ],
  });
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('App', () => {
  it('renders the shell: topbar logo, content area and footer', () => {
    const el = render();
    expect(el.querySelector('header.stoqr-topbar stoqr-logo')).not.toBeNull();
    expect(el.querySelector('main router-outlet')).not.toBeNull();
    expect(el.querySelector('footer')).not.toBeNull();
  });

  it('footer shows the mode and both sheet labels with their tabs', () => {
    const footer = render('test').querySelector('footer');
    const text = (selector: string) =>
      [...(footer?.querySelectorAll(selector) ?? [])].map((e) => e.textContent?.trim());
    expect(text('.app-footer__mode')).toEqual(['test']);
    expect(text('.app-footer__sheet')).toEqual(['Master (Sheet1)', 'Dr Trust (Sheet1)']);
  });

  it('TEST uses the neutral pill; LIVE uses the warning pill', () => {
    const test = render('test').querySelector('.app-footer__mode');
    expect(test?.classList).toContain('stoqr-badge--unknown');
    expect(test?.classList).not.toContain('stoqr-badge--low-stock');

    TestBed.resetTestingModule();
    const live = render('live').querySelector('.app-footer__mode');
    expect(live?.classList).toContain('stoqr-badge--low-stock');
    expect(live?.classList).not.toContain('stoqr-badge--unknown');
  });
});
