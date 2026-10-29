import { EDITABLE_DETAILS, EditableDetail } from './details-fields';
import { DETAIL_MESSAGES, validateDetail } from './details-validation';

function def(key: string): EditableDetail {
  const found = EDITABLE_DETAILS.find((d) => d.key === key);
  if (found === undefined) {
    throw new Error(`no field ${key}`);
  }
  return found;
}

describe('validateDetail (US-22)', () => {
  it('rule: a required text field may not be blank or only spaces', () => {
    for (const d of EDITABLE_DETAILS.filter((x) => x.required && x.kind === 'text')) {
      expect(validateDetail(d, '')).toBe(DETAIL_MESSAGES.required(d.label));
      expect(validateDetail(d, '   ')).toBe(DETAIL_MESSAGES.required(d.label));
      expect(validateDetail(d, ' x ')).toBeNull();
    }
    expect(validateDetail(def('sku'), '')).toBe('SKU is required.');
  });

  it('optional text fields accept anything, blank included', () => {
    for (const key of ['size', 'color', 'notes']) {
      expect(validateDetail(def(key), '')).toBeNull();
      expect(validateDetail(def(key), '-')).toBeNull();
    }
  });

  it.each(['0', '18', '0.18', '12.50', '2999', ' 12.5 '])('rule: number fields accept %j', (typed) => {
    for (const key of ['mrp', 'sellingPrice', 'purchasePrice', 'taxRate']) {
      expect(validateDetail(def(key), typed)).toBeNull();
    }
  });

  it.each(['-5', '1,200', '1e3', '.5', '5.', '12abc', '₹12', '+3'])(
    'rule: number fields reject %j (never cleaned up)',
    (typed) => {
      expect(validateDetail(def('mrp'), typed)).toBe(DETAIL_MESSAGES.number('MRP'));
      expect(validateDetail(def('taxRate'), typed)).toBe('Tax Rate must be a number ≥ 0, e.g. 12.50.');
    },
  );

  it('prices may be blank; tax rate may not', () => {
    for (const key of ['mrp', 'sellingPrice', 'purchasePrice']) {
      expect(validateDetail(def(key), '')).toBeNull();
    }
    expect(validateDetail(def('taxRate'), '')).toBe('Tax Rate is required.');
  });

  it.each(['0', '5', '1000000', ' 7 '])('rule: the threshold accepts %j', (typed) => {
    expect(validateDetail(def('lowStockThreshold'), typed)).toBeNull();
  });

  it.each(['', '-1', '2.5', '1000001', '1,000', 'ten'])('rule: the threshold rejects %j', (typed) => {
    const message =
      typed === ''
        ? 'Low Stock Threshold is required.'
        : 'Low Stock Threshold must be a whole number from 0 to 1,000,000.';
    expect(validateDetail(def('lowStockThreshold'), typed)).toBe(message);
  });
});
