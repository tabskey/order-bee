import { calculateOrderTotal } from './calculate-order-total';

describe('calculateOrderTotal', () => {
  it('sums a single item', () => {
    expect(calculateOrderTotal([{ quantity: 2, unitPriceCents: 1990 }])).toBe(
      3980,
    );
  });

  it('sums multiple items', () => {
    expect(
      calculateOrderTotal([
        { quantity: 2, unitPriceCents: 1990 },
        { quantity: 1, unitPriceCents: 500 },
      ]),
    ).toBe(4480);
  });

  it('returns 0 for no items', () => {
    expect(calculateOrderTotal([])).toBe(0);
  });

  it('never produces floating point drift', () => {
    expect(calculateOrderTotal([{ quantity: 3, unitPriceCents: 10 }])).toBe(30);
  });
});
