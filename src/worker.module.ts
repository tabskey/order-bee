import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { DatabaseModule } from './shared/database/database.module';
import { LoggingModule } from './shared/logging/logging.module';
import { OutboxModule } from './shared/outbox/outbox.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, LoggingModule, OutboxModule],
})
export class WorkerModule {}
