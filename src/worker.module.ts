import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { DatabaseModule } from './shared/database/database.module';
import { LoggingModule } from './shared/logging/logging.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, LoggingModule],
})
export class WorkerModule {}
