import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { LoggingModule } from './shared/logging/logging.module';

@Module({
  imports: [AppConfigModule, LoggingModule],
})
export class WorkerModule {}
