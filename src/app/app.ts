import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Auth } from '@core/auth/auth';
import { AppConfig } from '@core/config/app-config';
import { SessionPrompts } from '@features/session/session-prompts';
import { Logo } from '@shared/ui/logo/logo';
import { StoqrTooltip } from '@shared/ui/tooltip/tooltip';

/** App shell: topbar (logo, first name, Sign out), routed content area, environment footer. No logic. */
@Component({
  selector: 'app-root',
  imports: [NgTemplateOutlet, RouterOutlet, Logo, SessionPrompts, StoqrTooltip],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly config = inject(AppConfig);
  protected readonly auth = inject(Auth);
}
