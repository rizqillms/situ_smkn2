# Operational Safety — SITU SMKN 2 Rantau

## Confirmed requirements and hosting context
- The owner reports that entered records have disappeared after system updates/deployments.
- The owner has confirmed that the website is hosted on Railway Free.
- The existence of a Railway persistent volume, its attached service, mount path, active DATA_DIR value, and exact location of the current database are still unverified.
- Treat the current data source as operational data. Do not assume the GitHub repository contains or can reconstruct it.
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
- GPS accuracy remains separate from the 300-meter rule; the current implementation neither stores nor rejects by accuracy. Review device behavior and obtain an approved policy before adding any accuracy threshold.
- Use Asia/Makassar (WITA) for business-day and 08:00 lateness calculations.
- Record user-entered attendance notes/reasons and include them in monthly reports, consistent with the current workflow.

## Pre-deployment gate
- [x] Confirm exact school reference coordinates.
- [x] Confirm official 300-meter attendance radius.
- [x] Confirm current exception workflow is user-entered notes recorded for monthly reporting.
- [x] Confirm hosting provider: Railway Free.
- [ ] Verify Railway persistent volume exists and is attached to the production SITU service.
- [ ] Verify volume mount path and active DATA_DIR (recommended: mount /data and DATA_DIR=/data).
- [ ] Download a backup from the currently running service, including database and uploads.
- [ ] Verify backup archive and restore it on an isolated copy.
- [ ] Restore verified database and uploads to the persistent volume before switching DATA_DIR.
- [ ] Verify database integrity, record counts, uploaded file references, and application workflows after cutover.
- [ ] Set up off-site backup schedule and test restore.
- [ ] Review GPS accuracy handling (separate from the official 300-meter radius).
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
The repository contains application source only, not the operational database or uploaded files. The owner has reported data loss after updates, and Railway is now confirmed as the hosting provider, but the active persistent volume and current data location remain unverified. Stop production deployment changes until the data owner has downloaded a backup from the currently running service (or recovered the previous host disk/local database), verified it, and completed a restore test on an isolated copy.

The application must use one stable persistent DATA_DIR for both SQLite and uploads. The production startup guard refuses to create an empty database when initialized storage loses its database file. This guard reduces silent data resets but does not replace off-site backups or recover records already lost.
