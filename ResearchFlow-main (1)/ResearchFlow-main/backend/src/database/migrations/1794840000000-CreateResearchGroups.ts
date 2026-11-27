import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateResearchGroups1794840000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE research_groups (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name varchar(120) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 120),
      description text,
      leader_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      membership_locked boolean NOT NULL DEFAULT false,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await queryRunner.query(`CREATE TABLE group_members (
      group_id uuid NOT NULL REFERENCES research_groups(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      joined_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      left_at timestamptz,
      PRIMARY KEY (group_id, user_id),
      CONSTRAINT CK_group_members_dates CHECK (left_at IS NULL OR left_at >= joined_at)
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_group_members_active_user" ON group_members(user_id) WHERE left_at IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE research_groups ADD CONSTRAINT "FK_groups_leader_membership"
      FOREIGN KEY (id, leader_id) REFERENCES group_members(group_id, user_id) DEFERRABLE INITIALLY DEFERRED`);
    await queryRunner.query(`CREATE TABLE group_invitations (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      group_id uuid NOT NULL REFERENCES research_groups(id) ON DELETE RESTRICT,
      invitee_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      invited_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status varchar(20) NOT NULL DEFAULT 'pending',
      expires_at timestamptz NOT NULL,
      responded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT CK_group_invitation_status CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
      CONSTRAINT CK_group_invitation_target CHECK (invitee_id <> invited_by_id)
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_group_invitations_pending" ON group_invitations(group_id,invitee_id) WHERE status = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_group_invitations_invitee_created" ON group_invitations(invitee_id,created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_group_invitations_group_created" ON group_invitations(group_id,created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IX_research_groups_leader" ON research_groups(leader_id)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE group_invitations`);
    await queryRunner.query(
      `ALTER TABLE research_groups DROP CONSTRAINT "FK_groups_leader_membership"`,
    );
    await queryRunner.query(`DROP TABLE group_members`);
    await queryRunner.query(`DROP TABLE research_groups`);
  }
}
