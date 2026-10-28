import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppConfig } from '@core/config/app-config';
import { Logo } from '@shared/ui/logo/logo';

/** App shell: topbar with the logo, routed content area, environment footer. No logic. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Logo],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly config = inject(AppConfig);
}
