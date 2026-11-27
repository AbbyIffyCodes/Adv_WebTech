import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateSubmissionsAndReviews1794880000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE submissions (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),project_id uuid NOT NULL REFERENCES projects(id),kind varchar(20) NOT NULL DEFAULT 'proposal' CHECK(kind='proposal'),
   version_no int NOT NULL CHECK(version_no>0),submitted_by uuid NOT NULL REFERENCES users(id),revision_note text NOT NULL CHECK(char_length(btrim(revision_note)) BETWEEN 1 AND 1000),
   status varchar(30) NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','revision_required','approved')),
   created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,kind,version_no)
  )`);
    await q.query(
      `CREATE INDEX "IX_submission_project_created" ON submissions(project_id,created_at DESC,id)`,
    );
    await q.query(`CREATE TABLE reviews (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),submission_id uuid NOT NULL REFERENCES submissions(id),reviewer_id uuid NOT NULL REFERENCES users(id),
   decision varchar(30) NOT NULL CHECK(decision IN ('revision_required','approved')),comments text NOT NULL CHECK(char_length(btrim(comments)) BETWEEN 1 AND 5000),
   created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(id,submission_id),UNIQUE(submission_id)
  )`);
    await q.query(`CREATE TABLE files (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),submission_id uuid NOT NULL REFERENCES submissions(id),review_id uuid,
   original_name varchar(180) NOT NULL,storage_key varchar(100) NOT NULL UNIQUE,file_type varchar(120) NOT NULL,size int NOT NULL CHECK(size>0),sha256 varchar(64) NOT NULL,
   created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(review_id,submission_id) REFERENCES reviews(id,submission_id)
  )`);
    await q.query(
      `CREATE INDEX "IX_files_submission_review" ON files(submission_id,review_id)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of ["files", "reviews", "submissions"])
      await q.query("DROP TABLE " + table);
  }
}
