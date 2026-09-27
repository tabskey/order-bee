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
});
