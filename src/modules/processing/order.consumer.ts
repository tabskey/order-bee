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
import { StockService } from '../stock/stock.service';
import { OrderProcessingService } from './order-processing.service';

const PREFETCH = 10;

@Injectable()
export class OrderCreatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderCreatedConsumer.name);
  private readonly channel: ChannelWrapper;
  private readonly retryDelaysMs: number[];

  constructor(
    rabbit: RabbitmqConnection,
    @Inject(ConfigService) config: ConfigService<EnvConfig, true>,
    private readonly processing: OrderProcessingService,
    private readonly stock: StockService,
  ) {
    this.retryDelaysMs = config.get('RETRY_DELAYS_MS', { infer: true });
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

    let event: OrderCreatedEvent;
    try {
      event = JSON.parse(message.content.toString()) as OrderCreatedEvent;
    } catch {
      this.deadLetterPoisonMessage(channel, message);
      return;
    }

    try {
      await this.processing.process(event);
      channel.ack(message);
    } catch (error) {
      try {
        await this.handleFailure(channel, message, event, error);
      } catch (handlingError) {
        // e.g. DB down while marking FAILED: requeue instead of leaving the
        // message unacked until the channel drops.
        this.logger.error(
          {
            event: 'order.failure_handling_failed',
            orderId: event.orderId,
            correlationId: event.correlationId,
          },
          handlingError,
        );
        channel.nack(message, false, true);
      }
    }
  }

  // Unparseable payload: retrying cannot help. Raw channel publish keeps the
  // original bytes (the json wrapper would re-encode the Buffer).
  private deadLetterPoisonMessage(
    channel: Channel,
    message: ConsumeMessage,
  ): void {
    channel.publish(DEAD_LETTER_EXCHANGE, '', message.content, {
      persistent: true,
      headers: message.properties.headers,
    });
    this.logger.error({
      event: 'order.poison_message',
      content: message.content.toString().slice(0, 200),
    });
    channel.ack(message);
  }

  private async handleFailure(
    channel: Channel,
    message: ConsumeMessage,
    event: OrderCreatedEvent,
    error: unknown,
  ): Promise<void> {
    const { orderId, correlationId } = event;
    const attemptsMade = Number(message.properties.headers?.['x-attempt'] ?? 0);
    const reason = error instanceof Error ? error.message : String(error);

    // ADR-0012: every error here is technical. One retry per configured delay,
    // then dead-letter.
    if (attemptsMade < this.retryDelaysMs.length) {
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

    await this.stock.markFailed(orderId, reason);

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
