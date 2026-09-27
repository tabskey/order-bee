import { BusinessError } from '../../../shared/errors/business-error';

export class InsufficientStockError extends BusinessError {
  constructor(public readonly productId: number) {
    super(`Insufficient stock for product ${productId}`);
  }
}
