import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import * as request from 'supertest';
import {
  startTestDatabase,
  stopTestDatabase,
} from './support/mysql-test-database';

jest.setTimeout(120000);

describe('Health (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await startTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase(container);
  });

  beforeEach(async () => {
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'degraded', db: 'up', rabbitmq: 'down' });
  });
});
