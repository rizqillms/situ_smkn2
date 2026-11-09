# Operational Safety — SITU SMKN 2 Rantau

## Confirmed requirements
- Application is already used with real operational data.
- Production deployment has not started.
- Official attendance geofence: 300 meters from the school's approved reference point.
- Approved school reference point: latitude -2.9317903, longitude 115.1820055.
- Official lateness threshold: 08:00 local school time.
- School timezone: Asia/Makassar (WITA).
- Current exception workflow: users enter an attendance note/reason; the system records that note for the monthly attendance report. Do not invent automatic leave/sick/holiday/off-site approval workflows.

## Non-negotiable data protection rules
1. Do not run destructive migrations, reset tables, reseed accounts, or replace the live database during development.
2. Before any schema change, create a timestamped backup of the SQLite database and uploaded files while the application is stopped or using a consistent SQLite backup mechanism.
3. Verify backup integrity and perform a restore test against a separate copy before approving migration.
4. Never commit database files, uploaded documents, credentials, tokens, or personal data to Git.
5. Work on a copy of the database using synthetic or anonymized records. Keep production data outside development and test environments.
6. Deploy only after a migration plan, rollback plan, persistent storage, access-control review, and backup/restore procedure are verified.

## Attendance implementation requirements
- The server must calculate distance from submitted coordinates to the approved school reference point (-2.9317903, 115.1820055); browser-only checks are not security controls.
- Reject attendance when coordinates are missing, invalid, out of range, or farther than 300 meters.
- The 300-meter rule is the official geofence radius. GPS measurement accuracy is a separate technical consideration; do not silently treat 300 meters as an accuracy threshold.
- Store server-generated attendance timestamp; do not trust the client-provided clock or attendance date/time.
- Browser GPS accuracy may be submitted and stored as metadata; no accuracy-based rejection is active. Review device behavior and define an approved policy before enforcing any threshold.
- Use Asia/Makassar (WITA) for business-day and 08:00 lateness calculations.
- Record user-entered attendance notes/reasons and include them in monthly reports, consistent with the current workflow.

## Pre-deployment gate
- [x] Confirm exact school reference coordinates.
- [x] Confirm official 300-meter attendance radius.
- [x] Confirm current exception workflow is user-entered notes recorded for monthly reporting.
- [ ] Review GPS accuracy handling (separate from the official 300-meter radius).
- [ ] Create and restore-test a backup of the current database and uploads.
- [ ] Select persistent production database and file storage.
- [ ] Rotate all demo/default credentials and provision named accounts.
- [x] Initial endpoint authorization and upload protections implemented; [ ] final manual review of every endpoint and role.
- [ ] Test migration and rollback on a sanitized copy.
- [ ] Obtain school approval for go-live and data handling.

## Implementation status
- Backend validates the official geofence and calculates attendance date/time in WITA.
- Teachers are restricted to their own employee and attendance records.
- Attendance notes are included in monthly aggregate and Excel export.
- Uploaded files require an authenticated request and uploads are size/extension limited.
- Backup endpoint creates a consistent SQLite snapshot and packages it together with the uploads directory as a ZIP.
- Automated tests use a temporary database and synthetic records only.

## Current decision
The database and upload directory remain on the owner's local PC. Because the current system contains real data, feature development and security changes must be performed on an isolated copy. No live database migration or deployment is authorized by this document. A backup/restore test using the real operational files must be performed by the data owner on a separate location before any production cutover.
