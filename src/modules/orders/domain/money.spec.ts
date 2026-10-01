import { centsToDecimalString, toCents } from './money';

describe('money', () => {
  it('rounds float drift when converting to cents', () => {
    // 19.9 * 100 === 1989.9999999999998
    expect(toCents(19.9)).toBe(1990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('formats cents as a 2-decimal string', () => {
    expect(centsToDecimalString(3980)).toBe('39.80');
    expect(centsToDecimalString(0)).toBe('0.00');
  });
});
