import { EnvironmentProviders, effect, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from './auth';
import { SIGN_IN_PATH } from './auth-guards';

/**
 * Startup wiring for sign-in (US-05), kept in one place instead of in components:
 * - starts loading Google sign-in in the background (not awaited, so the app
 *   still renders offline and the sign-in screen can offer Retry);
 * - follows `Auth.status`: signed out on a protected page (including after
 *   `markExpired()`) goes to the sign-in screen; signed in on the sign-in
 *   screen goes home. The route guards cover URLs typed directly.
 */
export function provideAuthRedirects(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const auth = inject(Auth);
    const router = inject(Router);

    void auth.prepare();

    effect(() => {
      const status = auth.status();
      const onSignIn = router.url.startsWith(SIGN_IN_PATH);
      if (status === 'signed-out' && !onSignIn) {
        void router.navigateByUrl(SIGN_IN_PATH);
      } else if (status === 'signed-in' && onSignIn) {
        void router.navigateByUrl('/');
      }
    });
  });
}
