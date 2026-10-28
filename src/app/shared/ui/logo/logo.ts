import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Stoqr logo lockup. `inline=false` (hero): mark above the wordmark with the
 * INVENTORY sub-label. `inline=true` (active): small mark to the left, no
 * sub-label. The SVG mark uses `currentColor` so the colorway follows the theme
 * (Pine on light, Sage on dark via `--color-pine`). Sizes transition for the
 * hero↔active animation.
 */
@Component({
  selector: 'stoqr-logo',
  template: `
    <span class="stoqr-logo" [class.stoqr-logo--inline]="inline()">
      <svg
        class="stoqr-logo__mark"
        viewBox="0 0 680 580"
        role="img"
        aria-label="Stoqr"
      >
        <g transform="translate(340,265) rotate(90)">
          <path
            fill="currentColor"
            d="M 0 0 C -38 -38,-115 -88,-115 -170 C -115 -248,-55 -262,0 -232 C 55 -262,115 -248,115 -170 C 115 -88,38 -38,0 0 Z"
          />
        </g>
        <g transform="translate(340,265) rotate(-90)">
          <path
            fill="currentColor"
            d="M 0 0 C -38 -38,-115 -88,-115 -170 C -115 -248,-55 -262,0 -232 C 55 -262,115 -248,115 -170 C 115 -88,38 -38,0 0 Z"
          />
        </g>
        <g transform="translate(340,265) rotate(0)">
          <path
            fill="currentColor"
            d="M 0 0 C -38 -38,-115 -88,-115 -170 C -115 -248,-55 -262,0 -232 C 55 -262,115 -248,115 -170 C 115 -88,38 -38,0 0 Z"
          />
        </g>
        <g transform="translate(340,265) rotate(180)">
          <path
            fill="currentColor"
            d="M 0 0 C -38 -38,-115 -88,-115 -170 C -115 -248,-55 -262,0 -232 C 55 -262,115 -248,115 -170 C 115 -88,38 -38,0 0 Z"
          />
        </g>
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="14"
          stroke-linecap="round"
          d="M 340 265 Q 333 330 324 352"
        />
      </svg>
      <span class="stoqr-logo__text">
        <span class="stoqr-logo__wordmark">stoqr</span>
        <span class="stoqr-logo__sub">Inventory</span>
      </span>
    </span>
  `,
  styleUrl: './logo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  /** Compact, horizontal lockup for the active search state. */
  readonly inline = input(false);
}
