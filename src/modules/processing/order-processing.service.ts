import { Injectable, Logger } from '@nestjs/common';
import type { OrderCreatedEvent } from '../orders/domain/events/order-created.event';
import { ReserveResult } from '../stock/domain/reserve-result.enum';
import { StockService } from '../stock/stock.service';

@Injectable()
export class OrderProcessingService {
  private readonly logger = new Logger(OrderProcessingService.name);

  constructor(private readonly stock: StockService) {}

  async process(event: OrderCreatedEvent): Promise<void> {
    const { orderId, correlationId } = event;
    this.logger.log({
      event: 'order.processing.started',
      orderId,
      correlationId,
    });

    const result = await this.stock.reserve(orderId);

    if (result === ReserveResult.RESERVED) {
      this.logger.log({ event: 'order.processed', orderId, correlationId });
    } else if (result === ReserveResult.INSUFFICIENT_STOCK) {
      this.logger.log({
        event: 'order.failed',
        orderId,
        correlationId,
        reason: 'estoque insuficiente',
      });
    }
  }
}
