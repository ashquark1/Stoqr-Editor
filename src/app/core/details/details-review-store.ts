import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AppConfig } from '@core/config/app-config';
import { ProductSearchStore } from '@core/search/product-search-store';
import { approve } from '@core/sheets/approval';
import { ReviewFlow } from '@core/sheets/review-flow';
import { DiffLine, StatusLine, detailRowChanges, diffLines, statusLines } from './details-diff';
import { DETAIL_FIELDS } from './details-fields';
import { DetailsStore } from './details-store';

/** What the details review shows (US-23); null when nothing can be reviewed. */
export interface DetailsReview {
  /** "Master and Dr Trust" or "Master". */
  readonly sheetsText: string;
  readonly drTrustLabel: string;
  /** Set when a new SKU links this master-only product to an unmatched Dr Trust row (US-38). */
  readonly linkNote: string | null;
  readonly lines: readonly DiffLine[];
  /** Stock Status changes the save brings (derived per sheet), labelled by sheet. */
  readonly statuses: readonly (StatusLine & { readonly sheetLabel: string })[];
}

/** What a details save's messages need. */
interface DetailsSave {
  readonly productName: string;
}

/**
 * Review → approve → write for a details edit (US-23, US-24, US-36). The ONLY
 * caller of `approve()` for details. Only the changed fields are written, to
 * both sheets of a linked product, each guarded by that sheet's own current
 * values of those fields; Stock Status and Last Updated are filled in by the
 * writer. On success the product stays open with the saved values (owner
 * choice). The steps themselves are the shared `ReviewFlow`.
 */
@Injectable({ providedIn: 'root' })
export class DetailsReviewStore {
  private readonly details = inject(DetailsStore);
  private readonly search = inject(ProductSearchStore);
  private readonly config = inject(AppConfig);

  private readonly noticeSignal = signal<string | null>(null);

  private readonly flow = new ReviewFlow<DetailsSave>({
    written: ({ productName }, labels) => {
      this.noticeSignal.set(`${productName}: details saved (${labels.join(' and ')}).`);
      this.details.reset(); // the form now shows the confirmed values
    },
    conflictMessage: (result) =>
      `${fieldLabels(result.fields)} changed in ${result.sheet.label} since you opened this product. ` +
      'Nothing was saved. The form now shows the new values; review again.',
    partialMessage: (_save, writtenLabels, notUpdated, reason, retried) =>
      `${writtenLabels.join(' and ')} was updated. ${notUpdated} ${retried ? 'still not updated' : 'was not updated'}: ${reason}`,
    // The written sheet now holds the edits: drop them so they cannot be saved twice.
    partial: () => this.details.reset(),
  });

  readonly step = this.flow.step;
  /** Why the last save did not fully succeed (conflict / partial / failed), or null. */
  readonly message = this.flow.message;
  /** Success message for the toast, or null. */
  readonly notice = this.noticeSignal.asReadonly();
  /** The sheet(s) Retry would finish ("Dr Trust"), or null when there is nothing to retry. */
  readonly retryLabel = this.flow.retryLabel;

  readonly review = computed<DetailsReview | null>(() => {
    const selected = this.search.selected();
    const changed = this.details.changes();
    if (selected === null || changed.size === 0) {
      return null;
    }
    const linkTo = this.details.linkTo();
    const link = this.search.selectedLink() ?? linkTo;
    const masterLabel = this.config.sheet('master').label;
    const drTrustLabel = this.config.sheet('dr-trust').label;
    const drTrust = link?.product ?? null;
    return {
      sheetsText: link ? `${masterLabel} and ${drTrustLabel}` : masterLabel,
      drTrustLabel,
      linkNote:
        linkTo === null
          ? null
          : `This links it to the ${drTrustLabel} row "${linkTo.product.productName}" (qty ${linkTo.product.stockQty ?? 'blank'}). ` +
            'Later changes save to both sheets.',
      lines: diffLines(changed, selected.product, drTrust),
      statuses: statusLines(changed, selected.product, drTrust).map((s) => ({
        ...s,
        sheetLabel: s.sheet === 'master' ? masterLabel : drTrustLabel,
      })),
    };
  });

  constructor() {
    let lastRef = untracked(() => this.search.selected()?.ref ?? null);
    effect(() => {
      const ref = this.search.selected()?.ref ?? null;
      if (ref !== lastRef) {
        lastRef = ref;
        untracked(() => this.flow.reset());
      }
    });
  }

  /** Opens the review when the form is changed and valid. */
  open(): void {
    if (this.details.canReview()) {
      this.flow.open();
    }
  }

  /** Back to the form (not while saving); the edits are kept. */
  back(): void {
    this.flow.back();
  }

  clearNotice(): void {
    this.noticeSignal.set(null);
  }

  /**
   * The user's explicit approval. Works only from the review (or after a
   * failure with nothing written) and only for an editable product with a
   * reviewable change, so a double click cannot write twice.
   */
  async approve(): Promise<void> {
    if (!this.flow.canSave()) {
      return;
    }
    const selected = this.search.selected();
    if (selected === null || !this.details.canReview()) {
      this.flow.reset();
      return;
    }
    // A new SKU may link a master-only product to an unmatched Dr Trust row: both are written (US-38).
    const link = this.search.selectedLink() ?? this.details.linkTo();
    const rows = detailRowChanges(this.details.changes(), selected, link);
    await this.flow.save(() => approve(...rows), { productName: selected.product.productName });
  }

  /** Finishes a partial save from the original approval (an already written sheet is never rewritten). */
  retry(): Promise<void> {
    return this.flow.retry();
  }
}

function fieldLabels(fields: readonly string[]): string {
  return DETAIL_FIELDS.filter((def) => fields.includes(def.key))
    .map((def) => def.label)
    .join(', ');
}
