import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { StartedMySqlContainer } from '@testcontainers/mysql';
import { hash } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import {
  startTestDatabase,
  stopTestDatabase,
} from './support/mysql-test-database';

jest.setTimeout(120000);

describe('Users (e2e)', () => {
  let container: StartedMySqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
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
    userToken = sign(
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
    await dataSource.query('DELETE FROM user_role_changes');
    await dataSource.query('DELETE FROM users');
    await dataSource.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES (1, ?, ?, ?), (2, ?, ?, ?), (3, ?, ?, ?)',
      [
        'user@test.local',
        'unused-in-this-test',
        'USER',
        'admin@test.local',
        'unused-in-this-test',
        'ADMIN',
        'target@test.local',
        await hash('target123', 10),
        'USER',
      ],
    );
  });

  describe('DELETE /users/:id', () => {
    it('soft deletes a user as ADMIN', async () => {
      await request(app.getHttpServer())
        .delete('/users/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const [row] = await dataSource.query(
        'SELECT deleted_at FROM users WHERE id = 3',
      );
      expect(row.deleted_at).not.toBeNull();
    });

    it('blocks login for a soft-deleted user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'target@test.local', password: 'target123' })
        .expect(200);

      await request(app.getHttpServer())
        .delete('/users/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'target@test.local', password: 'target123' })
        .expect(401);
    });

    it('rejects as USER with 403', () => {
      return request(app.getHttpServer())
        .delete('/users/3')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects without a token with 401', () => {
      return request(app.getHttpServer()).delete('/users/3').expect(401);
    });

    it('returns 404 for a nonexistent user', () => {
      return request(app.getHttpServer())
        .delete('/users/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 404 for an already soft-deleted user', async () => {
      await request(app.getHttpServer())
        .delete('/users/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete('/users/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('rejects an admin deleting their own account with 400', () => {
      return request(app.getHttpServer())
        .delete('/users/2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('PATCH /users/:id/role', () => {
    it('promotes a user to ADMIN and records an audit row', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/3/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      expect(response.body).toEqual({
        id: 3,
        email: 'target@test.local',
        role: 'ADMIN',
      });

      const [audit] = await dataSource.query(
        'SELECT user_id, changed_by, old_role, new_role FROM user_role_changes WHERE user_id = 3',
      );
      expect(audit).toMatchObject({
        user_id: 3,
        changed_by: 2,
        old_role: 'USER',
        new_role: 'ADMIN',
      });
    });

    it('rejects as USER with 403', () => {
      return request(app.getHttpServer())
        .patch('/users/3/role')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('rejects an admin changing their own role with 400', () => {
      return request(app.getHttpServer())
        .patch('/users/2/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'USER' })
        .expect(400);
    });

    it('returns 404 for a nonexistent user', () => {
      return request(app.getHttpServer())
        .patch('/users/999/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' })
        .expect(404);
    });

    it('rejects an invalid role with 400', () => {
      return request(app.getHttpServer())
        .patch('/users/3/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SUPERADMIN' })
        .expect(400);
    });
  });
});
