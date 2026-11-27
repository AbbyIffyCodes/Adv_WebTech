# Projects

The leader creates a project for the group. It starts as a private draft. Publishing makes the title, research tags and short summary visible to signed-in users. Publishing does not confirm supervision or share the full proposal.

## Use the Postman collection

Import `postman/ResearchFlow-Phase3-Projects.postman_collection.json`. Its variables are separate from Phase 2. The leader email/password defaults match the original sample student; change them locally if needed. Keep the active group from Phase 2.

Send requests 01–14 manually in order. Request 01 logs the leader in, 02 saves the current group ID, 03 checks whether a project already exists, and 04 creates a draft and saves its ID. Skip 04 if 03 returned a project. Requests 05 and 06 create and log in a separate sample viewer named Amrin Shahwar. Skip registration if that sample email already exists, then log in with its correct local password. This is fake demonstration data, not Amrin's real account or a record of her work.

Request 07 expects 404 for the viewer reading an unpublished draft. Request 08 publishes the limited summary; 09 and 10 show successful viewing and filtering. Requests 11 and 12 deliberately return 403 and 400. Requests 13 and 14 demonstrate saving and reading changes.

For repeated demonstrations, an existing published project will make 07 return 200. Run optional request 15 to unpublish before demonstrating draft denial, then continue from 07. Optional requests 15–17 demonstrate withdrawing and restoring summary visibility. Leave the project and group available for the next feature.

## Endpoints and rules

| Method | Path | Behavior |
| --- | --- | --- |
| POST | /projects | Group leader creates a draft using groupId, title, sharedSummary and areaTags |
| GET | /projects/mine | Current student's active group project, or null |
| GET | /projects | Published, unarchived summaries; paginated, optional researchInterest filter |
| GET | /projects/:id | Current group members can read drafts/history; others can read only published active summaries |
| PATCH | /projects/:id | Current group leader edits title, limited summary and tags |
| PATCH | /projects/:id/summary-visibility | Leader explicitly sets published to true or false |
| DELETE | /projects/:id | Leader archives a project; history is retained |

All endpoints require authentication. A signed-in coordinator has no special draft access. Outsider requests for draft IDs return 404 rather than disclosing the draft. Unknown fields, including fullProposal, status, group reassignment and publication timestamps, are rejected. Names are 3–200 characters, summaries 1–1500, and tags 1–20 nonblank lowercase names using the existing research-interest vocabulary. Pagination is bounded at 100.

Implementation choice: a group has at most one unarchived project at a time. Archive the old project to start a replacement. A group with an active project cannot be archived until the project is archived first. Leadership transfer immediately transfers project management, while a member leaving loses draft access. An internal supervision-lock check prevents project archival while supervision is active.

## Code

| File | Responsibility |
| --- | --- |
| src/modules/projects/projects.controller.ts | Routes requests and applies role restrictions |
| src/modules/projects/dto/project.dto.ts | Validates and normalizes incoming data |
| src/modules/projects/projects.service.ts | Checks current membership/leadership, controls visibility and writes transactions |
| src/modules/projects/entities/project.entity.ts | Project fields and shared tag relationships |
| src/database/migrations/1794850000000-CreateProjects.ts | Projects and tag join table, workflow checks and active-project uniqueness |
| test/projects.postgres.test.cjs | PostgreSQL-backed privacy, permission, query and lifecycle tests |

The migration creates `projects` and `project_research_interests`. It reuses `research_interests`, rather than introducing a second tag vocabulary. Related changes run in transactions. User/group locks coordinate project creation with membership, role and group-archive changes. The database also rejects two active projects for one group and inconsistent status/publication/archive fields.
