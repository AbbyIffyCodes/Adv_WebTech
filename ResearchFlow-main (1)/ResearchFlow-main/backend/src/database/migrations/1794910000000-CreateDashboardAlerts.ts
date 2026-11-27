import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateDashboardAlerts1794910000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),user_id uuid NOT NULL REFERENCES users(id),project_id uuid REFERENCES projects(id),kind varchar(100) NOT NULL,message text NOT NULL,source_type varchar(30) NOT NULL CHECK(source_type IN ('event','group_invitation','selection_deadline','milestone_deadline')),source_id uuid NOT NULL,dedupe_key varchar(200) NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,dedupe_key))`,
    );
    await q.query(
      `CREATE INDEX "IX_notifications_user_created" ON notifications(user_id,created_at DESC,id)`,
    );
    await q.query(
      `CREATE INDEX "IX_notifications_user_unread" ON notifications(user_id) WHERE read_at IS NULL`,
    );
    await q.query(`CREATE FUNCTION rf_notify_activity(event_id uuid,project uuid,actor uuid,event_action text,event_details jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
   INSERT INTO notifications(user_id,project_id,kind,message,source_type,source_id,dedupe_key)
   SELECT DISTINCT u.id,project,event_action,'ResearchFlow update: '||replace(event_action,'.',' '),'event',event_id,'event:'||event_id::text FROM users u WHERE u.is_active=true AND u.id<>actor AND (
    EXISTS(SELECT 1 FROM group_members gm JOIN projects p ON p.group_id=gm.group_id WHERE p.id=project AND gm.user_id=u.id AND gm.left_at IS NULL) OR
    (event_action NOT LIKE 'support.%' AND EXISTS(SELECT 1 FROM supervisions s WHERE s.project_id=project AND s.supervisor_id=u.id AND s.ended_at IS NULL)) OR
    (event_action LIKE 'support.%' AND u.role='coordinator') OR
    (event_action LIKE 'selection.%' AND EXISTS(SELECT 1 FROM selection_requests r WHERE r.id::text=event_details->>'requestId' AND r.supervisor_id=u.id)) OR
    (event_action LIKE 'access.%' AND EXISTS(SELECT 1 FROM access_grants g WHERE g.id::text=event_details->>'grantId' AND g.grantee_id=u.id)) OR
    (event_action='supervision.ended' AND EXISTS(SELECT 1 FROM supervisions s WHERE s.id::text=event_details->>'supervisionId' AND s.supervisor_id=u.id))
   ) ON CONFLICT(user_id,dedupe_key) DO NOTHING;
  END $$`);
    await q.query(
      `CREATE FUNCTION rf_activity_alert_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM rf_notify_activity(NEW.id,NEW.project_id,NEW.actor_id,NEW.action,NEW.details); RETURN NEW; END $$`,
    );
    await q.query(
      `CREATE TRIGGER rf_activity_alert AFTER INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION rf_activity_alert_trigger()`,
    );
    await q.query(`CREATE FUNCTION rf_group_invitation_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF TG_OP='INSERT' THEN INSERT INTO notifications(user_id,kind,message,source_type,source_id,dedupe_key) SELECT NEW.invitee_id,'group.invitation','You have a research group invitation.','group_invitation',NEW.id,'group:'||NEW.id::text WHERE EXISTS(SELECT 1 FROM users WHERE id=NEW.invitee_id AND is_active=true) ON CONFLICT(user_id,dedupe_key) DO NOTHING; END IF; RETURN NEW; END $$`);
    await q.query(
      `CREATE TRIGGER rf_group_invitation_notice AFTER INSERT ON group_invitations FOR EACH ROW EXECUTE FUNCTION rf_group_invitation_alert()`,
    );
    // Seed recent generic event notices so an existing local demo has an inbox immediately.
    await q.query(
      `SELECT rf_notify_activity(id,project_id,actor_id,action,details) FROM (SELECT * FROM activity_events WHERE occurred_at>CURRENT_TIMESTAMP-interval '7 days' ORDER BY occurred_at DESC LIMIT 1000) recent`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "DROP TRIGGER rf_group_invitation_notice ON group_invitations",
    );
    await q.query("DROP FUNCTION rf_group_invitation_alert()");
    await q.query("DROP TRIGGER rf_activity_alert ON activity_events");
    await q.query("DROP FUNCTION rf_activity_alert_trigger()");
    await q.query(
      "DROP FUNCTION rf_notify_activity(uuid,uuid,uuid,text,jsonb)",
    );
    await q.query("DROP TABLE notifications");
  }
}
