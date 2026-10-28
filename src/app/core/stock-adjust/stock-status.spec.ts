import { deriveStockStatus } from './stock-status';

describe('deriveStockStatus (the one Stock Status rule)', () => {
  it.each([
    [0, 5, 'Out of Stock'],
    [0, null, 'Out of Stock'],
    [1, 5, 'Low Stock'],
    [4, 5, 'Low Stock'],
    [5, 5, 'In Stock'], // equal to the threshold is In Stock
    [6, 5, 'In Stock'],
    [3, null, 'In Stock'], // no threshold: no low-stock band
    [3, 0, 'In Stock'],
  ] as const)('qty %i, threshold %s → %s', (qty, threshold, status) => {
    expect(deriveStockStatus(qty, threshold)).toBe(status);
  });

  it.each([-1, 2.5, Number.NaN])('refuses a qty that is not a whole number ≥ 0 (%s), never clamps', (qty) => {
    expect(() => deriveStockStatus(qty, 5)).toThrow(RangeError);
  });
});
