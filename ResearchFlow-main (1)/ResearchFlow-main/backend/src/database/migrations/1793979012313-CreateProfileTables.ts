import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateProfileTables1793979012313 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "full_name",
            type: "varchar",
            length: "120",
            isNullable: false,
          },
          {
            name: "email",
            type: "varchar",
            length: "250",
            isUnique: true,
            isNullable: false,
          },
          {
            name: "password_hash",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "role",
            type: "enum",
            enum: ["student", "supervisor", "coordinator"],
            enumName: "user_role_enum",
            default: "'student'",
            isNullable: false,
          },
          {
            name: "is_active",
            type: "boolean",
            default: true,
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "profiles",
        columns: [
          {
            name: "user_id",
            type: "uuid",
            isPrimary: true,
            isNullable: false,
          },
          {
            name: "bio",
            type: "text",
            isNullable: true,
          },
          {
            name: "availability",
            type: "varchar",
            length: "250",
            isNullable: true,
          },
          {
            name: "capacity",
            type: "int",
            isNullable: true,
          },
          {
            name: "seeking_supervisor",
            type: "boolean",
            default: false,
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updated_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: "FK_profiles_user_id",
            columnNames: ["user_id"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("profiles");
    await queryRunner.dropTable("users");
  }
}
