import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { Auth } from '@core/auth/auth';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { Logo } from '@shared/ui/logo/logo';
import { Toast } from '@shared/ui/toast/toast';

/**
 * Sign-in screen (US-05). Reads `Auth` signals and calls its methods; no logic here.
 * The card holds the logo, then the title, the Google button and Remember me (US-44, owner).
 */
@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, Checkbox, Logo, Toast],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  protected readonly auth = inject(Auth);

  /** Ticked by default; passed to `Auth.signIn` (US-67). */
  protected readonly rememberMe = new FormControl(true, { nonNullable: true });
}
