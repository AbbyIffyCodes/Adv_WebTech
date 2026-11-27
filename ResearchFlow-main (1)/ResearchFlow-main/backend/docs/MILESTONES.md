# Milestones

Keep the latest proposal approved and the supervision active. Import the Phase 7 Postman collection and send 01–15 in order. Request 04 checks for an existing plan. On a fresh plan, 05 and 06 create two tasks. Do not repeat task creation on reruns: adding tasks changes the agreed total and therefore the progress denominator.

The confirmed supervisor plans tasks with a title, description, current group-member owner and future deadline with timezone. Only the assigned owner can start work. The group leader submits evidence on the group's behalf through the existing private-file submission route, adding a `milestoneId` Text field to form-data. In request 09 select the supplied `Amrin_Dataset_v1.csv` as File; let Postman generate the multipart Content-Type.

Evidence is versioned separately for each milestone. The supervisor uses the existing submission review endpoints to approve it or request revision. A submission awaiting review contributes zero completed milestones. Approval changes that milestone to completed. With one approved out of two planned milestones, progress is 50%. With no plan, percentage is null and state is not_yet_planned.

Request 14 deliberately returns 409 because completed work cannot be rewritten. Other requests return 200, except creation/evidence/review requests 05, 06, 09 and 11 which return 201. The dashboard uses the same plan and progress counts.

| Endpoint | Behavior |
| --- | --- |
| GET /projects/:id/milestones | Paginated plan and counts across the entire plan |
| POST /projects/:id/milestones | Current supervisor creates a task after latest proposal approval |
| PATCH /milestones/:id | Current supervisor edits an unfinished task and records the plan change |
| POST /milestones/:id/start | Assigned owner starts or resumes requested revisions |
| POST /projects/:id/submissions | Leader uploads private evidence with optional milestoneId |
| GET /milestones/:id/submissions | Authorized evidence-version history |
| POST /submissions/:id/reviews | Current supervisor approves or requests revision on latest evidence version |

Student work states are not_started, in_progress, submitted_for_review, revision_required and completed. A passed deadline without submitted evidence is overdue. Work awaiting review is counted separately from overdue work; an evidence revision requested after its deadline becomes overdue again until resubmitted. No one can claim completion by setting a status field in a DTO.

Owner must be an active student in the current group. Completed tasks and tasks awaiting review cannot be edited. Plans have no hard-delete endpoint; this preserves the agreed denominator and history. Membership remains locked during active supervision. Supervisor changes still require new pairing and document consent. Coordinator reads administrative milestone progress but needs a named document grant to inspect actual evidence or review comments. Unrelated students cannot inspect a project's plan.

The ninth migration creates milestones, links evidence to its same project through a composite foreign key, and adds separate unique version indexes for proposal and milestone histories. Project-row transactions serialize planning, evidence and review changes. Activity records plan creation/changes, starts, submissions and decisions. A rollback removes milestone evidence metadata; do not run rollback commands against demonstration data as a troubleshooting shortcut.

Understand these files: `modules/milestones` holds task routes, DTOs, entity and planning/progress rules; `modules/submissions` handles the protected evidence files and version-specific decisions. The API currently uses the leader to upload evidence for assigned members; direct nonleader file submission is not exposed.
