-- Local authentication storage. Passwords are scrypt hashes and are never
-- returned by an API. OIDC/Keycloak users continue to use external_subject.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS auth_sessions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash     text NOT NULL UNIQUE,
    expires_at     timestamptz NOT NULL,
    revoked_at     timestamptz,
    ip_address     inet,
    user_agent     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_seen_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx ON auth_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS auth_sessions_cleanup_hint ON auth_sessions;
