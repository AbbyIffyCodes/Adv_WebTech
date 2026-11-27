# Dashboards and notifications

These endpoints return JSON for the frontend planned next term. Import `ResearchFlow-Phase9-Dashboards.postman_collection.json`, set the existing coordinator password privately in Variables, and send 01–15. All return 200 except 13, which intentionally returns 404 when the supervisor tries to mark a student's private notice read. Request 07 saves its notification ID automatically. If an imported variable has a local empty override, copy the notice's ID into `notificationId`.

Student dashboards show the current group's projects, approved milestone progress, group invitations, selection responses, assigned work and support responses due. Supervisor dashboards show active projects, total and reserved capacity, pending applications, open opportunities and reviews for which the supervisor still has document permission. Coordinator dashboards show administrative project progress, account totals, active pairings, reserved student places, unresolved cases and unanswered selection counts. Dashboards never include file storage names, proposal contents or review comments.

| Endpoint | Behavior |
| --- | --- |
| GET /dashboard | Current authenticated role's counts, up to 20 scoped project summaries and unread alert count |
| GET /dashboard/projects | Paginated scoped projects and approved milestone progress |
| GET /notifications | Current user's inbox; optional unread=true/false and pagination |
| POST /notifications/refresh | Generate only the current user's due/overdue deadline notices |
| PATCH /notifications/:id/read | Mark own notice read; another user's ID returns 404 |
| PATCH /notifications/read-all | Mark only own notices read |

The student project scope is current group membership. The supervisor scope is active confirmed pairing. Coordinators receive administrative summaries, with unpublished titles hidden. Project and file APIs still enforce their own permissions; seeing a count or alert is not a document grant.

## How alerts are created

A PostgreSQL trigger creates generic in-app notices from committed activity events. The actor does not receive a duplicate notice for their own action. Current group members and relevant active supervisors receive workflow updates. Support events notify group members/coordinators without disclosing support cases to supervisors. Named grantees can receive access-change notices. Group invitation creation has its own recipient notice. Messages include event category only; case descriptions, review comments and full documents are not copied into notices.

The migration seeds generic notices for up to 1000 recent activity events from the past seven days, so an already completed local demonstration has a usable inbox. A unique user/deduplication key prevents event replay or repeated deadline refresh from creating duplicates. The background deadline loop runs every 60 seconds in development/production; it does not require Redis. Tests disable the loop and call refresh deterministically. Optional `ENABLE_DEADLINE_ALERTS=false` disables only the background interval; reading the dashboard/inbox or calling refresh still checks the current user's deadlines.

Selection responses and unfinished milestone deadlines within 24 hours or already overdue produce notices. Reminder counts do not classify submitted evidence awaiting supervisor review as overdue. Completed or submitted milestones and answered requests stop showing active deadline notices. Event notices remain historical and timestamped. No email, browser push, external message delivery or academic-system integration is included. Reminder generation runs while the backend is running and catches up on the next interval/read after downtime.

Read state is per recipient. Marking one user's inbox read does not change another's inbox. Unknown/foreign IDs are rejected. Generic historical notices may remain after a relationship ends, but accessing the corresponding project, case or file always checks current authorization again.

The eleventh migration creates notifications, indexes and event/invitation triggers. `modules/dashboard` contains role queries, private inbox controls and deadline refresh. Database event triggers keep alert creation in the same transaction as the underlying activity; rolled-back business actions do not leave alert rows.
