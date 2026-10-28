import { tabRange } from './a1-range';

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
