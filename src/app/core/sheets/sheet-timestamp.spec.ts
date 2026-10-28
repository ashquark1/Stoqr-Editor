import { formatSheetTimestamp, toSheetSerial } from './sheet-timestamp';

describe('Last Updated timestamps', () => {
  it('the Unix epoch in local time is serial 25569', () => {
    expect(toSheetSerial(new Date(1970, 0, 1, 0, 0, 0))).toBe(25569);
  });

  it('uses the local wall-clock date and time, to the second', () => {
    const local = new Date(2026, 9, 28, 14, 26, 3, 700); // 28/10/2026 14:26:03.700 local
    const days = (Date.UTC(2026, 9, 28) - Date.UTC(1970, 0, 1)) / 86_400_000;
    const expected = 25569 + days + (14 * 3600 + 26 * 60 + 4) / 86_400; // .700 rounds to :04
    expect(toSheetSerial(local)).toBeCloseTo(expected, 9);
  });

  it('formats the same moment as dd/MM/yyyy HH:mm:ss', () => {
    expect(formatSheetTimestamp(new Date(2026, 9, 28, 4, 5, 6))).toBe('28/10/2026 04:05:06');
  });
});
