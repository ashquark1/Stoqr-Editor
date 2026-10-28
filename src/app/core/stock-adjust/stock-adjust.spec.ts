import { AdjustMode, MAX_QUANTITY, formatDelta, parseAmount, proposeQuantity } from './stock-adjust';

describe('parseAmount', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['15', 15],
    [' 7 ', 7],
    ['007', 7],
  ] as const)('%j → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(['2.5', '-3', '1e3', 'abc', '1,000', '+4'])('%j is not a whole number', (raw) => {
    expect(parseAmount(raw)).toBeNaN();
  });
});

describe('proposeQuantity (the one place the new quantity is computed)', () => {
  it('adds and subtracts whole amounts', () => {
    expect(proposeQuantity(120, 'add', 15)).toEqual({ ok: true, current: 120, delta: 15, proposed: 135 });
    expect(proposeQuantity(120, 'subtract', 15)).toEqual({ ok: true, current: 120, delta: -15, proposed: 105 });
  });

  it('subtracting exactly the stock gives 0', () => {
    expect(proposeQuantity(10, 'subtract', 10)).toMatchObject({ ok: true, proposed: 0 });
  });

  describe('rules', () => {
    it('never returns a negative, fractional or over-cap quantity', () => {
      const currents = [0, 1, 9, 10, 500, MAX_QUANTITY - 1, MAX_QUANTITY];
      const amounts = [Number.NaN, -5, 0, 0.5, 1, 9, 10, 11, 2.5, MAX_QUANTITY, MAX_QUANTITY + 1];
      const modes: AdjustMode[] = ['add', 'subtract'];
      for (const current of currents) {
        for (const amount of amounts) {
          for (const mode of modes) {
            const p = proposeQuantity(current, mode, amount);
            if (p.ok) {
              expect(Number.isInteger(p.proposed)).toBe(true);
              expect(p.proposed).toBeGreaterThanOrEqual(0);
              expect(p.proposed).toBeLessThanOrEqual(MAX_QUANTITY);
              expect(p.proposed).toBe(current + p.delta);
            }
          }
        }
      }
    });

    it('a subtraction past zero is blocked with the counts, never clamped', () => {
      expect(proposeQuantity(10, 'subtract', 15)).toEqual({
        ok: false,
        reason: 'below-zero',
        message: "You can't subtract 15: only 10 in stock.",
      });
    });
  });

  it.each([
    [Number.NaN, 'not-whole', 'Enter a whole number (no decimals).'],
    [2.5, 'not-whole', 'Enter a whole number (no decimals).'],
    [0, 'not-positive', 'Enter an amount above 0.'],
    [-3, 'not-positive', 'Enter an amount above 0.'],
    [MAX_QUANTITY + 1, 'over-cap', "That's more than 1,000,000. Check for an extra zero."],
  ])('amount %s is blocked as %s', (amount, reason, message) => {
    expect(proposeQuantity(100, 'add', amount)).toEqual({ ok: false, reason, message });
  });

  it('blocks a result over the 1,000,000 cap', () => {
    expect(proposeQuantity(999_999, 'add', 2)).toMatchObject({ ok: false, reason: 'over-cap' });
    expect(proposeQuantity(999_999, 'add', 1)).toMatchObject({ ok: true, proposed: MAX_QUANTITY });
  });

  it.each([null, -1, 2.5])('refuses an invalid current quantity (%s)', (current) => {
    expect(proposeQuantity(current, 'add', 1)).toMatchObject({ ok: false, reason: 'invalid-current' });
  });
});

describe('formatDelta', () => {
  it('shows a plus or a real minus sign', () => {
    expect(formatDelta(15)).toBe('+15');
    expect(formatDelta(-15)).toBe('−15');
  });
});
