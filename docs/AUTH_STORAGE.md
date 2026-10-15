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

Files use private Huawei OBS, an S3-compatible bucket, or the local filesystem.
The server creates a random file UUID and builds the key as
`projects/{projectId}/files/{fileId}/{sanitizedFilename}`.

1. `POST /api/projects/{projectCode}/files/presign` reserves a file and returns
   a relative SDM upload URL. This API name is retained for compatibility; it no
   longer returns a cloud PUT URL or credentials. Batch reservations behave the
   same way.
2. `PUT /api/projects/{projectCode}/files/{fileId}/upload` authenticates the
   creator, streams the request to temporary server disk, enforces the declared
   size (up to 5 GB), and computes SHA-256. The server then uploads the staged
   file using Huawei's official Node.js OBS SDK or the S3 SDK. Cloud object size
   is verified before the database marks it uploaded. Retries reuse the same
   reservation, and stored assets cannot be replaced through the upload API.
3. `POST /api/projects/{projectCode}/files/complete` checks the stored size
   and, if provided, compares the client checksum with the server checksum.
   Completion is idempotent. Only stored files can be attached to a draft.
   Malware and text-index jobs wait for a successful upload.
4. `GET /api/projects/{projectCode}/files/{fileId}/download` returns a relative
   content URL, or redirects to it when `redirect=1`. The content route checks
   membership, document visibility, and a clean scan before streaming bytes
   from storage. `disposition=inline` is preserved for the BIM viewer. Browsers
   never need bucket CORS rules, cloud network access, or signed cloud URLs.

### Huawei OBS configuration

Set these environment variables on the SDM server and recreate the app:

```dotenv
S3_STORAGE_MODE=obs
OBS_ENDPOINT=https://obs.ap-southeast-1.myhuaweicloud.com
OBS_BUCKET=your-private-bucket
OBS_ACCESS_KEY_ID=your-server-access-key
OBS_SECRET_ACCESS_KEY=your-server-secret-key
# Optional for temporary credentials:
OBS_SECURITY_TOKEN=
OBS_TIMEOUT_SECONDS=900
```

Use your bucket's actual regional endpoint without a bucket name, object path,
or query string. `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, and `S3_SESSION_TOKEN` remain aliases. Existing
`S3_ENDPOINT` values ending in `.myhuaweicloud.com` or `.myhuaweicloud.cn`
automatically select the native OBS adapter unless filesystem mode is explicit.
OBS HTTPS certificate verification is enabled. Keep credentials in deployment
secrets, and grant only the needed object read/write/metadata permissions in
SDM's private prefix.

SDM performs authenticated server operations using the official SDK. Huawei's
[pre-signed URL reference](https://support.huaweicloud.com/intl/en-us/api-obs/obs_04_0011.html)
and [Node.js upload reference](https://support.huaweicloud.com/intl/en-us/sdk-nodejs-devg-obs/obs_29_0403.html)
describe the signing and object APIs; no signed upload URL is given to users.

`SDM_UPLOAD_TEMP_DIR` defaults to the operating system's temporary directory.
Provision enough disk space for concurrent uploads. Staged files are removed
on success or failure. Reverse proxies must permit upload bodies up to 5 GB
and allow enough request time for the browser transfer plus the cloud transfer.
A process crash may leave temporary files for the deployment's normal temp
cleanup. No file body is buffered in memory as a whole.

### Upgrade existing databases

Before starting this version of the app and worker, apply
`database/migrations/012_server_file_uploads.sql`. For the local Docker stack:

```powershell
docker exec SDM-db psql -U sdm -d sdm -v ON_ERROR_STOP=1 -f /opt/sdm/migrations/012_server_file_uploads.sql
docker compose up -d --force-recreate app worker
```

The additive migration preserves existing attached/verified assets and adds an
upload timestamp. New reservations remain unavailable until the server has
stored all bytes. Fresh Docker databases run it during bootstrap.

The local `storage` compose profile runs MinIO and creates the `sdm-files`
bucket. Use `S3_STORAGE_MODE=s3` for this adapter. The app's endpoint must be
reachable from the server (`http://storage:9000` inside the compose network).

## External drive connectors

SDM's own PostgreSQL/object-storage repository remains authoritative for the
controlled register, revisions, workflows, and audit trail. Project managers
and document controllers can configure external drive references through
`/api/projects/{projectCode}/connectors` for COSMOS Drive, Google Drive,
SharePoint, OneDrive, Dropbox, Box, S3, or WebDAV. Connector records contain
provider metadata and an opaque `credentialRef` that points to a deployment
secret manager. Raw passwords, access tokens, refresh tokens, and client
secrets are rejected by the API and are never returned to the browser.

