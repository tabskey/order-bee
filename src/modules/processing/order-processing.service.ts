import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { OrderCreatedEvent } from '../orders/domain/events/order-created.event';
import { ReserveResult } from '../stock/domain/reserve-result.enum';
import { StockService } from '../stock/stock.service';
import { SimulatedProcessingError } from './errors/simulated-processing.error';

interface CustomerNameRow {
  customer_name: string;
}

@Injectable()
export class OrderProcessingService {
  private readonly logger = new Logger(OrderProcessingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stock: StockService,
  ) {}

  async process(event: OrderCreatedEvent): Promise<void> {
    const { orderId, correlationId } = event;
    this.logger.log({
      event: 'order.processing.started',
      orderId,
      correlationId,
    });

    await this.simulateFailureByCustomerName(orderId);

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

  // Test-only hook (ADR-0002 / PLAN etapa 6): a "fail" in the customer name
  // simulates a technical failure, to exercise retry + dead-letter without
  // a real timeout or deadlock.
  private async simulateFailureByCustomerName(orderId: string): Promise<void> {
    const [order]: CustomerNameRow[] = await this.dataSource.query(
      `SELECT customer_name FROM orders WHERE id = ?`,
      [orderId],
    );
    if (order?.customer_name.toLowerCase().includes('fail')) {
      throw new SimulatedProcessingError(orderId);
    }
  }
}
