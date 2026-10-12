import { NextResponse } from "next/server";
import { authErrorResponse, requireProjectMembership, type SdmRole } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";
import { isUuid, parseObjectBody } from "../../../../../../lib/http";

export const runtime = "nodejs";
const workflowAdminRoles: readonly SdmRole[] = ["contractor_pm", "document_controller"];
const slugPattern = /^[a-z][a-z0-9_-]{1,63}$/;

function error(message: string, code = "INVALID_REQUEST", status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}
function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${field} must be between 1 and ${max} characters`);
  return result;
}

type Context = { params: Promise<{ projectCode: string; workflowId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { projectCode, workflowId } = await context.params;
    const { membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    if (!isUuid(workflowId)) return error("Workflow template not found", "NOT_FOUND", 404);
    const template = await db.query(
      `SELECT id, slug, name, active, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM workflow_templates WHERE id = $1 AND project_id = $2`,
      [workflowId, membership.projectId],
    );
    if (!template.rows[0]) return error("Workflow template not found", "NOT_FOUND", 404);
    const steps = await db.query(
      `SELECT id, sequence_no AS "sequenceNo", step_key AS "stepKey", display_name AS "displayName",
              required, required_role_slug AS "requiredRoleSlug"
         FROM workflow_template_steps WHERE template_id = $1 ORDER BY sequence_no`,
      [workflowId],
    );
    return NextResponse.json({ data: { ...template.rows[0], steps: steps.rows } });
  } catch (caught) {
    return authErrorResponse(caught);
  }
}

export async function PATCH(request: Request, context: Context) {
  const client = await db.connect();
  try {
    const { projectCode, workflowId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    if (!isUuid(workflowId)) return error("Workflow template not found", "NOT_FOUND", 404);
    const body = parseObjectBody(await request.json().catch(() => null));
    if (!body) return error("A JSON object is required");
    const name = body.name === undefined ? undefined : text(body.name, "name", 120);
    const slug = body.slug === undefined ? undefined : text(body.slug, "slug", 64).toLowerCase();
    if (slug !== undefined && !slugPattern.test(slug)) return error("slug must start with a letter and contain only lowercase letters, numbers, underscores, or hyphens");
    if (body.active !== undefined && typeof body.active !== "boolean") return error("active must be a boolean");
    if (name === undefined && slug === undefined && body.active === undefined) return error("Provide name, slug, or active to update");

    await client.query("BEGIN");
    const current = await client.query<{ id: string; name: string; slug: string; active: boolean }>(
      `SELECT id, name, slug, active FROM workflow_templates WHERE id = $1 AND project_id = $2 FOR UPDATE`,
      [workflowId, membership.projectId],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return error("Workflow template not found", "NOT_FOUND", 404);
    }
    const nextActive = body.active === undefined ? current.rows[0].active : body.active;
    if (nextActive) {
      const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM workflow_template_steps WHERE template_id = $1", [workflowId]);
      if (Number(count.rows[0].count) < 1) {
        await client.query("ROLLBACK");
        return error("Add at least one workflow step before activating this template", "WORKFLOW_EMPTY", 409);
      }
      const unassigned = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM workflow_template_steps ts
          WHERE ts.template_id = $1 AND ts.required = true
            AND (ts.required_role_slug IS NULL OR NOT EXISTS (
              SELECT 1 FROM project_memberships pm
               WHERE pm.project_id = $2 AND pm.role_slug = ts.required_role_slug AND pm.active = true
            ))`,
        [workflowId, membership.projectId],
      );
      if (Number(unassigned.rows[0].count) > 0) {
        await client.query("ROLLBACK");
        return error("Assign at least one active project member for every required workflow role before activation", "ROLE_UNASSIGNED", 409);
      }
    }
    if (slug !== undefined && slug !== current.rows[0].slug) {
      const duplicate = await client.query("SELECT 1 FROM workflow_templates WHERE project_id = $1 AND slug = $2 AND id <> $3", [membership.projectId, slug, workflowId]);
      if (duplicate.rowCount) {
        await client.query("ROLLBACK");
        return error("A workflow template with this slug already exists", "CONFLICT", 409);
      }
    }
    const updated = await client.query(
      `UPDATE workflow_templates SET name = COALESCE($1, name), slug = COALESCE($2, slug), active = $3
         WHERE id = $4 RETURNING id, slug, name, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name ?? null, slug ?? null, nextActive, workflowId],
    );
    if (nextActive) await client.query("UPDATE workflow_templates SET active = false WHERE project_id = $1 AND id <> $2", [membership.projectId, workflowId]);
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'workflow.template.updated', 'workflow_template', $3, $4::jsonb, $5)`,
      [membership.projectId, user.id, workflowId, JSON.stringify({ name: name ?? current.rows[0].name, slug: slug ?? current.rows[0].slug, active: nextActive }), request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: updated.rows[0] });
  } catch (caught) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (caught instanceof Error && (caught.message.includes("required") || caught.message.includes("characters"))) return error(caught.message);
    return authErrorResponse(caught);
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request, context: Context) {
  const client = await db.connect();
  try {
    const { projectCode, workflowId } = await context.params;
    const { user, membership } = await requireProjectMembership(request, projectCode, workflowAdminRoles);
    if (!isUuid(workflowId)) return error("Workflow template not found", "NOT_FOUND", 404);
    await client.query("BEGIN");
    const template = await client.query<{ id: string; active: boolean }>("SELECT id, active FROM workflow_templates WHERE id = $1 AND project_id = $2 FOR UPDATE", [workflowId, membership.projectId]);
    if (!template.rows[0]) {
      await client.query("ROLLBACK");
      return error("Workflow template not found", "NOT_FOUND", 404);
    }
    if (template.rows[0].active) {
      await client.query("ROLLBACK");
      return error("Deactivate a workflow template before deleting it", "ACTIVE_TEMPLATE", 409);
    }
    const instances = await client.query("SELECT 1 FROM workflow_instances WHERE template_id = $1 LIMIT 1", [workflowId]);
    if (instances.rowCount) {
      await client.query("ROLLBACK");
      return error("This template has workflow history and cannot be deleted; deactivate it instead", "WORKFLOW_IN_USE", 409);
    }
    await client.query("DELETE FROM workflow_templates WHERE id = $1", [workflowId]);
    await client.query(
      `INSERT INTO audit_events (project_id, actor_user_id, event_type, entity_type, entity_id, payload, request_id)
       VALUES ($1, $2, 'workflow.template.deleted', 'workflow_template', $3, '{}'::jsonb, $4)`,
      [membership.projectId, user.id, workflowId, request.headers.get("x-request-id")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { deleted: true, id: workflowId } });
  } catch (caught) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(caught);
  } finally {
    client.release();
  }
}
