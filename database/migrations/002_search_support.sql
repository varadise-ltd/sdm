-- Search projection for the SDM library.
-- The projection keeps PostgreSQL full-text search fast while the source tables
-- remain authoritative. Trigger refreshes are deliberately small and scoped to
-- the affected container.

CREATE TABLE IF NOT EXISTS container_search_documents (
    container_id       uuid PRIMARY KEY REFERENCES containers(id) ON DELETE CASCADE,
    project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    searchable_text    text NOT NULL DEFAULT '',
    search_vector      tsvector GENERATED ALWAYS AS (
        to_tsvector('simple'::regconfig, searchable_text)
    ) STORED,
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS container_search_documents_vector_idx
    ON container_search_documents USING gin (search_vector);

CREATE INDEX IF NOT EXISTS container_search_documents_project_idx
    ON container_search_documents (project_id, updated_at DESC);

CREATE OR REPLACE FUNCTION sdm_refresh_container_search(p_container_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO container_search_documents (
        container_id,
        project_id,
        searchable_text,
        updated_at
    )
    SELECT
        c.id,
        c.project_id,
        concat_ws(
            ' ',
            p.code,
            c.title,
            c.container_number,
            c.internal_number,
            c.document_type_code,
            c.iso_project_code,
            c.iso_originator_code,
            c.iso_volume_code,
            c.iso_level_code,
            c.iso_type_code,
            c.iso_role_code,
            c.lifecycle_status,
            string_agg(DISTINCT r.revision_code, ' '),
            string_agg(DISTINCT r.suitability_code, ' '),
            string_agg(DISTINCT r.client_response_code, ' '),
            string_agg(DISTINCT r.cde_state, ' '),
            string_agg(DISTINCT r.metadata::text, ' '),
            string_agg(DISTINCT t.name, ' '),
            string_agg(DISTINCT t.slug, ' '),
            string_agg(DISTINCT fa.original_filename, ' '),
            string_agg(DISTINCT fa.extracted_text, ' ')
        ),
        now()
    FROM containers AS c
    JOIN projects AS p ON p.id = c.project_id
    LEFT JOIN document_revisions AS r ON r.container_id = c.id
    LEFT JOIN revision_files AS rf ON rf.revision_id = r.id
    LEFT JOIN file_assets AS fa ON fa.id = rf.file_id
    LEFT JOIN container_tags AS ct ON ct.container_id = c.id
    LEFT JOIN tags AS t ON t.id = ct.tag_id
    WHERE c.id = p_container_id
    GROUP BY c.id, p.code
    ON CONFLICT (container_id) DO UPDATE
       SET project_id = EXCLUDED.project_id,
           searchable_text = EXCLUDED.searchable_text,
           updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_container_search_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM container_search_documents WHERE container_id = OLD.id;
        RETURN OLD;
    END IF;

    PERFORM sdm_refresh_container_search(NEW.id);
    IF TG_OP = 'UPDATE' AND OLD.id <> NEW.id THEN
        PERFORM sdm_refresh_container_search(OLD.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_revision_search_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    old_container_id uuid;
    new_container_id uuid;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        old_container_id := OLD.container_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        new_container_id := NEW.container_id;
    END IF;

    IF old_container_id IS NOT NULL THEN
        PERFORM sdm_refresh_container_search(old_container_id);
    END IF;
    IF new_container_id IS NOT NULL AND new_container_id IS DISTINCT FROM old_container_id THEN
        PERFORM sdm_refresh_container_search(new_container_id);
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_revision_file_search_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    revision_id_value uuid;
    container_id_value uuid;
BEGIN
    revision_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
    SELECT container_id INTO container_id_value
    FROM document_revisions WHERE id = revision_id_value;
    IF container_id_value IS NOT NULL THEN
        PERFORM sdm_refresh_container_search(container_id_value);
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_file_asset_search_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    file_id_value uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    container_id_value uuid;
BEGIN
    FOR container_id_value IN
        SELECT DISTINCT r.container_id
        FROM revision_files AS rf
        JOIN document_revisions AS r ON r.id = rf.revision_id
        WHERE rf.file_id = file_id_value
    LOOP
        PERFORM sdm_refresh_container_search(container_id_value);
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_container_tag_search_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM sdm_refresh_container_search(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.container_id ELSE NEW.container_id END
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sdm_tag_search_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    tag_id_value uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    container_id_value uuid;
BEGIN
    FOR container_id_value IN
        SELECT container_id FROM container_tags WHERE tag_id = tag_id_value
    LOOP
        PERFORM sdm_refresh_container_search(container_id_value);
    END LOOP;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS containers_search_refresh ON containers;
CREATE TRIGGER containers_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON containers
FOR EACH ROW EXECUTE FUNCTION sdm_container_search_trigger();

DROP TRIGGER IF EXISTS revisions_search_refresh ON document_revisions;
CREATE TRIGGER revisions_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON document_revisions
FOR EACH ROW EXECUTE FUNCTION sdm_revision_search_trigger();

DROP TRIGGER IF EXISTS revision_files_search_refresh ON revision_files;
CREATE TRIGGER revision_files_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON revision_files
FOR EACH ROW EXECUTE FUNCTION sdm_revision_file_search_trigger();

DROP TRIGGER IF EXISTS file_assets_search_refresh ON file_assets;
CREATE TRIGGER file_assets_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON file_assets
FOR EACH ROW EXECUTE FUNCTION sdm_file_asset_search_trigger();

DROP TRIGGER IF EXISTS container_tags_search_refresh ON container_tags;
CREATE TRIGGER container_tags_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON container_tags
FOR EACH ROW EXECUTE FUNCTION sdm_container_tag_search_trigger();

DROP TRIGGER IF EXISTS tags_search_refresh ON tags;
CREATE TRIGGER tags_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON tags
FOR EACH ROW EXECUTE FUNCTION sdm_tag_search_trigger();

DO $$
DECLARE
    container_id_value uuid;
BEGIN
    FOR container_id_value IN SELECT id FROM containers LOOP
        PERFORM sdm_refresh_container_search(container_id_value);
    END LOOP;
END;
$$;

INSERT INTO schema_migrations (version)
VALUES ('002_search_support')
ON CONFLICT (version) DO NOTHING;
