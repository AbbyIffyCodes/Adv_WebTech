import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateOpportunities1794860000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE opportunities (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
   supervisor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
   title varchar(200) NOT NULL CHECK(char_length(btrim(title)) BETWEEN 3 AND 200),
   description text NOT NULL CHECK(char_length(btrim(description)) BETWEEN 1 AND 5000),
   criteria text NOT NULL CHECK(char_length(btrim(criteria)) BETWEEN 1 AND 3000),
   places int NOT NULL CHECK(places BETWEEN 1 AND 1000),
   reserved_places int NOT NULL DEFAULT 0 CHECK(reserved_places>=0 AND reserved_places<=places),
   deadline timestamptz NOT NULL,
   status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
   opened_at timestamptz,
   created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
   CHECK((status='draft' AND opened_at IS NULL) OR (status IN ('open','closed') AND opened_at IS NOT NULL))
  )`);
    await q.query(
      `CREATE INDEX "IX_opportunities_supervisor_created" ON opportunities(supervisor_id,created_at DESC,id)`,
    );
    await q.query(
      `CREATE INDEX "IX_opportunities_open_deadline" ON opportunities(deadline,created_at DESC,id) WHERE status='open'`,
    );
    for (const [table, target, column] of [
      [
        "opportunity_research_interests",
        "research_interests",
        "research_interest_id",
      ],
      ["opportunity_required_skills", "skills", "skill_id"],
      ["opportunity_preferred_skills", "skills", "skill_id"],
    ]) {
      await q.query(
        `CREATE TABLE ${table} (opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, ${column} uuid NOT NULL REFERENCES ${target}(id) ON DELETE RESTRICT, PRIMARY KEY(opportunity_id,${column}))`,
      );
      await q.query(
        `CREATE INDEX "IX_${table}_tag" ON ${table}(${column},opportunity_id)`,
      );
    }
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      "opportunity_preferred_skills",
      "opportunity_required_skills",
      "opportunity_research_interests",
      "opportunities",
    ])
      await q.query(`DROP TABLE ${table}`);
  }
}
