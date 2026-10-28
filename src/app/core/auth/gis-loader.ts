import { DOCUMENT, InjectionToken, inject } from '@angular/core';

import { GisOAuth2 } from './gis-types';

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/** Loads the GIS script (once) and resolves with `google.accounts.oauth2`. */
export type GisLoader = () => Promise<GisOAuth2>;

/**
 * Injected so tests can supply a fake GIS. The default adds the script tag on
 * first call and reuses that load; after a failure the next call removes the
 * failed tag and tries again (the Retry path).
 */
export const GIS_LOADER = new InjectionToken<GisLoader>('GIS_LOADER', {
  providedIn: 'root',
  factory: () => createGisLoader(inject(DOCUMENT)),
});

export function createGisLoader(doc: Document): GisLoader {
  let pending: Promise<GisOAuth2> | null = null;
  let script: HTMLScriptElement | null = null;

  return () => {
    if (pending !== null) {
      return pending;
    }
    script?.remove();
    const tag = doc.createElement('script');
    tag.src = GIS_SCRIPT_URL;
    tag.async = true;
    script = tag;

    pending = new Promise<GisOAuth2>((resolve, reject) => {
      tag.addEventListener('load', () => {
        const oauth2 = doc.defaultView?.google?.accounts.oauth2;
        if (oauth2 === undefined) {
          reject(new Error('Google sign-in loaded without google.accounts.oauth2'));
        } else {
          resolve(oauth2);
        }
      });
      tag.addEventListener('error', () => reject(new Error('Google sign-in script failed to load')));
    });
    // A failed load is forgotten so the next call retries with a fresh tag.
    pending.catch(() => {
      pending = null;
    });

    doc.head.appendChild(tag);
    return pending;
  };
}
