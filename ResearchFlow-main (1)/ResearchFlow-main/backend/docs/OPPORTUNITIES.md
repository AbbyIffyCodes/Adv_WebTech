# Supervisor opportunities

An opportunity is a supervisor's recruitment post. It describes a research topic, selection criteria, required/preferred skills, student places and a response deadline. The post starts as an owner-only draft. Its owner opens applications explicitly. Signed-in users can browse eligible open posts and filter by research area, skill or supervisor.

## Postman walkthrough

Import `postman/ResearchFlow-Phase4-Opportunities.postman_collection.json`. Check collection Variables against the local sample accounts. The supervisor must already have been promoted by the coordinator and logged in again. This collection defaults to the previously created `supervisor@example.com` account and the Phase 3 sample student named Amrin. The supplied passwords are fake test defaults; replace them locally if your existing accounts differ. Do not register duplicate accounts or change their roles again.

Send 01–14 in order. Supervisor login stores its token and ID. Creating the post stores `opportunityId`; a pre-request script generates a deadline 30 days ahead. Amrin login stores a separate student token. The student receives 404 for the draft, then 200 after the supervisor opens it. Directory filtering matches either required or preferred skills and returns complete tag lists. Requests 09 and 10 intentionally return 403 and 400. Close and reopen demonstrate the post's state; keep it open at 14 for the next application stage.

## API and rules

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /opportunities | Supervisor creates a draft |
| DELETE | /opportunities/:id | Owner deletes an unused post; referenced posts return 409 |
| GET | /opportunities/mine | Supervisor's own drafts, open posts and closed history |
| GET | /opportunities | Open, unexpired posts with remaining places and active supervisor owners |
| GET | /opportunities/:id | Owner can read drafts; others can read previously opened posts of active supervisors |
| PATCH | /opportunities/:id | Owning supervisor edits details and criteria |
| PATCH | /opportunities/:id/status | Owning supervisor opens or closes applications |

All routes require authentication. Students, other supervisors and coordinators cannot edit a supervisor's post. DTOs reject forged supervisor IDs, status changes through ordinary edits, reservation counts, blank values, duplicate tags and null updates. Deadline timestamps must include a timezone and be in the future when created or changed. Expired posts stop accepting applications without depending on a background job. Extend the deadline before reopening one.

One place means one student, not one group. `places` is the post's limit, while the supervisor profile's capacity is the separate overall supervisor limit. The Phase 5 confirmation transaction checks and reserves both. `reservedPlaces` starts at zero and cannot be changed through opportunity-edit endpoints. Editing cannot reduce the post limit below existing reservations. A full post cannot be reopened. `acceptingApplications` reports whether post-level conditions permit applications; the selection module rechecks group eligibility and overall capacity separately.

Directory filters: `researchInterest=NLP`, `skill=Python`, `supervisorId=<UUID>`, `page=1`, `limit=20` (maximum 100). Public lists exclude drafts, closed posts, passed deadlines, full posts and inactive/demoted supervisors. Previously opened closed/expired posts remain readable by ID for context but report that applications are unavailable. No full proposal or private contact details appear in these responses.

## Implementation

| File | Job |
| --- | --- |
| src/modules/opportunities/dto/opportunity.dto.ts | Validate fields and normalize tags |
| src/modules/opportunities/opportunities.controller.ts | Route requests and restrict supervisor actions |
| src/modules/opportunities/opportunities.service.ts | Check owner identity, deadlines, places and post status |
| src/modules/opportunities/entities/opportunity.entity.ts | Define post and tag relationships |
| src/database/migrations/1794860000000-CreateOpportunities.ts | Create post, area-tag and required/preferred-skill join tables |
| test/opportunities.postgres.test.cjs | Exercise real PostgreSQL queries and permission/state rules |

Research areas reuse `research_interests`; both skill lists reuse `skills`. Transactions lock the owner and post during changes. SQL constraints reject invalid place counts and inconsistent publication states. The owner can delete an unused post with DELETE /opportunities/:id. Posts with reservations or research-history references return 409; close recruitment to keep their history.
