# Coordinator support

Import the Phase 8 collection and set `coordinatorPassword` privately in its Variables tab to the existing bootstrap account's local password. This value is blank in the shared collection. Keep the current group, proposal, pairing and milestones intact.

Send requests 01–15 in order. A leader raises a concern, the coordinator reviews the permitted summary and suggests a future research direction, the leader accepts it for consideration, and the coordinator records the resolution. Requests 04/08 return 201, 07 returns 403, 10 returns 409, and all others return 200. No actual proposal or pairing is replaced by this demonstration.

Cases support declined requests, passed response deadlines, capacity concerns, unavailable supervisors and other concerns. Any current group student may raise a case, while the group leader represents the group when responding to suggestions. Coordinators can also raise administrative cases. An optional linked selection request must belong to the same project. If the case claims a linked request is declined or unanswered, its actual state/deadline is checked.

## Routes

| Route | Rule |
| --- | --- |
| POST /support/cases | Group member or coordinator raises a case |
| GET /support/cases | Students see their current group's cases; coordinators see the queue |
| GET /support/needs-attention | Coordinator sees unresolved cases plus declined/unanswered selection counts |
| GET /support/cases/:id | Group or coordinator sees the case, permitted summary and suggestions |
| POST /support/cases/:id/suggestions | Coordinator proposes exactly one supervisor, opportunity or research direction with a reason |
| POST /support/suggestions/:id/respond | Current leader accepts or declines with a reason |
| PATCH /support/cases/:id/status | Coordinator records review or resolution notes |
| POST /support/cases/:id/reopen | Leader or coordinator reopens a resolved case with a reason |

Lists are paginated, with optional `projectId` and `status` filters. The Needs Attention list is an administrative queue, not a document-access grant. It does not automatically create duplicate cases for every expired or declined selection request. Students or coordinators can open a case after reviewing those signals.

States: open, in_review, awaiting_student, resolved. Suggestions retain pending/accepted/declined response, reason, actor and time. A case cannot resolve while a student response is pending. Reopening preserves prior suggestions and activity.

Supervisor/opportunity alternatives are checked for an active supervisor and enough current student places for the whole group; an opportunity must be open and unexpired. This is advisory and reserves nothing. Acceptance rechecks current availability. Supervisor judgement still considers interests, preferred skills and other criteria. Required skill checks and all capacity reservation run again through the actual selection workflow.

An accepted suggestion does not change the project title, summary, documents, active supervisor, capacity reservations or access grants. A replacement supervisor still needs a fresh mutual agreement and explicit sharing consent; the old pairing must end first. A research-direction change must be prepared as a new proposal revision and reviewed. Coordinators receive only an approved limited summary and administrative records, not proposal files or feedback. Separate named consent is still required for document access.

Cases are limited to group members and coordinators. Supervisors do not automatically see a group's support concerns. The module has no API to force a pairing or consent on a student's behalf. Reasons and resolution history appear in project activity as administrative events; do not place full proposal text in case descriptions.

`modules/support` contains DTOs, case/suggestion entities, controller and service. Migration `1794900000000-CreateCoordinatorSupport.ts` creates both tables and enforces same-project selection links and exactly one suggestion target. Transactions serialize case, suggestion and response transitions with project/group changes.
