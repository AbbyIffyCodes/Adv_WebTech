# Backend setup

The API uses NestJS 11, TypeORM and PostgreSQL. Redis is optional and disabled by default. The development demo was tested with Node.js 24 and PostgreSQL 18.

## Run locally

Open a terminal in backend and install the dependencies:

```powershell
npm.cmd install -g pnpm
pnpm.cmd install --frozen-lockfile
pnpm.cmd run setup:local
```

setup:local creates .env from .env.example and generates a JWT secret. Open .env and set your local database details:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_local_postgresql_password
DB_DATABASE=researchflow
PORT=5001
HOST=127.0.0.1
ENABLE_QUEUE=false
```

Keep the generated JWT_BEARER_SECRET. Do not commit .env.

In pgAdmin, create an empty database named researchflow. Then run:

```powershell
pnpm.cmd run migration:run
pnpm.cmd run build
pnpm.cmd run start:dev
```

There are eleven migrations. An up-to-date database has no pending migrations. TypeORM synchronization is disabled.

- Health: http://127.0.0.1:5001/health
- Swagger: http://127.0.0.1:5001/api

Keep one server process on port 5001. EADDRINUSE means another process is already using the port.

## Existing demo on another computer

Restore the database backup into an empty researchflow database and copy the matching uploads folder into backend. Set the laptop's own database password in .env. Run migrations and build, then start the server. Log in again in Postman for new tokens. Database records alone do not contain the uploaded file contents.

## Accounts and roles

Public registration creates students. To create the first coordinator, set COORDINATOR_NAME, COORDINATOR_EMAIL and COORDINATOR_PASSWORD locally, then run:

```powershell
pnpm.cmd run bootstrap:coordinator
```

Clear COORDINATOR_PASSWORD from .env afterwards. The coordinator can promote a registered account through PATCH /accounts/:id/role. The promoted account must log in again. Do not bootstrap accounts again after restoring the existing demo database.

## Account and profile routes

Registration, login, root and health are public. The other routes need a Bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /accounts | Register a student and create a profile |
| POST | /auth/login | Verify password and issue a JWT |
| GET | /auth/me | Read the signed-in account |
| POST | /auth/logout | Revoke all current tokens for this account |
| GET | /accounts | Coordinator lists accounts with pagination |
| GET | /accounts/:id | Owner/coordinator reads account |
| PATCH | /accounts/:id | Owner/coordinator updates name and email |
| DELETE | /accounts/:id | Coordinator deactivates an unassigned account |
| PATCH | /accounts/:id/role | Coordinator assigns a role; target must log in again |
| GET | /profiles | Paginated student/supervisor directory |
| GET | /profiles/:userId | Read a research profile |
| PATCH | /profiles/:userId | Edit your own bio and role-specific fields |
| POST | /profiles/:userId/tags | Add interests/skills |
| PATCH | /profiles/:userId/tags | Replace supplied interest/skill arrays; [] clears |
| POST | /profiles/:userId/work-links | Add a portfolio or publication link |
| PATCH | /profiles/:userId/work-links/:workLinkId | Edit your work link |
| DELETE | /profiles/:userId/work-links/:workLinkId | Delete your work link |

Profile directory filters include role, researchInterest, skill and seekingSupervisor. Lists use page and limit, with a maximum limit of 100. Interests and skills are stored as lowercase names.

## Postman

Import the collections from ../postman. They are numbered in workflow order. Set credentials in each collection's Variables tab; login scripts save tokens. Shared coordinator passwords and tokens are blank. Use your existing account password locally.

Skip registration or creation requests when reusing existing data. Expected 400, 401, 403, 404 and 409 responses test validation and access rules; check each request's test script. Upload requests may need files selected again using the file picker.

Module guides cover [groups](docs/GROUPS.md), [projects](docs/PROJECTS.md), [opportunities](docs/OPPORTUNITIES.md), [selection](docs/SELECTION.md), [submissions](docs/SUBMISSIONS.md), [milestones](docs/MILESTONES.md), [support](docs/SUPPORT.md) and [dashboards](docs/DASHBOARDS.md).

## Course requirements

See [the requirement mapping](docs/REQUIREMENTS.md). New passwords use bcrypt. Existing Argon2 accounts can log in and upgrade without losing demo data. The extra Requirements Check Postman collection uses separate temporary demo records.

## Checks

```powershell
pnpm.cmd test
pnpm.cmd run lint
pnpm.cmd run build
```

The default suite has 40 HTTP/validation tests using repository doubles. It runs without PostgreSQL or Redis. The separate PostgreSQL suite has 124 tests, including migration rollback/reapplication, joins, permissions, concurrent confirmations, private files and progress.

The PostgreSQL suite rolls back and recreates domain tables. Use an empty disposable test database, never the demonstration database:

```powershell
# First create an EMPTY database named researchflow_test_local in pgAdmin.
$env:RF_POSTGRES_TEST='1'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='5432'
$env:DB_USER='postgres'
$env:DB_DATABASE='researchflow_test_local'
# Set DB_PASSWORD privately in this terminal to your local password.
pnpm.cmd run test:postgres
Remove-Item Env:RF_POSTGRES_TEST,Env:DB_HOST,Env:DB_PORT,Env:DB_USER,Env:DB_DATABASE
# Also clear DB_PASSWORD from this terminal afterwards.
```

The runner rejects normal database names and non-local hosts. The file tests use a temporary upload directory. The suites passed during development: 164 tests in total, including 11 additional course-requirement checks.

## Project files

src/main.ts configures startup, validation and Swagger. src/app.module.ts registers modules and guards. Each feature in src/modules has its controller, DTOs, service and entities. Database changes are in src/database/migrations. Tests are in test.

Private files default to uploads/private, with five files per request and five MiB per file. See the submission guide for supported formats. There is no public uploads route. Back up the database and files together.

The [demo checklist](docs/FINAL-REVIEW.md) lists the presentation steps and current limits. The [team record](docs/TEAM-CONTRIBUTIONS.md) tracks contributions and module review.
