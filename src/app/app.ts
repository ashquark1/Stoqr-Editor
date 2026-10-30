import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

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
  private readonly router = inject(Router);

  /**
   * The bottom bar shows unless the active route sets `data.bottomBar: false`
   * (the sign-in screen, US-45). Hidden until the first navigation lands, and
   * switched only when a navigation finishes, so it never flashes on the
   * sign-in card while home loads.
   */
  protected readonly showBottomBar = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => deepestRoute(this.router.routerState.snapshot.root).data['bottomBar'] !== false),
    ),
    { initialValue: false },
  );
}

function deepestRoute(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  return route.firstChild ? deepestRoute(route.firstChild) : route;
}
