-- Repeatable local development seed for Project-001 and the MVP role model.
-- Every natural key uses ON CONFLICT so this file is safe to run repeatedly.

INSERT INTO role_catalog (slug, display_name, description, is_client_role)
VALUES
    ('contractor_pm',       'Contractor PM',       'Contractor project manager or staff member', false),
    ('document_controller', 'Document Controller', 'Controls registers, revisions, workflows and transmittals', false),
    ('subcontractor',       'Subcontractor',       'Subcontractor project user', false),
    ('supplier',            'Supplier',            'Supplier project user', false),
    ('design_consultant',   'Design Consultant',   'Design consultant project user', false),
    ('client_re_er',        'Client RE/ER',        'Client representative or engineer representative', true)
ON CONFLICT (slug) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_client_role = EXCLUDED.is_client_role;

INSERT INTO parties (code, name, party_type)
VALUES
    ('CON', 'COSMOS Contractor', 'contractor'),
    ('CLI', 'Project-001 Client', 'client'),
    ('SUB', 'Project-001 Subcontractor', 'subcontractor'),
    ('SUP', 'Project-001 Supplier', 'supplier'),
    ('DES', 'Project-001 Design Consultant', 'design_consultant')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    party_type = EXCLUDED.party_type,
    active = true;

INSERT INTO projects (code, name, timezone, status)
VALUES ('P001', 'Project-001', 'Asia/Hong_Kong', 'active')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    timezone = EXCLUDED.timezone,
    status = EXCLUDED.status;

INSERT INTO project_sequences (project_id, sequence_kind, next_value)
SELECT id, kind, 1
FROM projects
CROSS JOIN (VALUES ('container'), ('internal'), ('transmittal'), ('dwss')) AS kinds(kind)
WHERE code = 'P001'
ON CONFLICT (project_id, sequence_kind) DO NOTHING;

INSERT INTO project_code_values (project_id, category, code, label, sort_order)
SELECT p.id, v.category, v.code, v.label, v.sort_order
FROM projects AS p
CROSS JOIN (VALUES
    ('volume',          'ZZ', 'Project volume / zone', 10),
    ('level',           '01', 'Level 01', 10),
    ('document_type',   'DR', 'Drawing', 10),
    ('document_type',   'DC', 'Document / correspondence', 20),
    ('document_type',   'MS', 'Method statement', 30),
    ('role',            'A',  'Architectural / design role', 10),
    ('role',            'C',  'Contractor role', 20),
    ('suitability',     'S0', 'Work in progress', 0),
    ('suitability',     'S1', 'For coordination', 10),
    ('suitability',     'S2', 'For information', 20),
    ('suitability',     'S3', 'For review and comment', 30),
    ('suitability',     'S4', 'For construction', 40),
    ('suitability',     'A',  'Accepted / published', 50),
    ('suitability',     'B',  'Accepted with conditions', 60),
    ('client_response', 'Pending', 'Awaiting Client response', 0),
    ('client_response', 'A', 'Accepted', 10),
    ('client_response', 'C', 'Accepted with comments / revise', 20),
    ('client_response', 'D', 'Rejected / revise and resubmit', 30),
    ('cde_state',       'WIP', 'Work in progress', 10),
    ('cde_state',       'Shared', 'Shared for review', 20),
    ('cde_state',       'Published', 'Published / controlled', 30),
    ('cde_state',       'Archive', 'Archived / superseded', 40),
    ('form_module',     'RISCF', 'RISCF', 10),
    ('form_module',     'SITE_DIARY', 'Site Diary', 20),
    ('form_module',     'SAFETY_INSPECTION', 'Safety Inspection', 30),
    ('form_module',     'CLEANSING', 'Cleansing', 40)
) AS v(category, code, label, sort_order)
WHERE p.code = 'P001'
ON CONFLICT (project_id, category, code) DO UPDATE
SET label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    active = true;

INSERT INTO users (email, display_name, password_hash, password_updated_at)
VALUES
    ('pm.project001@sdm.local',       'Project-001 Contractor PM', 'scrypt$16384$8$1$CV3XH7Ohf9zhyL6I3jZEdw$IfEBDan48jlaUM7Kk-GrvtQUF_oat3WcG7fQZNWzJ3AqCw2Z0NAFVGA635TPYOpcZHe7pXHnJLVkavNO3snGGQ', now()),
    ('dc.project001@sdm.local',       'Project-001 Document Controller', 'scrypt$16384$8$1$CV3XH7Ohf9zhyL6I3jZEdw$IfEBDan48jlaUM7Kk-GrvtQUF_oat3WcG7fQZNWzJ3AqCw2Z0NAFVGA635TPYOpcZHe7pXHnJLVkavNO3snGGQ', now()),
    ('sub.project001@sdm.local',      'Project-001 Subcontractor User', 'scrypt$16384$8$1$CV3XH7Ohf9zhyL6I3jZEdw$IfEBDan48jlaUM7Kk-GrvtQUF_oat3WcG7fQZNWzJ3AqCw2Z0NAFVGA635TPYOpcZHe7pXHnJLVkavNO3snGGQ', now()),
    ('supplier.project001@sdm.local', 'Project-001 Supplier User', 'scrypt$16384$8$1$CV3XH7Ohf9zhyL6I3jZEdw$IfEBDan48jlaUM7Kk-GrvtQUF_oat3WcG7fQZNWzJ3AqCw2Z0NAFVGA635TPYOpcZHe7pXHnJLVkavNO3snGGQ', now()),
    ('design.project001@sdm.local',   'Project-001 Design Consultant', 'scrypt$16384$8$1$CV3XH7Ohf9zhyL6I3jZEdw$IfEBDan48jlaUM7Kk-GrvtQUF_oat3WcG7fQZNWzJ3AqCw2Z0NAFVGA635TPYOpcZHe7pXHnJLVkavNO3snGGQ', now()),
    ('client.project001@sdm.local',   'Project-001 Client RE/ER', 'scrypt$16384$8$1$CV3XH7Ohf9zhyL6I3jZEdw$IfEBDan48jlaUM7Kk-GrvtQUF_oat3WcG7fQZNWzJ3AqCw2Z0NAFVGA635TPYOpcZHe7pXHnJLVkavNO3snGGQ', now())
ON CONFLICT (email) DO UPDATE
SET display_name = EXCLUDED.display_name,
    password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
    password_updated_at = COALESCE(users.password_updated_at, EXCLUDED.password_updated_at),
    active = true;

INSERT INTO project_memberships (project_id, user_id, party_id, role_slug)
SELECT p.id, u.id, pa.id, m.role_slug
FROM (VALUES
    ('pm.project001@sdm.local',       'CON', 'contractor_pm'),
    ('dc.project001@sdm.local',       'CON', 'document_controller'),
    ('sub.project001@sdm.local',      'SUB', 'subcontractor'),
    ('supplier.project001@sdm.local', 'SUP', 'supplier'),
    ('design.project001@sdm.local',   'DES', 'design_consultant'),
    ('client.project001@sdm.local',   'CLI', 'client_re_er')
) AS m(email, party_code, role_slug)
JOIN users AS u ON u.email = m.email
JOIN parties AS pa ON pa.code = m.party_code
JOIN projects AS p ON p.code = 'P001'
ON CONFLICT (project_id, user_id, party_id, role_slug) DO UPDATE
SET active = true;

INSERT INTO workflow_templates (project_id, slug, name, active)
SELECT id, 'formal_submission', 'Formal Client submission', true
FROM projects
WHERE code = 'P001'
ON CONFLICT (project_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    active = true;

INSERT INTO workflow_template_steps
    (template_id, sequence_no, step_key, display_name, required, required_role_slug)
SELECT t.id, s.sequence_no, s.step_key, s.display_name, true, s.required_role_slug
FROM workflow_templates AS t
JOIN projects AS p ON p.id = t.project_id AND p.code = 'P001'
CROSS JOIN (VALUES
    (1, 'prepared',           'Prepared',                'contractor_pm'),
    (2, 'reviewed_endorsed',  'Reviewed & Endorsed',     'design_consultant'),
    (3, 'approved',           'Approved',                'contractor_pm'),
    (4, 'document_controller','Document Controller',     'document_controller'),
    (5, 'transmittal',        'Transmittal',             'document_controller')
) AS s(sequence_no, step_key, display_name, required_role_slug)
WHERE t.slug = 'formal_submission'
ON CONFLICT (template_id, sequence_no) DO UPDATE
SET step_key = EXCLUDED.step_key,
    display_name = EXCLUDED.display_name,
    required = EXCLUDED.required,
    required_role_slug = EXCLUDED.required_role_slug;

INSERT INTO tags (project_id, name, slug, tag_kind)
SELECT p.id, v.name, v.slug, v.tag_kind
FROM projects AS p
CROSS JOIN (VALUES
    ('High Priority', 'high-priority', 'custom'),
    ('For Site Team', 'for-site-team', 'custom'),
    ('Drawing', 'drawing', 'system'),
    ('Internal', 'internal', 'system')
) AS v(name, slug, tag_kind)
WHERE p.code = 'P001'
ON CONFLICT (project_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    tag_kind = EXCLUDED.tag_kind,
    active = true;

-- A controlled sample container makes the local API and register integration
-- immediately testable while keeping the IFC/file asset pipeline separate.
INSERT INTO containers (
    project_id,
    originator_party_id,
    created_by_user_id,
    title,
    document_type_code,
    is_drawing,
    is_internal,
    iso_project_code,
    iso_originator_code,
    iso_volume_code,
    iso_level_code,
    iso_type_code,
    iso_role_code,
    iso_number,
    lifecycle_status
)
SELECT
    p.id,
    pa.id,
    u.id,
    'Site Location Plan',
    'DR',
    true,
    false,
    'P001',
    'ABC',
    'ZZ',
    '01',
    'DR',
    'A',
    1,
    'active'
FROM projects AS p
JOIN parties AS pa ON pa.code = 'CON'
JOIN users AS u ON u.email = 'pm.project001@sdm.local'
WHERE p.code = 'P001'
ON CONFLICT DO NOTHING;

INSERT INTO document_revisions (
    container_id,
    revision_sequence,
    revision_code,
    suitability_code,
    client_response_code,
    cde_state,
    workflow_status,
    submitted_by_user_id,
    submitted_at,
    metadata
)
SELECT
    c.id,
    1,
    'P01',
    'S3',
    'Pending',
    'Shared',
    'in_review',
    u.id,
    now(),
    '{"source":"mvp-seed","bim_ready":true}'::jsonb
FROM containers AS c
JOIN projects AS p ON p.id = c.project_id AND p.code = 'P001'
JOIN users AS u ON u.email = 'pm.project001@sdm.local'
WHERE c.container_number = 'P001-ABC-ZZ-01-DR-A-0001'
ON CONFLICT (container_id, revision_code) DO UPDATE
SET suitability_code = EXCLUDED.suitability_code,
    client_response_code = EXCLUDED.client_response_code,
    cde_state = EXCLUDED.cde_state,
    workflow_status = EXCLUDED.workflow_status,
    metadata = EXCLUDED.metadata,
    updated_at = now();

UPDATE containers AS c
SET latest_revision_id = r.id
FROM document_revisions AS r
WHERE c.container_number = 'P001-ABC-ZZ-01-DR-A-0001'
  AND r.container_id = c.id
  AND r.revision_code = 'P01';

-- Keep the allocator ahead of any repeatable sample containers.
UPDATE project_sequences AS s
SET next_value = GREATEST(
    s.next_value,
    COALESCE((SELECT max(c.iso_number) + 1 FROM containers c WHERE c.project_id = s.project_id AND c.is_internal = false), 1)
)
WHERE s.sequence_kind = 'container';
