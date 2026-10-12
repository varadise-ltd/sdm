-- Project-scoped party registry. Parties remain reusable global organisations,
-- while this table controls which parties are available to each project.
CREATE TABLE IF NOT EXISTS project_parties (
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    party_id         uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, party_id)
);

CREATE INDEX IF NOT EXISTS project_parties_party_idx ON project_parties (party_id, active);

DROP TRIGGER IF EXISTS project_parties_updated_at ON project_parties;
CREATE TRIGGER project_parties_updated_at
BEFORE UPDATE ON project_parties
FOR EACH ROW EXECUTE FUNCTION sdm_set_updated_at();

-- Existing memberships are the authoritative initial project-party links.
INSERT INTO project_parties (project_id, party_id)
SELECT DISTINCT project_id, party_id
FROM project_memberships
ON CONFLICT (project_id, party_id) DO UPDATE SET active = true;
