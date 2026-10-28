import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

export const SIGNED_IN_PATH = '/';
export const SIGN_IN_PATH = '/sign-in';

/**
 * The app is unusable until signed in: signed-out users go to the sign-in
 * screen. An expired or renewing session stays put, so its work is kept (US-06).
 */
export const requireSignedIn: CanActivateFn = () =>
  inject(Auth).hasSession() || inject(Router).parseUrl(SIGN_IN_PATH);

/** Someone with a session has nothing to do on the sign-in screen. */
export const redirectIfSignedIn: CanActivateFn = () =>
  !inject(Auth).hasSession() || inject(Router).parseUrl(SIGNED_IN_PATH);
