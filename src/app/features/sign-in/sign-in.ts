import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { Logo } from '@shared/ui/logo/logo';
import { Toast } from '@shared/ui/toast/toast';

/** Sign-in screen (US-05). Reads `Auth` signals and calls its methods; no logic here. */
@Component({
  selector: 'app-sign-in',
  imports: [Logo, Toast],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  protected readonly auth = inject(Auth);
}
