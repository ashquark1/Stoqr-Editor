import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Auth } from './auth';

export const SIGN_IN_PATH = '/sign-in';

/** The app is unusable until signed in: signed-out users go to the sign-in screen. */
export const requireSignedIn: CanActivateFn = () =>
  inject(Auth).status() === 'signed-in' || inject(Router).parseUrl(SIGN_IN_PATH);

/** A signed-in user has nothing to do on the sign-in screen. */
export const redirectIfSignedIn: CanActivateFn = () =>
  inject(Auth).status() !== 'signed-in' || inject(Router).parseUrl('/');
