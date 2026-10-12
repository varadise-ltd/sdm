-- Persist the SDM library location independently from ISO 19650 document metadata.
-- Internal Shared and Archived are dynamic views, not assignable folders.
ALTER TABLE containers ADD COLUMN IF NOT EXISTS library_folder text;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS library_folder text;

UPDATE containers
SET library_folder = CASE
  WHEN is_drawing THEN 'Drawings'
  WHEN upper(document_type_code) IN ('FM','FRM','FORM','FORMS') THEN 'Forms'
  WHEN upper(document_type_code) IN ('TR','TX','TRANSMITTAL','TRANSMITTALS') THEN 'Transmittals'
  WHEN upper(document_type_code) IN ('PK','PKG','PACKAGE','PACKAGES') THEN 'Packages'
  ELSE 'Documents'
END
WHERE library_folder IS NULL;

UPDATE drafts
SET library_folder = CASE
  WHEN is_drawing THEN 'Drawings'
  WHEN upper(document_type_code) IN ('FM','FRM','FORM','FORMS') THEN 'Forms'
  WHEN upper(document_type_code) IN ('TR','TX','TRANSMITTAL','TRANSMITTALS') THEN 'Transmittals'
  WHEN upper(document_type_code) IN ('PK','PKG','PACKAGE','PACKAGES') THEN 'Packages'
  ELSE 'Documents'
END
WHERE library_folder IS NULL;

ALTER TABLE containers ALTER COLUMN library_folder SET DEFAULT 'Documents';
ALTER TABLE containers ALTER COLUMN library_folder SET NOT NULL;
ALTER TABLE drafts ALTER COLUMN library_folder SET DEFAULT 'Documents';
ALTER TABLE drafts ALTER COLUMN library_folder SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE containers ADD CONSTRAINT containers_library_folder_check CHECK (library_folder IN (
    'Documents','Documents/Project Information','Documents/Design','Documents/Construction','Documents/Commercial','Documents/Handover',
    'Drawings','Drawings/Architectural','Drawings/Structural','Drawings/MEP','Drawings/Civil',
    'Forms','Packages','Packages/Incoming','Packages/Outgoing','Transmittals'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE drafts ADD CONSTRAINT drafts_library_folder_check CHECK (library_folder IN (
    'Documents','Documents/Project Information','Documents/Design','Documents/Construction','Documents/Commercial','Documents/Handover',
    'Drawings','Drawings/Architectural','Drawings/Structural','Drawings/MEP','Drawings/Civil',
    'Forms','Packages','Packages/Incoming','Packages/Outgoing','Transmittals'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS containers_project_library_folder_idx
  ON containers (project_id, library_folder, updated_at DESC);
CREATE INDEX IF NOT EXISTS drafts_project_library_folder_idx
  ON drafts (project_id, library_folder, updated_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('011_document_library_folders')
ON CONFLICT (version) DO NOTHING;
