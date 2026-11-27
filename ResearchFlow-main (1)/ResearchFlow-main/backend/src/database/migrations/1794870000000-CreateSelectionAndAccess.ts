import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateSelectionAndAccess1794870000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE opportunities ADD CONSTRAINT "UQ_opportunity_supervisor" UNIQUE(id,supervisor_id)`,
    );
    await q.query(`CREATE TABLE selection_requests (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), project_id uuid NOT NULL REFERENCES projects(id), supervisor_id uuid NOT NULL REFERENCES users(id),
   opportunity_id uuid, initiated_by uuid NOT NULL REFERENCES users(id), direction varchar(20) NOT NULL CHECK(direction IN ('application','invitation')),
   status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','offered','confirmed','declined','withdrawn','expired')),
   statement text NOT NULL CHECK(char_length(btrim(statement)) BETWEEN 1 AND 2000), decision_reason text,
   response_due timestamptz NOT NULL, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(opportunity_id,supervisor_id) REFERENCES opportunities(id,supervisor_id)
  )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_selection_live_pair" ON selection_requests(project_id,supervisor_id) WHERE status IN ('pending','offered')`,
    );
    await q.query(
      `CREATE INDEX "IX_selection_project" ON selection_requests(project_id,created_at DESC,id)`,
    );
    await q.query(
      `CREATE INDEX "IX_selection_supervisor" ON selection_requests(supervisor_id,status,response_due)`,
    );
    await q.query(`CREATE TABLE supervisions (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), project_id uuid NOT NULL REFERENCES projects(id), supervisor_id uuid NOT NULL REFERENCES users(id),
   opportunity_id uuid, request_id uuid NOT NULL UNIQUE REFERENCES selection_requests(id), reserved_places int NOT NULL CHECK(reserved_places>0),
   confirmed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at timestamptz, end_reason text,
   UNIQUE(id,project_id), FOREIGN KEY(opportunity_id,supervisor_id) REFERENCES opportunities(id,supervisor_id)
  )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_supervision_active_project" ON supervisions(project_id) WHERE ended_at IS NULL`,
    );
    await q.query(
      `CREATE INDEX "IX_supervision_capacity" ON supervisions(supervisor_id) WHERE ended_at IS NULL`,
    );
    await q.query(`CREATE TABLE access_grants (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), project_id uuid NOT NULL REFERENCES projects(id), grantee_id uuid NOT NULL REFERENCES users(id),
   granted_by uuid NOT NULL REFERENCES users(id), scope varchar(30) NOT NULL DEFAULT 'full_documents' CHECK(scope='full_documents'),
   supervision_id uuid, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(supervision_id,project_id) REFERENCES supervisions(id,project_id)
  )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_access_active_grantee" ON access_grants(project_id,grantee_id,scope) WHERE revoked_at IS NULL`,
    );
    await q.query(`CREATE TABLE activity_events (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), project_id uuid NOT NULL REFERENCES projects(id), actor_id uuid NOT NULL REFERENCES users(id),
   action varchar(100) NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await q.query(
      `CREATE INDEX "IX_activity_project_time" ON activity_events(project_id,occurred_at DESC,id)`,
    );
    await q.query(
      `ALTER TABLE projects DROP CONSTRAINT projects_status_check, DROP CONSTRAINT ck_projects_state`,
    );
    await q.query(`ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK(status IN ('draft','seeking_supervisor','under_supervision','archived')),
   ADD CONSTRAINT ck_projects_state CHECK((status='draft' AND published_at IS NULL AND archived_at IS NULL) OR
    (status IN ('seeking_supervisor','under_supervision') AND published_at IS NOT NULL AND archived_at IS NULL) OR
    (status='archived' AND published_at IS NULL AND archived_at IS NOT NULL))`);
    // Profile updates and confirmation serialize on the same profile row.
    await q.query(`CREATE FUNCTION rf_guard_capacity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF NEW.capacity IS NULL OR NEW.capacity < COALESCE((SELECT sum(reserved_places) FROM supervisions WHERE supervisor_id=NEW.user_id AND ended_at IS NULL),0) THEN
    IF EXISTS(SELECT 1 FROM supervisions WHERE supervisor_id=NEW.user_id AND ended_at IS NULL) THEN
     RAISE EXCEPTION 'Capacity cannot be below active reserved student places' USING ERRCODE='23514',CONSTRAINT='CK_profiles_reserved_capacity';
    END IF;
   END IF; RETURN NEW; END $$`);
    await q.query(
      `CREATE TRIGGER rf_capacity_guard BEFORE UPDATE OF capacity ON profiles FOR EACH ROW EXECUTE FUNCTION rf_guard_capacity()`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER rf_capacity_guard ON profiles`);
    await q.query(`DROP FUNCTION rf_guard_capacity()`);
    await q.query(
      `UPDATE projects SET status='seeking_supervisor' WHERE status='under_supervision'`,
    );
    await q.query(
      `UPDATE research_groups SET membership_locked=false WHERE id IN (SELECT p.group_id FROM projects p JOIN supervisions s ON s.project_id=p.id WHERE s.ended_at IS NULL)`,
    );
    await q.query(`UPDATE opportunities SET reserved_places=0`);
    await q.query(
      `ALTER TABLE projects DROP CONSTRAINT projects_status_check, DROP CONSTRAINT ck_projects_state`,
    );
    await q.query(`ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK(status IN ('draft','seeking_supervisor','archived')),
   ADD CONSTRAINT ck_projects_state CHECK((status='draft' AND published_at IS NULL AND archived_at IS NULL) OR
    (status='seeking_supervisor' AND published_at IS NOT NULL AND archived_at IS NULL) OR (status='archived' AND published_at IS NULL AND archived_at IS NOT NULL))`);
    for (const t of [
      "activity_events",
      "access_grants",
      "supervisions",
      "selection_requests",
    ])
      await q.query(`DROP TABLE ${t}`);
    await q.query(
      `ALTER TABLE opportunities DROP CONSTRAINT "UQ_opportunity_supervisor"`,
    );
  }
}
