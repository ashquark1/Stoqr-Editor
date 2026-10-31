/** Owner-confirmed sanity cap on an amount and on any resulting quantity (catches an extra zero). */
export const MAX_QUANTITY = 1_000_000;
const MAX_TEXT = '1,000,000';

export type AdjustMode = 'add' | 'subtract';

/** One way to change stock (CR-04): an amount with a sign, or a new total. */
export type QuantityEntry =
  | { readonly way: 'amount'; readonly mode: AdjustMode; readonly amount: number }
  | { readonly way: 'total'; readonly total: number };

export type ProposalBlock =
  | 'not-whole'
  | 'not-positive'
  | 'negative'
  | 'unchanged'
  | 'below-zero'
  | 'over-cap'
  | 'invalid-current';

export type Proposal =
  | {
      readonly ok: true;
      readonly current: number;
      /** Signed change: +amount for add, −amount for subtract, total − current for a total. */
      readonly delta: number;
      readonly proposed: number;
    }
  | { readonly ok: false; readonly reason: ProposalBlock; readonly message: string };

/**
 * Typed text → amount or total. Blank (or spaces) → null (nothing to propose
 * yet). Whole digits with an optional leading minus, trimmed → that number
 * (`-3` → −3, so it gets the sign message). Anything else (`2.5`, `1e3`, `abc`)
 * → NaN, which `proposeQuantity` reports as not a whole number.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  return /^-?\d+$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * THE ONE place the proposed quantity is computed (AI_CONTRACT: Stock), for
 * both ways (CR-04): current ± amount, or a new total. Pure. Returns the new
 * whole-number quantity, or the reason it is blocked — it never clamps and
 * never returns a negative, fractional or over-cap value. `current` is the
 * MASTER's quantity.
 */
export function proposeQuantity(current: number | null, entry: QuantityEntry): Proposal {
  if (current === null || !Number.isInteger(current) || current < 0) {
    return block('invalid-current', "This product's current stock qty is invalid.");
  }
  return entry.way === 'amount'
    ? byAmount(current, entry.mode, entry.amount)
    : toTotal(current, entry.total);
}

function toTotal(current: number, total: number): Proposal {
  if (!Number.isInteger(total)) {
    return block('not-whole', 'Enter a whole number (no decimals).');
  }
  if (total < 0) {
    return block('negative', 'Enter 0 or more.');
  }
  if (total > MAX_QUANTITY) {
    return block('over-cap', `That's more than ${MAX_TEXT}. Check for an extra zero.`);
  }
  if (total === current) {
    return block('unchanged', "That's already the current quantity.");
  }
  return { ok: true, current, delta: total - current, proposed: total };
}

function byAmount(current: number, mode: AdjustMode, amount: number): Proposal {
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
    return block(
      'over-cap',
      `That would make the stock more than ${MAX_TEXT}. Check for an extra zero.`,
    );
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
