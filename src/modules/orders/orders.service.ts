import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './domain/order-status.enum';
import { OrderNotFailedError } from './errors/order-not-failed.error';
import { OrderNotFoundError } from './errors/order-not-found.error';
import { ProductsNotFoundError } from './errors/products-not-found.error';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async create(
    dto: CreateOrderDto,
    createdBy: number,
    correlationId: string,
  ): Promise<{ id: string; status: OrderStatus }> {
    try {
      return await this.ordersRepository.create({
        dto,
        createdBy,
        correlationId,
      });
    } catch (error) {
      if (error instanceof ProductsNotFoundError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }

  async findById(id: string) {
    const result = await this.ordersRepository.findById(id);
    if (!result) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    const { order, items } = result;
    return {
      id: order.id,
      customerName: order.customerName,
      total: order.total,
      status: order.status,
      failureReason: order.failureReason,
      correlationId: order.correlationId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      processedAt: order.processedAt,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    };
  }

  async reprocess(
    id: string,
    correlationId: string,
  ): Promise<{ id: string; status: OrderStatus }> {
    try {
      await this.ordersRepository.reprocess(id, correlationId);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof OrderNotFailedError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    return { id, status: OrderStatus.PENDING };
  }

  async list(page: number, limit: number) {
    const { orders, total } = await this.ordersRepository.findPage(page, limit);
    return {
      data: orders.map((order) => ({
        id: order.id,
        customerName: order.customerName,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
