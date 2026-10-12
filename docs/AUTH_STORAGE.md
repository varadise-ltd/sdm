# SDM authentication and file storage

The API keeps identity and authorization on the server. A browser must never
choose its project membership or object-storage key.

## Authentication

`apps/web/lib/auth.ts` supports three modes:

- `SDM_AUTH_MODE=development` is an explicit role-testing mode. It resolves the
  seeded `SDM_DEV_USER_EMAIL` user and permits a request to override it with
  `x-sdm-user-email`. This mode is rejected by policy in production deployments.
- The Docker Desktop stack defaults to `SDM_AUTH_MODE=local`, which uses the
  `/login` page and opaque server sessions for normal local development.
- `SDM_AUTH_MODE=local` enables local email/password sign-in through
  `POST /api/auth/login`. Passwords are scrypt hashes, require at least eight
  characters plus uppercase, lowercase, and special characters, and are never
  returned. Sessions are opaque, HttpOnly, SameSite cookies backed by the
  `auth_sessions` table. `PATCH /api/auth/password` rotates the current user's
  password and revokes existing sessions.
- `SDM_AUTH_MODE=oidc` validates `Authorization: Bearer <JWT>` with the
  configured OIDC issuer, audience, and JWKS URL. The JWT `sub` is matched to
  `users.external_subject`, with email as a migration fallback. An identity
  must already be provisioned as an active SDM user before it receives access.

Keycloak compatibility uses the same OIDC verifier. `KEYCLOAK_ISSUER_URL` and
`KEYCLOAK_CLIENT_ID` can be used as aliases for the generic issuer and audience;
the default Keycloak JWKS endpoint is
`{issuer}/protocol/openid-connect/certs`. The COSMOS integration can therefore
move to a Keycloak realm by changing configuration and provisioning
`external_subject` values, without changing project authorization. Browser
sign-in is authorization-code PKCE: SDM generates state, nonce, and an S256
code verifier, validates them at the callback, exchanges the code server-side,
and creates the same opaque SDM session cookie used by local auth. OIDC users
must already be provisioned by `external_subject`; SDM never falls back to an
unverified email claim. The optional local realm import is in
`infra/keycloak/cosmos-realm.json` and applies the required eight-character,
uppercase, lowercase, and special-character password policy.

Every project route calls `requireProjectMembership`, which verifies the
project is active, the user is active, the party is active, and (where needed)
the membership role is allowed. API responses intentionally avoid revealing
whether a project exists to users without membership.

## Object storage

Files use an S3-compatible bucket. The server creates a random file UUID and
builds the key as `projects/{projectId}/files/{fileId}/{sanitizedFilename}`.
Clients receive a short-lived presigned PUT URL from:

`POST /api/projects/{projectCode}/files/presign`

After uploading, the client calls:

`POST /api/projects/{projectCode}/files/complete`

The API performs a `HeadObject` size check before the asset can be attached to
a draft or revision. Malware and text-index jobs remain pending until the
worker completes them. Downloads use a membership-checked short-lived GET
URL from:

`GET /api/projects/{projectCode}/files/{fileId}/download`

The local `storage` compose profile runs MinIO and creates the `sdm-files`
bucket. Production should set `S3_ENDPOINT` to the managed S3-compatible
service, use a dedicated bucket, rotate credentials, and grant the API only
object-level access to its prefix.

## External drive connectors

SDM's own PostgreSQL/object-storage repository remains authoritative for the
controlled register, revisions, workflows, and audit trail. Project managers
and document controllers can configure external drive references through
`/api/projects/{projectCode}/connectors` for COSMOS Drive, Google Drive,
SharePoint, OneDrive, Dropbox, Box, S3, or WebDAV. Connector records contain
provider metadata and an opaque `credentialRef` that points to a deployment
secret manager. Raw passwords, access tokens, refresh tokens, and client
secrets are rejected by the API and are never returned to the browser.

