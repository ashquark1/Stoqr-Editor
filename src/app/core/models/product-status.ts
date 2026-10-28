/** Product lifecycle status (the `status` column) — distinct from stock status. */
export type ProductStatusVariant = 'active' | 'inactive' | 'discontinued' | 'other';

const STATUS_VARIANTS: Readonly<Record<string, ProductStatusVariant>> = {
  active: 'active',
  inactive: 'inactive',
  discontinued: 'discontinued',
};

/** Display only: variant for a sheet `status` text (trimmed, case-insensitive). Copied from V1 without its filter. */
export function resolveProductStatus(status: string | null | undefined): ProductStatusVariant {
  return STATUS_VARIANTS[(status ?? '').trim().toLowerCase()] ?? 'other';
}

/** Display label: the sheet's own text, or "Unknown" when blank. */
export function statusLabel(status: string | null | undefined): string {
  const text = (status ?? '').trim();
  return text === '' ? 'Unknown' : text;
}
