import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagingModule } from '../messaging/messaging.module';
import { OutboxEventEntity } from './entities/outbox-event.entity';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity]), MessagingModule],
  providers: [OutboxRelayService],
})
export class OutboxModule {}
