import type { ConfirmChannel } from 'amqplib';

export const ORDERS_EXCHANGE = 'orders';
export const ORDER_CREATED_QUEUE = 'order.created';
export const ORDER_CREATED_ROUTING_KEY = 'order.created';
export const DEAD_LETTER_EXCHANGE = 'orders.dlx';
export const ORDER_CREATED_DLQ = 'order.created.dlq';

export function retryQueueName(delayMs: number): string {
  return `order.created.retry.${delayMs}`;
}

export async function declareTopology(
  channel: ConfirmChannel,
  retryDelaysMs: number[],
): Promise<void> {
  await channel.assertExchange(ORDERS_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', {
    durable: true,
  });

  await channel.assertQueue(ORDER_CREATED_QUEUE, { durable: true });
  await channel.bindQueue(
    ORDER_CREATED_QUEUE,
    ORDERS_EXCHANGE,
    ORDER_CREATED_ROUTING_KEY,
  );

  for (const delayMs of retryDelaysMs) {
    // Published to directly by routing key = queue name (default exchange),
    // not bound to `orders`: the delay lives only in the queue's TTL.
    await channel.assertQueue(retryQueueName(delayMs), {
      durable: true,
      arguments: {
        'x-message-ttl': delayMs,
        'x-dead-letter-exchange': ORDERS_EXCHANGE,
        'x-dead-letter-routing-key': ORDER_CREATED_ROUTING_KEY,
      },
    });
  }

  await channel.assertQueue(ORDER_CREATED_DLQ, { durable: true });
  await channel.bindQueue(ORDER_CREATED_DLQ, DEAD_LETTER_EXCHANGE, '');
}
