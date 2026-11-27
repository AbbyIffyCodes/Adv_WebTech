import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateMilestones1794890000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE milestones(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),project_id uuid NOT NULL REFERENCES projects(id),owner_id uuid NOT NULL REFERENCES users(id),title varchar(200) NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 200),description text NOT NULL CHECK(char_length(btrim(description)) BETWEEN 1 AND 3000),due_date timestamptz NOT NULL,status varchar(30) NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','submitted_for_review','revision_required','completed')),created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(id,project_id))`,
    );
    await q.query(
      `CREATE INDEX "IX_milestones_project_due" ON milestones(project_id,due_date,id)`,
    );
    await q.query(
      `ALTER TABLE submissions ADD COLUMN milestone_id uuid, ADD CONSTRAINT "FK_submission_milestone_project" FOREIGN KEY(milestone_id,project_id) REFERENCES milestones(id,project_id)`,
    );
    await q.query(
      `ALTER TABLE submissions DROP CONSTRAINT submissions_kind_check,DROP CONSTRAINT submissions_project_id_kind_version_no_key`,
    );
    await q.query(
      `ALTER TABLE submissions ADD CONSTRAINT submissions_kind_check CHECK((kind='proposal' AND milestone_id IS NULL) OR (kind='milestone' AND milestone_id IS NOT NULL))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_proposal_version" ON submissions(project_id,version_no) WHERE kind='proposal'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_milestone_version" ON submissions(milestone_id,version_no) WHERE kind='milestone'`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM files WHERE submission_id IN(SELECT id FROM submissions WHERE kind='milestone')`,
    );
    await q.query(
      `DELETE FROM reviews WHERE submission_id IN(SELECT id FROM submissions WHERE kind='milestone')`,
    );
    await q.query(`DELETE FROM submissions WHERE kind='milestone'`);
    await q.query(`DROP INDEX "UQ_proposal_version"`);
    await q.query(`DROP INDEX "UQ_milestone_version"`);
    await q.query(
      `ALTER TABLE submissions DROP CONSTRAINT submissions_kind_check,DROP CONSTRAINT "FK_submission_milestone_project",DROP COLUMN milestone_id,ADD CONSTRAINT submissions_kind_check CHECK(kind='proposal'),ADD UNIQUE(project_id,kind,version_no)`,
    );
    await q.query(`DROP TABLE milestones`);
  }
}
