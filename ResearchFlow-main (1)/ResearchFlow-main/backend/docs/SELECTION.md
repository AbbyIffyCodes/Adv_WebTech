# Supervisor selection and access

A student group leader applies to a supervisor or one of that supervisor's opportunities. The supervisor may offer supervision or decline with a reason. An offer reserves no places and grants no document access. The leader confirms the final pairing using literal `shareFullProposal: true`. Alternatively, a supervisor invites a group and the leader confirms directly with the same consent.

Confirmation is one database transaction. It rechecks active student membership, published summary, supervisor role, post ownership, deadline, required skills and remaining places. Every member consumes one student place. The transaction reserves overall supervisor capacity and opportunity places, creates one active pairing, records the named supervisor grant, closes competing requests, locks group membership and records activity. Agreeing to supervision does not approve the research proposal.

## Postman

Import `postman/ResearchFlow-Phase5-Selection.postman_collection.json`. Use the original student leader, published Phase 3 project, two-member group and open Phase 4 opportunity. Set account passwords locally if they differ from fake defaults. The collection finds the logged-in supervisor's open NLP post and the leader's active project; it saves IDs and tokens itself. Request 05 ensures Python is in the leader's actual profile skills to meet the demonstration post's requirement.

Send 01–17 in order. Requests 07 and 10 return 200 with `allowed:false`. Request 11 deliberately returns 400 for missing consent. Request 12 confirms the pairing and records `supervisionId`. Requests 13–17 show two reserved places, permission, pairing history, locked membership and activity. Leave the pairing active for the next submissions phase.

The optional coordinator folder uses the existing coordinator. Its password is intentionally blank; set your local password privately. Coordinator status alone returns `allowed:false`. The leader must name that user in a grant. Revoking it removes access.

The optional final folder ends the current pairing, verifies that its supervisor permission is gone, then demonstrates a fresh supervisor invitation and renewed leader consent. Ending releases all reserved places and unlocks membership. Do not run it unless you intend to change the demonstration pairing.

## Routes

| Method | Path | Rule |
| --- | --- | --- |
| POST | /selection/applications | Current group leader sends projectId, supervisorId, optional opportunityId and statement |
| POST | /selection/invitations | Supervisor sends projectId, optional own opportunityId and statement |
| GET | /selection/requests?projectId=... | Group sees its requests; supervisor sees only their requests; coordinator sees administrative state without statements |
| POST | /selection/requests/:id/offer | Named supervisor offers a pending application |
| POST | /selection/requests/:id/decline | Recipient declines with reason; supervisor may decline their application offer |
| POST | /selection/requests/:id/withdraw | Sender withdraws a live request with reason |
| POST | /selection/requests/:id/confirm | Leader confirms an offered application or pending invitation with explicit sharing consent |
| POST | /selection/supervisions/:id/end | Leader or current supervisor ends with reason |
| GET | /selection/capacity/:supervisorId | Overall capacity, active reserved student places and remaining places |
| GET/POST | /projects/:id/access-grants | Leader reads grants or grants a named coordinator/current supervisor |
| DELETE | /projects/:id/access-grants/:grantId | Leader revokes a grant |
| GET | /projects/:id/document-access | Signed-in user checks their own effective document permission |
| GET | /projects/:id/activity | Group, confirmed supervisor or coordinator sees administrative activity |

Request lists and activity are paginated. Response deadlines default to seven days and are configurable through optional `SELECTION_RESPONSE_HOURS` (1–2160). Offers start a fresh response period. Expiration is enforced on reads and decisions without requiring Redis. Replacing an expired request persists its expired state. Deadline reminders are described in [DASHBOARDS.md](DASHBOARDS.md).

## Eligibility and change rules

Required opportunity skills are checked against the active group's combined profile skills: every required skill must exist on at least one current member's profile. Preferred skills and free-text criteria are displayed for supervisor judgement. They are not automatic ranking or automated academic eligibility rules. A direct supervisor application without an opportunity has no post-specific skill requirement.

The student's current group must be valid at request creation and confirmation. Only final confirmation reserves places. If a two-person group applies to a post with one place left, confirmation fails. Supervisor capacity is measured across all active pairings. A profile's capacity cannot be cleared or reduced below active reservations. A supervisor with active pairings cannot change role.

While a pairing is active, membership and leadership are locked rather than silently changing capacity or permissions. End the pairing, change membership and obtain fresh confirmation and sharing permission. During supervision, proposal changes use submission revisions; direct draft edits and publication resets are blocked. The system does not yet implement a live membership-change approval process.

Groups retain their own document rights. External supervisors need both a live pairing and an unrevoked grant linked to it. A coordinator needs a separate named grant and receives no automatic file access. Revoke permission immediately through the grant endpoint. Ending a pairing revokes its supervisor grants; a replacement always needs fresh consent. Separate coordinator grants remain under the leader's explicit control until revoked. Disabled accounts cannot authenticate.

## Code and database

`selection.controller.ts` maps routes; `dto/selection.dto.ts` validates inputs; `selection.service.ts` applies transitions, permissions and capacity transactions. Entity files describe `selection_requests`, `supervisions`, `access_grants` and `activity_events`. Migration `1794870000000-CreateSelectionAndAccess.ts` creates those tables, indexes, foreign keys, a capacity-update guard and the under-supervision project state.

The service locks participating users in UUID order, then the group and project before modifying requests or pairings. Confirmations sharing a supervisor serialize on that supervisor's user/profile locks. A partial unique index also prevents two active supervisors for the same project. Opportunity reservation updates share its row lock with opportunity edits. The capacity database trigger prevents a profile update from making capacity lower than active reservations. API writes use parameterized SQL through TypeORM's transaction manager.

`assertDocumentAccess` is the effective permission check used by the [Phase 6 private submission and file routes](SUBMISSIONS.md). Activity now also records proposal submissions and version-specific review decisions. Milestone events are also recorded in activity.
