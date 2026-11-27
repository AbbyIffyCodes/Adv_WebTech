import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateProjects1794850000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      group_id uuid NOT NULL REFERENCES research_groups(id) ON DELETE RESTRICT,
      title varchar(200) NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 200),
      shared_summary text NOT NULL CHECK(char_length(btrim(shared_summary)) BETWEEN 1 AND 1500),
      status varchar(30) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','seeking_supervisor','archived')),
      published_at timestamptz,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT CK_projects_state CHECK (
        (status='draft' AND published_at IS NULL AND archived_at IS NULL) OR
        (status='seeking_supervisor' AND published_at IS NOT NULL AND archived_at IS NULL) OR
        (status='archived' AND published_at IS NULL AND archived_at IS NOT NULL)
      )
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_projects_active_group" ON projects(group_id) WHERE archived_at IS NULL`,
    );
    await q.query(
      `CREATE INDEX "IX_projects_published_created" ON projects(created_at DESC,id) WHERE published_at IS NOT NULL AND archived_at IS NULL`,
    );
    await q.query(`CREATE TABLE project_research_interests (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      research_interest_id uuid NOT NULL REFERENCES research_interests(id) ON DELETE RESTRICT,
      PRIMARY KEY(project_id,research_interest_id)
    )`);
    await q.query(
      `CREATE INDEX "IX_project_interest_tag" ON project_research_interests(research_interest_id,project_id)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE project_research_interests`);
    await q.query(`DROP TABLE projects`);
  }
}
