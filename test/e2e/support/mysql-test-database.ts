import * as path from 'node:path';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { DataSource } from 'typeorm';

export async function startTestDatabase(): Promise<StartedMySqlContainer> {
  const container = await new MySqlContainer('mysql:8.4')
    .withDatabase('order_bee')
    .withUsername('order_bee')
    .withUserPassword('order_bee')
    .start();

  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = String(container.getPort());
  process.env.DB_USERNAME = container.getUsername();
  process.env.DB_PASSWORD = container.getUserPassword();
  process.env.DB_DATABASE = container.getDatabase();

  const dataSource = new DataSource({
    type: 'mysql',
    connectorPackage: 'mysql2',
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getUserPassword(),
    database: container.getDatabase(),
    migrations: [
      path.join(__dirname, '../../../src/shared/database/migrations/*.ts'),
    ],
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  return container;
}

export async function stopTestDatabase(
  container: StartedMySqlContainer,
): Promise<void> {
  await container.stop();
}
