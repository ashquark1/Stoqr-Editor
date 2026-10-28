import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Auth, AuthStatus } from '@core/auth/auth';
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

const status = signal<AuthStatus>('signed-out');
const userLabel = signal('Signed in');
const signOut = vi.fn();
const fakeAuth = { status, userLabel, signOut };

function render(mode?: AppMode): HTMLElement {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      { provide: Auth, useValue: fakeAuth },
      ...(mode ? [{ provide: AppConfig, useValue: fakeConfig(mode) }] : []),
    ],
  });
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('App', () => {
  beforeEach(() => {
    status.set('signed-out');
    userLabel.set('Signed in');
    signOut.mockClear();
  });

  it('renders the shell: topbar logo, content area and footer', () => {
    const el = render();
    expect(el.querySelector('header.stoqr-topbar stoqr-logo')).not.toBeNull();
    expect(el.querySelector('main router-outlet')).not.toBeNull();
    expect(el.querySelector('footer')).not.toBeNull();
  });

  describe('topbar user (US-07, D1)', () => {
    it('shows nothing about the user when signed out', () => {
      const el = render();
      expect(el.querySelector('.app-user')).toBeNull();
    });

    it('shows the first name and a Sign out button when signed in', () => {
      status.set('signed-in');
      userLabel.set('Ashutosh');
      const el = render();
      expect(el.querySelector('.app-user__name')?.textContent?.trim()).toBe('Ashutosh');

      el.querySelector<HTMLButtonElement>('.app-user button')?.click();
      expect(signOut).toHaveBeenCalledTimes(1);
    });

    it('shows "Signed in" when the first name is unknown', () => {
      status.set('signed-in');
      const el = render();
      expect(el.querySelector('.app-user__name')?.textContent?.trim()).toBe('Signed in');
    });
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
