import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../../lib/auth";
import { db } from "../../../../../../../lib/db";
import { isUuid, parseObjectBody } from "../../../../../../../lib/http";

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
function sequence(value: unknown, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 999) throw new Error("sequenceNo must be an integer between 1 and 999");
  return value;
}
async function verifyRole(client: import("pg").PoolClient, value: string | null) {
  if (value === null) return;
  if (!rolePattern.test(value)) throw new Error("requiredRoleSlug is invalid");
  const result = await client.query("SELECT 1 FROM role_catalog WHERE slug = $1", [value]);
  if (!result.rowCount) throw new Error("requiredRoleSlug is not a recognised SDM role");
}
async function assertTemplate(client: import("pg").PoolClient, templateId: string, projectId: string) {
  const result = await client.query<{ id: string; active: boolean }>("SELECT id, active FROM workflow_templates WHERE id = $1 AND project_id = $2 FOR UPDATE", [templateId, projectId]);
  return result.rows[0];
}
async function renumber(client: import("pg").PoolClient, templateId: string, moveId?: string, requested?: number) {
  const rows = await client.query<{ id: string }>("SELECT id FROM workflow_template_steps WHERE template_id = $1 ORDER BY sequence_no, id", [templateId]);
  let ordered = rows.rows.map((row) => row.id);
  if (moveId) {
    ordered = ordered.filter((id) => id !== moveId);
    const index = Math.max(0, Math.min((requested ?? ordered.length + 1) - 1, ordered.length));
    ordered.splice(index, 0, moveId);
  }
  await client.query("UPDATE workflow_template_steps SET sequence_no = sequence_no + $2 WHERE template_id = $1", [templateId, REORDER_OFFSET * 2]);
  for (let index = 0; index < ordered.length; index += 1) {
    await client.query("UPDATE workflow_template_steps SET sequence_no = $2 WHERE id = $1", [ordered[index], REORDER_OFFSET * 3 + index + 1]);
  }
  for (let index = 0; index < ordered.length; index += 1) {
    await client.query("UPDATE workflow_template_steps SET sequence_no = $2 WHERE id = $1", [ordered[index], index + 1]);
  }
}

type Context = { params: Promise<{ projectCode: string; workflowId: string }> };

export async function POST(request: Request, context: Context) {
  const client = await db.connect();
  try {
    const { projectCode, workflowId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    if (!isUuid(workflowId)) return error("Workflow template not found", "NOT_FOUND", 404);
    const body = parseObjectBody(await request.json().catch(() => null));
    if (!body) return error("A JSON object is required");
    let stepKey: string;
    let displayName: string;
    try {
      stepKey = text(body.stepKey, "stepKey", 64).toLowerCase();
      displayName = text(body.displayName, "displayName", 120);
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : "Invalid workflow step");
    }
    if (!keyPattern.test(stepKey)) return error("stepKey must start with a letter and contain only lowercase letters, numbers, dots, hyphens, or underscores");
    const required = body.required === undefined ? true : body.required;
    if (typeof required !== "boolean") return error("required must be a boolean");
    if (body.requiredRoleSlug !== undefined && body.requiredRoleSlug !== null && typeof body.requiredRoleSlug !== "string") return error("requiredRoleSlug must be a string or null");
    let requiredRoleSlug: string | null = body.requiredRoleSlug === null || body.requiredRoleSlug === undefined ? null : body.requiredRoleSlug.trim().toLowerCase();
    if (required && !requiredRoleSlug) return error("requiredRoleSlug is required for a required step");
    try {
      await client.query("BEGIN");
      const template = await assertTemplate(client, workflowId, membership.projectId);
      if (!template) {
        await client.query("ROLLBACK");
        return error("Workflow template not found", "NOT_FOUND", 404);
      }
      await verifyRole(client, requiredRoleSlug);
      const duplicate = await client.query("SELECT 1 FROM workflow_template_steps WHERE template_id = $1 AND step_key = $2", [workflowId, stepKey]);
      if (duplicate.rowCount) {
        await client.query("ROLLBACK");
        return error("A step with this key already exists", "CONFLICT", 409);
      }
      const current = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM workflow_template_steps WHERE template_id = $1", [workflowId]);
      const requested = sequence(body.sequenceNo, Number(current.rows[0].count) + 1);
      await client.query("UPDATE workflow_template_steps SET sequence_no = sequence_no + $2 WHERE template_id = $1", [workflowId, REORDER_OFFSET * 2]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO workflow_template_steps (template_id, sequence_no, step_key, display_name, required, required_role_slug)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [workflowId, REORDER_OFFSET * 3 + Math.min(requested, Number(current.rows[0].count) + 1), stepKey, displayName, required, requiredRoleSlug],
      );
      await renumber(client, workflowId, inserted.rows[0].id, requested);
      await client.query(
        `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
         VALUES ($1, $2, 'workflow.step.created', 'workflow_template_step', $3, $4::jsonb, $5)`,
        [membership.projectId, user.id, inserted.rows[0].id, JSON.stringify({ workflowId, stepKey, displayName, required, requiredRoleSlug }), request.headers.get("x-request-id")],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { id: inserted.rows[0].id, workflowId, stepKey, displayName, required, requiredRoleSlug } }, { status: 201 });
    } catch (caught) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (caught instanceof Error && (caught.message.includes("required") || caught.message.includes("invalid") || caught.message.includes("integer") || caught.message.includes("recognised"))) return error(caught.message);
      throw caught;
    }
  } catch (caught) {
    return authErrorResponse(caught);
  } finally {
    client.release();
  }
}
