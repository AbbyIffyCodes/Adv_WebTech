import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateOrdersTable1792439517809 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: "orders",
      columns: [
        { name: "id", type: "serial", isPrimary: true },
        { name: "customer_name", type: "varchar", isNullable: false },
        { name: "customer_email", type: "varchar", isNullable: false },
        { name: "product_name", type: "varchar", isNullable: false },
        { name: "quantity", type: "int", isNullable: false },
        { name: "total_amount", type: "decimal", precision: 10, scale: 2, isNullable: false },
        { name: "status", type: "varchar", default: "'PENDING'", isNullable: false },
        { name: "created_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
        { name: "updated_at", type: "timestamp", default: "CURRENT_TIMESTAMP" },
      ],
    }));
  }
  public async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.dropTable("orders"); }
}
