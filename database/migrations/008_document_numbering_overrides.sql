-- Editable sequence cursors and document-type-specific numbering systems.
-- The project-level configuration remains the default shared system. Overrides
-- are keyed by document_type_code and only replace the fields supplied in the
-- override; the API stores a complete normalized base config for each entry.
ALTER TABLE project_document_numbering
    ADD COLUMN IF NOT EXISTS sequence_next bigint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS document_type_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Keep the editable project cursor aligned with existing default scopes once
-- when upgrading an installation. Subsequent edits are explicit and are
-- applied by the settings API without silently rewinding unrelated scopes.
UPDATE project_document_numbering AS n
   SET sequence_next = scoped.minimum_next
  FROM (
    SELECT project_id, MIN(next_value) AS minimum_next
      FROM project_document_number_sequences
     WHERE sequence_key LIKE 'document:%'
     GROUP BY project_id
  ) AS scoped
 WHERE n.project_id = scoped.project_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'project_document_numbering_sequence_next_positive'
    ) THEN
        ALTER TABLE project_document_numbering
            ADD CONSTRAINT project_document_numbering_sequence_next_positive CHECK (sequence_next > 0);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'project_document_numbering_type_overrides_object'
    ) THEN
        ALTER TABLE project_document_numbering
            ADD CONSTRAINT project_document_numbering_type_overrides_object CHECK (jsonb_typeof(document_type_overrides) = 'object');
    END IF;
END;
$$;

INSERT INTO schema_migrations (version)
VALUES ('008_document_numbering_overrides')
ON CONFLICT (version) DO NOTHING;
