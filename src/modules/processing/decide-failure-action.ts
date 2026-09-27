import { BusinessError } from '../../shared/errors/business-error';

export type FailureAction = 'RETRY' | 'FAIL_NOW' | 'FAIL_AND_DEAD_LETTER';

// ADR-0002: business errors fail fast; technical errors retry until
// `attemptsMade` (the attempt that just failed) is the last one allowed.
export function decideFailureAction(
  error: unknown,
  attemptsMade: number,
  maxAttempts: number,
): FailureAction {
  if (error instanceof BusinessError) {
    return 'FAIL_NOW';
  }
  return attemptsMade + 1 < maxAttempts ? 'RETRY' : 'FAIL_AND_DEAD_LETTER';
}
