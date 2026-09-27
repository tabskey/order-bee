import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'mysql',
  connectorPackage: 'mysql2',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: ['src/modules/**/entities/*.ts', 'src/shared/**/entities/*.ts'],
  migrations: ['src/shared/database/migrations/*.ts'],
});
