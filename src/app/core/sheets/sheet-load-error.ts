/** Why a sheet could not be loaded. `expired` means the user is sent back to sign-in. */
export type SheetLoadErrorKind = 'columns' | 'access' | 'tab' | 'not-found' | 'expired' | 'unavailable';

/** A load failure for one sheet, with a message that names it and is safe to show staff. */
export class SheetLoadError extends Error {
  constructor(
    readonly sheetLabel: string,
    readonly kind: SheetLoadErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SheetLoadError';
  }
}
