import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { allocateDocumentNumber, numberingForDocumentType, publicDocumentNumbering } from "../../../../../../../lib/document-numbering";
import { db } from "../../../../../../../lib/db";

export const runtime = "nodejs";

const submitRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

function code(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(normalized) ? normalized : fallback;
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string; draftId: string }> }) {
  const client = await db.connect();
  try {
    const { projectCode, draftId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, submitRoles, "documents.submit");
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    }

    await client.query("BEGIN");
    const draftResult = await client.query<{
      id: string;
      projectId: string;
      title: string;
      documentTypeCode: string;
      isDrawing: boolean;
      libraryFolder: string;
      isInternal: boolean;
      internalCategory: string | null;
      metadata: Record<string, unknown>;
      status: string;
    }>(
      `
        SELECT id, project_id AS "projectId", title, document_type_code AS "documentTypeCode",
               is_drawing AS "isDrawing", library_folder AS "libraryFolder", is_internal AS "isInternal",
               internal_category AS "internalCategory", metadata, status
        FROM drafts
        WHERE id = $1 AND project_id = $2 AND creator_user_id = $3
        FOR UPDATE
      `,
      [draftId, membership.projectId, user.id],
    );
    const draft = draftResult.rows[0];
    if (!draft) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Draft not found" } }, { status: 404 });
    }
    if (draft.status !== "open") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "DRAFT_CLOSED", message: "Only open drafts can be submitted" } }, { status: 409 });
    }

    const attachedFiles = await client.query<{ fileId: string; sortOrder: number; scan: string }>(
      `SELECT df.file_id AS "fileId", df.sort_order AS "sortOrder", fa.virus_scan_status AS scan
       FROM draft_files df
       JOIN file_assets fa ON fa.id = df.file_id
       WHERE df.draft_id = $1
       ORDER BY df.sort_order, df.file_id`,
      [draft.id],
    );
    const blockedFile = attachedFiles.rows.find((file) => file.scan !== "clean");
    if (blockedFile) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "FILE_NOT_READY", message: "Every attached file must pass the malware scan before submission" } }, { status: 409 });
    }

    const metadata = draft.metadata ?? {};
    const project = await client.query<{ id: string; code: string }>("SELECT id, code FROM projects WHERE id = $1 AND status = 'active'", [membership.projectId]);
    const projectRow = project.rows[0];
    if (!projectRow) throw new Error("Project is not active");

    const isoOriginator = code(metadata.originatorCode, membership.partyCode);
    const isoVolume = code(metadata.volumeCode, "ZZ");
    const isoLevel = code(metadata.levelCode, "01");
    const isoType = code(metadata.typeCode, draft.documentTypeCode);
    const isoRole = code(metadata.roleCode, draft.isDrawing ? "A" : "C");
    const isoDiscipline = code(metadata.disciplineCode ?? metadata.discipline, "");
    const numberingResult = await client.query<Record<string, unknown>>(
      `SELECT enabled, prefix, suffix, separator, sequence_width AS "sequenceWidth", sequence_start AS "sequenceStart",
              sequence_next AS "sequenceNext", sequence_scope AS "sequenceScope",
              sequence_levels AS "sequenceLevels", custom_fields AS "customFields",
              document_type_overrides AS "documentTypeOverrides"
         FROM project_document_numbering WHERE project_id = $1`,
      [projectRow.id],
    );
    const numbering = publicDocumentNumbering(numberingResult.rows[0] ?? null);
    const typeNumbering = numberingForDocumentType(numbering, isoType);
    const detailValues: Record<string, string | number | boolean | null | undefined> = {
      project: projectRow.code,
      originator: isoOriginator,
      documentType: isoType,
      discipline: isoDiscipline,
      volume: isoVolume,
      level: isoLevel,
      role: isoRole,
      drawing: draft.isDrawing,
      category: draft.internalCategory,
      internalCategory: draft.internalCategory,
      party: membership.partyCode,
      title: draft.title,
      // The first revision is created immediately after allocation. Exposing
      // its controlled defaults lets numbering rules select these attributes.
      revision: "P01",
      suitability: "S3",
      clientResponse: "Pending",
      cdeState: "Shared",
      lifecycleStatus: "active",
    };
    // Custom fields can select stable attributes stored in draft metadata.
    // Ignore nested objects/arrays so arbitrary metadata cannot leak into a
    // generated document number.
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") detailValues[key] = value;
    }
    const customDocumentNumber = typeNumbering.config.enabled
      ? await allocateDocumentNumber(client, projectRow.id, typeNumbering.config, detailValues, {
          sequenceNamespace: typeNumbering.hasOverride ? `type:${isoType}` : "document",
        })
      : null;

    let containerId: string;
    if (draft.isInternal) {
      const sequence = await client.query<{ value: string }>("SELECT sdm_next_sequence($1, 'internal')::text AS value", [projectRow.id]);
      const internalNumber = customDocumentNumber ?? `INT-${membership.partyCode}-${String(sequence.rows[0].value).padStart(4, "0")}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO containers (project_id, originator_party_id, created_by_user_id, title, document_type_code, is_drawing, is_internal, library_folder, internal_number, document_number, lifecycle_status)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $8, 'active') RETURNING id`,
        [projectRow.id, membership.partyId, user.id, draft.title, draft.documentTypeCode, draft.isDrawing, draft.libraryFolder, internalNumber],
      );
      containerId = inserted.rows[0].id;
    } else {
      const sequence = await client.query<{ value: string }>("SELECT sdm_next_sequence($1, 'container')::text AS value", [projectRow.id]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO containers (
          project_id, originator_party_id, created_by_user_id, title, document_type_code, is_drawing, is_internal, library_folder,
          document_number, iso_project_code, iso_originator_code, iso_volume_code, iso_level_code, iso_type_code, iso_role_code, iso_number, lifecycle_status
        ) VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active') RETURNING id`,
        [projectRow.id, membership.partyId, user.id, draft.title, draft.documentTypeCode, draft.isDrawing, draft.libraryFolder, customDocumentNumber, projectRow.code, isoOriginator, isoVolume, isoLevel, isoType, isoRole, Number(sequence.rows[0].value)],
      );
      containerId = inserted.rows[0].id;
    }

    const revision = await client.query<{ id: string }>(
      `INSERT INTO document_revisions (
        container_id, revision_sequence, revision_code, suitability_code, client_response_code,
        cde_state, workflow_status, submitted_by_user_id, metadata
      ) VALUES ($1, 1, 'P01', 'S3', 'Pending', 'Shared', 'in_review', $2, $3::jsonb)
      RETURNING id`,
      [containerId, user.id, JSON.stringify({ sourceDraftId: draft.id, submittedByRole: membership.roleSlug, discipline: isoDiscipline || null })],
    );
    await client.query("UPDATE containers SET latest_revision_id = $1 WHERE id = $2", [revision.rows[0].id, containerId]);
    if (attachedFiles.rows.length > 0) {
      await client.query(
        `INSERT INTO revision_files (revision_id, file_id, sort_order, is_primary)
         SELECT $1, file_id, sort_order, sort_order = 0
         FROM draft_files WHERE draft_id = $2
         ON CONFLICT (revision_id, file_id) DO NOTHING`,
        [revision.rows[0].id, draft.id],
      );
    }

    const template = await client.query<{ id: string }>(
      `SELECT id FROM workflow_templates
         WHERE project_id = $1 AND active = true
         ORDER BY CASE WHEN slug = 'formal_submission' THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`,
      [projectRow.id],
    );
    if (!template.rows[0]) throw new Error("Formal submission workflow is not configured");
    const unassigned = await client.query<{ stepKey: string }>(
      `SELECT ts.step_key AS "stepKey"
         FROM workflow_template_steps ts
        WHERE ts.template_id = $1 AND ts.required = true
          AND (ts.required_role_slug IS NULL OR NOT EXISTS (
            SELECT 1 FROM project_memberships pm
             WHERE pm.project_id = $2 AND pm.role_slug = ts.required_role_slug AND pm.active = true
          ))
        ORDER BY ts.sequence_no`,
      [template.rows[0].id, projectRow.id],
    );
    if (unassigned.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "WORKFLOW_MISCONFIGURED", message: "Every required workflow step must have an active project member assigned", steps: unassigned.rows.map((step) => step.stepKey) } }, { status: 409 });
    }
    const instance = await client.query<{ id: string }>(
      `INSERT INTO workflow_instances (revision_id, template_id, status, started_at)
       VALUES ($1, $2, 'in_progress', now()) RETURNING id`,
      [revision.rows[0].id, template.rows[0].id],
    );
    await client.query(
      `
        INSERT INTO workflow_steps (workflow_instance_id, sequence_no, step_key, display_name, required, assigned_user_id, assigned_party_id, status)
        SELECT $1, ts.sequence_no, ts.step_key, ts.display_name, ts.required, assignee.user_id, assignee.party_id,
               CASE WHEN assignee.user_id IS NULL AND assignee.party_id IS NULL THEN 'skipped' ELSE 'pending' END
        FROM workflow_template_steps ts
        LEFT JOIN LATERAL (
          SELECT pm.user_id, pm.party_id
          FROM project_memberships pm
          WHERE pm.project_id = $2 AND pm.role_slug = ts.required_role_slug AND pm.active = true
          ORDER BY pm.created_at ASC
          LIMIT 1
        ) assignee ON true
        WHERE ts.template_id = $3
        ORDER BY ts.sequence_no
      `,
      [instance.rows[0].id, projectRow.id, template.rows[0].id],
    );
    await client.query(
      `UPDATE workflow_steps SET status = 'in_progress'
         WHERE id = (SELECT id FROM workflow_steps WHERE workflow_instance_id = $1 AND status = 'pending' ORDER BY sequence_no LIMIT 1)`,
      [instance.rows[0].id],
    );
    const activeStep = await client.query<{ id: string; assignedUserId: string | null; assignedPartyId: string | null; displayName: string }>(
      `SELECT id, assigned_user_id AS "assignedUserId", assigned_party_id AS "assignedPartyId", display_name AS "displayName"
       FROM workflow_steps WHERE workflow_instance_id = $1 AND status = 'in_progress' LIMIT 1`,
      [instance.rows[0].id],
    );
    if (!activeStep.rows[0]) throw new Error("Formal submission workflow has no assigned first step");
    await client.query(
      `INSERT INTO tasks (project_id, assignee_user_id, assignee_party_id, task_type, target_type, target_id, due_at)
       VALUES ($1, $2, $3, 'workflow_signature', 'workflow_step', $4, now() + interval '14 days')`,
      [projectRow.id, activeStep.rows[0].assignedUserId, activeStep.rows[0].assignedPartyId, activeStep.rows[0].id],
    );
    if (activeStep.rows[0].assignedUserId) {
      await client.query(
        `INSERT INTO alerts (project_id, user_id, alert_type, target_type, target_id, message)
         VALUES ($1, $2, 'workflow_signature_required', 'workflow_step', $3, $4)`,
        [projectRow.id, activeStep.rows[0].assignedUserId, activeStep.rows[0].id, `Signature required: ${activeStep.rows[0].displayName}`],
      );
    }
    await client.query(
      `UPDATE drafts SET status = 'submitted', submitted_at = now(), promoted_container_id = $1 WHERE id = $2`,
      [containerId, draft.id],
    );
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'draft.submitted', 'container', $3, $4::jsonb, $5)`,
      [projectRow.id, user.id, containerId, JSON.stringify({ draftId: draft.id, revisionId: revision.rows[0].id, revisionCode: "P01" }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");

    return NextResponse.json({ data: { containerId, libraryFolder: draft.libraryFolder, revisionId: revision.rows[0].id, revisionCode: "P01", cdeState: "Shared", suitabilityCode: "S3", workflowStatus: "in_review" } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error);
  } finally {
    client.release();
  }
}
