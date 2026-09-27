import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { DatabaseModule } from './shared/database/database.module';
import { LoggingModule } from './shared/logging/logging.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { ProcessingModule } from './modules/processing/processing.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    LoggingModule,
    OutboxModule,
    ProcessingModule,
  ],
})
export class WorkerModule {}
