import { SheetLoadError, combineLoadErrors, noAccessMessage } from './sheet-load-error';

const noAccess = (label: string) => new SheetLoadError(label, 'access', noAccessMessage([label]));
const unavailable = (label: string) =>
  new SheetLoadError(label, 'unavailable', `Couldn't load ${label}. Check your connection and try again.`);

describe('combineLoadErrors (US-32)', () => {
  it('names every sheet the account cannot open, in one message', () => {
    expect(combineLoadErrors([noAccess('Master'), noAccess('Dr Trust')])).toBe(
      "You don't have access to Master or Dr Trust. Ask the owner to share them with you as Editor.",
    );
  });

  it('uses the single-sheet wording for one sheet', () => {
    expect(combineLoadErrors([noAccess('Dr Trust')])).toBe(
      "You don't have access to Dr Trust. Ask the owner to share it with you as Editor.",
    );
  });

  it('lists each sheet message when the failures differ', () => {
    expect(combineLoadErrors([noAccess('Master'), unavailable('Dr Trust')])).toBe(
      "You don't have access to Master. Ask the owner to share it with you as Editor. " +
        "Couldn't load Dr Trust. Check your connection and try again.",
    );
  });

  it('shows nothing when the session expired (Auth sends the user to sign-in)', () => {
    expect(combineLoadErrors([new SheetLoadError('Master', 'expired', 'x'), noAccess('Dr Trust')])).toBeNull();
  });

  it('shows nothing when nothing failed', () => {
    expect(combineLoadErrors([])).toBeNull();
  });
});
