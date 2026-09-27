import { Module } from '@nestjs/common';
import { MessagePublisher } from './message-publisher';

@Module({
  providers: [MessagePublisher],
  exports: [MessagePublisher],
})
export class MessagingModule {}
