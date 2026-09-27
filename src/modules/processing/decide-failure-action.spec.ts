import { decideFailureAction } from './decide-failure-action';
import { InsufficientStockError } from '../stock/errors/insufficient-stock.error';

describe('decideFailureAction', () => {
  it('fails now for business errors, regardless of attempts left', () => {
    expect(decideFailureAction(new InsufficientStockError(1), 0, 4)).toBe(
      'FAIL_NOW',
    );
    expect(decideFailureAction(new InsufficientStockError(1), 3, 4)).toBe(
      'FAIL_NOW',
    );
  });

  it('retries technical errors while attempts remain', () => {
    expect(decideFailureAction(new Error('boom'), 0, 4)).toBe('RETRY');
    expect(decideFailureAction(new Error('boom'), 2, 4)).toBe('RETRY');
  });

  it('dead-letters technical errors once attempts are exhausted', () => {
    expect(decideFailureAction(new Error('boom'), 3, 4)).toBe(
      'FAIL_AND_DEAD_LETTER',
    );
  });
});
