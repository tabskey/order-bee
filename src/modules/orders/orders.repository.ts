import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ProductEntity } from '../stock/entities/product.entity';
import { OutboxEventEntity } from '../../shared/outbox/entities/outbox-event.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderEntity } from './entities/order.entity';
import { calculateOrderTotal } from './domain/calculate-order-total';
import { ORDER_CREATED_EVENT } from './domain/events/order-created.event';
import { OrderStatus } from './domain/order-status.enum';
import { centsToDecimalString, toCents } from './domain/money';
import { ProductsNotFoundError } from './errors/products-not-found.error';

export interface CreateOrderCommand {
  dto: CreateOrderDto;
  createdBy: number;
  correlationId: string;
}

export interface OrderWithItems {
  order: OrderEntity;
  items: OrderItemEntity[];
}

@Injectable()
export class OrdersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(
    command: CreateOrderCommand,
  ): Promise<{ id: string; status: OrderStatus }> {
    const { dto, createdBy, correlationId } = command;

    return this.dataSource.transaction(async (manager) => {
      const productNames = dto.items.map((item) => item.productName);
      const products = await manager.find(ProductEntity, {
        where: { name: In(productNames) },
      });
      const productByName = new Map(products.map((p) => [p.name, p]));

      const missing = productNames.filter((name) => !productByName.has(name));
      if (missing.length > 0) {
        throw new ProductsNotFoundError(missing);
      }

      const itemsWithCents = dto.items.map((item) => ({
        product: productByName.get(item.productName)!,
        quantity: item.quantity,
        unitPriceCents: toCents(item.price),
      }));

      const totalCents = calculateOrderTotal(itemsWithCents);
      const orderId = randomUUID();

      await manager.insert(OrderEntity, {
        id: orderId,
        createdBy,
        customerName: dto.customerName,
        total: centsToDecimalString(totalCents),
        status: OrderStatus.PENDING,
        failureReason: null,
        correlationId,
        processedAt: null,
      });

      await manager.insert(
        OrderItemEntity,
        itemsWithCents.map((item) => ({
          orderId,
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: centsToDecimalString(item.unitPriceCents),
        })),
      );

      await manager.insert(OutboxEventEntity, {
        eventType: ORDER_CREATED_EVENT,
        aggregateId: orderId,
        payload: { orderId, correlationId },
        correlationId,
        publishedAt: null,
      });

      return { id: orderId, status: OrderStatus.PENDING };
    });
  }

  async findById(id: string): Promise<OrderWithItems | null> {
    const order = await this.dataSource.manager.findOneBy(OrderEntity, {
      id,
    });
    if (!order) {
      return null;
    }
    const items = await this.dataSource.manager.findBy(OrderItemEntity, {
      orderId: id,
    });
    return { order, items };
  }

  async findPage(
    page: number,
    limit: number,
  ): Promise<{ orders: OrderEntity[]; total: number }> {
    const [orders, total] = await this.dataSource.manager.findAndCount(
      OrderEntity,
      {
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      },
    );
    return { orders, total };
  }
}
