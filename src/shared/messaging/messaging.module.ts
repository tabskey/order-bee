import { Module } from '@nestjs/common';
import { MessagePublisher } from './message-publisher';
import { RabbitmqConnection } from './rabbitmq-connection';

@Module({
  providers: [RabbitmqConnection, MessagePublisher],
  exports: [RabbitmqConnection, MessagePublisher],
})
export class MessagingModule {}
