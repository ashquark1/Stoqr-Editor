import { Directive, inject } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';

/**
 * Shared tooltip (US-41): `<span stoqrTooltip="Full text">`. Wraps PrimeNG's
 * Tooltip as a host directive so features never touch PrimeNG. Shows on hover
 * AND keyboard focus (put it on a focusable element), hides on Escape, sits
 * above by default. `stoqrTooltipOnEllipsis` shows it only while the element's
 * text is cut short with "…".
 */
@Directive({
  selector: '[stoqrTooltip]',
  hostDirectives: [
    {
      directive: Tooltip,
      inputs: [
        'pTooltip: stoqrTooltip',
        'tooltipPosition: stoqrTooltipPosition',
        'showOnEllipsis: stoqrTooltipOnEllipsis',
      ],
    },
  ],
})
export class StoqrTooltip {
  constructor() {
    // Defaults for every tooltip. PrimeNG reads its options store, not the input
    // fields, so set them there; the aliased inputs above still override position.
    inject(Tooltip, { self: true }).setOption({
      tooltipEvent: 'both',
      tooltipPosition: 'top',
      hideOnEscape: true,
    });
  }
}
