import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";

export const runtime = "nodejs";

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: Request, context: { params: Promise<{ projectCode: string; revisionId: string }> }) {
  try {
    const { projectCode, revisionId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode);
    if (!validId(revisionId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Revision not found" } }, { status: 404 });
    const result = await db.query(
      `
        SELECT wi.id, wi.status, wi.started_at AS "startedAt", wi.completed_at AS "completedAt",
               ws.id AS "stepId", ws.sequence_no AS "sequenceNo", ws.step_key AS "stepKey",
               ws.display_name AS "displayName", ws.required, ws.status AS "stepStatus",
               ws.assigned_user_id AS "assignedUserId", ws.assigned_party_id AS "assignedPartyId",
               ws.signature_reference AS "verificationCode", ws.signed_at AS "signedAt",
               signer.display_name AS "signedBy", COALESCE(assignee.display_name, assigned_party.name) AS "assigneeName"
        FROM workflow_instances wi
        JOIN document_revisions r ON r.id = wi.revision_id
        JOIN containers c ON c.id = r.container_id AND c.project_id = $2
        JOIN project_memberships viewer ON viewer.project_id = c.project_id AND viewer.user_id = $3 AND viewer.active = true
        JOIN workflow_steps ws ON ws.workflow_instance_id = wi.id
        LEFT JOIN users signer ON signer.id = ws.signed_by_user_id
        LEFT JOIN users assignee ON assignee.id = ws.assigned_user_id
        LEFT JOIN parties assigned_party ON assigned_party.id = ws.assigned_party_id
        WHERE wi.revision_id = $1
          AND ($4::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $5::uuid)
        ORDER BY ws.sequence_no
      `,
      [revisionId, membership.projectId, user.id, membership.roleSlug, membership.partyId],
    );
    if (result.rows.length === 0) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Workflow not found" } }, { status: 404 });
    const first = result.rows[0];
    return NextResponse.json({ data: { id: first.id, status: first.status, startedAt: first.startedAt, completedAt: first.completedAt, steps: result.rows.map(({ id: _id, status: _status, startedAt: _startedAt, completedAt: _completedAt, ...step }) => step) } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectCode: string; revisionId: string }> }) {
  const client = await db.connect();
  try {
    const { projectCode, revisionId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode);
    if (!validId(revisionId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Revision not found" } }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const stepId = typeof body.stepId === "string" ? body.stepId : "";
    if (!validId(stepId)) return NextResponse.json({ error: { code: "INVALID_STEP", message: "stepId is required" } }, { status: 400 });

    await client.query("BEGIN");
    const stepResult = await client.query<{
      stepId: string;
      sequenceNo: number;
      stepStatus: string;
      assignedUserId: string | null;
      assignedPartyId: string | null;
      instanceId: string;
      projectId: string;
      workflowStatus: string;
    }>(
      `
        SELECT ws.id AS "stepId", ws.sequence_no AS "sequenceNo", ws.status AS "stepStatus",
               ws.assigned_user_id AS "assignedUserId", ws.assigned_party_id AS "assignedPartyId",
               wi.id AS "instanceId", c.project_id AS "projectId", wi.status AS "workflowStatus"
        FROM workflow_steps ws
        JOIN workflow_instances wi ON wi.id = ws.workflow_instance_id AND wi.revision_id = $1
        JOIN document_revisions r ON r.id = wi.revision_id
        JOIN containers c ON c.id = r.container_id AND c.project_id = $2
        WHERE ws.id = $3
          AND ($4::text = 'document_controller' OR c.is_internal = false OR c.originator_party_id = $5::uuid)
        FOR UPDATE OF ws, wi
      `,
      [revisionId, membership.projectId, stepId, membership.roleSlug, membership.partyId],
    );
    const step = stepResult.rows[0];
    if (!step) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Workflow step not found" } }, { status: 404 });
    }
    if (step.assignedUserId !== user.id && step.assignedPartyId !== membership.partyId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "This workflow step is not assigned to you" } }, { status: 403 });
    }
    if (step.stepStatus !== "in_progress") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "INVALID_STATE", message: "Only the active workflow step can be signed" } }, { status: 409 });
    }

    const verificationCode = `SDM-${randomBytes(5).toString("hex").toUpperCase()}`;
    const signed = await client.query(
      `UPDATE workflow_steps
       SET status = 'signed', signed_at = now(), signed_by_user_id = $1, signature_reference = $2
       WHERE id = $3
       RETURNING id, signed_at AS "signedAt"`,
      [user.id, verificationCode, step.stepId],
    );
    await client.query(
      `UPDATE tasks SET status = 'completed', completed_at = now()
       WHERE project_id = $1 AND target_type = 'workflow_step' AND target_id = $2 AND status <> 'completed'`,
      [membership.projectId, step.stepId],
    );
    const nextStep = await client.query<{ id: string }>(
      `UPDATE workflow_steps SET status = 'in_progress'
       WHERE workflow_instance_id = $1 AND sequence_no = $2 AND status = 'pending'
       RETURNING id`,
      [step.instanceId, step.sequenceNo + 1],
    );
    if (nextStep.rows[0]?.id) {
      const nextAssignment = await client.query<{ assignedUserId: string | null; assignedPartyId: string | null; displayName: string }>(
        `SELECT assigned_user_id AS "assignedUserId", assigned_party_id AS "assignedPartyId", display_name AS "displayName"
         FROM workflow_steps WHERE id = $1`,
        [nextStep.rows[0].id],
      );
      const assignment = nextAssignment.rows[0];
      if (assignment) {
        await client.query(
          `INSERT INTO tasks (project_id, assignee_user_id, assignee_party_id, task_type, target_type, target_id, due_at)
           VALUES ($1, $2, $3, 'workflow_signature', 'workflow_step', $4, now() + interval '14 days')`,
          [membership.projectId, assignment.assignedUserId, assignment.assignedPartyId, nextStep.rows[0].id],
        );
        if (assignment.assignedUserId) {
          await client.query(
            `INSERT INTO alerts (project_id, user_id, alert_type, target_type, target_id, message)
             VALUES ($1, $2, 'workflow_signature_required', 'workflow_step', $3, $4)`,
            [membership.projectId, assignment.assignedUserId, nextStep.rows[0].id, `Signature required: ${assignment.displayName}`],
          );
        }
      }
    }
    const remaining = await client.query<{ pending: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM workflow_steps WHERE workflow_instance_id = $1 AND required = true AND status NOT IN ('signed', 'skipped')) AS pending`,
      [step.instanceId],
    );
    if (!remaining.rows[0].pending) {
      await client.query("UPDATE workflow_instances SET status = 'completed', completed_at = now() WHERE id = $1", [step.instanceId]);
      await client.query("UPDATE document_revisions SET workflow_status = 'submitted', submitted_at = now() WHERE id = $1", [revisionId]);
    }
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'workflow.step.signed', 'revision', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, revisionId, JSON.stringify({ stepId, verificationCode, completed: !remaining.rows[0].pending }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { stepId, signedAt: signed.rows[0].signedAt, verificationCode, nextStepId: nextStep.rows[0]?.id ?? null, completed: !remaining.rows[0].pending } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error);
  } finally {
    client.release();
  }
}
