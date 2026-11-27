import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
} from "typeorm";

export class FoundationConstraints1794700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "token_version",
        type: "integer",
        default: 0,
      }),
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_users_email_normalized" ON "users" (lower("email"))',
    );
    await queryRunner.createCheckConstraint(
      "users",
      new TableCheck({
        name: "CK_users_full_name_length",
        expression: 'char_length(btrim("full_name")) BETWEEN 3 AND 120',
      }),
    );
    await queryRunner.createCheckConstraint(
      "profiles",
      new TableCheck({
        name: "CK_profiles_capacity_nonnegative",
        expression: '"capacity" IS NULL OR "capacity" >= 0',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropCheckConstraint(
      "profiles",
      "CK_profiles_capacity_nonnegative",
    );
    await queryRunner.dropCheckConstraint("users", "CK_users_full_name_length");
    await queryRunner.query('DROP INDEX "UQ_users_email_normalized"');
    await queryRunner.dropColumn("users", "token_version");
  }
}
