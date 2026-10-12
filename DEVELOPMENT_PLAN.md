# COSMOS Smart Document Management (SDM)

## 1. Development objective

Build an ISO 19650-aligned Smart Document Management platform. SDM owns the authoritative repository for formal documents, drawings, DWSS form records, revisions, workflows, transmittals, Client decisions, audit events, and controlled links. COSMOS Drive Hub, Drawing Hub, Photo Hub, Form Flow, Google Drive, SharePoint, and other stores are external drives or connected systems, not the SDM product shell or its system of record.

The implementation will preserve the PRD's core invariants:

- Drafts have no formal container number.
- Submission allocates an ISO-style container ID and `P01` atomically.
- Revisions are append-only and never overwritten.
- Suitability and Client response are separate metadata fields.
- Client `C`/`D` keeps suitability at `S3` and enables RTC/resubmission.
- Client `A` can move a package to Published when drawing-use rules pass.
- Internal documents use party-scoped company numbering.
- Every material action creates an auditable event.

## 2. Recommended implementation baseline

The recommended starting stack is:

- Next.js and TypeScript for the web application
- A modular TypeScript API in the same repository
- PostgreSQL 16 as the system-of-record database
- S3-compatible object storage for files, previews, cover forms, watermarked copies, and converted BIM assets
- A background worker for indexing, PDF generation, exports, OCR, notifications, and deadline escalation
- PostgreSQL full-text search initially, with a dedicated search index added when scale or OCR needs justify it
- Local mock adapters for identity, e-sign, COSMOS drives, Google Drive, SharePoint, Photo Hub, Drawing Hub, and Form Flow until real APIs are available
- a licensed read-only BIM renderer, with IFC converted to optimized browser assets before loading

The backend should begin as a modular application with workers. Modules can be separated later if operational scale requires it.

## 3. Delivery phases

### Phase 0 — Decisions and acceptance matrix

Confirm project-specific rules before implementing irreversible behavior. Produce a decision record and testable acceptance matrix for:

- Seven-field container syntax, delimiters, code lists, and number sequence scope
- Suitability meanings, including `A` and `B`, and exact transitions
- Sequential or parallel signatory steps and e-signature evidence requirements
- CDE transition rules for WIP, Shared, Published, and Archive
- Drawing IDC/ICE/Client endorsement combinations
- Internal numbering and whether internal items can later become external submissions
- DWSS form sequence scope and module/year rules
- Cross-hub APIs, authentication, link versioning, and snapshot requirements
- File limits, allowed types, retention, OCR, watermarking, and virus scanning
- Search indexing, permission filtering, notification channels, SSO/MFA, and backup requirements

Exit criteria: signed-off domain rules, a role/permission matrix, and an acceptance test list for the first vertical slice.

### Phase 1 — Repository and development foundation

- Create the web, API, domain, worker, database migration, and test directories.
- Add environment validation and typed configuration.
- Add database migration tooling and a seed dataset.
- Add API health/readiness endpoints.
- Add structured logging, error handling, request IDs, and local development commands.
- Add CI checks for formatting, type checking, unit tests, migration validation, and container build.
- Add local object storage and a mail/notification sink when the first integration phase begins.

Exit criteria: a clean checkout starts the application, connects to PostgreSQL, runs migrations, and returns a health response.

### Phase 2 — Identity, projects, parties, and access

Implement:

- Users, organizations/parties, roles, permissions, projects, memberships, and hub views
- Contractor versus Client views
- Party-scoped Internal Shared access
- Document Controller control permissions
- Backend-enforced row-level authorization
- Seed accounts for every MVP role

Exit criteria: each seeded role sees only its permitted projects, rows, actions, internal files, and transmittals.

### Phase 3 — Project configuration and controlled vocabularies

Implement project-configurable:

- ISO seven-field code lists
- Document, drawing, and form types
- Suitability and Client response values
- CDE states
- Workflow templates and signatory definitions
- Tags and tag governance
- SLA, deadline, holiday, and escalation rules
- External drive connector definitions, provider configuration, credential-manager references, and connection status

Exit criteria: a project administrator can configure a pilot project without code changes, and invalid codes cannot enter a submission.

### Phase 4 — Registry, Library, files, drafts, and revisions

Implement the core information-container model:

- Draft creation with no formal ID
- File upload and object-storage records
- Metadata and custom tags
- Atomic container-number allocation on Submit
- `P01`, `P02`, and later revision lineage
- Append-only revision and supersession rules
- Internal company-number path
- Documents, Drawings, Forms, and Internal Library views
- CDE filters and latest-revision display
- Preview generation and secure downloads
- Metadata/full-text search with permission-filtered results

Exit criteria: a user can create a draft, submit it, receive one unique ID and `P01`, open the latest revision, and retrieve older revisions without mutation.

### Phase 5 — Workflow, e-sign, tasks, alerts, and audit

Implement:

- Prepared → Reviewed/Endorsed → Approved → Document Controller → Transmittal
- Sequential or configured parallel assignments
- E-signature adapter and signature evidence
- My Tasks and role-filtered alerts
- Deadline calculation in Asia/Hong Kong time
- Append-only audit events for all key actions

Exit criteria: no required workflow step can be skipped, completed signatures change package state correctly, and each transition is visible in the audit log.

### Phase 6 — Transmittals, Client decisions, RTC, and correspondence

Implement:

- Outgoing and Incoming transmittals relative to the logged-in role
- Package-level transmittal items
- Client `A`, `C`, and `D` decisions
- `A` → Published transition when eligibility rules pass
- `C`/`D` → S3, RTC letter, and next P-revision path
- Client letters and Contractor correspondence
- Due dates, response tracking, and escalation

Exit criteria: the complete formal submission lifecycle works end to end for Contractor and Client test accounts.

### Phase 7 — Drawings, DWSS forms, and cross-hub links

Implement:

- Drawing/non-drawing type separation
- IDC/ICE/Client endorsement records and construction-use authorization
- DWSS form numbering and record-only behavior
- Photo Hub, Drawing Hub/BIM, and Form Flow adapters
- Cross-reference selection and package-detail link display
- Form Flow output retrieval into SDM's repository while preserving Form Flow as source authority
- a BIM viewer embedded in package detail with Drawing Hub exposed as an external connection
- IFC source retention plus worker conversion to XKT and metadata
- Model tree, storey navigation, selection/highlight, hide/isolate, section planes, and federated model loading
- BCF viewpoint save/load as a later review enhancement

Exit criteria: linked external records are visible without duplicating their source authority, drawings cannot be presented as for-construction without required evidence, and an authorized reviewer can open and inspect a permitted BIM revision in the browser.

### Phase 8 — Registers, exports, controlled copies, and operational hardening

Implement:

- Three register tabs with search and filters
- Excel and PDF exports
- Controlled/watermarked PDF copies
- File malware scanning and preview failure handling
- Backup/restore checks and retention policies
- Performance indexes for tens of thousands of containers
- End-to-end, security, accessibility, and permission-isolation tests

Exit criteria: pilot-scale data remains responsive, exports match visible filters, and recovery procedures are documented and tested.

### Phase 9 — P1/P2 capabilities

- Athena assistive search, status, draft, and naming help
- Dedicated search indexing and OCR improvements
- Configurable holiday/deadline engine enhancements
- Template-based non-drawing authoring
- Full Method Statement generation only under a separate approved PRD
- Native CAD/BIM authoring remains outside SDM

## 4. Initial domain model

The first schema should include:

`User`, `Party`, `Role`, `Permission`, `Project`, `ProjectMembership`, `ProjectProfile`, `ProjectConnector`, `CodeList`, `CodeValue`, `Tag`, `InformationContainer`, `ContainerRevision`, `FileAsset`, `WorkflowInstance`, `WorkflowStep`, `ESignature`, `Transmittal`, `TransmittalItem`, `ClientDecision`, `DWSSFormSubmission`, `CrossHubLink`, `Task`, `Alert`, and `AuditEvent`.

Revision, audit, and numbering records should be append-only. Search indexes and generated files are derived data and must be rebuildable from the database and object storage.

## 5. First vertical slice

The first development increment should implement and test:

```text
Seed Contractor and Client users
→ create a draft
→ verify no container ID
→ submit a document
→ allocate ISO ID + P01
→ complete workflow/e-sign mock
→ generate cover form
→ create outgoing transmittal
→ Client returns C
→ verify S3 and RTC path
→ resubmit as P02
→ Client returns A
→ verify Published eligibility
```

This slice proves the product's most important control behavior before building every screen and integration.

## 6. Current readiness

The local P0 vertical slice is implemented and running in Docker Desktop:

- `SDM`: Next.js/TypeScript web client and API at `http://localhost:3001`
- `SDM-db`: PostgreSQL 16 with core schema, search projection, and seed data
- `SDM-worker`: durable worker process with database heartbeat
- Host ports: API `3001`, database `5433`
- Database extensions: `pgcrypto`, `citext`
- Auth boundary: seeded development identity or OIDC JWT validation
- Storage boundary: local filesystem adapter or S3-compatible presigned transfer
- Viewer boundary: licensed BIM renderer with authorized optimized-asset loading

The server-side formal lifecycle is covered by the implemented draft, submit,
workflow, transmittal, Client decision, search, tag, audit, and file APIs. A
clean production Next.js build and TypeScript validation pass. A deployment
still needs real OIDC, S3, renderer licensing, model-conversion, scanning, and
operational integrations configured for its target environment; these are
external prerequisites rather than local code scaffolding gaps.

## 7. Decisions needed from the product owner

Please confirm the three choices requested in chat:

1. Application stack: recommended Next.js/TypeScript or another stack.
2. Whether to use local mock adapters before real COSMOS integrations.
3. Whether the first milestone is the P0 formal-submission vertical slice.

The remaining decisions in Phase 0 can be resolved from the pilot contract, DEVB/DWSS rules, and the actual COSMOS integration contracts as development reaches those phases.

## 8. BIM viewer decision

Pascal was evaluated as a possible BIM surface. It is technically capable and compatible with the planned React/Next.js stack, but its primary product is a broader 3D building editor. SDM needs a controlled, read-only BIM review surface, so a dedicated renderer behind the adapter boundary is the better fit for the first implementation.

The BIM flow will be:

```text
Drawing Hub / SDM source IFC
→ immutable source file record
→ conversion worker
→ XKT geometry + IFC metadata
→ secure object storage
→ BIM viewer in package detail
```

The SDM database remains authoritative for project, package, revision, permissions, endorsement, and audit metadata. The renderer is responsible for rendering and model interaction only.

### Licensing gate

The selected renderer and bundled BIM viewer must have a license compatible with the intended COSMOS deployment. Before production integration into a closed-source deployment, the product owner must confirm either:

1. The deployment will comply with AGPLv3, or
2. COSMOS will obtain a commercial renderer license.

Until that decision is made, the viewer should be developed behind an adapter and feature flag so the rendering implementation can be replaced without changing SDM's package, revision, or permission model.
