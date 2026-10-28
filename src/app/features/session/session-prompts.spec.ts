import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AUTH_MESSAGES, Auth, AuthStatus } from '@core/auth/auth';
import { Modal } from '@shared/ui/modal/modal';
import { SessionPrompts } from './session-prompts';

/** Stand-in for the PrimeNG dialog: renders its content only while open. */
@Component({
  selector: 'stoqr-modal',
  template: `@if (open()) {
    <div class="modal-stub" [attr.data-header]="header()" [attr.data-dismissable]="dismissable()">
      <ng-content />
    </div>
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ModalStub {
  readonly open = input(false);
  readonly header = input('');
  readonly dismissable = input(true);
}

describe('SessionPrompts (US-06)', () => {
  const status = signal<AuthStatus>('signed-in');
  const expiringSoon = signal(false);
  const renewalError = signal<string | null>(null);
  const auth = {
    status,
    renewalError,
    expiryWarning: computed(() => expiringSoon() && status() === 'signed-in'),
    expiredDialogOpen: computed(() => status() === 'expired' || status() === 'renewing'),
    renew: vi.fn(),
    signOut: vi.fn(),
    dismissExpiryWarning: vi.fn(),
  };
  let fixture: ComponentFixture<SessionPrompts>;
  let el: HTMLElement;

  const button = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);

  function show(): void {
    fixture.detectChanges();
  }

  beforeEach(() => {
    status.set('signed-in');
    expiringSoon.set(false);
    renewalError.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [SessionPrompts],
      providers: [{ provide: Auth, useValue: auth }],
    });
    TestBed.overrideComponent(SessionPrompts, {
      remove: { imports: [Modal] },
      add: { imports: [ModalStub] },
    });
    fixture = TestBed.createComponent(SessionPrompts);
    el = fixture.nativeElement;
    show();
  });

  it('shows nothing while the session is healthy', () => {
    expect(el.querySelector('stoqr-toast')).toBeNull();
    expect(el.querySelector('.modal-stub')).toBeNull();
  });

  it('warns 5 minutes ahead; Stay signed in renews, close dismisses', () => {
    expiringSoon.set(true);
    show();
    const toast = el.querySelector('stoqr-toast');
    expect(toast?.textContent).toContain('Your session ends in 5 minutes');
    expect(toast?.querySelector('.stoqr-toast')?.classList).toContain('stoqr-toast--warning');

    button('Stay signed in')?.click();
    expect(auth.renew).toHaveBeenCalledTimes(1);
    toast?.querySelector<HTMLButtonElement>('.toast-close')?.click();
    expect(auth.dismissExpiryWarning).toHaveBeenCalledTimes(1);
  });

  it('shows the non-dismissable "Session expired" dialog; Continue renews', () => {
    status.set('expired');
    show();
    const dialog = el.querySelector('.modal-stub');
    expect(dialog?.getAttribute('data-header')).toBe('Session expired');
    expect(dialog?.getAttribute('data-dismissable')).toBe('false');
    expect(dialog?.textContent).toContain('Your work is kept.');

    button('Continue')?.click();
    expect(auth.renew).toHaveBeenCalledTimes(1);
  });

  it('disables Continue while renewing', () => {
    status.set('renewing');
    show();
    const continuing = button('Continuing…');
    expect(continuing?.disabled).toBe(true);
  });

  it('shows a renewal error inside the dialog, and offers Sign out', () => {
    status.set('expired');
    renewalError.set(AUTH_MESSAGES.renewCancelled);
    show();
    expect(el.querySelector('.session__error')?.textContent?.trim()).toBe(AUTH_MESSAGES.renewCancelled);
    button('Sign out')?.click();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
