import { cellRange, columnLetter, tabRange } from './a1-range';

describe('columnLetter and cellRange (exact cells for writes)', () => {
  it.each([
    [0, 'A'],
    [10, 'K'],
    [25, 'Z'],
    [26, 'AA'],
    [46, 'AU'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ])('column %i is %s', (index, letters) => {
    expect(columnLetter(index)).toBe(letters);
  });

  it('builds a single-cell A1 range with the tab quoted', () => {
    expect(cellRange('Sheet1', 10, 12)).toBe("'Sheet1'!K12");
    expect(cellRange("Ash's Stock", 0, 2)).toBe("'Ash''s Stock'!A2");
  });

  it('refuses impossible columns and rows', () => {
    expect(() => columnLetter(-1)).toThrow(RangeError);
    expect(() => cellRange('Sheet1', 0, 0)).toThrow(RangeError);
  });
});

describe('tabRange', () => {
  it.each([
    ['Sheet1', '%27Sheet1%27', "'Sheet1'"],
    ['Stock List', '%27Stock%20List%27', "'Stock List'"],
    ["Ash's Stock", '%27Ash%27%27s%20Stock%27', "'Ash''s Stock'"],
  ])('encodes %j as %s (A1 range %s)', (tab, encoded, a1) => {
    expect(tabRange(tab)).toBe(encoded);
    expect(decodeURIComponent(tabRange(tab))).toBe(a1);
  });

  it('leaves no raw space or apostrophe in the path segment', () => {
    expect(tabRange("Ash's Stock")).not.toMatch(/[ ']/);
  });
});
