/** Owner-confirmed sanity cap on an amount and on any resulting quantity (catches an extra zero). */
export const MAX_QUANTITY = 1_000_000;
const MAX_TEXT = '1,000,000';

export type AdjustMode = 'add' | 'subtract';

export type ProposalBlock = 'not-whole' | 'not-positive' | 'below-zero' | 'over-cap' | 'invalid-current';

export type Proposal =
  | {
      readonly ok: true;
      readonly current: number;
      /** Signed change: +amount for add, −amount for subtract. */
      readonly delta: number;
      readonly proposed: number;
    }
  | { readonly ok: false; readonly reason: ProposalBlock; readonly message: string };

/**
 * Typed text → amount. Blank (or spaces) → null (nothing to propose yet).
 * Whole digits, trimmed → that number. Anything else (`2.5`, `-3`, `1e3`, `abc`)
 * → NaN, which `proposeQuantity` reports as not a whole number.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * THE ONE place the proposed quantity is computed (AI_CONTRACT: Stock). Pure.
 * Returns the new whole-number quantity, or the reason it is blocked — it
 * never clamps and never returns a negative, fractional or over-cap value.
 */
export function proposeQuantity(current: number | null, mode: AdjustMode, amount: number): Proposal {
  if (current === null || !Number.isInteger(current) || current < 0) {
    return block('invalid-current', "This product's current stock qty is invalid.");
  }
  if (!Number.isInteger(amount)) {
    return block('not-whole', 'Enter a whole number (no decimals).');
  }
  if (amount <= 0) {
    return block('not-positive', 'Enter an amount above 0.');
  }
  if (amount > MAX_QUANTITY) {
    return block('over-cap', `That's more than ${MAX_TEXT}. Check for an extra zero.`);
  }
  const delta = mode === 'add' ? amount : -amount;
  const proposed = current + delta;
  if (proposed < 0) {
    return block('below-zero', `You can't subtract ${amount}: only ${current} in stock.`);
  }
  if (proposed > MAX_QUANTITY) {
    return block('over-cap', `That would make the stock more than ${MAX_TEXT}. Check for an extra zero.`);
  }
  return { ok: true, current, delta, proposed };
}

/** Signed change for display: "+15" or "−15" (a real minus sign). */
export function formatDelta(delta: number): string {
  return delta < 0 ? `−${-delta}` : `+${delta}`;
}

function block(reason: ProposalBlock, message: string): Proposal {
  return { ok: false, reason, message };
}
