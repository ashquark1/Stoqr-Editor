import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideAuthRedirects } from '@core/auth/auth-redirects';
import { provideStoqrUi } from '@shared/ui/provide-stoqr-ui';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideStoqrUi(),
    provideAuthRedirects(),
  ],
};
