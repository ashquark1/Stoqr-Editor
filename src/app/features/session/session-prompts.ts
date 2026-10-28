import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Auth } from '@core/auth/auth';
import { Modal } from '@shared/ui/modal/modal';
import { Toast } from '@shared/ui/toast/toast';

/**
 * Session prompts (US-06), rendered once in the app shell: an early warning
 * before the token runs out, and a blocking "Session expired" dialog that keeps
 * the user's work while they renew. Reads `Auth` signals and calls its methods.
 */
@Component({
  selector: 'app-session-prompts',
  imports: [Modal, Toast],
  templateUrl: './session-prompts.html',
  styleUrl: './session-prompts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPrompts {
  protected readonly auth = inject(Auth);
}
