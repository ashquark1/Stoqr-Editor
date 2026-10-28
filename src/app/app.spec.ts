import { computed, signal } from '@angular/core';
import { ComponentFixture, DeferBlockBehavior, TestBed } from '@angular/core/testing';
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
const hasSession = computed(() => ['signed-in', 'expired', 'renewing'].includes(status()));
const fakeAuth = { status, userLabel, signOut, hasSession };

/**
 * Deferred blocks are left unrendered (Manual): the session prompts are tested
 * on their own; here we only check the shell around them.
 */
async function render(mode?: AppMode): Promise<{ el: HTMLElement; fixture: ComponentFixture<App> }> {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      { provide: Auth, useValue: fakeAuth },
      ...(mode ? [{ provide: AppConfig, useValue: fakeConfig(mode) }] : []),
    ],
    deferBlockBehavior: DeferBlockBehavior.Manual,
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  return { el: fixture.nativeElement, fixture };
}

describe('App', () => {
  beforeEach(() => {
    status.set('signed-out');
    userLabel.set('Signed in');
    signOut.mockClear();
  });

  it('renders the shell: topbar logo, content area and footer', async () => {
    const { el } = await render();
    expect(el.querySelector('header.stoqr-topbar stoqr-logo')).not.toBeNull();
    expect(el.querySelector('main router-outlet')).not.toBeNull();
    expect(el.querySelector('footer')).not.toBeNull();
  });

  it('defers the session prompts (US-06) so the dialog library is not in the first load', async () => {
    const { fixture } = await render();
    expect(await fixture.getDeferBlocks()).toHaveLength(1);
  });

  describe('topbar user (US-07, D1)', () => {
    it('shows nothing about the user when signed out', async () => {
      const { el } = await render();
      expect(el.querySelector('.app-user')).toBeNull();
    });

    it('shows the first name and a Sign out button when signed in', async () => {
      status.set('signed-in');
      userLabel.set('Ashutosh');
      const { el } = await render();
      expect(el.querySelector('.app-user__name')?.textContent?.trim()).toBe('Ashutosh');

      el.querySelector<HTMLButtonElement>('.app-user button')?.click();
      expect(signOut).toHaveBeenCalledTimes(1);
    });

    it('keeps the name and Sign out while the session is expired (US-06)', async () => {
      status.set('expired');
      userLabel.set('Ashutosh');
      const { el } = await render();
      expect(el.querySelector('.app-user__name')?.textContent?.trim()).toBe('Ashutosh');
    });

    it('shows "Signed in" when the first name is unknown', async () => {
      status.set('signed-in');
      const { el } = await render();
      expect(el.querySelector('.app-user__name')?.textContent?.trim()).toBe('Signed in');
    });
  });

  it('footer shows the mode and both sheet labels with their tabs', async () => {
    const footer = (await render('test')).el.querySelector('footer');
    const text = (selector: string) =>
      [...(footer?.querySelectorAll(selector) ?? [])].map((e) => e.textContent?.trim());
    expect(text('.app-footer__mode')).toEqual(['test']);
    expect(text('.app-footer__sheet')).toEqual(['Master (Sheet1)', 'Dr Trust (Sheet1)']);
  });

  it('TEST uses the neutral pill; LIVE uses the warning pill', async () => {
    const test = (await render('test')).el.querySelector('.app-footer__mode');
    expect(test?.classList).toContain('stoqr-badge--unknown');
    expect(test?.classList).not.toContain('stoqr-badge--low-stock');

    TestBed.resetTestingModule();
    const live = (await render('live')).el.querySelector('.app-footer__mode');
    expect(live?.classList).toContain('stoqr-badge--low-stock');
    expect(live?.classList).not.toContain('stoqr-badge--unknown');
  });
});
