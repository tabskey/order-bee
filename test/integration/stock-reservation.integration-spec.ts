import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
} from '../e2e/support/mysql-test-database';
import type { StockService as StockServiceType } from '../../src/modules/stock/stock.service';
import type { ReserveResult as ReserveResultType } from '../../src/modules/stock/domain/reserve-result.enum';

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

async function insertPendingOrder(
  dataSource: DataSource,
  params: { createdBy: number; productId: number; quantity: number },
): Promise<string> {
  const orderId = randomUUID();
  await dataSource.query(
    `INSERT INTO orders (id, created_by, customer_name, total, status, correlation_id)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    [orderId, params.createdBy, 'Test Customer', '10.00', randomUUID()],
  );
  await dataSource.query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
     VALUES (?, ?, ?, ?)`,
    [orderId, params.productId, params.quantity, '5.00'],
  );
  return orderId;
}

describe('Stock reservation (integration)', () => {
  let dbContainer: StartedMySqlContainer;
  let app: INestApplicationContext;
  let dataSource: DataSource;
  let stockService: StockServiceType;
  let ReserveResult: typeof ReserveResultType;

  beforeAll(async () => {
    dbContainer = await startTestDatabase();

    // Required after the container env override: AppConfigModule's
    // ConfigModule reads process.env synchronously at import time.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      AppConfigModule,
    } = require('../../src/shared/config/config.module');
    const {
      DatabaseModule,
    } = require('../../src/shared/database/database.module');
    const { StockModule } = require('../../src/modules/stock/stock.module');
    const stockServiceModule = require('../../src/modules/stock/stock.service');
    const reserveResultModule = require('../../src/modules/stock/domain/reserve-result.enum');
    /* eslint-enable @typescript-eslint/no-require-imports */
    ReserveResult = reserveResultModule.ReserveResult;

    @Module({ imports: [AppConfigModule, DatabaseModule, StockModule] })
    class TestModule {}

    app = await NestFactory.createApplicationContext(TestModule);
    dataSource = app.get(getDataSourceToken());
    stockService = app.get(stockServiceModule.StockService);
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase(dbContainer);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM order_items');
    await dataSource.query('DELETE FROM orders');
    await dataSource.query('DELETE FROM products');
    await dataSource.query('DELETE FROM users');
  });

  it('reserves stock atomically under concurrency, no overselling', async () => {
    const userId = await insertUser(dataSource);
    const productId = await insertProduct(dataSource, 5);
    const orderIds = await Promise.all([
      insertPendingOrder(dataSource, {
        createdBy: userId,
        productId,
        quantity: 2,
      }),
      insertPendingOrder(dataSource, {
        createdBy: userId,
        productId,
        quantity: 2,
      }),
      insertPendingOrder(dataSource, {
        createdBy: userId,
        productId,
        quantity: 2,
      }),
    ]);

    const results = await Promise.all(
      orderIds.map((orderId) => stockService.reserve(orderId)),
    );

    const processedCount = results.filter(
      (result) => result === ReserveResult.RESERVED,
    ).length;
    const failedCount = results.filter(
      (result) => result === ReserveResult.INSUFFICIENT_STOCK,
    ).length;
    expect(processedCount).toBe(2);
    expect(failedCount).toBe(1);

    const [product] = await dataSource.query(
      'SELECT stock FROM products WHERE id = ?',
      [productId],
    );
    expect(product.stock).toBe(1);

    const orders = await dataSource.query(
      `SELECT status, failure_reason FROM orders WHERE id IN (?, ?, ?)`,
      orderIds,
    );
    const failedOrders = orders.filter(
      (order: { status: string }) => order.status === 'FAILED',
    );
    expect(failedOrders).toHaveLength(1);
    expect(failedOrders[0].failure_reason).toBe('estoque insuficiente');
  });

  it('rolls back every decrement when a later item lacks stock, and a retry changes nothing', async () => {
    const userId = await insertUser(dataSource);
    const enough = await insertProduct(dataSource, 5);
    const scarce = await insertProduct(dataSource, 1);
    const orderId = await insertPendingOrder(dataSource, {
      createdBy: userId,
      productId: enough,
      quantity: 2,
    });
    // Second item on the same order; `scarce` has a higher id, so it is
    // reserved after `enough` already got decremented inside the tx.
    await dataSource.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
       VALUES (?, ?, ?, ?)`,
      [orderId, scarce, 2, '5.00'],
    );

    expect(await stockService.reserve(orderId)).toBe(
      ReserveResult.INSUFFICIENT_STOCK,
    );
    // Redelivery after the failure: the claim finds no PENDING order.
    expect(await stockService.reserve(orderId)).toBe(
      ReserveResult.ALREADY_PROCESSED,
    );

    const stocks = await dataSource.query(
      'SELECT id, stock FROM products WHERE id IN (?, ?) ORDER BY id',
      [enough, scarce],
    );
    expect(stocks.map((p: { stock: number }) => p.stock)).toEqual([5, 1]);

    const [order] = await dataSource.query(
      'SELECT status, failure_reason FROM orders WHERE id = ?',
      [orderId],
    );
    expect(order.status).toBe('FAILED');
    expect(order.failure_reason).toBe('estoque insuficiente');
  });

  it('redelivery of an already PROCESSED order does not change stock again', async () => {
    const userId = await insertUser(dataSource);
    const productId = await insertProduct(dataSource, 5);
    const orderId = await insertPendingOrder(dataSource, {
      createdBy: userId,
      productId,
      quantity: 2,
    });

    const first = await stockService.reserve(orderId);
    expect(first).toBe(ReserveResult.RESERVED);

    const second = await stockService.reserve(orderId);
    expect(second).toBe(ReserveResult.ALREADY_PROCESSED);

    const [product] = await dataSource.query(
      'SELECT stock FROM products WHERE id = ?',
      [productId],
    );
    expect(product.stock).toBe(3);
  });
});
