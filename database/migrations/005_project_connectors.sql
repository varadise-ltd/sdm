-- Project-scoped external drive connector configuration.
--
-- SDM owns the authoritative document repository. Connectors are optional
-- references to external drives and do not replace the local CDE. Secrets are
-- deliberately represented by a secret-manager reference; raw access tokens,
-- client secrets, and passwords must never be stored in this table.
CREATE TABLE IF NOT EXISTS project_connectors (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                  text NOT NULL,
    provider              text NOT NULL CHECK (provider IN (
        'cosmos_drive', 'google_drive', 'sharepoint', 'onedrive',
        'dropbox', 'box', 's3', 'webdav'
    )),
    status                text NOT NULL DEFAULT 'disabled' CHECK (status IN (
        'disabled', 'pending_auth', 'ready', 'error'
    )),
    endpoint_url          text,
    external_drive_id     text,
    account_label         text,
    config                jsonb NOT NULL DEFAULT '{}'::jsonb,
    credential_ref        text,
    last_tested_at        timestamptz,
    last_error            text,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, name),
    CONSTRAINT project_connectors_name_nonempty CHECK (length(btrim(name)) BETWEEN 2 AND 120),
    CONSTRAINT project_connectors_endpoint_no_credentials CHECK (
        endpoint_url IS NULL OR endpoint_url !~* '^https?://[^/]*@'
    ),
    CONSTRAINT project_connectors_config_object CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT project_connectors_credential_ref_no_whitespace CHECK (
        credential_ref IS NULL OR (length(credential_ref) BETWEEN 3 AND 255 AND credential_ref !~ '\s')
    )
);

CREATE INDEX IF NOT EXISTS project_connectors_project_idx
    ON project_connectors (project_id, status, provider, updated_at DESC);

DROP TRIGGER IF EXISTS project_connectors_set_updated_at ON project_connectors;
CREATE TRIGGER project_connectors_set_updated_at
BEFORE UPDATE ON project_connectors
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();

INSERT INTO schema_migrations (version)
VALUES ('005_project_connectors')
ON CONFLICT (version) DO NOTHING;
