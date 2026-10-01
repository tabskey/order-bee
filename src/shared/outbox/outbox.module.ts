import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [MessagingModule],
  providers: [OutboxRelayService],
})
export class OutboxModule {}
