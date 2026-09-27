import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { EnvConfig } from '../../shared/config/env.schema';
import { RabbitmqConnection } from '../../shared/messaging/rabbitmq-connection';
import {
  declareTopology,
  DEAD_LETTER_EXCHANGE,
  ORDER_CREATED_QUEUE,
  retryQueueName,
} from '../../shared/messaging/topology';
import type { OrderCreatedEvent } from '../orders/domain/events/order-created.event';
import { decideFailureAction } from './decide-failure-action';
import { OrderProcessingService } from './order-processing.service';

const PREFETCH = 10;

@Injectable()
export class OrderCreatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderCreatedConsumer.name);
  private readonly channel: ChannelWrapper;
  private readonly retryDelaysMs: number[];
  private readonly maxAttempts: number;

  constructor(
    rabbit: RabbitmqConnection,
    @Inject(ConfigService) config: ConfigService<EnvConfig, true>,
    private readonly processing: OrderProcessingService,
  ) {
    this.retryDelaysMs = config.get('RETRY_DELAYS_MS', { infer: true });
    this.maxAttempts = this.retryDelaysMs.length + 1;
    this.channel = rabbit.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        await declareTopology(channel, this.retryDelaysMs);
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
      await this.handleFailure(channel, message, event, error);
    }
  }

  private async handleFailure(
    channel: Channel,
    message: ConsumeMessage,
    event: OrderCreatedEvent,
    error: unknown,
  ): Promise<void> {
    const { orderId, correlationId } = event;
    const attemptsMade = Number(message.properties.headers?.['x-attempt'] ?? 0);
    const action = decideFailureAction(error, attemptsMade, this.maxAttempts);
    const reason = error instanceof Error ? error.message : String(error);

    if (action === 'RETRY') {
      const delayMs = this.retryDelaysMs[attemptsMade];
      try {
        await this.channel.sendToQueue(retryQueueName(delayMs), event, {
          persistent: true,
          headers: {
            ...message.properties.headers,
            'x-attempt': attemptsMade + 1,
          },
        });
        this.logger.warn({
          event: 'order.retry.scheduled',
          orderId,
          correlationId,
          delayMs,
          attempt: attemptsMade + 1,
          reason,
        });
        channel.ack(message);
      } catch (publishError) {
        this.logger.error(
          { event: 'order.retry.publish_failed', orderId, correlationId },
          publishError,
        );
        channel.nack(message, false, true);
      }
      return;
    }

    await this.processing.markFailed(orderId, reason);

    if (action === 'FAIL_NOW') {
      this.logger.log({
        event: 'order.failed',
        orderId,
        correlationId,
        reason,
      });
      channel.ack(message);
      return;
    }

    try {
      await this.channel.publish(DEAD_LETTER_EXCHANGE, '', event, {
        persistent: true,
        headers: {
          ...message.properties.headers,
          'x-attempt': attemptsMade + 1,
        },
      });
      this.logger.error(
        { event: 'order.dead_lettered', orderId, correlationId, reason },
        error,
      );
      channel.ack(message);
    } catch (publishError) {
      this.logger.error(
        { event: 'order.dlq.publish_failed', orderId, correlationId },
        publishError,
      );
      channel.nack(message, false, true);
    }
  }
}
