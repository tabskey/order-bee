import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './domain/order-status.enum';
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
}
