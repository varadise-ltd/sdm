-- Organization and project access model.
-- Existing installations are moved into one default organization; future
-- projects can belong to any organization without changing the SDM register.

CREATE TABLE IF NOT EXISTS organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    timezone    text NOT NULL DEFAULT 'Asia/Hong_Kong',
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organizations_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$')
);

INSERT INTO organizations (code, name, timezone)
VALUES ('COSMOS', 'COSMOS', 'Asia/Hong_Kong')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE projects
   SET organization_id = (SELECT id FROM organizations WHERE code = 'COSMOS')
 WHERE organization_id IS NULL;
ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_organization_id_fkey') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS projects_organization_idx ON projects (organization_id, status, created_at);

CREATE TABLE IF NOT EXISTS organization_memberships (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_slug       text NOT NULL DEFAULT 'org_member' CHECK (role_slug IN ('org_owner', 'org_admin', 'org_member')),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_user_idx ON organization_memberships (user_id, active);

INSERT INTO organization_memberships (organization_id, user_id, role_slug)
SELECT DISTINCT p.organization_id, pm.user_id,
       CASE WHEN bool_or(pm.role_slug IN ('contractor_pm', 'document_controller'))
            THEN 'org_admin' ELSE 'org_member' END
  FROM project_memberships pm
  JOIN projects p ON p.id = pm.project_id
 GROUP BY p.organization_id, pm.user_id
ON CONFLICT (organization_id, user_id) DO UPDATE
   SET role_slug = CASE WHEN organization_memberships.role_slug = 'org_owner'
                        THEN organization_memberships.role_slug
                        WHEN EXCLUDED.role_slug = 'org_admin' THEN 'org_admin'
                        ELSE organization_memberships.role_slug END,
       active = true;

ALTER TABLE project_memberships ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_memberships_permissions_object') THEN
    ALTER TABLE project_memberships ADD CONSTRAINT project_memberships_permissions_object
      CHECK (jsonb_typeof(permissions) = 'object');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS project_memberships_user_project_idx ON project_memberships (user_id, project_id, active);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();
DROP TRIGGER IF EXISTS organization_memberships_set_updated_at ON organization_memberships;
CREATE TRIGGER organization_memberships_set_updated_at BEFORE UPDATE ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();

INSERT INTO schema_migrations (version)
VALUES ('010_organizations_project_access')
ON CONFLICT (version) DO NOTHING;
