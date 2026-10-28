import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { Auth, AuthStatus } from './auth';
import { redirectIfSignedIn, requireSignedIn } from './auth-guards';
import { provideAuthRedirects } from './auth-redirects';

@Component({ template: 'home', changeDetection: ChangeDetectionStrategy.OnPush })
class HomeStub {}

@Component({ template: 'sign-in', changeDetection: ChangeDetectionStrategy.OnPush })
class SignInStub {}

describe('auth guards and redirects', () => {
  let status: WritableSignal<AuthStatus>;
  let prepare: ReturnType<typeof vi.fn>;
  let router: Router;

  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  beforeEach(() => {
    status = signal<AuthStatus>('signed-out');
    prepare = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: HomeStub, canActivate: [requireSignedIn] },
          { path: 'sign-in', component: SignInStub, canActivate: [redirectIfSignedIn] },
        ]),
        provideAuthRedirects(),
        { provide: Auth, useValue: { status, prepare } },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('starts loading Google sign-in at startup', () => {
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('guards: a signed-out user is sent to /sign-in', async () => {
    await router.navigateByUrl('/');
    expect(router.url).toBe('/sign-in');
  });

  it('guards: a signed-in user on /sign-in is sent home', async () => {
    status.set('signed-in');
    await router.navigateByUrl('/sign-in');
    expect(router.url).toBe('/');
  });

  it('redirects home after sign-in, and back to /sign-in when the session ends', async () => {
    await router.navigateByUrl('/sign-in');
    expect(router.url).toBe('/sign-in');

    status.set('signed-in');
    await settle();
    expect(router.url).toBe('/');

    status.set('signed-out'); // e.g. Auth.markExpired() after a 401
    await settle();
    expect(router.url).toBe('/sign-in');
  });

  it('does not navigate while a sign-in is in progress', async () => {
    await router.navigateByUrl('/sign-in');
    status.set('signing-in');
    await settle();
    expect(router.url).toBe('/sign-in');
  });
});
