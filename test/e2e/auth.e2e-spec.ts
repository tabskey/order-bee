import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import { hash } from 'bcryptjs';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
} from './support/mysql-test-database';

jest.setTimeout(120000);

describe('Auth (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;

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
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase(container);
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM users');
    await dataSource.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES (1, ?, ?, ?)',
      ['user@test.local', await hash('user123', 10), 'USER'],
    );
  });

  it('logs in with valid credentials and returns a bearer token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@test.local', password: 'user123' })
      .expect(200);

    expect(response.body).toEqual({ accessToken: expect.any(String) });
  });

  it('rejects an unknown email with 401', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@test.local', password: 'user123' })
      .expect(401);
  });

  it('rejects a wrong password with 401', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@test.local', password: 'wrong' })
      .expect(401);
  });

  it('registers a new account as USER', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'newbie@test.local', password: 'newbie123' })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(Number),
      email: 'newbie@test.local',
      role: 'USER',
    });

    const [row] = await dataSource.query(
      'SELECT role FROM users WHERE email = ?',
      ['newbie@test.local'],
    );
    expect(row.role).toBe('USER');
  });

  it('rejects registration with a duplicate email with 409', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'user@test.local', password: 'newbie123' })
      .expect(409);
  });

  it('rejects registration with a short password with 400', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'shorty@test.local', password: 'short' })
      .expect(400);
  });

  it('ignores a role sent in the register payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'sneaky@test.local',
        password: 'sneaky123',
        role: 'ADMIN',
      })
      .expect(201);

    expect(response.body.role).toBe('USER');
  });
});
