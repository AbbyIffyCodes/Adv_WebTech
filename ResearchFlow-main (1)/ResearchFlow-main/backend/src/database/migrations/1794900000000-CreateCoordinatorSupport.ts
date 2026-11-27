import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateCoordinatorSupport1794900000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE selection_requests ADD CONSTRAINT "UQ_request_project" UNIQUE(id,project_id)`,
    );
    await q.query(
      `CREATE TABLE support_cases(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),project_id uuid NOT NULL REFERENCES projects(id),raised_by uuid NOT NULL REFERENCES users(id),reason varchar(30) NOT NULL CHECK(reason IN ('declined','unanswered','capacity','unavailable','concern')),description text NOT NULL CHECK(char_length(btrim(description)) BETWEEN 1 AND 2000),request_id uuid,status varchar(30) NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_review','awaiting_student','resolved')),resolution_note text,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(request_id,project_id) REFERENCES selection_requests(id,project_id),CHECK((status='resolved' AND resolved_at IS NOT NULL AND resolution_note IS NOT NULL) OR (status<>'resolved' AND resolved_at IS NULL)))`,
    );
    await q.query(
      `CREATE INDEX "IX_support_status_created" ON support_cases(status,created_at DESC,id)`,
    );
    await q.query(
      `CREATE INDEX "IX_support_project_created" ON support_cases(project_id,created_at DESC,id)`,
    );
    await q.query(
      `CREATE TABLE suggestions(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),case_id uuid NOT NULL REFERENCES support_cases(id),coordinator_id uuid NOT NULL REFERENCES users(id),supervisor_id uuid REFERENCES users(id),opportunity_id uuid REFERENCES opportunities(id),research_direction text,explanation text NOT NULL CHECK(char_length(btrim(explanation)) BETWEEN 1 AND 2000),response varchar(20) NOT NULL DEFAULT 'pending' CHECK(response IN ('pending','accepted','declined')),response_reason text,responded_by uuid REFERENCES users(id),responded_at timestamptz,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(num_nonnulls(supervisor_id,opportunity_id,research_direction)=1),CHECK(research_direction IS NULL OR char_length(btrim(research_direction)) BETWEEN 1 AND 1000),CHECK((response='pending' AND responded_at IS NULL AND responded_by IS NULL) OR (response<>'pending' AND responded_at IS NOT NULL AND responded_by IS NOT NULL AND response_reason IS NOT NULL)))`,
    );
    await q.query(
      `CREATE INDEX "IX_suggestions_case_created" ON suggestions(case_id,created_at,id)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE suggestions");
    await q.query("DROP TABLE support_cases");
    await q.query(
      'ALTER TABLE selection_requests DROP CONSTRAINT "UQ_request_project"',
    );
  }
}
