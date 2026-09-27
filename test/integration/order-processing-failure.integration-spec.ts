import { randomUUID } from 'node:crypto';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import type { StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { connect, ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { ORDER_CREATED_DLQ } from '../../src/shared/messaging/topology';
import {
  startTestDatabase,
  stopTestDatabase,
} from '../e2e/support/mysql-test-database';
import {
  startTestBroker,
  stopTestBroker,
} from './support/rabbitmq-test-broker';

jest.setTimeout(120000);

interface WriteResult {
  insertId: number;
}

async function insertUser(dataSource: DataSource): Promise<number> {
  const result: WriteResult = await dataSource.query(
    `INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`,
    [`${randomUUID()}@test.local`, 'hash', 'USER'],
  );
  return result.insertId;
}

async function insertProduct(
  dataSource: DataSource,
  stock: number,
): Promise<number> {
  const result: WriteResult = await dataSource.query(
    `INSERT INTO products (name, stock) VALUES (?, ?)`,
    [`product-${randomUUID()}`, stock],
  );
  return result.insertId;
}

async function insertPendingOrderWithOutbox(
  dataSource: DataSource,
  params: { createdBy: number; productId: number; customerName: string },
): Promise<string> {
  const orderId = randomUUID();
  const correlationId = randomUUID();
  await dataSource.query(
    `INSERT INTO orders (id, created_by, customer_name, total, status, correlation_id)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    [orderId, params.createdBy, params.customerName, '10.00', correlationId],
  );
  await dataSource.query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
     VALUES (?, ?, ?, ?)`,
    [orderId, params.productId, 1, '10.00'],
  );
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
  return orderId;
}

async function waitForDlqMessage(timeoutMs: number): Promise<ConsumeMessage> {
  const connection = await connect(process.env.RABBITMQ_URL!);
  const channel = await connection.createChannel();
  try {
    return await new Promise<ConsumeMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`No DLQ message within ${timeoutMs}ms`));
      }, timeoutMs);

      void channel.consume(
        ORDER_CREATED_DLQ,
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

describe('Order processing failure (integration)', () => {
  let dbContainer: StartedMySqlContainer;
  let brokerContainer: StartedRabbitMQContainer;
  let app: INestApplicationContext;
  let dataSource: DataSource;

  beforeAll(async () => {
    dbContainer = await startTestDatabase();
    brokerContainer = await startTestBroker();
    process.env.RETRY_DELAYS_MS = '50,100,150';

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

  it('"fail" in the customer name exhausts retries, marks FAILED, and dead-letters the message', async () => {
    const userId = await insertUser(dataSource);
    const productId = await insertProduct(dataSource, 5);
    const orderId = await insertPendingOrderWithOutbox(dataSource, {
      createdBy: userId,
      productId,
      customerName: 'fail Bob',
    });

    const dlqMessage = await waitForDlqMessage(10000);
    expect(JSON.parse(dlqMessage.content.toString())).toEqual(
      expect.objectContaining({ orderId }),
    );
    expect(dlqMessage.properties.headers['x-attempt']).toBe(4);

    const [order] = await dataSource.query(
      `SELECT status, failure_reason FROM orders WHERE id = ?`,
      [orderId],
    );
    expect(order.status).toBe('FAILED');
    expect(order.failure_reason).toContain('Simulated processing failure');

    const [product] = await dataSource.query(
      `SELECT stock FROM products WHERE id = ?`,
      [productId],
    );
    expect(product.stock).toBe(5);
  });
});
