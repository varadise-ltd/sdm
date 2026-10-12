-- Project document-number configuration and scoped sequences.
-- The configuration is project-scoped and is applied when an open draft is submitted.
ALTER TABLE containers ADD COLUMN IF NOT EXISTS document_number text;
CREATE UNIQUE INDEX IF NOT EXISTS containers_project_document_number_unique
    ON containers (project_id, document_number)
    WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_document_numbering (
    project_id       uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    enabled          boolean NOT NULL DEFAULT true,
    prefix           text NOT NULL DEFAULT '',
    suffix           text NOT NULL DEFAULT '',
    separator        text NOT NULL DEFAULT '-',
    sequence_width   integer NOT NULL DEFAULT 4 CHECK (sequence_width BETWEEN 1 AND 12),
    sequence_start   bigint NOT NULL DEFAULT 1 CHECK (sequence_start > 0),
    sequence_levels  jsonb NOT NULL DEFAULT '["project"]'::jsonb,
    custom_fields    jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT project_document_numbering_prefix_length CHECK (length(prefix) <= 64),
    CONSTRAINT project_document_numbering_suffix_length CHECK (length(suffix) <= 64),
    CONSTRAINT project_document_numbering_separator_length CHECK (length(separator) BETWEEN 0 AND 8),
    CONSTRAINT project_document_numbering_levels_array CHECK (jsonb_typeof(sequence_levels) = 'array'),
    CONSTRAINT project_document_numbering_custom_fields_array CHECK (jsonb_typeof(custom_fields) = 'array')
);

CREATE TABLE IF NOT EXISTS project_document_number_sequences (
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sequence_key     text NOT NULL,
    next_value       bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
    PRIMARY KEY (project_id, sequence_key)
);

DROP TRIGGER IF EXISTS project_document_numbering_set_updated_at ON project_document_numbering;
CREATE TRIGGER project_document_numbering_set_updated_at
BEFORE UPDATE ON project_document_numbering
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();

CREATE OR REPLACE FUNCTION sdm_next_document_number_sequence(
    p_project_id uuid,
    p_sequence_key text,
    p_start_value bigint DEFAULT 1
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    allocated_value bigint;
BEGIN
    IF p_sequence_key IS NULL OR length(p_sequence_key) < 1 OR length(p_sequence_key) > 255 THEN
        RAISE EXCEPTION 'invalid document sequence key';
    END IF;
    IF p_start_value IS NULL OR p_start_value < 1 THEN
        RAISE EXCEPTION 'invalid document sequence start';
    END IF;
    INSERT INTO project_document_number_sequences (project_id, sequence_key, next_value)
    VALUES (p_project_id, p_sequence_key, p_start_value)
    ON CONFLICT (project_id, sequence_key) DO NOTHING;
    UPDATE project_document_number_sequences
       SET next_value = next_value + 1
     WHERE project_id = p_project_id AND sequence_key = p_sequence_key
     RETURNING next_value - 1 INTO allocated_value;
    IF allocated_value IS NULL THEN
        RAISE EXCEPTION 'project does not exist or document sequence could not be allocated';
    END IF;
    RETURN allocated_value;
END;
$$;

-- Include the configured number in full-text search after the new column exists.
CREATE OR REPLACE FUNCTION sdm_refresh_container_search(p_container_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO container_search_documents (container_id, project_id, searchable_text, updated_at)
    SELECT c.id, c.project_id,
      concat_ws(' ', p.code, c.title, c.document_number, c.container_number, c.internal_number,
        c.document_type_code, c.iso_project_code, c.iso_originator_code, c.iso_volume_code,
        c.iso_level_code, c.iso_type_code, c.iso_role_code, c.lifecycle_status,
        string_agg(DISTINCT r.revision_code, ' '), string_agg(DISTINCT r.suitability_code, ' '),
        string_agg(DISTINCT r.client_response_code, ' '), string_agg(DISTINCT r.cde_state, ' '),
        string_agg(DISTINCT r.metadata::text, ' '), string_agg(DISTINCT t.name, ' '),
        string_agg(DISTINCT t.slug, ' '), string_agg(DISTINCT fa.original_filename, ' '),
        string_agg(DISTINCT fa.extracted_text, ' ')), now()
    FROM containers AS c
    JOIN projects AS p ON p.id = c.project_id
    LEFT JOIN document_revisions AS r ON r.container_id = c.id
    LEFT JOIN revision_files AS rf ON rf.revision_id = r.id
    LEFT JOIN file_assets AS fa ON fa.id = rf.file_id
    LEFT JOIN container_tags AS ct ON ct.container_id = c.id
    LEFT JOIN tags AS t ON t.id = ct.tag_id
    WHERE c.id = p_container_id
    GROUP BY c.id, p.code
    ON CONFLICT (container_id) DO UPDATE SET project_id = EXCLUDED.project_id,
      searchable_text = EXCLUDED.searchable_text, updated_at = EXCLUDED.updated_at;
END;
$$;

INSERT INTO schema_migrations (version)
VALUES ('006_document_numbering')
ON CONFLICT (version) DO NOTHING;
