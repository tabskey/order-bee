import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
} from './support/mysql-test-database';

jest.setTimeout(120000);

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

describe('Auth via Google (e2e)', () => {
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
    verifyIdToken.mockReset();
    await dataSource.query('DELETE FROM users');
  });

  it('creates a new local user on first Google login', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'new-via-google@test.local',
        email_verified: true,
      }),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'google-id-token' })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();

    const rows = await dataSource.query(
      'SELECT email, role FROM users WHERE email = ?',
      ['new-via-google@test.local'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('USER');
  });

  it('reuses the same local user on repeat Google login', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'repeat-via-google@test.local',
        email_verified: true,
      }),
    });

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'google-id-token' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'google-id-token' })
      .expect(200);

    const rows = await dataSource.query(
      'SELECT id FROM users WHERE email = ?',
      ['repeat-via-google@test.local'],
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects an invalid Google ID token with 401', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid_token'));

    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'not-a-real-token' })
      .expect(401);
  });
});
