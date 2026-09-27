import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { DatabaseModule } from './shared/database/database.module';
import { LoggingModule } from './shared/logging/logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UsersModule } from './modules/users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    LoggingModule,
    AuthModule,
    OrdersModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
