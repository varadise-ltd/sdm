# Production readiness gate

The code in this workspace is a working P0 service, not a static screen. The
local stack persists project data in PostgreSQL, stores files through the
private-storage adapter, enforces project/party/role access in the API, and
records lifecycle events in an immutable audit table.

Implemented in the current slice:

- ISO 19650-style numbering is allocated only during transactional submission.
- Open drafts, file presign/upload/complete/attachment, revisions, workflow
  steps, timestamped e-signatures, verification codes, tasks, alerts,
  transmittals, client A/C/D decisions, drawing endorsements, DWSS form
  numbering, custom tags, full-text search, audit reads, metadata updates, and
  revision file browsing use persisted APIs.
- Internal Shared and private draft/file access is filtered server-side.
- Clean malware-scan status is required for downloads and submission; local
  development uses the explicit `SDM_FILE_SCAN_MODE=development` release path.
- The browser register is API-backed and the BIM viewer loads an authorized optimized model asset
  through the same download ACL.

Before a production deployment is approved, configure and verify:

1. OIDC issuer, audience, JWKS, user provisioning, session/token delivery, and
   MFA policy. The local identity header must remain disabled.
2. S3-compatible private storage with encryption, lifecycle/retention rules,
   backups, and a tested restore procedure.
3. A production antivirus scanner and worker adapter. Do not use the local
   development release path in production.
4. IFC-to-XKT conversion, PDF/preview generation, OCR/text extraction, and
   notification adapters for the file classes the project accepts.
5. A renderer license and distribution decision compatible with the deployment model.
6. End-to-end permission, workflow, backup/restore, accessibility, load, and
   disaster-recovery tests against the pilot project's approved ISO code lists.

The production Docker compose file intentionally requires OIDC, S3, and the
production scan mode instead of silently falling back to local development
behavior.
