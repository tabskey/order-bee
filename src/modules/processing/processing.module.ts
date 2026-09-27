import { Module } from '@nestjs/common';
import { MessagingModule } from '../../shared/messaging/messaging.module';
import { StockModule } from '../stock/stock.module';
import { OrderCreatedConsumer } from './order.consumer';
import { OrderProcessingService } from './order-processing.service';

@Module({
  imports: [StockModule, MessagingModule],
  providers: [OrderProcessingService, OrderCreatedConsumer],
})
export class ProcessingModule {}
