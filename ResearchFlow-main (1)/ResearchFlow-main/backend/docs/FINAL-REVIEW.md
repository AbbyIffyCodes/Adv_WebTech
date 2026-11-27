# Demo checklist

The backend build passed and the code was pushed to GitHub. Automated checks passed 164 tests: 40 HTTP/validation tests and 124 PostgreSQL tests. The main Postman workflows, including Phase 9, were checked during development.

## Before class

- Restore the demo database and copy its matching uploads folder to the laptop.
- Set the laptop's PostgreSQL credentials in its own .env.
- Build the backend and keep one server process on port 5001.
- Log in again in Postman and reselect files for upload requests.
- Check the active pairing, approved latest proposal and two-task plan with one completed task (50%).
- Download an existing PDF and check version and support-case history.
- Rehearse optional supervisor-invitation and coordinator grant/revoke requests if presenting them. They change pairing or access state.

## Demo order

1. Student login, group and published project summary.
2. Supervisor opportunity, pairing and reserved places.
3. Proposal versions, feedback and a denied outsider download.
4. Milestone evidence, review and calculated progress.
5. Coordinator suggestion and the leader's response.
6. Role dashboards and private notifications.

Keep passwords and tokens out of screenshots and Git commits. Back up the database and uploads together.

## Limits

The frontend is planned for next term. Email reminders, automatic recommendations, password reset, email verification and academic-system integration are not implemented. File checks validate supported structures but do not scan for malware. A crash can leave an orphan file; automatic cleanup is not implemented.

The leader uploads evidence for assigned members. Active supervision locks membership changes. A support suggestion does not change the pairing or document permission. Deadline reminders run while the backend is running and catch up on the next refresh.

The team work record is in [TEAM-CONTRIBUTIONS.md](TEAM-CONTRIBUTIONS.md).
