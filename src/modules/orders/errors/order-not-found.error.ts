import { BusinessError } from '../../../shared/errors/business-error';

export class OrderNotFoundError extends BusinessError {
  constructor(public readonly orderId: string) {
    super(`Order ${orderId} not found`);
  }
}
