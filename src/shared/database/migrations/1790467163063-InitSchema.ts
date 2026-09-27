import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1790467163063 implements MigrationInterface {
  name = 'InitSchema1790467163063';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('USER', 'ADMIN') NOT NULL,
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        stock INT NOT NULL,
        UNIQUE KEY uq_products_name (name),
        CONSTRAINT chk_products_stock CHECK (stock >= 0)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE orders (
        id CHAR(36) PRIMARY KEY,
        created_by INT NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        total DECIMAL(12, 2) NOT NULL,
        status ENUM('PENDING', 'PROCESSED', 'FAILED') NOT NULL,
        failure_reason VARCHAR(255) NULL,
        correlation_id CHAR(36) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        processed_at DATETIME NULL,
        CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id),
        KEY idx_orders_status_created_at (status, created_at),
        KEY idx_orders_created_at_id (created_at, id)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE order_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        order_id CHAR(36) NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(12, 2) NOT NULL,
        CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id),
        CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id),
        CONSTRAINT chk_order_items_quantity CHECK (quantity > 0)
      ) ENGINE=InnoDB;
    `);

    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(255) NOT NULL,
        aggregate_id CHAR(36) NOT NULL,
        payload JSON NOT NULL,
        correlation_id CHAR(36) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        published_at DATETIME NULL,
        KEY idx_outbox_events_published_at_id (published_at, id)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE outbox_events;`);
    await queryRunner.query(`DROP TABLE order_items;`);
    await queryRunner.query(`DROP TABLE orders;`);
    await queryRunner.query(`DROP TABLE products;`);
    await queryRunner.query(`DROP TABLE users;`);
  }
}
