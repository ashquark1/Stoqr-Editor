import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { Toast } from '@shared/ui/toast/toast';

/**
 * Sign-in screen (US-05). Reads `Auth` signals and calls its methods; no logic here.
 * No logo in the card: the top bar's logo is the only one on screen (US-40).
 */
@Component({
  selector: 'app-sign-in',
  imports: [Toast],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  protected readonly auth = inject(Auth);
}
