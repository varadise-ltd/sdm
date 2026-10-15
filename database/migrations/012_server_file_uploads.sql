BEGIN;

ALTER TABLE file_assets ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

-- Retain access to existing verified or attached files. New reservations stay
-- quarantined until the server has stored and verified all bytes.
UPDATE file_assets fa SET uploaded_at = fa.created_at
 WHERE uploaded_at IS NULL
   AND (sha256_hex IS NOT NULL
        OR EXISTS (SELECT 1 FROM draft_files df WHERE df.file_id = fa.id)
        OR EXISTS (SELECT 1 FROM revision_files rf WHERE rf.file_id = fa.id));

COMMIT;
