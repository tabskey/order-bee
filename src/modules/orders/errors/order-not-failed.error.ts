import { BusinessError } from '../../../shared/errors/business-error';
import { OrderStatus } from '../domain/order-status.enum';

export class OrderNotFailedError extends BusinessError {
  constructor(
    public readonly orderId: string,
    public readonly currentStatus: OrderStatus,
  ) {
    super(
      `Order ${orderId} cannot be reprocessed: status is ${currentStatus}, not FAILED`,
    );
  }
}
