import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ProductEntity } from '../stock/entities/product.entity';
import { OutboxEventEntity } from '../../shared/outbox/entities/outbox-event.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderEntity } from './entities/order.entity';
import { ORDER_CREATED_EVENT } from './domain/events/order-created.event';
import { OrderStatus } from './domain/order-status.enum';
import { centsToDecimalString, toCents } from './domain/money';

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
        throw new UnprocessableEntityException(
          `Products not found: ${missing.join(', ')}`,
        );
      }

      const itemsWithCents = dto.items.map((item) => ({
        product: productByName.get(item.productName)!,
        quantity: item.quantity,
        unitPriceCents: toCents(item.price),
      }));

      const totalCents = itemsWithCents.reduce(
        (total, item) => total + item.quantity * item.unitPriceCents,
        0,
      );
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

  // `createdBy` undefined = no ownership filter (ADMIN).
  async findById(
    id: string,
    createdBy?: number,
  ): Promise<OrderWithItems | null> {
    const order = await this.dataSource.manager.findOneBy(OrderEntity, {
      id,
      createdBy,
    });
    if (!order) {
      return null;
    }
    const items = await this.dataSource.manager.findBy(OrderItemEntity, {
      orderId: id,
    });
    return { order, items };
  }

  async reprocess(id: string, correlationId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOneBy(OrderEntity, { id });
      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (order.status !== OrderStatus.FAILED) {
        throw new ConflictException(
          `Order ${id} cannot be reprocessed: status is ${order.status}, not FAILED`,
        );
      }

      const result = await manager
        .createQueryBuilder()
        .update(OrderEntity)
        .set({
          status: OrderStatus.PENDING,
          failureReason: null,
          processedAt: null,
        })
        .where('id = :id', { id })
        .andWhere('status = :status', { status: OrderStatus.FAILED })
        .execute();
      if (!result.affected) {
        throw new ConflictException(
          `Order ${id} cannot be reprocessed: status changed concurrently`,
        );
      }

      await manager.insert(OutboxEventEntity, {
        eventType: ORDER_CREATED_EVENT,
        aggregateId: id,
        payload: { orderId: id, correlationId },
        correlationId,
        publishedAt: null,
      });
    });
  }

  async findPage(
    page: number,
    limit: number,
    createdBy?: number,
  ): Promise<{ orders: OrderEntity[]; total: number }> {
    const [orders, total] = await this.dataSource.manager.findAndCount(
      OrderEntity,
      {
        where: { createdBy },
        // `id` breaks ties: DATETIME has second precision, so without it
        // rows created in the same second can repeat or vanish across pages.
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      },
    );
    return { orders, total };
  }
}
