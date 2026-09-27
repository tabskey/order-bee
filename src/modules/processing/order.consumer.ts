import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { EnvConfig } from '../../shared/config/env.schema';
import { RabbitmqConnection } from '../../shared/messaging/rabbitmq-connection';
import {
  declareTopology,
  ORDER_CREATED_QUEUE,
} from '../../shared/messaging/topology';
import type { OrderCreatedEvent } from '../orders/domain/events/order-created.event';
import { OrderProcessingService } from './order-processing.service';

const PREFETCH = 10;

@Injectable()
export class OrderCreatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderCreatedConsumer.name);
  private readonly channel: ChannelWrapper;

  constructor(
    rabbit: RabbitmqConnection,
    @Inject(ConfigService) config: ConfigService<EnvConfig, true>,
    private readonly processing: OrderProcessingService,
  ) {
    const retryDelaysMs = config.get('RETRY_DELAYS_MS', { infer: true });
    this.channel = rabbit.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await declareTopology(channel, retryDelaysMs);
        await channel.prefetch(PREFETCH);
        await channel.consume(
          ORDER_CREATED_QUEUE,
          (message) => void this.handle(channel, message),
          { noAck: false },
        );
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.channel.waitForConnect();
  }

  private async handle(
    channel: Channel,
    message: ConsumeMessage | null,
  ): Promise<void> {
    if (!message) {
      return;
    }

    const event = JSON.parse(message.content.toString()) as OrderCreatedEvent;

    try {
      await this.processing.process(event);
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        { event: 'order.processing.error', orderId: event.orderId },
        error,
      );
      // ponytail: requeue on any unexpected error, no delay/DLQ routing yet.
      // Etapa 6 (decideFailureAction) replaces this with classified retry.
      channel.nack(message, false, true);
    }
  }
}
