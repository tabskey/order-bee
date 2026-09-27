import { randomUUID } from 'node:crypto';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import {
  ORDERS_EXCHANGE,
  ORDER_CREATED_ROUTING_KEY,
} from '../../src/shared/messaging/topology';
import {
  startTestDatabase,
  stopTestDatabase,
} from '../e2e/support/mysql-test-database';
import {
  startTestBroker,
  stopTestBroker,
} from './support/rabbitmq-test-broker';

jest.setTimeout(120000);

// A dedicated exclusive queue bound to the exchange, not the real
// `order.created` queue: the worker's own consumer (Etapa 5) also holds a
// consumer there, and two consumers on one queue split deliveries.
async function waitForMessage(
  routingKey: string,
  timeoutMs: number,
): Promise<ConsumeMessage> {
  const connection = await connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();
  try {
    const { queue } = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    await channel.bindQueue(queue, ORDERS_EXCHANGE, routingKey);

    return await new Promise<ConsumeMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`No message on ${routingKey} within ${timeoutMs}ms`));
      }, timeoutMs);

      void channel.consume(
        queue,
        (message) => {
          if (message) {
            clearTimeout(timer);
            channel.ack(message);
            resolve(message);
          }
        },
        { noAck: false },
      );
    });
  } finally {
    await channel.close();
    await connection.close();
  }
}

describe('Outbox relay (integration)', () => {
  let dbContainer: StartedMySqlContainer;
  let brokerContainer: StartedRabbitMQContainer;
  let app: INestApplicationContext;
  let dataSource: DataSource;

  beforeAll(async () => {
    dbContainer = await startTestDatabase();
    brokerContainer = await startTestBroker();

    // Required after the container env overrides: AppConfigModule's
    // ConfigModule reads process.env synchronously at import time.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const workerModule: typeof import('../../src/worker.module') = require('../../src/worker.module');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const { WorkerModule } = workerModule;

    app = await NestFactory.createApplicationContext(WorkerModule);
    dataSource = app.get(getDataSourceToken());
  });

  afterAll(async () => {
    await app.close();
    await stopTestBroker(brokerContainer);
    await stopTestDatabase(dbContainer);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM outbox_events');
  });

  it('publishes a pending outbox event to order.created', async () => {
    const orderId = randomUUID();
    const correlationId = randomUUID();

    await dataSource.query(
      `INSERT INTO outbox_events (event_type, aggregate_id, payload, correlation_id, published_at)
       VALUES (?, ?, ?, ?, NULL)`,
      [
        'OrderCreatedEvent',
        orderId,
        JSON.stringify({ orderId, correlationId }),
        correlationId,
      ],
    );

    const message = await waitForMessage(ORDER_CREATED_ROUTING_KEY, 5000);

    expect(JSON.parse(message.content.toString())).toEqual({
      orderId,
      correlationId,
    });
    expect(message.properties.headers['x-attempt']).toBe(0);

    const [row] = await dataSource.query(
      'SELECT published_at FROM outbox_events WHERE aggregate_id = ?',
      [orderId],
    );
    expect(row.published_at).not.toBeNull();
  });
});
