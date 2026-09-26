import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { LoggingModule } from './shared/logging/logging.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, LoggingModule],
  controllers: [HealthController],
})
export class AppModule {}
