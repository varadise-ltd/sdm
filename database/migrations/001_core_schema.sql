-- SDM core relational foundation.
--
-- This migration intentionally uses ordinary text values with CHECK constraints
-- for workflow and CDE statuses. Project-specific code lists live in
-- project_code_values, while the bounded values below protect the P0 state
-- machine from invalid writes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version       text PRIMARY KEY,
    applied_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION sdm_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit events are immutable';
END;
$$;

CREATE TABLE IF NOT EXISTS role_catalog (
    slug             text PRIMARY KEY,
    display_name     text NOT NULL,
    description      text,
    is_client_role   boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parties (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,
    name             text NOT NULL,
    party_type       text NOT NULL CHECK (party_type IN (
        'contractor', 'client', 'subcontractor', 'supplier',
        'design_consultant', 'other'
    )),
    parent_party_id  uuid REFERENCES parties(id),
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT parties_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$')
);

CREATE TABLE IF NOT EXISTS users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email            citext NOT NULL UNIQUE,
    display_name     text NOT NULL,
    external_subject  text,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_external_subject_unique
    ON users (external_subject)
    WHERE external_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS projects (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,
    name             text NOT NULL,
    timezone         text NOT NULL DEFAULT 'Asia/Hong_Kong',
    status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'closed')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT projects_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$')
);

CREATE TABLE IF NOT EXISTS project_memberships (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    party_id         uuid NOT NULL REFERENCES parties(id),
    role_slug        text NOT NULL REFERENCES role_catalog(slug),
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id, party_id, role_slug)
);

CREATE TABLE IF NOT EXISTS project_code_values (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category         text NOT NULL,
    code             text NOT NULL,
    label            text NOT NULL,
    sort_order       integer NOT NULL DEFAULT 0,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, category, code),
    CONSTRAINT project_code_values_category_format CHECK (
        category ~ '^[a-z][a-z0-9_]{1,63}$'
    )
);

CREATE TABLE IF NOT EXISTS project_sequences (
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sequence_kind    text NOT NULL,
    next_value       bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
    PRIMARY KEY (project_id, sequence_kind)
);

CREATE OR REPLACE FUNCTION sdm_next_sequence(
    p_project_id uuid,
    p_sequence_kind text
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    allocated_value bigint;
BEGIN
    IF p_sequence_kind IS NULL OR p_sequence_kind !~ '^[a-z][a-z0-9_]{1,31}$' THEN
        RAISE EXCEPTION 'invalid sequence kind: %', p_sequence_kind;
    END IF;

    INSERT INTO project_sequences (project_id, sequence_kind)
    VALUES (p_project_id, p_sequence_kind)
    ON CONFLICT (project_id, sequence_kind) DO NOTHING;

    UPDATE project_sequences
       SET next_value = next_value + 1
     WHERE project_id = p_project_id
       AND sequence_kind = p_sequence_kind
     RETURNING next_value - 1 INTO allocated_value;

    IF allocated_value IS NULL THEN
        RAISE EXCEPTION 'project does not exist or sequence could not be allocated';
    END IF;
    RETURN allocated_value;
END;
$$;

CREATE TABLE IF NOT EXISTS containers (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    originator_party_id   uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title                 text NOT NULL CHECK (length(btrim(title)) > 0),
    document_type_code    text NOT NULL,
    is_drawing            boolean NOT NULL DEFAULT false,
    is_internal           boolean NOT NULL DEFAULT false,
    -- ISO 19650 field snapshots. Keeping snapshots protects identifiers when
    -- a project or party display name is later changed.
    iso_project_code      text,
    iso_originator_code   text,
    iso_volume_code       text,
    iso_level_code        text,
    iso_type_code         text,
    iso_role_code         text,
    iso_number            integer,
    internal_number       text,
    container_number      text GENERATED ALWAYS AS (
        CASE WHEN is_internal THEN NULL ELSE
            iso_project_code || '-' || iso_originator_code || '-' || iso_volume_code
            || '-' || iso_level_code || '-' || iso_type_code || '-' || iso_role_code
            || '-' || lpad(iso_number::text, 4, '0')
        END
    ) STORED,
    lifecycle_status      text NOT NULL DEFAULT 'active'
                          CHECK (lifecycle_status IN (
                              'active', 'superseded', 'withdrawn', 'archived'
                          )),
    latest_revision_id    uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT containers_external_or_internal_fields CHECK (
        (is_internal = true
         AND internal_number IS NOT NULL
         AND btrim(internal_number) <> ''
         AND iso_project_code IS NULL
         AND iso_originator_code IS NULL
         AND iso_volume_code IS NULL
         AND iso_level_code IS NULL
         AND iso_type_code IS NULL
         AND iso_role_code IS NULL
         AND iso_number IS NULL)
        OR
        (is_internal = false
         AND internal_number IS NULL
         AND iso_project_code IS NOT NULL
         AND iso_originator_code IS NOT NULL
         AND iso_volume_code IS NOT NULL
         AND iso_level_code IS NOT NULL
         AND iso_type_code IS NOT NULL
         AND iso_role_code IS NOT NULL
         AND iso_number IS NOT NULL
         AND iso_number > 0)
    ),
    CONSTRAINT containers_iso_code_format CHECK (
        (iso_project_code IS NULL OR iso_project_code ~ '^[A-Z0-9_-]{2,32}$')
        AND (iso_originator_code IS NULL OR iso_originator_code ~ '^[A-Z0-9_-]{2,32}$')
        AND (iso_volume_code IS NULL OR iso_volume_code ~ '^[A-Z0-9_-]{1,32}$')
        AND (iso_level_code IS NULL OR iso_level_code ~ '^[A-Z0-9_-]{1,32}$')
        AND (iso_type_code IS NULL OR iso_type_code ~ '^[A-Z0-9_-]{1,32}$')
        AND (iso_role_code IS NULL OR iso_role_code ~ '^[A-Z0-9_-]{1,32}$')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS containers_project_number_unique
    ON containers (project_id, container_number)
    WHERE container_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS containers_project_internal_number_unique
    ON containers (project_id, internal_number)
    WHERE internal_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS drafts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    creator_user_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owning_party_id       uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    title                 text NOT NULL CHECK (length(btrim(title)) > 0),
    document_type_code    text NOT NULL,
    is_drawing            boolean NOT NULL DEFAULT false,
    is_internal           boolean NOT NULL DEFAULT false,
    internal_category     text,
    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
    status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'submitted', 'expired', 'cancelled')),
    due_at                timestamptz NOT NULL,
    submitted_at          timestamptz,
    promoted_container_id uuid REFERENCES containers(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT drafts_internal_category_required CHECK (
        is_internal = false OR length(btrim(coalesce(internal_category, ''))) > 0
    ),
    CONSTRAINT drafts_submission_fields_consistent CHECK (
        (status = 'submitted' AND submitted_at IS NOT NULL AND promoted_container_id IS NOT NULL)
        OR status <> 'submitted'
    )
);

CREATE TABLE IF NOT EXISTS file_assets (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    storage_key           text NOT NULL UNIQUE,
    original_filename     text NOT NULL,
    mime_type             text NOT NULL,
    byte_size             bigint NOT NULL CHECK (byte_size >= 0),
    sha256_hex            text CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[a-f0-9]{64}$'),
    virus_scan_status     text NOT NULL DEFAULT 'pending'
                          CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'failed')),
    text_index_status     text NOT NULL DEFAULT 'pending'
                          CHECK (text_index_status IN ('pending', 'indexed', 'unsupported', 'failed')),
    extracted_text        text,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_revisions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id          uuid NOT NULL REFERENCES containers(id) ON DELETE RESTRICT,
    revision_sequence     integer NOT NULL CHECK (revision_sequence > 0),
    revision_code         text NOT NULL,
    suitability_code      text NOT NULL DEFAULT 'S0'
                          CHECK (suitability_code IN ('S0', 'S1', 'S2', 'S3', 'S4', 'A', 'B')),
    client_response_code  text NOT NULL DEFAULT 'Pending'
                          CHECK (client_response_code IN ('Pending', 'A', 'C', 'D')),
    cde_state             text NOT NULL DEFAULT 'WIP'
                          CHECK (cde_state IN ('WIP', 'Shared', 'Published', 'Archive')),
    workflow_status       text NOT NULL DEFAULT 'draft'
                          CHECK (workflow_status IN (
                              'draft', 'in_review', 'approved', 'submitted',
                              'published', 'returned', 'withdrawn'
                          )),
    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
    supersedes_revision_id uuid REFERENCES document_revisions(id) ON DELETE RESTRICT,
    submitted_by_user_id  uuid REFERENCES users(id) ON DELETE RESTRICT,
    submitted_at          timestamptz,
    published_at          timestamptz,
    is_current            boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (container_id, revision_sequence),
    UNIQUE (container_id, revision_code),
    CONSTRAINT document_revisions_code_format CHECK (revision_code ~ '^[A-Z][0-9]{2}$'),
    CONSTRAINT document_revisions_submission_consistency CHECK (
        (workflow_status IN ('submitted', 'published') AND submitted_at IS NOT NULL)
        OR workflow_status NOT IN ('submitted', 'published')
    ),
    CONSTRAINT document_revisions_publish_consistency CHECK (
        (workflow_status = 'published' AND cde_state = 'Published' AND published_at IS NOT NULL)
        OR workflow_status <> 'published'
    ),
    CONSTRAINT document_revisions_not_self_superseded CHECK (
        supersedes_revision_id IS NULL OR supersedes_revision_id <> id
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS document_revisions_one_current
    ON document_revisions (container_id)
    WHERE is_current;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'containers_latest_revision_fk'
          AND conrelid = 'containers'::regclass
    ) THEN
        ALTER TABLE containers
            ADD CONSTRAINT containers_latest_revision_fk
            FOREIGN KEY (latest_revision_id) REFERENCES document_revisions(id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS draft_files (
    draft_id              uuid NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    file_id               uuid NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT,
    sort_order             integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (draft_id, file_id)
);

CREATE TABLE IF NOT EXISTS revision_files (
    revision_id           uuid NOT NULL REFERENCES document_revisions(id) ON DELETE RESTRICT,
    file_id               uuid NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT,
    sort_order             integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_primary             boolean NOT NULL DEFAULT false,
    PRIMARY KEY (revision_id, file_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS revision_files_one_primary
    ON revision_files (revision_id)
    WHERE is_primary;

CREATE TABLE IF NOT EXISTS container_links (
    source_container_id   uuid NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    target_container_id   uuid NOT NULL REFERENCES containers(id) ON DELETE RESTRICT,
    link_type              text NOT NULL DEFAULT 'cross_reference',
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at             timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source_container_id, target_container_id),
    CONSTRAINT container_links_not_self CHECK (source_container_id <> target_container_id)
);

CREATE TABLE IF NOT EXISTS hub_links (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    container_id          uuid REFERENCES containers(id) ON DELETE CASCADE,
    revision_id           uuid REFERENCES document_revisions(id) ON DELETE CASCADE,
    source_hub             text NOT NULL CHECK (source_hub IN ('Photo Hub', 'Drawing Hub', 'Form Flow')),
    source_object_type    text NOT NULL,
    source_object_id      text NOT NULL,
    source_revision       text,
    link_url              text,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_links_target_required CHECK (container_id IS NOT NULL OR revision_id IS NOT NULL),
    UNIQUE (source_hub, source_object_type, source_object_id, source_revision)
);

CREATE TABLE IF NOT EXISTS workflow_templates (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug                  text NOT NULL,
    name                  text NOT NULL,
    active                boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug)
);

CREATE TABLE IF NOT EXISTS workflow_template_steps (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id           uuid NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    sequence_no           integer NOT NULL CHECK (sequence_no > 0),
    step_key              text NOT NULL,
    display_name          text NOT NULL,
    required              boolean NOT NULL DEFAULT true,
    required_role_slug    text REFERENCES role_catalog(slug),
    UNIQUE (template_id, sequence_no),
    UNIQUE (template_id, step_key)
);

CREATE TABLE IF NOT EXISTS workflow_instances (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id           uuid NOT NULL UNIQUE REFERENCES document_revisions(id) ON DELETE CASCADE,
    template_id           uuid NOT NULL REFERENCES workflow_templates(id) ON DELETE RESTRICT,
    status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'completed', 'returned', 'cancelled')),
    started_at            timestamptz,
    completed_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workflow_instances_completion_consistency CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR status <> 'completed'
    )
);

CREATE TABLE IF NOT EXISTS workflow_steps (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id  uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    sequence_no           integer NOT NULL CHECK (sequence_no > 0),
    step_key              text NOT NULL,
    display_name          text NOT NULL,
    required              boolean NOT NULL DEFAULT true,
    assigned_user_id      uuid REFERENCES users(id) ON DELETE RESTRICT,
    assigned_party_id     uuid REFERENCES parties(id) ON DELETE RESTRICT,
    status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'signed', 'skipped', 'rejected')),
    signature_reference   text,
    signed_at             timestamptz,
    signed_by_user_id     uuid REFERENCES users(id) ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_instance_id, sequence_no),
    UNIQUE (workflow_instance_id, step_key),
    CONSTRAINT workflow_steps_assignee_required CHECK (
        assigned_user_id IS NOT NULL OR assigned_party_id IS NOT NULL
    ),
    CONSTRAINT workflow_steps_signature_consistency CHECK (
        (status = 'signed' AND signed_at IS NOT NULL AND signed_by_user_id IS NOT NULL)
        OR status <> 'signed'
    )
);

CREATE TABLE IF NOT EXISTS transmittals (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    transmittal_number    text NOT NULL,
    direction             text NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
    sender_party_id       uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    recipient_party_id    uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'sent', 'received', 'closed', 'cancelled')),
    subject               text NOT NULL CHECK (length(btrim(subject)) > 0),
    sent_at               timestamptz,
    received_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, transmittal_number),
    CONSTRAINT transmittals_parties_distinct CHECK (sender_party_id <> recipient_party_id),
    CONSTRAINT transmittals_sent_consistency CHECK (
        (status IN ('sent', 'received', 'closed') AND sent_at IS NOT NULL)
        OR status IN ('draft', 'cancelled')
    ),
    CONSTRAINT transmittals_received_consistency CHECK (
        (status IN ('received', 'closed') AND received_at IS NOT NULL)
        OR status NOT IN ('received', 'closed')
    )
);

CREATE TABLE IF NOT EXISTS transmittal_items (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transmittal_id        uuid NOT NULL REFERENCES transmittals(id) ON DELETE CASCADE,
    revision_id           uuid NOT NULL REFERENCES document_revisions(id) ON DELETE RESTRICT,
    item_order            integer NOT NULL CHECK (item_order > 0),
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (transmittal_id, revision_id),
    UNIQUE (transmittal_id, item_order)
);

CREATE TABLE IF NOT EXISTS client_decisions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transmittal_item_id   uuid NOT NULL REFERENCES transmittal_items(id) ON DELETE RESTRICT,
    revision_id           uuid NOT NULL REFERENCES document_revisions(id) ON DELETE RESTRICT,
    response_code         text NOT NULL CHECK (response_code IN ('A', 'C', 'D')),
    resulting_suitability text NOT NULL CHECK (resulting_suitability IN ('A', 'S3')),
    response_comments     text,
    responded_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    responded_at          timestamptz NOT NULL DEFAULT now(),
    is_current            boolean NOT NULL DEFAULT true,
    UNIQUE (transmittal_item_id),
    CONSTRAINT client_decisions_revision_matches_item CHECK (
        response_code = 'A' AND resulting_suitability = 'A'
        OR response_code IN ('C', 'D') AND resulting_suitability = 'S3'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS client_decisions_one_current_revision
    ON client_decisions (revision_id)
    WHERE is_current;

CREATE TABLE IF NOT EXISTS tags (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                  text NOT NULL,
    slug                  text NOT NULL,
    tag_kind              text NOT NULL DEFAULT 'custom'
                          CHECK (tag_kind IN ('system', 'custom')),
    active                boolean NOT NULL DEFAULT true,
    created_by_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug),
    CONSTRAINT tags_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,63}$')
);

CREATE TABLE IF NOT EXISTS container_tags (
    container_id          uuid NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    tag_id                uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    applied_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    applied_at            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (container_id, tag_id)
);

CREATE TABLE IF NOT EXISTS drawing_endorsements (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id           uuid NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
    endorsement_type      text NOT NULL CHECK (endorsement_type IN ('IDC', 'ICE', 'Client')),
    status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'endorsed', 'rejected', 'withdrawn')),
    endorsed_by_user_id   uuid REFERENCES users(id) ON DELETE RESTRICT,
    endorsed_at           timestamptz,
    evidence_file_id      uuid REFERENCES file_assets(id) ON DELETE RESTRICT,
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT drawing_endorsements_signature_consistency CHECK (
        (status = 'endorsed' AND endorsed_by_user_id IS NOT NULL AND endorsed_at IS NOT NULL)
        OR status <> 'endorsed'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS drawing_endorsements_one_active_type
    ON drawing_endorsements (revision_id, endorsement_type)
    WHERE status IN ('pending', 'endorsed');

CREATE TABLE IF NOT EXISTS form_submissions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    project_code_snapshot text NOT NULL,
    module_code           text NOT NULL,
    form_year             integer NOT NULL CHECK (form_year BETWEEN 2000 AND 2200),
    sequence_no           integer NOT NULL CHECK (sequence_no > 0),
    form_number           text GENERATED ALWAYS AS (
        'DWSS-' || project_code_snapshot || '-' || module_code || '-' || form_year::text
        || '-' || lpad(sequence_no::text, 4, '0')
    ) STORED,
    source_record_id      text,
    status                text NOT NULL DEFAULT 'recorded'
                          CHECK (status IN ('recorded', 'superseded', 'void')),
    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, module_code, form_year, sequence_no),
    CONSTRAINT form_submissions_number_format CHECK (
        form_number ~ '^DWSS-[A-Z0-9_-]+-[A-Z0-9_-]+-[0-9]{4}-[0-9]{4}$'
    )
);

CREATE TABLE IF NOT EXISTS tasks (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
    assignee_party_id     uuid REFERENCES parties(id) ON DELETE CASCADE,
    task_type             text NOT NULL,
    target_type           text NOT NULL,
    target_id             uuid NOT NULL,
    status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled', 'expired')),
    due_at                timestamptz,
    completed_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tasks_assignee_required CHECK (assignee_user_id IS NOT NULL OR assignee_party_id IS NOT NULL),
    CONSTRAINT tasks_completion_consistency CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR status <> 'completed'
    )
);

CREATE TABLE IF NOT EXISTS alerts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type            text NOT NULL,
    target_type           text NOT NULL,
    target_id             uuid NOT NULL,
    message               text NOT NULL,
    read_at               timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            uuid REFERENCES projects(id) ON DELETE SET NULL,
    actor_user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    event_type            text NOT NULL,
    entity_type           text NOT NULL,
    entity_id             uuid,
    revision              bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at           timestamptz NOT NULL DEFAULT now(),
    request_id            text
);

DROP TRIGGER IF EXISTS audit_events_immutable_update ON audit_events;
CREATE TRIGGER audit_events_immutable_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION sdm_prevent_audit_mutation();

CREATE INDEX IF NOT EXISTS project_memberships_project_user_idx
    ON project_memberships (project_id, user_id);
CREATE INDEX IF NOT EXISTS containers_project_state_idx
    ON containers (project_id, is_internal, lifecycle_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS revisions_search_metadata_idx
    ON document_revisions USING gin (metadata);
CREATE INDEX IF NOT EXISTS drafts_owner_due_idx
    ON drafts (project_id, creator_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS workflow_steps_assignee_idx
    ON workflow_steps (assigned_user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS transmittals_project_status_idx
    ON transmittals (project_id, direction, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx
    ON audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_project_time_idx
    ON audit_events (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS file_assets_extracted_text_idx
    ON file_assets USING gin (to_tsvector('simple', coalesce(extracted_text, '')));

DROP TRIGGER IF EXISTS parties_set_updated_at ON parties;
CREATE TRIGGER parties_set_updated_at BEFORE UPDATE ON parties
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS projects_set_updated_at ON projects;
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS memberships_set_updated_at ON project_memberships;
CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON project_memberships
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS code_values_set_updated_at ON project_code_values;
CREATE TRIGGER code_values_set_updated_at BEFORE UPDATE ON project_code_values
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS containers_set_updated_at ON containers;
CREATE TRIGGER containers_set_updated_at BEFORE UPDATE ON containers
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS drafts_set_updated_at ON drafts;
CREATE TRIGGER drafts_set_updated_at BEFORE UPDATE ON drafts
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS revisions_set_updated_at ON document_revisions;
CREATE TRIGGER revisions_set_updated_at BEFORE UPDATE ON document_revisions
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS templates_set_updated_at ON workflow_templates;
CREATE TRIGGER templates_set_updated_at BEFORE UPDATE ON workflow_templates
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS instances_set_updated_at ON workflow_instances;
CREATE TRIGGER instances_set_updated_at BEFORE UPDATE ON workflow_instances
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS steps_set_updated_at ON workflow_steps;
CREATE TRIGGER steps_set_updated_at BEFORE UPDATE ON workflow_steps
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS transmittals_set_updated_at ON transmittals;
CREATE TRIGGER transmittals_set_updated_at BEFORE UPDATE ON transmittals
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS tags_set_updated_at ON tags;
CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON tags
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS endorsements_set_updated_at ON drawing_endorsements;
CREATE TRIGGER endorsements_set_updated_at BEFORE UPDATE ON drawing_endorsements
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS forms_set_updated_at ON form_submissions;
CREATE TRIGGER forms_set_updated_at BEFORE UPDATE ON form_submissions
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS tasks_set_updated_at ON tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();

INSERT INTO schema_migrations (version)
VALUES ('001_core_schema')
ON CONFLICT (version) DO NOTHING;
