import { describe, expect, it } from 'vitest';

import { EMPTY_DISPLAY, displayValue } from './display-value';

describe('displayValue', () => {
  it('shows null as "empty"', () => {
    expect(displayValue(null)).toBe(EMPTY_DISPLAY);
  });

  it('shows undefined as "empty"', () => {
    expect(displayValue(undefined)).toBe(EMPTY_DISPLAY);
  });

  it('shows an empty or whitespace-only string as "empty"', () => {
    expect(displayValue('')).toBe(EMPTY_DISPLAY);
    expect(displayValue('   ')).toBe(EMPTY_DISPLAY);
  });

  it('keeps a genuine placeholder like "-" verbatim', () => {
    expect(displayValue('-')).toBe('-');
  });

  it('renders numbers as strings, including 0', () => {
    expect(displayValue(0)).toBe('0');
    expect(displayValue(3999)).toBe('3999');
  });

  it('returns non-empty strings unchanged', () => {
    expect(displayValue('In Stock')).toBe('In Stock');
  });
});
