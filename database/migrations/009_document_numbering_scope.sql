-- Keep the counter scope independent from the attributes rendered in a number.
-- Existing installations used the first sequence level for both purposes.
ALTER TABLE project_document_numbering
    ADD COLUMN IF NOT EXISTS sequence_scope text;

UPDATE project_document_numbering
   SET sequence_scope = COALESCE(NULLIF(sequence_scope, ''), sequence_levels->>0, 'project')
 WHERE sequence_scope IS NULL OR sequence_scope = '';

ALTER TABLE project_document_numbering
    ALTER COLUMN sequence_scope SET DEFAULT 'project';

ALTER TABLE project_document_numbering
    ALTER COLUMN sequence_scope SET NOT NULL;

ALTER TABLE project_document_numbering
    ALTER COLUMN sequence_scope SET NOT NULL;

ALTER TABLE project_document_numbering
    DROP CONSTRAINT IF EXISTS project_document_numbering_sequence_scope_format;

ALTER TABLE project_document_numbering
    ADD CONSTRAINT project_document_numbering_sequence_scope_format CHECK (
      sequence_scope ~ '^(project|originator|documentType|discipline|volume|level|role|drawing|category|party|custom:[a-z][a-z0-9_]{1,31})$'
    );

INSERT INTO schema_migrations (version)
VALUES ('009_document_numbering_scope')
ON CONFLICT (version) DO NOTHING;
