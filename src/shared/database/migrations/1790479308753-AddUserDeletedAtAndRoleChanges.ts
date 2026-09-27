import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDeletedAtAndRoleChanges1790479308753 implements MigrationInterface {
  name = 'AddUserDeletedAtAndRoleChanges1790479308753';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE user_role_changes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        changed_by INT NOT NULL,
        old_role ENUM('USER', 'ADMIN') NOT NULL,
        new_role ENUM('USER', 'ADMIN') NOT NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_role_changes_user FOREIGN KEY (user_id) REFERENCES users (id),
        CONSTRAINT fk_user_role_changes_changed_by FOREIGN KEY (changed_by) REFERENCES users (id)
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE user_role_changes;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN deleted_at;`);
  }
}
