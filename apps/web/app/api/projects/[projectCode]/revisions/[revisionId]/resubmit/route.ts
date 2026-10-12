import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";

export const runtime = "nodejs";
const resubmitRoles: readonly SdmRole[] = ["contractor_pm", "document_controller", "subcontractor", "supplier", "design_consultant"];

export async function POST(request: Request, context: { params: Promise<{ projectCode: string; revisionId: string }> }) {
  const client = await db.connect();
  try {
    const { projectCode, revisionId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, resubmitRoles, "documents.submit");
    if (!/^[0-9a-f-]{36}$/i.test(revisionId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Revision not found" } }, { status: 404 });
    await client.query("BEGIN");
    const previousResult = await client.query<{
      id: string; containerId: string; sequence: number; response: string; workflowStatus: string; isDrawing: boolean; title: string;
    }>(
      `SELECT r.id, r.container_id AS "containerId", r.revision_sequence AS sequence,
              r.client_response_code AS response, r.workflow_status AS "workflowStatus",
              c.is_drawing AS "isDrawing", c.title
       FROM document_revisions r JOIN containers c ON c.id = r.container_id
       WHERE r.id = $1 AND c.project_id = $2 AND r.is_current = true
         AND ($3::text = 'document_controller' OR c.originator_party_id = $4::uuid)
       FOR UPDATE OF r, c`,
      [revisionId, membership.projectId, membership.roleSlug, membership.partyId],
    );
    const previous = previousResult.rows[0];
    if (!previous) { await client.query("ROLLBACK"); return NextResponse.json({ error: { code: "NOT_FOUND", message: "Revision not found" } }, { status: 404 }); }
    if (!["C", "D"].includes(previous.response) || previous.workflowStatus !== "returned") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "INVALID_STATE", message: "Only a returned C or D revision can be resubmitted" } }, { status: 409 });
    }
    const nextSequence = previous.sequence + 1;
    const revisionCode = `P${String(nextSequence).padStart(2, "0")}`;
    await client.query("UPDATE document_revisions SET is_current = false, updated_at = now() WHERE id = $1", [previous.id]);
    const revision = await client.query<{ id: string }>(
      `INSERT INTO document_revisions (container_id, revision_sequence, revision_code, suitability_code,
         client_response_code, cde_state, workflow_status, submitted_by_user_id, metadata, supersedes_revision_id)
       SELECT container_id, $2, $3, 'S3', 'Pending', 'Shared', 'in_review', $4,
              jsonb_build_object('resubmitsRevisionId', id, 'resubmittedByRole', $5::text), id
       FROM document_revisions WHERE id = $1 RETURNING id`,
      [previous.id, nextSequence, revisionCode, user.id, membership.roleSlug],
    );
    await client.query("UPDATE containers SET latest_revision_id = $1 WHERE id = $2", [revision.rows[0].id, previous.containerId]);
    await client.query(
      `INSERT INTO revision_files (revision_id, file_id, sort_order, is_primary)
       SELECT $1, file_id, sort_order, is_primary FROM revision_files WHERE revision_id = $2`,
      [revision.rows[0].id, previous.id],
    );
    const template = await client.query<{ id: string }>(
      `SELECT id FROM workflow_templates
         WHERE project_id = $1 AND active = true
         ORDER BY CASE WHEN slug = 'formal_submission' THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`,
      [membership.projectId],
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
      [template.rows[0].id, membership.projectId],
    );
    if (unassigned.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "WORKFLOW_MISCONFIGURED", message: "Every required workflow step must have an active project member assigned", steps: unassigned.rows.map((step) => step.stepKey) } }, { status: 409 });
    }
    const instance = await client.query<{ id: string }>(
      `INSERT INTO workflow_instances (revision_id, template_id, status, started_at) VALUES ($1, $2, 'in_progress', now()) RETURNING id`,
      [revision.rows[0].id, template.rows[0].id],
    );
    await client.query(
      `INSERT INTO workflow_steps (workflow_instance_id, sequence_no, step_key, display_name, required, assigned_user_id, assigned_party_id, status)
       SELECT $1, ts.sequence_no, ts.step_key, ts.display_name, ts.required, assignee.user_id, assignee.party_id,
              CASE WHEN assignee.user_id IS NULL AND assignee.party_id IS NULL THEN 'skipped' ELSE 'pending' END
       FROM workflow_template_steps ts
       LEFT JOIN LATERAL (SELECT pm.user_id, pm.party_id FROM project_memberships pm
         WHERE pm.project_id = $2 AND pm.role_slug = ts.required_role_slug AND pm.active = true
         ORDER BY pm.created_at LIMIT 1) assignee ON true
       WHERE ts.template_id = $3 ORDER BY ts.sequence_no`,
      [instance.rows[0].id, membership.projectId, template.rows[0].id],
    );
    await client.query(
      `UPDATE workflow_steps SET status = 'in_progress'
         WHERE id = (SELECT id FROM workflow_steps WHERE workflow_instance_id = $1 AND status = 'pending' ORDER BY sequence_no LIMIT 1)`,
      [instance.rows[0].id],
    );
    const active = await client.query<{ id: string; assignedUserId: string | null; assignedPartyId: string | null; displayName: string }>(
      `SELECT id, assigned_user_id AS "assignedUserId", assigned_party_id AS "assignedPartyId", display_name AS "displayName" FROM workflow_steps WHERE workflow_instance_id = $1 AND status = 'in_progress' LIMIT 1`,
      [instance.rows[0].id],
    );
    if (!active.rows[0]) throw new Error("Formal submission workflow has no assigned first step");
    await client.query(
      `INSERT INTO tasks (project_id, assignee_user_id, assignee_party_id, task_type, target_type, target_id, due_at)
       VALUES ($1, $2, $3, 'workflow_signature', 'workflow_step', $4, now() + interval '14 days')`,
      [membership.projectId, active.rows[0].assignedUserId, active.rows[0].assignedPartyId, active.rows[0].id],
    );
    if (active.rows[0].assignedUserId) await client.query(
      `INSERT INTO alerts (project_id, user_id, alert_type, target_type, target_id, message) VALUES ($1, $2, 'workflow_signature_required', 'workflow_step', $3, $4)`,
      [membership.projectId, active.rows[0].assignedUserId, active.rows[0].id, `Signature required: ${active.rows[0].displayName}`],
    );
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'revision.resubmitted', 'revision', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, revision.rows[0].id, JSON.stringify({ previousRevisionId: previous.id, revisionCode }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { revisionId: revision.rows[0].id, containerId: previous.containerId, revisionCode, workflowStatus: "in_review" } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error);
  } finally { client.release(); }
}
