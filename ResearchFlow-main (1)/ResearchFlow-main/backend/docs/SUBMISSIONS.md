# Submissions and reviews

Keep the confirmed Phase 5 pairing active. Supervision agreement and proposal approval are separate: the proposal becomes approved only when the current supervisor reviews a specific submission version and approves it.

## Postman demonstration

Import `postman/ResearchFlow-Phase6-Submissions.postman_collection.json`. Send requests 01–17 in order using your existing sample accounts. Request 04 uses the separate Amrin sample viewer created earlier; that account is an outsider to the demonstration group. Group members retain their own access.

For request 05, open Body > form-data. `revisionNote` must be Text. Two `files` rows must be File, selecting `Mayesha_Proposal_v1.pdf` and `Amrin_Dataset_v1.csv`. Imported file paths may need selecting again with Postman's file picker. Do not manually set Content-Type; Postman needs to generate the multipart boundary. Request 12 uses a text decision/comments and an optional feedback CSV file. Request 13 selects the v2 PDF. Request 15 uses JSON for a review with no attached files.

Expected: 01–04 return 200; 05 returns 201; 06 returns 200; 07 returns 403; 08–09 return 200; 10 returns 403; 11 returns 200; 12–13 return 201; 14 returns 200; 15 returns 201; 16–17 return 200. The PDF response may appear in Preview or as binary output. Use Postman's download action to save a local demonstration copy.

V1 receives revision-required feedback, v2 is submitted, then v2 is approved. Request 14 shows v1 still has its original files and feedback. Request 16 reports the latest version's proposal status. Leave the approved version and active pairing available for milestone work.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /projects/:projectId/submissions | Current leader submits multipart revisionNote and one or more files |
| GET | /projects/:projectId/submissions | Authorized version history and latest proposal state |
| GET | /submissions/:id | Authorized bundle, file metadata and version-specific reviews |
| POST | /submissions/:id/start-review | Current confirmed supervisor marks latest version under review |
| POST | /submissions/:id/reviews | Current supervisor decides revision_required or approved, with comments and optional review files |
| GET | /files/:id/download | Authorized attachment download |
| GET | /files/:id/preview | Authorized PDF/image preview |

All endpoints authenticate and recheck effective document access. A named coordinator grant allows reading, not submitting or reviewing. Only the current group leader submits proposals. Only the current confirmed supervisor with an unrevoked document grant reviews. Declined, ended, unrelated or revoked relationships cannot download. Current group members can read their own history. File routes use the parent's project permission and do not expose physical storage paths.

## File checks and storage

Allowed formats: PDF, DOCX, PPTX, XLSX, CSV, JPG/JPEG and PNG. Defaults: up to five files per request and five MiB per file. Optional environment settings `UPLOAD_MAX_FILES` (1–10), `UPLOAD_MAX_FILE_MB` (1–20) and `PRIVATE_UPLOAD_DIR` (default `uploads/private`) configure local limits. Default settings require no `.env` changes.

Validation checks allowed extension and content, rejects empty files and unsafe filenames, verifies PDF/image signatures, checks UTF-8 CSV content, and inspects Office archive structure, expected document parts, content types and decompression bounds. Encrypted, macro-bearing and unsupported Office archives are rejected. These are structural/type checks, not a malware scanner or a full PDF/image/Office renderer. Keep demonstration files from trusted sample sources.

Uploads stay in memory until route permission and DTO checks pass. Authorized writes use random storage names; original names, type, size and SHA-256 hashes are database metadata. There is no public upload-folder route. Download responses disable caching and set safe disposition and nosniff headers; inline previews also use a restrictive sandbox policy. DOCX/PPTX/XLSX/CSV are downloaded rather than rendered as HTML.

Version allocation and metadata/review writes serialize on the project inside a database transaction. Normal failures remove newly written files and roll database rows back. A process or machine crash between filesystem writes and database commit can leave an orphan file; filesystem/database storage is not a single atomic storage engine. No automatic cleanup deletes historical attachments. Back up the database and private folder together.

## Code

| File | Job |
| --- | --- |
| submissions.controller.ts | Multipart routes, protected downloads and preview headers |
| submission-upload.guard.ts | Checks project/role permissions before processing upload bodies |
| dto/submission.dto.ts | Validates revision notes, review decisions and comments |
| file-validation.ts | Checks supported extensions and file content |
| submissions.service.ts | Version numbering, permission checks, private storage, review transitions and activity |
| entities | Submissions, files and reviews |
| 1794880000000-CreateSubmissionsAndReviews.ts | Creates tables, version uniqueness and review-file relationships |

Before the first proposal upload, history reports draft. Uploaded versions move through submitted, under_review, revision_required or approved. Every review and its attachments belong to one version. Files are immutable through these APIs: send a new version to revise them. Phase 7 extends this model with [milestone evidence and approved progress](MILESTONES.md). Adding milestoneId to the multipart submission binds evidence to that task; each task has its own version sequence.
