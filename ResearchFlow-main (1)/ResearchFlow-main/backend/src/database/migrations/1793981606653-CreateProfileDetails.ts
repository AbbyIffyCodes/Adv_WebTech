import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from "typeorm";

export class CreateProfileDetails1793981606653 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "research_interests",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isUnique: true,
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "skills",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "name",
            type: "varchar",
            length: "100",
            isUnique: true,
            isNullable: false,
          },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "profile_research_interests",
        columns: [
          {
            name: "profile_id",
            type: "uuid",
            isPrimary: true,
            isNullable: false,
          },
          {
            name: "research_interest_id",
            type: "uuid",
            isPrimary: true,
            isNullable: false,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: "FK_profile_research_interest_profile",
            columnNames: ["profile_id"],
            referencedTableName: "profiles",
            referencedColumnNames: ["user_id"],
            onDelete: "CASCADE",
          }),
          new TableForeignKey({
            name: "FK_profile_interests_interest",
            columnNames: ["research_interest_id"],
            referencedTableName: "research_interests",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "profile_skills",
        columns: [
          {
            name: "profile_id",
            type: "uuid",
            isPrimary: true,
            isNullable: false,
          },
          {
            name: "skill_id",
            type: "uuid",
            isPrimary: true,
            isNullable: false,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: "FK_profile_skills_profile",
            columnNames: ["profile_id"],
            referencedTableName: "profiles",
            referencedColumnNames: ["user_id"],
            onDelete: "CASCADE",
          }),
          new TableForeignKey({
            name: "FK_profile_skills_skill",
            columnNames: ["skill_id"],
            referencedTableName: "skills",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "work_links",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "profile_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "label",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "url",
            type: "text",
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamptz",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: "FK_work_links_profile",
            columnNames: ["profile_id"],
            referencedTableName: "profiles",
            referencedColumnNames: ["user_id"],
            onDelete: "CASCADE",
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("work_links");
    await queryRunner.dropTable("profile_skills");
    await queryRunner.dropTable("profile_research_interests");
    await queryRunner.dropTable("skills");
    await queryRunner.dropTable("research_interests");
  }
}
