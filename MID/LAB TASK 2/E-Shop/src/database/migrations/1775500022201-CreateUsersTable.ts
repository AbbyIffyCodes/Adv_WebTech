import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateUsersTable1775500022201 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.createTable(new Table({
      name: "users",
      columns: [
        { name: "id", type: "uuid", isPrimary: true, default: "uuid_generate_v4()" },
        { name: "name", type: "varchar", isNullable: false },
        { name: "email", type: "varchar", isNullable: false, isUnique: true },
        { name: "password", type: "varchar", isNullable: false },
        { name: "role", type: "varchar", default: "'CUSTOMER'", isNullable: false },
        { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
        { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
      ],
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("users", true);
  }
}
