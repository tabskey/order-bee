import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import { sign } from 'jsonwebtoken';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
} from './support/mysql-test-database';

jest.setTimeout(120000);

describe('Orders (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let adminToken: string;

  beforeAll(async () => {
    container = await startTestDatabase();

    // Required after the container env override: AppModule's ConfigModule
    // reads process.env synchronously at import time.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const appModule: typeof import('../../src/app.module') = require('../../src/app.module');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const { AppModule } = appModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = app.get(getDataSourceToken());
    token = sign(
      { sub: 1, email: 'user@test.local', role: 'USER' },
      process.env.JWT_SECRET ?? 'change-me',
      { expiresIn: '15m' },
    );
    adminToken = sign(
      { sub: 2, email: 'admin@test.local', role: 'ADMIN' },
      process.env.JWT_SECRET ?? 'change-me',
      { expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase(container);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM order_items');
    await dataSource.query('DELETE FROM outbox_events');
    await dataSource.query('DELETE FROM orders');
    await dataSource.query('DELETE FROM products');
    await dataSource.query('DELETE FROM users');
    await dataSource.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES (1, ?, ?, ?)',
      ['user@test.local', 'unused-in-this-test', 'USER'],
    );
    await dataSource.query('INSERT INTO products (name, stock) VALUES (?, ?)', [
      'Widget',
      5,
    ]);
  });

  it('creates a PENDING order with an outbox row', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Widget', quantity: 2, price: 19.9 }],
      })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      status: 'PENDING',
    });

    const [order] = await dataSource.query(
      'SELECT status, total FROM orders WHERE id = ?',
      [response.body.id],
    );
    expect(order.status).toBe('PENDING');
    expect(Number(order.total)).toBeCloseTo(39.8);

    const outboxRows = await dataSource.query(
      'SELECT event_type, aggregate_id FROM outbox_events WHERE aggregate_id = ?',
      [response.body.id],
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].event_type).toBe('OrderCreatedEvent');
  });

  it('rejects with 422 for a nonexistent product', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Nope', quantity: 1, price: 10 }],
      })
      .expect(422);

    expect(response.body.message).toContain('Nope');
  });

  it('rejects without a token', () => {
    return request(app.getHttpServer())
      .post('/orders')
      .send({ customerName: 'Alice', items: [] })
      .expect(401);
  });

  it('returns 404 for a nonexistent order', () => {
    return request(app.getHttpServer())
      .get('/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('gets an order by id with its items', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Widget', quantity: 2, price: 19.9 }],
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: created.body.id,
      status: 'PENDING',
      items: [
        { productId: expect.any(Number), quantity: 2, unitPrice: '19.90' },
      ],
    });
  });

  it('lists orders with pagination metadata', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerName: `Customer ${i}`,
          items: [{ productName: 'Widget', quantity: 1, price: 10 }],
        })
        .expect(201);
    }

    const response = await request(app.getHttpServer())
      .get('/orders?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('rejects a limit above 100', () => {
    return request(app.getHttpServer())
      .get('/orders?limit=101')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('reprocesses a FAILED order as ADMIN', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Widget', quantity: 2, price: 19.9 }],
      })
      .expect(201);
    const orderId: string = created.body.id;
    await dataSource.query(
      "UPDATE orders SET status = 'FAILED', failure_reason = 'out of stock' WHERE id = ?",
      [orderId],
    );

    const response = await request(app.getHttpServer())
      .post(`/orders/${orderId}/reprocess`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(response.body).toEqual({ id: orderId, status: 'PENDING' });

    const [order] = await dataSource.query(
      'SELECT status, failure_reason FROM orders WHERE id = ?',
      [orderId],
    );
    expect(order.status).toBe('PENDING');
    expect(order.failure_reason).toBeNull();

    const outboxRows = await dataSource.query(
      'SELECT event_type FROM outbox_events WHERE aggregate_id = ? ORDER BY id',
      [orderId],
    );
    expect(outboxRows).toHaveLength(2);
    expect(outboxRows[1].event_type).toBe('OrderCreatedEvent');
  });

  it('rejects reprocess from a non-ADMIN with 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Widget', quantity: 2, price: 19.9 }],
      })
      .expect(201);
    await dataSource.query("UPDATE orders SET status = 'FAILED' WHERE id = ?", [
      created.body.id,
    ]);

    return request(app.getHttpServer())
      .post(`/orders/${created.body.id}/reprocess`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects reprocess of a non-FAILED order with 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Widget', quantity: 2, price: 19.9 }],
      })
      .expect(201);

    return request(app.getHttpServer())
      .post(`/orders/${created.body.id}/reprocess`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('rejects an oversized customerName with 400 instead of a DB error', () => {
    return request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'x'.repeat(256),
        items: [{ productName: 'Widget', quantity: 1, price: 10 }],
      })
      .expect(400);
  });

  it('rejects a non-UUID order id with 400', () => {
    return request(app.getHttpServer())
      .get('/orders/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('replaces a non-UUID correlation id instead of storing it', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-correlation-id', 'x'.repeat(100))
      .send({
        customerName: 'Alice',
        items: [{ productName: 'Widget', quantity: 1, price: 10 }],
      })
      .expect(201);

    const correlationId = response.headers['x-correlation-id'];
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
    const [order] = await dataSource.query(
      'SELECT correlation_id FROM orders WHERE id = ?',
      [response.body.id],
    );
    expect(order.correlation_id).toBe(correlationId);
  });

  describe('ownership', () => {
    const otherUserToken = () =>
      sign(
        { sub: 3, email: 'other@test.local', role: 'USER' },
        process.env.JWT_SECRET ?? 'change-me',
        { expiresIn: '15m' },
      );

    async function createOrderAsUser1(): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerName: 'Alice',
          items: [{ productName: 'Widget', quantity: 1, price: 10 }],
        })
        .expect(201);
      return created.body.id;
    }

    it("returns 404 when a USER reads another user's order", async () => {
      const orderId = await createOrderAsUser1();

      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherUserToken()}`)
        .expect(404);
    });

    it('lists only the orders the USER created', async () => {
      await createOrderAsUser1();

      const response = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${otherUserToken()}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.meta.total).toBe(0);
    });

    it("lets an ADMIN read any user's order", async () => {
      const orderId = await createOrderAsUser1();

      await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const list = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.meta.total).toBe(1);
    });
  });

  it('returns 404 reprocessing a nonexistent order', () => {
    return request(app.getHttpServer())
      .post('/orders/00000000-0000-0000-0000-000000000000/reprocess')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
