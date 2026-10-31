import { EnvironmentProviders, effect, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from './auth';
import { SIGNED_IN_PATH, SIGN_IN_PATH } from './auth-guards';

/**
 * Startup wiring for sign-in (US-05), kept in one place instead of in components:
 * - starts loading Google sign-in in the background (not awaited, so the app
 *   still renders offline and the sign-in screen can offer Retry);
 * - follows `Auth.status`: signed out on a protected page goes to the sign-in
 *   screen; signed in on the sign-in screen goes home. An expired or renewing
 *   session never navigates, so its work stays on screen (US-06). The route
 *   guards cover URLs typed directly;
 * - Remember me (US-68): with a valid record and no session yet, goes to
 *   Google once for a silent sign-in (`prompt=none`) and comes back signed in,
 *   or to the normal sign-in screen with no error.
 */
export function provideAuthRedirects(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const auth = inject(Auth);
    const router = inject(Router);

    void auth.prepare();

    const silent = auth.silentSignInUrl();
    if (silent !== null) {
      window.location.assign(silent);
      return;
    }

    effect(() => {
      const status = auth.status();
      const onSignIn = router.url.startsWith(SIGN_IN_PATH);
      if (status === 'signed-out' && !onSignIn) {
        void router.navigateByUrl(SIGN_IN_PATH);
      } else if (status === 'signed-in' && onSignIn) {
        void router.navigateByUrl(SIGNED_IN_PATH);
      }
    });
  });
}
