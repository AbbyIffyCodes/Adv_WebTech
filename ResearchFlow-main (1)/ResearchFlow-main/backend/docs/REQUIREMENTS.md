# Course requirement checks

This checklist maps ResearchFlow to the CSC4161 project guide. Postman collections for the main workflows remain in postman. ResearchFlow-Requirements-Check.postman_collection.json covers the added account routes, group directory and opportunity deletion.

## CRUD modules

| Entity | Create | List | Read one | Update | Delete |
| --- | --- | --- | --- | --- | --- |
| Account | POST /accounts | GET /accounts (coordinator) | GET /accounts/:id (owner/coordinator) | PATCH /accounts/:id | DELETE /accounts/:id (coordinator, deactivate) |
| Group | POST /groups | GET /groups | GET /groups/:id | PATCH /groups/:id | DELETE /groups/:id (archive) |
| Project | POST /projects | GET /projects | GET /projects/:id | PATCH /projects/:id | DELETE /projects/:id (archive) |
| Opportunity | POST /opportunities | GET /opportunities; GET /opportunities/mine | GET /opportunities/:id | PATCH /opportunities/:id | DELETE /opportunities/:id |

Lists support page and limit. Private drafts remain restricted. A DELETE endpoint can refuse a conflicting operation with 409: active memberships/supervision block account deactivation, and referenced or reserved opportunities cannot be deleted. Closing recruitment preserves those opportunity records. Deactivated accounts and archived groups/projects retain history.

## Passwords

New accounts and coordinator bootstrap use bcrypt with cost 12. Existing Argon2 hashes remain verifiable and are upgraded after successful login. The compare-and-set update does not overwrite a concurrent hash change. Legacy passwords over 72 UTF-8 bytes remain on Argon2 to preserve login compatibility. New passwords over that byte limit return 400 instead of being silently truncated. Hashes are never included in API responses.

The existing demo accounts must log in after installation to upgrade their compatible hashes. No schema migration or password reset is needed for this update.

## Validation and errors

Create and update inputs use separate DTOs and class-validator rules. The global ValidationPipe checks types and rejects unexpected fields. Built-in HTTP exceptions return readable status/message/error bodies. The global filter maps duplicate and foreign-key conflicts to 409, constraint/input failures to 400 and unexpected failures to a generic 500. Stack traces and database details are not returned to the client.

## Transactions and rollback evidence

Selection confirmation changes capacity reservations, pairing, access grants, project/group state and activity inside one transaction. Sorted row locks and unique constraints protect concurrent confirmations.

The PostgreSQL file tests include a forced audit failure after new file and submission writes. They check that the API returns 500, new files are removed and the version count stays unchanged. This runs only in a disposable database and temporary upload directory. There is no failure-injection endpoint in the normal application.

Run the PostgreSQL suite only using the disposable-database instructions in the backend README. Test children disable telemetry and permit loopback network connections only. Capture the passing rollback test and before/after state for report evidence.

## Submission work still needed

- Formal report with background comparison, numbered requirements, measurable non-functional targets, use case and ER diagrams, normalization, API tables and real captioned screenshots.
- Cover details, each member's actual contribution and AI usage as required by the guide. Percentages must come from the members; the guide's sample values are not project data.
- Genuine work and Git commits from every member.
- Laptop installation, final manual requirements checks and a rehearsal of success and failure cases.

Optional features already present include custom decorators, Swagger, environment validation, migrations, shaped responses and transaction locking. Project activity records selected workflow actions; it is not an audit of every CRUD change with IP and before/after values. Real email delivery and general request-logging middleware are not implemented.
