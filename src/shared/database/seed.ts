import dataSource from './data-source';
import { hashPassword } from '../security/password.util';

async function seed(): Promise<void> {
  await dataSource.initialize();

  await dataSource.query(
    `INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?), (?, ?, ?)`,
    [
      'user@order-bee.dev',
      hashPassword('user123'),
      'USER',
      'admin@order-bee.dev',
      hashPassword('admin123'),
      'ADMIN',
    ],
  );

  await dataSource.query(
    `INSERT INTO products (name, stock) VALUES (?, ?), (?, ?), (?, ?)`,
    ['Widget', 5, 'Gadget', 5, 'Gizmo', 5],
  );

  await dataSource.destroy();
}

seed()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Seed completed.');
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed.', error);
    process.exitCode = 1;
  });
