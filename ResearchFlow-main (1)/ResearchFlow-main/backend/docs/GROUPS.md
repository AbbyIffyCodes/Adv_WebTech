# Research groups

A student creates a group and automatically becomes its leader and first member. The leader invites another student. That student joins only after accepting the invitation with their own login token. Each student can belong to only one active group.

## Postman walkthrough

1. Open the new collection's Variables tab. Check `baseUrl`, `leaderEmail`, `leaderPassword`, `memberEmail` and `memberPassword`. The leader must be an existing student. Default passwords are fake demo values; use your actual local test account password if different.
2. Send 01 to log the leader in. Its test script stores the leader token and ID automatically.
3. Send 02. If `group` is null, send 03 to create a group. If 02 returns an existing group, its ID is stored automatically: skip 03.
4. Send 04 once to register a new demo student. A 409 on a repeat means the email already exists: skip registration and use 05 with that account's correct password. Login stores the member's ID and token.
5. Send 06 to invite the student. Send 07 as that student to see the pending invitation. No membership has been created yet.
6. Send 08 to accept. Send 09 to confirm two members. Send 10 to edit the name as leader.
7. Send 11, 12 and 13. Expected responses are 403, 409 and 400. These are successful permission, membership and validation demonstrations.
8. Send 14 for invitation history. Save screenshots of useful responses without exposing tokens or passwords.

The optional folder demonstrates leadership transfer, leaving and archiving. Use it only when ready to release this demo group's memberships. After 15, the member is the new leader; 16 uses the former leader's token, and 17 uses the new leader's token. Archive preserves history and releases active memberships. Once the group has an active project, archive that project first or group archive returns 409. Keep the demonstration group for the next feature while developing.

## Endpoints

All group endpoints require authentication. Mutations require the student role; leader-only actions also check the user's ID against the group's current leader.

| Method | Path | Who and purpose |
| --- | --- | --- |
| POST | /groups | Student without an active group creates one |
| GET | /groups | Paginated active group summaries |
| GET | /groups/mine | Student reads their active group or null |
| GET | /groups/:groupId | Any authenticated user reads the public group summary |
| PATCH | /groups/:groupId | Leader edits name/description |
| POST | /groups/:groupId/invitations | Leader invites an active student by inviteeId |
| GET | /groups/:groupId/invitations | Leader reads paginated invitation history |
| GET | /groups/invitations/me | Student reads their own invitations |
| POST | /groups/invitations/:invitationId/accept | Named recipient accepts an unexpired pending invitation |
| POST | /groups/invitations/:invitationId/decline | Named recipient declines |
| DELETE | /groups/:groupId/invitations/:invitationId | Leader cancels a pending invitation |
| PATCH | /groups/:groupId/leader | Leader transfers leadership to an active member using leaderId |
| POST | /groups/:groupId/leave | A nonleader leaves |
| DELETE | /groups/:groupId/members/:userId | Leader removes another member |
| DELETE | /groups/:groupId | Leader archives the group |

Invitation lists accept `page` and `limit` (1 to 100). Invitations expire after seven days. A leader cannot leave until transferring leadership or archiving. A coordinator cannot promote an active group member to another role: the student must leave or archive first.

## Files and database

| File | Plain explanation |
| --- | --- |
| src/modules/groups/groups.controller.ts | Receives each request and selects the service method |
| src/modules/groups/dto/group.dto.ts | Checks names, lengths, IDs and pagination |
| src/modules/groups/groups.service.ts | Checks leader/recipient ownership and applies membership rules in transactions |
| src/modules/groups/entities | Defines groups, memberships and invitations |
| src/database/migrations/1794840000000-CreateResearchGroups.ts | Creates three tables, foreign keys, checks and indexes |
| src/modules/accounts/accounts.service.ts | Prevents role changes while the student has an active membership |
| test/groups.postgres.test.cjs | Exercises 25 group cases against real PostgreSQL and HTTP |

`research_groups` holds the name, leader and archive date. `group_members` connects students to groups; `left_at` is null while membership is active. `group_invitations` records the sender, recipient, expiry and response.

A transaction makes related changes succeed together or roll back together. User rows are locked in a consistent order before changing membership. A partial unique index on active `group_members.user_id` also blocks a student from joining two groups, including when acceptances arrive simultaneously. A deferred foreign key ensures a group's leader has a membership record. Leaving and archiving retain history rather than deleting it.

Public summaries include names and user IDs, but no email addresses, password hashes or private invitation history. Group invitations here are membership invitations, not supervisor selection invitations.
