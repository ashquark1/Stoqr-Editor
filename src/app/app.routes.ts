import { Routes } from '@angular/router';

import { redirectIfSignedIn, requireSignedIn } from '@core/auth/auth-guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [requireSignedIn],
    loadComponent: () =>
      import('@features/stock-editor/stock-editor').then((m) => m.StockEditor),
  },
  {
    path: 'sign-in',
    canActivate: [redirectIfSignedIn],
    loadComponent: () => import('@features/sign-in/sign-in').then((m) => m.SignIn),
  },
  { path: '**', redirectTo: '' },
];
