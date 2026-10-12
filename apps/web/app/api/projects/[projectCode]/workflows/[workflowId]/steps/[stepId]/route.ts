import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../../lib/auth";
import { db } from "../../../../../../../../lib/db";
import { isUuid, parseObjectBody } from "../../../../../../../../lib/http";

export const runtime = "nodejs";
const workflowAdminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];
const keyPattern = /^[a-z][a-z0-9_.-]{1,63}$/;
const rolePattern = /^[a-z][a-z0-9_]{1,63}$/;
const REORDER_OFFSET = 1_000_000;

function error(message: string, code = "INVALID_REQUEST", status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}
function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${field} must be between 1 and ${max} characters`);
  return result;
}
function sequence(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 999) throw new Error("sequenceNo must be an integer between 1 and 999");
  return value;
}
async function verifyRole(client: PoolClient, value: string | null) {
  if (value === null) return;
  if (!rolePattern.test(value)) throw new Error("requiredRoleSlug is invalid");
  const result = await client.query("SELECT 1 FROM role_catalog WHERE slug = $1", [value]);
  if (!result.rowCount) throw new Error("requiredRoleSlug is not a recognised SDM role");
}
async function renumber(client: PoolClient, templateId: string, moveId?: string, requested?: number) {
  const rows = await client.query<{ id: string }>("SELECT id FROM workflow_template_steps WHERE template_id = $1 ORDER BY sequence_no, id", [templateId]);
  let ordered = rows.rows.map((row) => row.id);
  if (moveId) {
    ordered = ordered.filter((id) => id !== moveId);
    const index = Math.max(0, Math.min((requested ?? ordered.length + 1) - 1, ordered.length));
    ordered.splice(index, 0, moveId);
  }
  await client.query("UPDATE workflow_template_steps SET sequence_no = sequence_no + $2 WHERE template_id = $1", [templateId, REORDER_OFFSET * 2]);
  for (let index = 0; index < ordered.length; index += 1) await client.query("UPDATE workflow_template_steps SET sequence_no = $2 WHERE id = $1", [ordered[index], REORDER_OFFSET * 3 + index + 1]);
  for (let index = 0; index < ordered.length; index += 1) await client.query("UPDATE workflow_template_steps SET sequence_no = $2 WHERE id = $1", [ordered[index], index + 1]);
}

type Context = { params: Promise<{ projectCode: string; workflowId: string; stepId: string }> };

export async function PATCH(request: Request, context: Context) {
  const client = await db.connect();
  try {
    const { projectCode, workflowId, stepId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    if (!isUuid(workflowId) || !isUuid(stepId)) return error("Workflow step not found", "NOT_FOUND", 404);
    const body = parseObjectBody(await request.json().catch(() => null));
    if (!body) return error("A JSON object is required");
    await client.query("BEGIN");
    const template = await client.query("SELECT id FROM workflow_templates WHERE id = $1 AND project_id = $2 FOR UPDATE", [workflowId, membership.projectId]);
    if (!template.rows[0]) {
      await client.query("ROLLBACK");
      return error("Workflow template not found", "NOT_FOUND", 404);
    }
    const current = await client.query<{ id: string; sequenceNo: number; stepKey: string; displayName: string; required: boolean; requiredRoleSlug: string | null }>(
      `SELECT id, sequence_no AS "sequenceNo", step_key AS "stepKey", display_name AS "displayName", required, required_role_slug AS "requiredRoleSlug"
         FROM workflow_template_steps WHERE id = $1 AND template_id = $2 FOR UPDATE`,
      [stepId, workflowId],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return error("Workflow step not found", "NOT_FOUND", 404);
    }
    const row = current.rows[0];
    let nextKey = row.stepKey;
    let nextName = row.displayName;
    let nextRequired = row.required;
    let nextRole = row.requiredRoleSlug;
    if (body.stepKey !== undefined) nextKey = text(body.stepKey, "stepKey", 64).toLowerCase();
    if (body.displayName !== undefined) nextName = text(body.displayName, "displayName", 120);
    if (!keyPattern.test(nextKey)) throw new Error("stepKey must start with a letter and contain only lowercase letters, numbers, dots, hyphens, or underscores");
    if (body.required !== undefined) {
      if (typeof body.required !== "boolean") throw new Error("required must be a boolean");
      nextRequired = body.required;
    }
    if (body.requiredRoleSlug !== undefined) {
      if (body.requiredRoleSlug !== null && typeof body.requiredRoleSlug !== "string") throw new Error("requiredRoleSlug must be a string or null");
      nextRole = body.requiredRoleSlug === null ? null : body.requiredRoleSlug.trim().toLowerCase();
    }
    if (nextRequired && !nextRole) throw new Error("requiredRoleSlug is required for a required step");
    await verifyRole(client, nextRole);
    if (nextKey !== row.stepKey) {
      const duplicate = await client.query("SELECT 1 FROM workflow_template_steps WHERE template_id = $1 AND step_key = $2 AND id <> $3", [workflowId, nextKey, stepId]);
      if (duplicate.rowCount) {
        await client.query("ROLLBACK");
        return error("A step with this key already exists", "CONFLICT", 409);
      }
    }
    await client.query(
      `UPDATE workflow_template_steps SET step_key = $1, display_name = $2, required = $3, required_role_slug = $4 WHERE id = $5`,
      [nextKey, nextName, nextRequired, nextRole, stepId],
    );
    if (body.sequenceNo !== undefined) await renumber(client, workflowId, stepId, sequence(body.sequenceNo));
    const updated = await client.query(
      `SELECT id, sequence_no AS "sequenceNo", step_key AS "stepKey", display_name AS "displayName", required, required_role_slug AS "requiredRoleSlug"
         FROM workflow_template_steps WHERE id = $1`,
      [stepId],
    );
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'workflow.step.updated', 'workflow_template_step', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, stepId, JSON.stringify({ workflowId, ...updated.rows[0] }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: updated.rows[0] });
  } catch (caught) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (caught instanceof Error && (caught.message.includes("required") || caught.message.includes("invalid") || caught.message.includes("characters") || caught.message.includes("integer") || caught.message.includes("recognised") || caught.message.includes("string or null"))) return error(caught.message);
    return authErrorResponse(caught);
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request, context: Context) {
  const client = await db.connect();
  try {
    const { projectCode, workflowId, stepId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    if (!isUuid(workflowId) || !isUuid(stepId)) return error("Workflow step not found", "NOT_FOUND", 404);
    await client.query("BEGIN");
    const template = await client.query("SELECT id FROM workflow_templates WHERE id = $1 AND project_id = $2 FOR UPDATE", [workflowId, membership.projectId]);
    if (!template.rows[0]) {
      await client.query("ROLLBACK");
      return error("Workflow template not found", "NOT_FOUND", 404);
    }
    const step = await client.query<{ id: string; required: boolean }>("SELECT id, required FROM workflow_template_steps WHERE id = $1 AND template_id = $2 FOR UPDATE", [stepId, workflowId]);
    if (!step.rows[0]) {
      await client.query("ROLLBACK");
      return error("Workflow step not found", "NOT_FOUND", 404);
    }
    const count = await client.query<{ total: string; required: string }>("SELECT count(*)::text AS total, count(*) FILTER (WHERE required)::text AS required FROM workflow_template_steps WHERE template_id = $1", [workflowId]);
    if (Number(count.rows[0].total) <= 1 || (step.rows[0].required && Number(count.rows[0].required) <= 1)) {
      await client.query("ROLLBACK");
      return error("A workflow must retain at least one required step", "WORKFLOW_EMPTY", 409);
    }
    await client.query("DELETE FROM workflow_template_steps WHERE id = $1", [stepId]);
    await renumber(client, workflowId);
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'workflow.step.deleted', 'workflow_template_step', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, stepId, JSON.stringify({ workflowId }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { deleted: true, id: stepId } });
  } catch (caught) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(caught);
  } finally {
    client.release();
  }
}
