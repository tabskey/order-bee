import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { EnvConfig } from '../config/env.schema';
import { declareTopology, ORDERS_EXCHANGE } from './topology';

@Injectable()
export class MessagePublisher implements OnModuleInit, OnModuleDestroy {
  private readonly connection: amqp.AmqpConnectionManager;
  private readonly channel: ChannelWrapper;

  constructor(@Inject(ConfigService) config: ConfigService<EnvConfig, true>) {
    const retryDelaysMs = config.get('RETRY_DELAYS_MS', { infer: true });
    this.connection = amqp.connect([
      config.get('RABBITMQ_URL', { infer: true }),
    ]);
    this.channel = this.connection.createChannel({
      json: true,
      setup: (channel) => declareTopology(channel, retryDelaysMs),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.channel.waitForConnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
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
