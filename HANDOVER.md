# SDM handover

**Date:** 2026-10-12  
**Repository:** COSMOS Smart Document Management (SDM)  
**Current state:** Working P0 application foundation; suitable for local Docker evaluation and continued development. It is not production-approved.

## What is here

SDM is a Next.js/TypeScript web client and API backed by PostgreSQL, a private file-storage adapter, and a background worker. The current P0 slice includes:

- ISO 19650-style document register, library/folder views, detail drawer, revisions, metadata, tags, search, audit history, and exports.
- Draft creation, file presign/upload/verification/attachment, transactional submission, container numbering, and `P01` revision creation.
- Configurable project numbering, parties, users, memberships, roles, workflow templates and steps.
- Workflow task/signature progression, alerts, transmittals, Client `A`/`C`/`D` decisions, RTC/resubmission, drawing endorsements, and DWSS form records.
- Server-side project/party/role authorization and local password sessions, with OIDC/Keycloak support behind configuration.
- Local filesystem storage or S3-compatible storage, plus an authorized BIM asset viewer boundary.

The authoritative product data remains in SDM’s PostgreSQL/object-storage repository. COSMOS Drive, Google Drive, SharePoint and other connectors are project-scoped references; they do not replace SDM’s register or audit trail.

## Start locally

From the repository root, with Docker Desktop running:

```powershell
docker compose --project-name sdm up -d
docker compose --project-name sdm ps
```

With the checked-in `.env`, open `http://localhost:3001/`. Useful checks are:

```text
http://localhost:3001/api/health
http://localhost:3001/api/projects
http://localhost:3001/api/containers
http://localhost:3001/api/search?project=P001&q=site
```

The default local account is `pm.project001@sdm.local` with password `SdmLocal!1`. Change it before sharing the environment. Seeded role accounts used by the smoke flow are documented in `scripts/smoke-backend.mjs`.

The stack creates `SDM` (web/API), `SDM-db` (PostgreSQL 16), and `SDM-worker`. The optional `storage` profile starts MinIO; the default development mode uses `.local-storage/`.

## Verification

The end-to-end API acceptance flow is in `scripts/smoke-backend.mjs`. After the stack is running, execute it inside the app container:

```powershell
docker exec -w /workspace SDM node scripts/smoke-backend.mjs
```

The smoke flow covers health, permission filtering, draft creation, file upload/verification, submission, workflow signatures, transmittal, Client `C`, and `P02` resubmission. It creates uniquely named test records in the seeded `P001` project.

For a production build check:

```powershell
docker exec -e NODE_ENV=production -w /workspace SDM npm run build
```

Host-side `npm run lint` and `npm run build` were not runnable during handover because `npm` is not installed on the host; use the container commands above.

## Database and configuration

Fresh PostgreSQL volumes apply the bootstrap scripts, migrations `001` through `011`, and `database/seeds/001_mvp_seed.sql`. Existing volumes can be migrated with the commands in [README.md](README.md).

Important configuration boundaries:

- Local development: `SDM_AUTH_MODE=local`, `S3_STORAGE_MODE=filesystem`, `SDM_FILE_SCAN_MODE=development`.
- Production: `SDM_AUTH_MODE=oidc`, a real OIDC/Keycloak issuer and JWKS, S3-compatible private storage, and a production malware scanner. Do not carry the local identity header or development scan release path into production.
- OIDC users must be provisioned in SDM with the matching `external_subject`; an email claim alone must not grant access.
- Connector records store secret-manager references (`credentialRef`), never raw passwords, tokens, or client secrets.

## Production blockers

Before deployment approval, the receiving team must configure and test real OIDC/MFA, S3 encryption/retention/backups and restore, antivirus scanning, IFC-to-XKT conversion, PDF/preview generation, OCR, notifications, accessibility/load/permission isolation tests, disaster recovery, and a renderer license compatible with the closed-source deployment model. These are called out in [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## Recommended next actions

1. Preserve the current workspace and create the first reviewable Git commit/branch; `git status` currently reports no commits and the project files are untracked.
2. Start Docker, run the smoke flow, and capture any failures as issues before changing domain behavior.
3. Resolve the Phase 0 product decisions in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md): container syntax/code lists, suitability transitions, workflow/signature rules, CDE rules, retention/search/notification policy, and integration contracts.
4. Configure the pilot’s real OIDC, storage, scanning, conversion and notification adapters, then rerun end-to-end and recovery tests.

## Key references

- [README.md](README.md) — setup, API surface, auth, storage, migrations, and deployment commands.
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) — delivery phases, domain invariants, first vertical slice, and decisions needed.
- [docs/AUTH_STORAGE.md](docs/AUTH_STORAGE.md) — authentication, authorization, storage, and connector contracts.
- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) — production gate and outstanding prerequisites.
- [scripts/smoke-backend.mjs](scripts/smoke-backend.mjs) — runnable acceptance flow.
- [apps/web/app/page.tsx](apps/web/app/page.tsx) — current register/application surface.

