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

/** One message for every sheet that refused access, e.g. both Master and Dr Trust. */
export function noAccessMessage(sheetLabels: readonly string[]): string {
  const them = sheetLabels.length > 1 ? 'them' : 'it';
  return `You don't have access to ${sheetLabels.join(' or ')}. Ask the owner to share ${them} with you as Editor.`;
}

/**
 * The panel message for one load attempt (US-32). Null when nothing failed or
 * the session expired (Auth sends the user to sign-in). When every failure is
 * a refused access, one message names every such sheet; otherwise each
 * sheet's own message, in order.
 */
export function combineLoadErrors(errors: readonly SheetLoadError[]): string | null {
  if (errors.length === 0 || errors.some((e) => e.kind === 'expired')) {
    return null;
  }
  if (errors.every((e) => e.kind === 'access')) {
    return noAccessMessage(errors.map((e) => e.sheetLabel));
  }
  return errors.map((e) => e.message).join(' ');
}
