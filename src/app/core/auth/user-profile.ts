import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** The part of Google's userinfo response the app uses (needs the profile scope). */
export interface UserInfo {
  readonly given_name?: string;
  readonly name?: string;
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
 * Reads the signed-in person's first name (D1). Used only by `Auth`, with the
 * token it holds; the name stays in memory. Any failure resolves to null so
 * sign-in never depends on it.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileReader {
  private readonly http = inject(HttpClient);

  async firstName(accessToken: string): Promise<string | null> {
    try {
      const info = await firstValueFrom(
        this.http.get<UserInfo>(USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return firstNameFrom(info);
    } catch {
      return null;
    }
  }
}
