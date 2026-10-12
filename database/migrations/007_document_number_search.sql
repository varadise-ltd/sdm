-- Include configured document numbers in the full-text search projection.
-- This is separate from the original search migration so existing volumes
-- receive the new number field without rebuilding the database.
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
            c.document_number,
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
VALUES ('007_document_number_search')
ON CONFLICT (version) DO NOTHING;
