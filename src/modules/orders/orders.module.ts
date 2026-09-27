import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductEntity } from '../stock/entities/product.entity';
import { OutboxEventEntity } from '../../shared/outbox/entities/outbox-event.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderEntity } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      ProductEntity,
      OutboxEventEntity,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
