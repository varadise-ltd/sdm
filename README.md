# COSMOS Smart Document Management (SDM)

This repository contains the SDM application foundation for a deployable
document-control service: a Next.js web client and API, PostgreSQL schema,
controlled private object-storage adapter, background worker, and Docker
Desktop development environment.

The working P0 application is available in `apps/web`: an SDM repository with
the ISO 19650 CDE board, document register, library tree, detail drawer,
workflow/revision/activity views, draft creation, client decision actions,
linked-hub surfaces, and a BIM viewer entry point. The server APIs cover
the formal submission lifecycle, permission-filtered search, governed tags,
transmittals, client decisions, audit events, and secure file transfer.
External drive connections are project-scoped and audited; COSMOS Drive, Google
Drive, SharePoint, and S3-compatible locations are configured as sources that
can be referenced without replacing SDM's authoritative repository.

## Database choice

SDM uses PostgreSQL as its system-of-record database. It fits the product because SDM needs:

- Strong transactions for container numbering, workflow transitions, and Client decisions
- Relational modeling for projects, parties, roles, permissions, revisions, transmittals, and audit events
- JSONB for project-specific metadata and configurable ISO/DWSS code lists
- Built-in full-text search for the initial search implementation
- A clear path to a dedicated search index if document-scale search grows later

## Start with Docker Desktop

Install and start Docker Desktop, then run from this directory:

```powershell
docker compose --project-name sdm up -d
docker compose --project-name sdm ps
```

The project creates:

- `SDM`: Node.js development workspace
- `SDM-db`: PostgreSQL 16 database
- `SDM-postgres-data`: persistent database volume
- `SDM-network`: private application network
- `SDM-worker`: background worker heartbeat and future indexing/conversion jobs

The API workspace is mounted at `/workspace` inside `SDM`. PostgreSQL is available to the app at:

```text
postgresql://sdm:sdm_dev_password@db:5432/sdm
```

The database is exposed locally on port `5433` (the container still listens on
`5432`) and the API on port `3001` (the container still listens on `3000`).

The default development storage mode is a filesystem adapter at
`.local-storage/`, which keeps the stack self-contained. An S3-compatible
adapter is also implemented. If the local Docker registry permits the MinIO
images, start that optional profile with `docker compose --profile storage up
-d`; otherwise point `S3_ENDPOINT`, `S3_BUCKET`, and the access credentials at a
managed S3-compatible service for a deployment environment.

## Open the local application

With the compose stack running, open [http://localhost:3001/](http://localhost:3001/). The Next.js development server starts automatically in `SDM`.

The server-side database checks are available at:

- [http://localhost:3001/api/health](http://localhost:3001/api/health)
- [http://localhost:3001/api/projects](http://localhost:3001/api/projects)
- [http://localhost:3001/api/containers](http://localhost:3001/api/containers)
- [http://localhost:3001/api/search?project=P001&q=site](http://localhost:3001/api/search?project=P001&q=site)

The main lifecycle endpoints are:

- `POST /api/projects/{projectCode}/drafts` creates a private draft.
- `POST /api/projects/{projectCode}/drafts/{draftId}/submit` atomically allocates the ISO-style container ID and P01 revision, creates the formal workflow, and records the audit event.
- Project setup includes governed document-number configuration. Administrators can enable a custom prefix and suffix, add ordered field/value segments, choose the sequence scope levels (for example project + level), and set the sequence width/start. Numbers are allocated transactionally on submission and stored alongside the ISO 19650 snapshot; draft records never consume a number.
- `POST /api/projects/{projectCode}/transmittals` and `POST /api/projects/{projectCode}/transmittals/{id}/send` create and send controlled packages.
- `POST /api/projects/{projectCode}/client-decisions` records Client A/C/D decisions and applies the Published or RTC transition rules.
- `POST /api/projects/{projectCode}/files/presign`, `POST .../files/complete`, and `GET .../files/{fileId}/download` provide the authenticated upload/verification/download flow.
- `GET/POST/PATCH/DELETE /api/projects/{projectCode}/tags` and `GET/POST/DELETE /api/containers/{containerId}/tags` provide governed custom tags.
- `GET/POST/PATCH/DELETE /api/projects/{projectCode}/connectors` provides project-scoped external-drive configuration. Connector records store provider metadata and secret-manager references only; raw passwords, tokens, and client secrets are rejected and never returned.
- `GET/PATCH /api/projects/{projectCode}/settings`, plus the parties, users, and
  members resources, provide audited project setup and access administration for
  Project Managers and Document Controllers.
- `GET/POST/PATCH/DELETE /api/projects/{projectCode}/workflows` and its steps
  resources provide audited workflow-template setup, ordered ISO 19650 steps,
  role assignment, activation, and safe deactivation/deletion rules.
- `GET/PATCH/POST /api/projects/{projectCode}/tasks` supports assigned review
  work, completion, and traceable request-changes tasks.

Authentication is deliberately explicit. The Docker Desktop stack defaults to
`SDM_AUTH_MODE=local` and uses the `/login` page with the seeded local account.
The `development` mode is an explicit role-testing mode: it resolves the
seeded user in `SDM_DEV_USER_EMAIL` and accepts the `x-sdm-user-email` header.
A deployment must set `SDM_AUTH_MODE=oidc`, configure
`OIDC_ISSUER_URL`, `OIDC_AUDIENCE`, and `OIDC_JWKS_URL`, and provision matching
active users and memberships. The development fallback must not be enabled in
production.

For local password sign-in, set `SDM_AUTH_MODE=local` and call
`POST /api/auth/login` with an email and password. Passwords are scrypt-hashed
and must be at least eight characters with an uppercase letter, a lowercase
letter, and a special character. The seeded development account password is
`SdmLocal!1`; replace it before sharing the environment. `PATCH
/api/auth/password` changes the signed-in user's password and revokes existing
sessions. Local sessions use an HttpOnly, SameSite cookie and expire after
eight hours.

Keycloak is prepared as the future COSMOS identity provider. Set
`SDM_AUTH_MODE=oidc` with either the generic OIDC variables or the equivalent
`KEYCLOAK_ISSUER_URL`, `KEYCLOAK_CLIENT_ID`, and optional `KEYCLOAK_JWKS_URL`.
The default Keycloak JWKS endpoint is `/protocol/openid-connect/certs`. SDM
continues to authorize project roles from its own audited memberships after the
Keycloak token is verified. Browser sign-in uses authorization-code PKCE with
state and nonce validation. Provision a user with the exact Keycloak `sub` in
`external_subject`; an email claim alone cannot grant access. The optional
local Keycloak realm can be started with `KEYCLOAK_ADMIN_PASSWORD=... docker
compose --profile keycloak up -d keycloak`, then configure the callback URI
`http://localhost:3001/api/auth/oidc/callback`.

The schema and repeatable local seed are in
`database/migrations/001_core_schema.sql`,
`database/migrations/002_search_support.sql`,
`database/migrations/003_auth_sessions.sql`, `database/migrations/004_project_parties.sql`,
`database/migrations/005_project_connectors.sql`, `database/migrations/006_document_numbering.sql`, and
`database/seeds/001_mvp_seed.sql`. Fresh PostgreSQL volumes apply all migrations
automatically through `database/init/002_sdm_bootstrap.sh`. Apply the search
migration and seed to an existing development volume with:

```powershell
Get-Content -Raw database\migrations\001_core_schema.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
Get-Content -Raw database\migrations\002_search_support.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
Get-Content -Raw database\migrations\003_auth_sessions.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
Get-Content -Raw database\migrations\004_project_parties.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
Get-Content -Raw database\migrations\005_project_connectors.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
Get-Content -Raw database\migrations\006_document_numbering.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
Get-Content -Raw database\seeds\001_mvp_seed.sql | docker exec -i SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f -
```

For a production build check inside the container, use `NODE_ENV=production`:

```powershell
docker exec -e NODE_ENV=production -w /workspace SDM npm run build
```

For a deployment build, configure a real OIDC provider and S3-compatible
storage first, then run the application with `npm run start` and the worker with
`npm run worker`. The worker runs a durable heartbeat and the explicit local
development scan release path. A production deployment must provide an
antivirus scanner and OCR adapters behind this worker boundary before enabling
production file processing. IFC and XKT files can be previewed directly in the
browser; other uploaded CAD formats remain downloadable source files. Optional
model conversion and the BIM viewer also
require a production renderer licensing arrangement appropriate to the
deployment model.

The production image is reproducible with:

```powershell
docker build --target runner -t sdm-web:local .
docker compose -f docker-compose.production.yml up -d
```

The production compose file intentionally requires OIDC and S3 settings rather
than silently starting with the development identity or local file storage.

See [docs/AUTH_STORAGE.md](docs/AUTH_STORAGE.md) for the identity and object
storage contract and [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the full
delivery and acceptance plan.

## Functional checks

With the local application, database, worker, and seeded test accounts running:

```powershell
npm run lint
node scripts/smoke-backend.mjs
node scripts/smoke-files.mjs
npm run test:browser
npm run test:recovery
npm run test:workflow
```

The checks default to `http://localhost:3001`. Set `SDM_BASE_URL` when using
another local port. Browser tests use installed Microsoft Edge; `SDM_BROWSER`
can select another installed Playwright browser channel. These tests create
named local test records using small IFC and SVG fixtures. Screenshots and
results are saved under `artifacts/functional-checks/`, which is excluded from
Git.

The workflow check covers adding and editing single-letter step keys, length
limits, invalid input, and duplicate keys. It removes its inactive test template
after the run.

Docker development uses polling and a separate `.next-docker` directory so
Windows builds cannot overwrite its running development assets.

The browser suite checks real clicks, file selection, attachment scanning,
draft editing and submission, folder moves, IFC geometry, drawer controls,
navigation, batch uploads, filename search, exports, and logout. The recovery
suite interrupts one attachment request and verifies that retry creates only
one draft and uploads the file once. It also checks attaching files to an
existing draft and Client-role restrictions.

`predev` and `prebuild` copy the installed IFC parser's WASM runtime into public
assets. Models are parsed locally in the browser using the existing xeokit
renderer and its [WebIFC loader](https://xeokit.github.io/xeokit-sdk/docs/class/src/plugins/WebIFCLoaderPlugin/WebIFCLoaderPlugin.js~WebIFCLoaderPlugin.html).

## Stop the environment

```powershell
docker compose --project-name sdm down
```

The database volume is retained. To remove the local database data as well:

```powershell
docker compose --project-name sdm down -v
```
