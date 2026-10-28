import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Auth, AuthStatus } from '@core/auth/auth';
import { SignIn } from './sign-in';

describe('SignIn', () => {
  const gisReady = signal(false);
  const status = signal<AuthStatus>('signed-out');
  const error = signal<string | null>(null);
  const auth = {
    gisReady,
    status,
    error,
    signIn: vi.fn(),
    retry: vi.fn(),
    clearError: vi.fn(),
  };
  let fixture: ComponentFixture<SignIn>;

  function button(): HTMLButtonElement {
    const el = fixture.nativeElement.querySelector('button.sign-in__button');
    if (!(el instanceof HTMLButtonElement)) {
      throw new Error('sign-in button not rendered');
    }
    return el;
  }

  beforeEach(() => {
    gisReady.set(false);
    status.set('signed-out');
    error.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [SignIn],
      providers: [{ provide: Auth, useValue: auth }],
    });
    fixture = TestBed.createComponent(SignIn);
    fixture.detectChanges();
  });

  it('disables the button while Google sign-in loads', () => {
    expect(button().disabled).toBe(true);
    expect(button().textContent?.trim()).toBe('Loading Google sign-in…');
  });

  it('enables the button once ready and signs in on click', () => {
    gisReady.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
    expect(button().textContent?.trim()).toBe('Sign in with Google');

    button().click();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
  });

  it('disables the button while signing in', () => {
    gisReady.set(true);
    status.set('signing-in');
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(button().textContent?.trim()).toBe('Signing in…');
  });

  it('shows errors in the toast; Retry and close call Auth', () => {
    expect(fixture.nativeElement.querySelector('stoqr-toast')).toBeNull();

    error.set('Sign-in was cancelled.');
    fixture.detectChanges();
    const toast: HTMLElement = fixture.nativeElement.querySelector('stoqr-toast');
    expect(toast.textContent).toContain("Couldn't sign in");
    expect(toast.textContent).toContain('Sign-in was cancelled.');

    toast.querySelector<HTMLButtonElement>('.stoqr-toast__retry')?.click();
    expect(auth.retry).toHaveBeenCalledTimes(1);
    toast.querySelector<HTMLButtonElement>('.toast-close')?.click();
    expect(auth.clearError).toHaveBeenCalledTimes(1);
  });
});
