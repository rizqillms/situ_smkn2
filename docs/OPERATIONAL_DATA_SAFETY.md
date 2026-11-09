# Operational Safety — SITU SMKN 2 Rantau

## Confirmed requirements
- Application is already used with real operational data.
- Production deployment has not started.
- Official attendance radius: 300 meters from the school's approved reference point.
- Approved school reference point: latitude -2.9317903, longitude 115.1820055.
- Official lateness threshold: 08:00 local school time.
- School timezone: Asia/Makassar (WITA).

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
- Store server-generated attendance timestamp; do not trust the client-provided clock or attendance date/time.
- Validate GPS accuracy and reject implausibly inaccurate readings according to a school-approved threshold. The numeric accuracy threshold is still awaiting confirmation.
- Use Asia/Makassar (WITA) for business-day and 08:00 lateness calculations.
- Preserve the school's exception policy for leave, sickness, holidays, and approved off-site duties; do not infer policy.

## Pre-deployment gate
- [x] Confirm exact school reference coordinates.
- [ ] Confirm acceptable GPS accuracy tolerance.
- [ ] Confirm how late arrivals, leave, sickness, holidays, and off-site work are handled.
- [ ] Create and restore-test a backup of the current database and uploads.
- [ ] Select persistent production database and file storage.
- [ ] Rotate all demo/default credentials and provision named accounts.
- [ ] Complete endpoint-by-endpoint authorization and upload review.
- [ ] Test migration and rollback on a sanitized copy.
- [ ] Obtain school approval for go-live and data handling.

## Current decision
The database and upload directory remain on the owner's local PC. Because the current system contains real data, feature development and security changes must be performed on an isolated copy. No live database migration or deployment is authorized by this document.
