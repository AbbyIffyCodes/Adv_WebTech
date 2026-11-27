# ResearchFlow

Advanced Web Technologies project, AIUB.

ResearchFlow helps student groups find supervisors and manage research work. Students form a group and publish a short project summary. A supervisor and group leader confirm supervision before sharing private proposal files. The group then submits revisions and milestone evidence for review. Coordinators can help with support cases and suggest alternatives.

This repository contains the backend. The frontend is planned for the final term.

## Features

- Student, supervisor and coordinator accounts with JWT login and role checks.
- Research profiles, skills, interests, groups and membership invitations.
- Projects and supervisor opportunities with search filters.
- Applications, supervision invitations, capacity checks and document consent.
- Private file uploads, submission versions and supervisor feedback.
- Milestones, deadlines and progress based on approved work.
- Coordinator support cases, role dashboards and in-app notifications.

## Setup

Use [backend/README.md](backend/README.md) for installation, configuration and test commands. The local demo was tested with Node.js 24 and PostgreSQL 18. The backend uses NestJS and TypeORM; Redis is optional.

After configuring the database, run these from backend:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run setup:local
pnpm.cmd run migration:run
pnpm.cmd run start:dev
```

Swagger: http://127.0.0.1:5001/api

## API testing

The postman folder contains nine workflow collections and a requirements-check collection, numbered in workflow order. Test files for uploads are in postman/samples. Collection variables hold local credentials and IDs; login requests save tokens automatically.

Automated checks passed 164 tests: 40 HTTP/validation tests and 124 PostgreSQL integration tests. The PostgreSQL suite uses a disposable database because it recreates tables. See the backend guide before running it. The build and main Postman workflows were also checked during development.

## Demo and team notes

- [Demo checklist and limits](backend/docs/FINAL-REVIEW.md)
- [Team and contribution record](backend/docs/TEAM-CONTRIBUTIONS.md)
- [Course requirement mapping and remaining submission work](backend/docs/REQUIREMENTS.md)
- Module guides are in backend/docs.

Local .env settings, database data and uploaded documents are not in GitHub. To move an existing demo, transfer its database backup and matching uploads folder privately. Do not commit passwords or tokens.

The tools/install-local.cjs script is for copying updates to the original local AWT-Project folder. It preserves local settings and dependencies and backs up changed files. A fresh checkout can use the setup guide directly.
