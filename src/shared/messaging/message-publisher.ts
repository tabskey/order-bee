import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { EnvConfig } from '../config/env.schema';
import { RabbitmqConnection } from './rabbitmq-connection';
import { declareTopology, ORDERS_EXCHANGE } from './topology';

@Injectable()
export class MessagePublisher implements OnModuleInit {
  private readonly channel: ChannelWrapper;

  constructor(
    rabbit: RabbitmqConnection,
    @Inject(ConfigService) config: ConfigService<EnvConfig, true>,
  ) {
    const retryDelaysMs = config.get('RETRY_DELAYS_MS', { infer: true });
    this.channel = rabbit.createChannel({
      json: true,
      setup: (channel) => declareTopology(channel, retryDelaysMs),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.channel.waitForConnect();
  }

  async publish(
    routingKey: string,
    message: Record<string, unknown>,
    headers: Record<string, unknown> = {},
  ): Promise<void> {
    await this.channel.publish(ORDERS_EXCHANGE, routingKey, message, {
      persistent: true,
      headers,
    });
  }
}
