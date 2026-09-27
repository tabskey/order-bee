import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type {
  ChannelWrapper,
  CreateChannelOpts,
} from 'amqp-connection-manager';
import type { EnvConfig } from '../config/env.schema';

@Injectable()
export class RabbitmqConnection implements OnModuleDestroy {
  private readonly connection: amqp.AmqpConnectionManager;

  constructor(@Inject(ConfigService) config: ConfigService<EnvConfig, true>) {
    this.connection = amqp.connect([
      config.get('RABBITMQ_URL', { infer: true }),
    ]);
  }

  createChannel(options: CreateChannelOpts): ChannelWrapper {
    return this.connection.createChannel(options);
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
