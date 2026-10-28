import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** The part of Google's userinfo response the app uses (needs the profile scope). */
export interface UserInfo {
  /** Google's stable account id. */
  readonly sub?: string;
  readonly given_name?: string;
  readonly name?: string;
}

/** Who is signed in, as far as the app needs: memory only. */
export interface UserProfile {
  /** Stable account id, used to tell whether a renewed session is the same person (US-06). */
  readonly id: string | null;
  readonly firstName: string | null;
}

/** First name for the topbar: `given_name`, else the first word of `name`, else null. */
export function firstNameFrom(info: UserInfo): string | null {
  const given = info.given_name?.trim();
  if (given) {
    return given;
  }
  const first = info.name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * Reads the signed-in person's account id and first name (D1, US-06). Used only
 * by `Auth`, with the token it holds; nothing is stored outside memory. Any
 * failure resolves to null so sign-in never depends on it.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileReader {
  private readonly http = inject(HttpClient);

  async profile(accessToken: string): Promise<UserProfile | null> {
    try {
      const info = await firstValueFrom(
        this.http.get<UserInfo>(USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return { id: info.sub?.trim() || null, firstName: firstNameFrom(info) };
    } catch {
      return null;
    }
  }
}
