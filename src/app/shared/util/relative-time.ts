import {
  ChangeDetectorRef,
  OnDestroy,
  Pipe,
  PipeTransform,
  inject,
} from '@angular/core';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** How often the relative wording is recomputed (copied from V1 unchanged, US-69). */
const TICK_MS = MINUTE_MS;

/**
 * Presentation helper: a human "time ago" string for a past instant.
 *
 * Buckets: < 1 min -> "just now"; < 1 hour -> "N minute(s) ago";
 * < 1 day -> "N hour(s) ago"; otherwise "N day(s) ago". A `from` in the
 * (near) future — e.g. clock skew — reads as "just now".
 *
 * Pure and deterministic (both instants are passed in) so it is unit-testable
 * without timers; the live "now" + ticking is the pipe's job.
 */
export function relativeTime(from: Date, now: Date): string {
  const diff = now.getTime() - from.getTime();

  if (diff < MINUTE_MS) {
    return 'just now';
  }
  if (diff < HOUR_MS) {
    return units(Math.floor(diff / MINUTE_MS), 'minute');
  }
  if (diff < DAY_MS) {
    return units(Math.floor(diff / HOUR_MS), 'hour');
  }
  return units(Math.floor(diff / DAY_MS), 'day');
}

function units(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/**
 * `{{ date | relativeTime }}` — renders {@link relativeTime} against the current
 * time and refreshes itself every 60s (AC-08) by marking the host for check.
 *
 * Impure because the output changes with wall-clock time, not just its input.
 * It owns a single interval, started lazily on the first non-null value and
 * cleared on destroy — so the component stays free of any timer wiring.
 */
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private timer: ReturnType<typeof setInterval> | null = null;

  transform(value: Date | null | undefined): string {
    if (value == null) {
      this.stop();
      return '';
    }
    this.start();
    return relativeTime(value, new Date());
  }

  private start(): void {
    this.timer ??= setInterval(() => this.cdr.markForCheck(), TICK_MS);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Editor addition (US-69): the exact time for the "Last updated" tooltip, as
 * Angular's `d MMM y, h:mm a` ("31 Oct 2026, 7:07 AM"). Hand-written because
 * `DatePipe` added 13 kB to the first load.
 */
export function exactTime(at: Date): string {
  const hours = at.getHours();
  const minutes = String(at.getMinutes()).padStart(2, '0');
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}
